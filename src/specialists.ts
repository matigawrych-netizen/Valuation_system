/**
 * Specjaliści (krok d): skład zespołu i trening jednego horyzontu na pamięci z dnia treningu.
 * Projekt: docs/specjalisci.md. Egzamin: scripts/specialists-exam.ts, raport: scripts/specialists-report.ts.
 *
 * Każdy prognozujący (specjalista albo punkt odniesienia) daje dla horyzontu h:
 *  • surową prognozę log(cena za h lat / P) przy dzisiejszej cenie P,
 *  • centyle 10/50/90 swoich błędów (cel − surowa prognoza) na całej pamięci.
 * Mediana = surowa prognoza + 50. centyl błędów, pas 80% = surowa prognoza + 10. i 90. centyl.
 * Jedna metoda pasa dla wszystkich; wyjątek to „cena się nie zmieni”, którego mediana z definicji wynosi 0.
 */
import { cagr, type Horizon } from './facts-panel.js';
import { fitLinear, growthObservations, reversionObservations, shareDriftFact } from './facts.js';
import { GBM_PARAMS, explainGbm, predictGbm, trainGbm } from './gbm.js';
import { MLP_PARAMS, predictMlp, trainMlp } from './mlp.js';
import { quantile } from './stats.js';
import type { MemoryLength, MemorySplit } from './specialist-memory.js';
import {
  FEATURE_LABEL,
  FEATURE_NAMES,
  featureVector,
  hasKeyFeatures,
  keyRanges,
  targetLog,
  type KeyRanges,
  type SpecialistRow,
} from './specialist-features.js';

export type Method = 'simple' | 'trees' | 'nn';
export type BenchmarkKind = 'no_change' | 'constant_multiple' | 'typical_return';

export interface ForecasterDef {
  id: string;
  name: string;
  memory: MemoryLength;
  /** Specjalista zespołu albo punkt odniesienia do egzaminu (bez ceny zakupu i bez głosu). */
  role: 'specialist' | 'benchmark';
  method: Method;
  benchmark?: BenchmarkKind;
  /** Sieć neuronowa wchodzi do zespołu dopiero po bramce z egzaminu. */
  conditional?: boolean;
}

export const METHOD_LABEL: Record<Method, string> = {
  simple: 'model prosty',
  trees: 'drzewa decyzyjne',
  nn: 'sieć neuronowa',
};

export const MEMORY_LABEL = (m: MemoryLength) => (m === 'all' ? 'cała historia' : m === 4 ? '4 lata' : `${m} lat`);

export const TEAM: ForecasterDef[] = [
  { id: 'reporter', name: 'Reporter', method: 'simple', memory: 4, role: 'specialist' },
  { id: 'praktyk', name: 'Praktyk', method: 'simple', memory: 8, role: 'specialist' },
  { id: 'weteran', name: 'Weteran', method: 'simple', memory: 'all', role: 'specialist' },
  { id: 'tropiciel', name: 'Tropiciel', method: 'trees', memory: 4, role: 'specialist' },
  { id: 'detektyw', name: 'Detektyw', method: 'trees', memory: 8, role: 'specialist' },
  { id: 'archiwista', name: 'Archiwista', method: 'trees', memory: 'all', role: 'specialist' },
  { id: 'radar', name: 'Radar', method: 'nn', memory: 4, role: 'specialist', conditional: true },
  { id: 'sejsmograf', name: 'Sejsmograf', method: 'nn', memory: 8, role: 'specialist', conditional: true },
  { id: 'kompas', name: 'Kompas', method: 'nn', memory: 'all', role: 'specialist', conditional: true },
];

const memoryId = (m: MemoryLength) => (m === 'all' ? 'all' : `${m}y`);

export const BENCHMARK_LABEL: Record<BenchmarkKind, string> = {
  no_change: 'cena się nie zmieni',
  constant_multiple: 'stała wielokrotność',
  typical_return: 'typowy zwrot z pamięci (informacyjnie)',
};

/** Punkty odniesienia — liczone przy modelu prostym, osobno dla każdej długości pamięci. */
export const BENCHMARKS: ForecasterDef[] = ([4, 8, 'all'] as MemoryLength[]).flatMap((memory) =>
  (['no_change', 'constant_multiple', 'typical_return'] as BenchmarkKind[]).map((benchmark) => ({
    id: `bench-${benchmark}-${memoryId(memory)}`,
    name: `${BENCHMARK_LABEL[benchmark]} (${MEMORY_LABEL(memory)})`,
    method: 'simple' as Method,
    memory,
    role: 'benchmark' as const,
    benchmark,
  }))
);

export const benchmarkFor = (kind: BenchmarkKind, memory: MemoryLength) =>
  BENCHMARKS.find((b) => b.benchmark === kind && b.memory === memory)!;

export interface ErrorQuantiles {
  q10: number;
  q50: number;
  q90: number;
  n: number;
}

export interface HorizonForecaster {
  h: Horizon;
  /** Surowa prognoza log(cena za h lat / price). */
  raw: (r: SpecialistRow, price: number) => number | null;
  errors: ErrorQuantiles;
  shiftMedian: boolean;
  ranges: KeyRanges;
  info: Record<string, number | string>;
  /** Cechy, które najbardziej przesunęły prognozę (drzewa); model prosty i sieć nie mają. */
  explain?: (r: SpecialistRow) => string[];
}

export type TrainOutcome = { ok: true; forecaster: HorizonForecaster } | { ok: false; reason: string };

/** Najmniej błędów w pamięci, z których liczymy centyle pasa. */
export const MIN_ERRORS = 100;

/** Wiersze, które mogą wejść do pamięci dla horyzontu h: kluczowe cechy i znany wynik. */
export function eligibleRows(rows: SpecialistRow[], h: Horizon): SpecialistRow[] {
  return rows.filter((r) => targetLog(r, h) != null && hasKeyFeatures(r));
}

function errorQuantiles(rows: SpecialistRow[], h: Horizon, raw: HorizonForecaster['raw']): ErrorQuantiles | null {
  const errs: number[] = [];
  for (const r of rows) {
    const y = targetLog(r, h);
    const p = raw(r, r.price);
    if (y != null && p != null && Number.isFinite(p)) errs.push(y - p);
  }
  if (errs.length < MIN_ERRORS) return null;
  errs.sort((a, b) => a - b);
  return { q10: quantile(errs, 0.1), q50: quantile(errs, 0.5), q90: quantile(errs, 0.9), n: errs.length };
}

export interface Forecast {
  median: number;
  q10: number;
  q90: number;
}

/** Mediana i pas 80% (w logarytmie zmiany ceny) przy cenie `price`. */
export function forecastAt(f: HorizonForecaster, r: SpecialistRow, price = r.price): Forecast | null {
  const raw = f.raw(r, price);
  if (raw == null || !Number.isFinite(raw)) return null;
  return {
    median: raw + (f.shiftMedian ? f.errors.q50 : 0),
    q10: raw + f.errors.q10,
    q90: raw + f.errors.q90,
  };
}

/** Mediana jako funkcja ceny — wejście do ceny zakupu. */
export const medianLogAtPrice = (f: HorizonForecaster, r: SpecialistRow) => (price: number) => forecastAt(f, r, price)?.median ?? null;

// ── Model prosty ──

/**
 * Model prosty: trzy dopasowania jak w faktach wspólnych (src/facts.ts), wyuczone na pamięci specjalisty.
 * log(cena za h / P) = h·log(1 + wzrost) − h·dryf akcji + [scenariusz B] a + (b − 1)·log(P/S przy cenie P).
 * Ten sam wzór co `predictPrice` — zgodność sprawdza test.
 */
export function trainSimple(split: MemorySplit<SpecialistRow>, h: Horizon, scenario: 'A' | 'B' = 'B'): TrainOutcome {
  const rows = split.all;
  const growth = fitLinear(growthObservations(rows, h));
  const reversion = fitLinear(reversionObservations(rows, h));
  const drift = shareDriftFact(rows, h);
  if (!growth || !drift || (scenario === 'B' && !reversion)) {
    return { ok: false, reason: 'za mało danych do dopasowania wzrostu, wyceny albo liczby akcji' };
  }
  const raw = (r: SpecialistRow, price: number): number | null => {
    const past = cagr(r.revenueTTM_3y, r.revenueTTM, 3);
    if (past == null || !(r.revenueTTM > 0) || !(price > 0)) return null;
    const g = Math.min(1, Math.max(-0.5, growth.intercept + growth.slope * past));
    const base = h * Math.log(1 + g) - h * drift.value;
    if (scenario === 'A') return base;
    const logPs = Math.log((price * r.shares) / r.revenueTTM);
    return base + reversion!.intercept + (reversion!.slope - 1) * logPs;
  };
  const errors = errorQuantiles(rows, h, raw);
  if (!errors) return { ok: false, reason: 'za mało błędów do wyznaczenia pasa' };
  return {
    ok: true,
    forecaster: {
      h,
      raw,
      errors,
      shiftMedian: true,
      ranges: keyRanges(rows),
      info: {
        rows: rows.length,
        growthSlope: growth.slope,
        growthIntercept: growth.intercept,
        reversionSlope: reversion?.slope ?? NaN,
        reversionIntercept: reversion?.intercept ?? NaN,
        shareDrift: drift.value,
      },
    },
  };
}

/** Punkty odniesienia z egzaminu (K3, K4) i informacyjny „typowy zwrot”. */
export function trainBenchmark(split: MemorySplit<SpecialistRow>, h: Horizon, kind: BenchmarkKind): TrainOutcome {
  if (kind === 'constant_multiple') return trainSimple(split, h, 'A');
  const raw = () => 0;
  const errors = errorQuantiles(split.all, h, raw);
  if (!errors) return { ok: false, reason: 'za mało obserwacji do wyznaczenia pasa' };
  return {
    ok: true,
    forecaster: {
      h,
      raw,
      errors,
      shiftMedian: kind === 'typical_return',
      ranges: keyRanges(split.all),
      info: { rows: split.all.length },
    },
  };
}

// ── Drzewa i sieć ──

const matrix = (rows: SpecialistRow[]) => rows.map((r) => featureVector(r, r.price));
const targets = (rows: SpecialistRow[], h: Horizon) => rows.map((r) => targetLog(r, h)!);

/** Deterministyczne ziarno z nazwy specjalisty, dnia treningu i horyzontu. */
export function seedFor(...parts: (string | number)[]): number {
  let hash = 2166136261;
  for (const ch of parts.join('|')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function trainTrees(split: MemorySplit<SpecialistRow>, h: Horizon): TrainOutcome {
  const started = Date.now();
  const selection = trainGbm(matrix(split.train), targets(split.train, h), GBM_PARAMS, {
    X: matrix(split.validation),
    y: targets(split.validation, h),
  });
  // Model końcowy: cała pamięć, liczba drzew wybrana na ostatnim roku.
  const final = trainGbm(matrix(split.all), targets(split.all, h), { ...GBM_PARAMS, maxTrees: selection.bestTrees });
  const model = final.model;
  const raw = (r: SpecialistRow, price: number) => predictGbm(model, featureVector(r, price));
  const errors = errorQuantiles(split.all, h, raw);
  if (!errors) return { ok: false, reason: 'za mało błędów do wyznaczenia pasa' };
  return {
    ok: true,
    forecaster: {
      h,
      raw,
      errors,
      shiftMedian: true,
      ranges: keyRanges(split.all),
      info: {
        rows: split.all.length,
        validationRows: split.validation.length,
        trees: selection.bestTrees,
        /** Drzewa zbudowane w obu treningach (wybór liczby drzew + model końcowy) — do szacowania czasu. */
        treesBuilt: selection.validationLoss.length + selection.bestTrees,
        seconds: (Date.now() - started) / 1000,
      },
      explain: (r) => {
        const c = explainGbm(model, featureVector(r, r.price));
        return [...c.keys()]
          .filter((i) => c[i] !== 0)
          .sort((a, b) => Math.abs(c[b]) - Math.abs(c[a]))
          .slice(0, 3)
          .map((i) => `${FEATURE_LABEL[FEATURE_NAMES[i]]} (${c[i] > 0 ? '+' : ''}${(c[i] * 100).toFixed(0)}%)`);
      },
    },
  };
}

export function trainNn(split: MemorySplit<SpecialistRow>, h: Horizon, seed: number): TrainOutcome {
  const started = Date.now();
  const params = { ...MLP_PARAMS, seed };
  const selection = trainMlp(matrix(split.train), targets(split.train, h), params, {
    X: matrix(split.validation),
    y: targets(split.validation, h),
  });
  const final = trainMlp(matrix(split.all), targets(split.all, h), { ...params, maxEpochs: selection.bestEpochs });
  const model = final.model;
  const raw = (r: SpecialistRow, price: number) => predictMlp(model, featureVector(r, price));
  const errors = errorQuantiles(split.all, h, raw);
  if (!errors) return { ok: false, reason: 'za mało błędów do wyznaczenia pasa' };
  return {
    ok: true,
    forecaster: {
      h,
      raw,
      errors,
      shiftMedian: true,
      ranges: keyRanges(split.all),
      info: {
        rows: split.all.length,
        validationRows: split.validation.length,
        epochs: selection.bestEpochs,
        /** Epoki w obu treningach (wybór liczby epok + model końcowy) — do szacowania czasu. */
        epochsRun: selection.validationLoss.length + selection.bestEpochs,
        seconds: (Date.now() - started) / 1000,
      },
    },
  };
}

/** Trening jednego prognozującego dla jednego horyzontu w dniu treningu. */
export function trainForecaster(def: ForecasterDef, split: MemorySplit<SpecialistRow>, h: Horizon, cutoff: string): TrainOutcome {
  if (def.role === 'benchmark') return trainBenchmark(split, h, def.benchmark!);
  if (def.method === 'simple') return trainSimple(split, h, 'B');
  if (def.method === 'trees') return trainTrees(split, h);
  return trainNn(split, h, seedFor(def.id, cutoff, h));
}
