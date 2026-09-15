/**
 * Operatory algorytmu genetycznego (wspólne dla evolve.ts i replay-expert.ts).
 * Cała losowość przez przekazywany generator (mulberry32) — przebieg jest powtarzalny dla ziarna.
 */
import { WEIGHT_MATRIX, type WeightMatrix } from '../src/valuation-engine.js';
import { DEFAULT_PARAMS, type SimConfig, type SimMetrics } from './simulate.js';

export type Rng = () => number;
type Params = typeof DEFAULT_PARAMS;

export interface Genome {
  matrixHiking: WeightMatrix;
  matrixHolding: WeightMatrix;
  matrixCutting: WeightMatrix;
  params: Params;
}

export const PARAM_RANGES: Record<keyof Params, [number, number]> = {
  maxPositions: [5, 40],
  positionSizePct: [0.02, 0.15],
  sellOvervaluedAt: [1.05, 1.6],
  stopLossPct: [0.08, 0.4],
  minUpside: [0.03, 0.35],
  minModels: [3, 8],
  vixThreshold1: [12, 25],
  vixThreshold2: [20, 38],
  vixThreshold3: [30, 55],
  equityPctCalm: [0.7, 1.0],
  equityPctElevated: [0.4, 0.95],
  equityPctFear: [0.1, 0.7],
  equityPctPanic: [0.0, 0.5],
};

/** Genom z mniejszą liczbą transakcji niż próg dostaje fitness −∞ (inaczej wygrywa strategia „prawie nic nie rób”). */
export const MIN_TRADES = 20;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const PARAM_KEYS = Object.keys(PARAM_RANGES) as (keyof Params)[];

function normalize(g: Genome): Genome {
  const v = [g.params.vixThreshold1, g.params.vixThreshold2, g.params.vixThreshold3].sort((a, b) => a - b);
  [g.params.vixThreshold1, g.params.vixThreshold2, g.params.vixThreshold3] = v;
  const e = [g.params.equityPctCalm, g.params.equityPctElevated, g.params.equityPctFear, g.params.equityPctPanic].sort((a, b) => b - a);
  [g.params.equityPctCalm, g.params.equityPctElevated, g.params.equityPctFear, g.params.equityPctPanic] = e;
  g.params.maxPositions = Math.round(g.params.maxPositions);
  g.params.minModels = Math.round(g.params.minModels);
  return g;
}

const matrices = (g: Genome) => [g.matrixHiking, g.matrixHolding, g.matrixCutting];

export function defaultGenome(): Genome {
  return { matrixHiking: clone(WEIGHT_MATRIX), matrixHolding: clone(WEIGHT_MATRIX), matrixCutting: clone(WEIGHT_MATRIX), params: { ...DEFAULT_PARAMS } };
}

export function randomGenome(rnd: Rng): Genome {
  const g = defaultGenome();
  for (const m of matrices(g)) for (const a of Object.keys(m)) for (const b of Object.keys((m as any)[a])) (m as any)[a][b] = rnd();
  for (const k of PARAM_KEYS) {
    const [lo, hi] = PARAM_RANGES[k];
    g.params[k] = lo + rnd() * (hi - lo);
  }
  return normalize(g);
}

export function mutateGenome(genome: Genome, rate: number, rnd: Rng): Genome {
  const g = clone(genome);
  for (const m of matrices(g)) {
    for (const a of Object.keys(m)) {
      for (const b of Object.keys((m as any)[a])) {
        if (rnd() < rate) (m as any)[a][b] = Math.max(0, Math.min(1, (m as any)[a][b] + (rnd() * 0.2 - 0.1)));
      }
    }
  }
  for (const k of PARAM_KEYS) {
    if (rnd() < rate) {
      const [lo, hi] = PARAM_RANGES[k];
      g.params[k] = Math.max(lo, Math.min(hi, g.params[k] + (rnd() * 0.2 - 0.1) * (hi - lo)));
    }
  }
  return normalize(g);
}

export function crossoverGenome(g1: Genome, g2: Genome, rnd: Rng): Genome {
  const child = clone(g1);
  const other = matrices(g2);
  matrices(child).forEach((m, i) => {
    for (const a of Object.keys(m)) for (const b of Object.keys((m as any)[a])) if (rnd() < 0.5) (m as any)[a][b] = (other[i] as any)[a][b];
  });
  for (const k of PARAM_KEYS) if (rnd() < 0.5) child.params[k] = g2.params[k];
  return normalize(child);
}

export const genomeToConfig = (g: Genome): SimConfig => ({ matrixHiking: g.matrixHiking, matrixHolding: g.matrixHolding, matrixCutting: g.matrixCutting, ...g.params });

/**
 * Fitness w [0, 1] (albo −∞): każdy człon przycięty i znormalizowany, więc deklarowane wagi 50/30/20 faktycznie obowiązują.
 * Alfa jest ROCZNA — okresy treningowy (kilkanaście lat) i testowy (2 lata) muszą być porównywalne.
 */
export function fitnessScore(sim: Pick<SimMetrics, 'sortino' | 'alphaAnnualized' | 'maxDrawdown' | 'totalTrades'>): number {
  if (sim.totalTrades < MIN_TRADES) return -Infinity;
  const sortinoPart = Math.min(Math.max(sim.sortino ?? 0, 0), 3) / 3;
  const alphaPart = Math.min(Math.max(sim.alphaAnnualized, -0.5), 0.5) + 0.5;
  const ddPart = 1 - Math.min(sim.maxDrawdown, 1);
  return 0.5 * sortinoPart + 0.3 * alphaPart + 0.2 * ddPart;
}

/** Selekcja turniejowa z CAŁEJ populacji. */
export function tournamentSelect<T extends { fitness: number }>(pop: T[], size: number, rnd: Rng): T {
  let best = pop[Math.floor(rnd() * pop.length)];
  for (let i = 1; i < size; i++) {
    const c = pop[Math.floor(rnd() * pop.length)];
    if (c.fitness > best.fitness) best = c;
  }
  return best;
}

/** Średnie odchylenie standardowe wag macierzy w populacji — diagnostyka kolapsu. */
export function weightSpread(genomes: Genome[]): number {
  const flat = genomes.map((g) => matrices(g).flatMap((m) => Object.keys(m).sort().flatMap((a) => Object.keys((m as any)[a]).sort().map((b) => (m as any)[a][b] as number))));
  const dims = flat[0]?.length ?? 0;
  let total = 0;
  for (let j = 0; j < dims; j++) {
    const col = flat.map((f) => f[j]);
    const mu = col.reduce((a, b) => a + b, 0) / col.length;
    total += Math.sqrt(col.reduce((a, b) => a + (b - mu) ** 2, 0) / col.length);
  }
  return dims ? total / dims : 0;
}
