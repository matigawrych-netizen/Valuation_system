/**
 * Model „wagi bloków”: przewidywana cena za 12M / cena dziś = średnia ważona (blok / cena)
 * po blokach obecnych w wierszu — dokładnie tak, jak silnik renormalizuje wagi.
 * Wspólne dla train.ts, build-accuracy-profile.ts, stability-test.ts, evaluate-holdout.ts.
 */
import type { Row } from './dataset.js';
import { evaluate } from './evaluation-harness.js';
import { splitFold } from './purging.js';
import { mulberry32 } from './stats.js';
import { BLOCKS, WEIGHT_MATRIX, type Archetype, type ValuationBlock } from './valuation-engine.js';
import type { YearBlock } from './paths.js';

/** Poniżej tylu obserwacji archetyp dostaje wagi priora (kalibrowanie 4 wag na kilkudziesięciu wierszach to interpolacja). */
export const MIN_ARCHETYPE_OBS = 200;
/** blok/cena przycinane do [0, 5] — pojedyncze absurdalne wyceny nie mogą zdominować straty L1. */
export const BLOCK_RATIO_CAP = 5;
/** Jak w silniku: Fair Value przycinane do [0.2, 5] x cena. */
const PRED_RATIO_MIN = 0.2;
const PRED_RATIO_MAX = 5;

export type BlockWeights = Record<ValuationBlock, number>;

export interface Sample {
  x: (number | null)[]; // blok/cena w kolejności BLOCKS; null = blok nieobecny
  y: number; // 1 + fwdReturn12m
}

export function priorWeights(archetype: string): BlockWeights {
  const p = WEIGHT_MATRIX[archetype as Archetype];
  if (!p) return Object.fromEntries(BLOCKS.map((b) => [b, 1 / BLOCKS.length])) as BlockWeights;
  return Object.fromEntries(BLOCKS.map((b) => [b, p[b] ?? 0])) as BlockWeights;
}

export function toSample(row: Row): Sample | null {
  const x = BLOCKS.map((b) => {
    const v = row.blocks[b];
    return v == null ? null : Math.min(Math.max(v / row.price, 0), BLOCK_RATIO_CAP);
  });
  if (x.every((v) => v == null)) return null;
  return { x, y: 1 + row.fwdReturn };
}

const wVec = (w: BlockWeights) => BLOCKS.map((b) => w[b]);
const wObj = (v: number[]) => Object.fromEntries(BLOCKS.map((b, i) => [b, v[i]])) as BlockWeights;

/** Zwraca [ratio, D] — D = suma wag obecnych bloków (0 => średnia prosta, jak w silniku). */
function predictVec(x: (number | null)[], w: number[]): [number, number] {
  let num = 0;
  let den = 0;
  let sum = 0;
  let cnt = 0;
  for (let j = 0; j < x.length; j++) {
    const xj = x[j];
    if (xj == null) continue;
    num += w[j] * xj;
    den += w[j];
    sum += xj;
    cnt++;
  }
  const raw = den > 1e-4 ? num / den : sum / cnt;
  return [Math.min(Math.max(raw, PRED_RATIO_MIN), PRED_RATIO_MAX), den];
}

export function predictReturn(row: Row, w: BlockWeights): number | null {
  const s = toSample(row);
  return s ? predictVec(s.x, wVec(w))[0] - 1 : null;
}

export function projectSimplex(v: number[]): number[] {
  const u = [...v].sort((a, b) => b - a);
  let cumsum = 0;
  let rho = 0;
  let rhoSum = 0;
  for (let i = 0; i < u.length; i++) {
    cumsum += u[i];
    if (u[i] + (1 - cumsum) / (i + 1) > 0) {
      rho = i + 1;
      rhoSum = cumsum;
    }
  }
  const theta = (1 - rhoSum) / rho;
  return v.map((x) => Math.max(x + theta, 0));
}

export function l1Error(samples: Sample[], w: BlockWeights): number {
  if (!samples.length) return NaN;
  const wv = wVec(w);
  let err = 0;
  for (const s of samples) err += Math.abs(predictVec(s.x, wv)[0] - s.y);
  return err / samples.length;
}

const penalty = (w: number[], prior: number[], lambda: number) =>
  lambda * w.reduce((s, wi, i) => s + (wi - prior[i]) ** 2, 0);

/** Start z priora zmieszanego z rozkładem równomiernym (zera w priorze blokowałyby gradient). */
const startPoint = (prior: number[]) => projectSimplex(prior.map((p) => 0.9 * p + 0.1 / prior.length));

/** Projektowany subgradient dla straty L1 + λ‖w − prior‖², w ≥ 0, Σw = 1. Deterministyczny. */
export function optimizeProjectedSubgradient(samples: Sample[], prior: BlockWeights, lambda: number, iterations = 300): BlockWeights {
  const p = wVec(prior);
  let w = startPoint(p);
  let lr = 0.1;
  for (let it = 0; it < iterations; it++) {
    const grad = new Array<number>(w.length).fill(0);
    for (const s of samples) {
      const [pred, den] = predictVec(s.x, w);
      if (den <= 1e-4 || pred <= PRED_RATIO_MIN || pred >= PRED_RATIO_MAX) continue;
      const sign = Math.sign(pred - s.y);
      for (let j = 0; j < w.length; j++) {
        const xj = s.x[j];
        if (xj != null) grad[j] += (sign * (xj - pred)) / den;
      }
    }
    for (let j = 0; j < w.length; j++) {
      grad[j] = grad[j] / samples.length + 2 * lambda * (w[j] - p[j]);
      w[j] -= lr * grad[j];
    }
    w = projectSimplex(w);
    lr *= 0.995;
  }
  return wObj(w);
}

/**
 * Izotropowe przeszukiwanie losowe z malejącą sigmą (to NIE jest CMA-ES — brak adaptacji kowariancji).
 */
export function optimizeRandomSearch(samples: Sample[], prior: BlockWeights, lambda: number, seed: number, iterations = 200): BlockWeights {
  const rnd = mulberry32(seed);
  const p = wVec(prior);
  const objective = (w: number[]) => l1Error(samples, wObj(w)) + penalty(w, p, lambda);
  let center = startPoint(p);
  let best = center;
  let bestLoss = objective(center);
  let sigma = 0.1;
  const popSize = 8;
  for (let it = 0; it < iterations; it++) {
    const pop = Array.from({ length: popSize }, () => {
      const cand = projectSimplex(center.map((v) => v + (rnd() * 2 - 1) * sigma));
      return { cand, loss: objective(cand) };
    }).sort((a, b) => a.loss - b.loss);
    if (pop[0].loss < bestLoss) {
      bestLoss = pop[0].loss;
      best = pop[0].cand;
    }
    const mu = popSize / 2;
    center = projectSimplex(center.map((_, j) => pop.slice(0, mu).reduce((s, q) => s + q.cand[j], 0) / mu));
    sigma *= 0.99;
  }
  return wObj(best);
}

export type Optimizer = { kind: 'subgradient' } | { kind: 'random'; seed: number };

export function fitArchetypeWeights(
  rows: Row[],
  lambda: number,
  optimizer: Optimizer
): { weights: Record<string, BlockWeights>; fallbackToPrior: Record<string, boolean>; nByArchetype: Record<string, number> } {
  const byArch = new Map<string, Sample[]>();
  for (const r of rows) {
    const s = toSample(r);
    if (!s) continue;
    if (!byArch.has(r.dominantArchetype)) byArch.set(r.dominantArchetype, []);
    byArch.get(r.dominantArchetype)!.push(s);
  }
  const weights: Record<string, BlockWeights> = {};
  const fallbackToPrior: Record<string, boolean> = {};
  const nByArchetype: Record<string, number> = {};
  for (const a of Object.keys(WEIGHT_MATRIX)) {
    const samples = byArch.get(a) ?? [];
    nByArchetype[a] = samples.length;
    const prior = priorWeights(a);
    if (samples.length < MIN_ARCHETYPE_OBS) {
      weights[a] = prior;
      fallbackToPrior[a] = true;
    } else {
      weights[a] =
        optimizer.kind === 'random'
          ? optimizeRandomSearch(samples, prior, lambda, optimizer.seed)
          : optimizeProjectedSubgradient(samples, prior, lambda);
      fallbackToPrior[a] = false;
    }
  }
  return { weights, fallbackToPrior, nByArchetype };
}

export function predictRows(rows: Row[], weights: Record<string, BlockWeights>) {
  const out: { row: Row; pred: number }[] = [];
  for (const r of rows) {
    const w = weights[r.dominantArchetype] ?? priorWeights(r.dominantArchetype);
    const pred = predictReturn(r, w);
    if (pred != null) out.push({ row: r, pred });
  }
  return out;
}

export interface FoldResult {
  block: YearBlock;
  nTrain: number;
  nTest: number;
  nPurged: number;
  purgedShare: number;
  trainL1: number;
  valL1: number;
  isIC: number | null;
  oosIC: number | null;
  weights: Record<string, BlockWeights>;
  oos: { row: Row; pred: number }[];
}

export function walkForward(rows: Row[], blocks: YearBlock[], lambda: number, optimizer: Optimizer): FoldResult[] {
  return blocks.map((block) => {
    const { train, test, purged } = splitFold(rows, block);
    const { weights } = fitArchetypeWeights(train, lambda, optimizer);
    const trainPreds = predictRows(train, weights);
    const oos = predictRows(test, weights);
    const l1 = (preds: { row: Row; pred: number }[]) =>
      preds.length ? preds.reduce((s, p) => s + Math.abs(p.pred - p.row.fwdReturn), 0) / preds.length : NaN;
    const ic = (preds: { row: Row; pred: number }[]) =>
      evaluate(
        preds.map((p) => p.pred),
        preds.map((p) => p.row.fwdReturn),
        preds.map((p) => ({ quarter: p.row.asOf }))
      ).IC_by_quarter.mean;
    return {
      block,
      nTrain: train.length,
      nTest: test.length,
      nPurged: purged.length,
      purgedShare: purged.length / Math.max(1, train.length + purged.length),
      trainL1: l1(trainPreds),
      valL1: l1(oos),
      isIC: ic(trainPreds),
      oosIC: ic(oos),
      weights,
      oos,
    };
  });
}
