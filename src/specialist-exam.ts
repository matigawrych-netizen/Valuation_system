/**
 * Egzamin specjalistów (docs/specjalisci.md, punkt 7): format zapisu prognoz i miary K1, K3, K4, K6,
 * bramka dla drzew i sieci oraz różnorodność zespołu. K2 (zlecenia z limitem): src/limit-backtest.ts.
 */
import fs from 'node:fs';
import { HORIZONS, type Horizon } from './facts-panel.js';
import { addMonths } from './purging.js';
import { bootstrapGroups, dieboldMarianoFromLosses, mean, pearson, quantile, type DieboldMarianoResult } from './stats.js';

// ── Pliki z prognozami ──

/** Pliki jednego prognozującego w katalogu <UNIVERSE_DATA_DIR>/specialists. */
export const specialistFiles = (dir: string, id: string) => ({
  exam: `${dir}/exam-${id}.csv`,
  buy: `${dir}/buy-${id}.csv`,
  log: `${dir}/train-${id}.json`,
});

/** Prognozujący policzony do końca (przerwany egzamin nie zostawia pliku z logiem `complete`). */
export function isComplete(dir: string, id: string): boolean {
  const f = specialistFiles(dir, id);
  return fs.existsSync(f.log) && fs.existsSync(f.exam) && JSON.parse(fs.readFileSync(f.log, 'utf-8')).complete === true;
}

export const EXAM_HEADER = 'cik,asOf,cutoff,h,status,median,q10,q90,actual';
export const BUY_HEADER = 'cik,asOf,price,dividendPerShare,dividendKnown,aggressive,balanced,cautious,balanced_h1,balanced_h2,balanced_h3,balanced_h4,balanced_h5,censored';

export interface ExamRecord {
  cik: string;
  asOf: string;
  cutoff: string;
  h: Horizon;
  /** 'ok' albo powód braku prognozy: 'no_model', 'missing:…', 'out_of_range:…', 'no_forecast'. */
  status: string;
  median: number | null;
  q10: number | null;
  q90: number | null;
  /** Prawdziwy log(cena za h lat / cena); null, gdy jeszcze nieznany. */
  actual: number | null;
}

export interface BuyRecord {
  cik: string;
  asOf: string;
  price: number;
  dividendPerShare: number;
  dividendKnown: boolean;
  aggressive: number;
  balanced: number;
  cautious: number;
  balancedByHorizon: number[];
  censored: number;
}

const cell = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : String(Number(v.toPrecision(8))));
const num = (s: string | undefined) => (s == null || s === '' ? null : Number(s));

export const examLine = (r: ExamRecord) =>
  [r.cik, r.asOf, r.cutoff, r.h, r.status, cell(r.median), cell(r.q10), cell(r.q90), cell(r.actual)].join(',');

export const buyLine = (r: BuyRecord) =>
  [
    r.cik,
    r.asOf,
    cell(r.price),
    cell(r.dividendPerShare),
    r.dividendKnown ? 1 : 0,
    cell(r.aggressive),
    cell(r.balanced),
    cell(r.cautious),
    ...r.balancedByHorizon.map(cell),
    r.censored,
  ].join(',');

function readLines(file: string, header: string): string[][] {
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter((l) => l.length > 0);
  if (lines[0] !== header) throw new Error(`Nieoczekiwany nagłówek pliku ${file}.`);
  return lines.slice(1).map((l) => l.split(','));
}

export function readExamFile(file: string): ExamRecord[] {
  return readLines(file, EXAM_HEADER).map((c) => ({
    cik: c[0],
    asOf: c[1],
    cutoff: c[2],
    h: Number(c[3]) as Horizon,
    status: c[4],
    median: num(c[5]),
    q10: num(c[6]),
    q90: num(c[7]),
    actual: num(c[8]),
  }));
}

export function readBuyFile(file: string): BuyRecord[] {
  return readLines(file, BUY_HEADER).map((c) => ({
    cik: c[0],
    asOf: c[1],
    price: Number(c[2]),
    dividendPerShare: Number(c[3]),
    dividendKnown: c[4] === '1',
    aggressive: Number(c[5]),
    balanced: Number(c[6]),
    cautious: Number(c[7]),
    balancedByHorizon: c.slice(8, 13).map(Number),
    censored: Number(c[13]),
  }));
}

/** Rekord oceniony: prognoza istnieje i wynik jest znany. */
export const isScored = (r: ExamRecord) => r.status === 'ok' && r.actual != null && r.median != null && r.q10 != null && r.q90 != null;

// ── K1: pokrycie pasa 80% ──

export const K1_RANGE: [number, number] = [0.72, 0.88];
/** Najmniej obserwacji i kwartałów, żeby pokrycie uznać za zmierzone. */
export const K1_MIN_ROWS = 100;
export const K1_MIN_QUARTERS = 4;

export interface CoverageResult {
  coverage: number;
  n: number;
  quarters: number;
  lo: number | null;
  hi: number | null;
  status: 'PASS' | 'FAIL' | 'BRAK POMIARU';
}

function groupByQuarter<T extends { asOf: string }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const g = out.get(it.asOf) ?? [];
    g.push(it);
    out.set(it.asOf, g);
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function coverage(records: ExamRecord[], h: Horizon): CoverageResult {
  const scored = records.filter((r) => r.h === h && isScored(r));
  const byQuarter = groupByQuarter(scored);
  const groups = [...byQuarter.values()].map((g) => g.map((r) => (r.actual! >= r.q10! && r.actual! <= r.q90! ? 1 : 0)));
  const flat = groups.flat();
  if (flat.length < K1_MIN_ROWS || groups.length < K1_MIN_QUARTERS) {
    return { coverage: flat.length ? mean(flat) : NaN, n: flat.length, quarters: groups.length, lo: null, hi: null, status: 'BRAK POMIARU' };
  }
  const ci = bootstrapGroups(groups, (sample) => {
    const f = sample.flat();
    return f.length ? mean(f) : null;
  });
  const c = mean(flat);
  return {
    coverage: c,
    n: flat.length,
    quarters: groups.length,
    lo: ci.lo,
    hi: ci.hi,
    status: c >= K1_RANGE[0] && c <= K1_RANGE[1] ? 'PASS' : 'FAIL',
  };
}

// ── Strata kwantylowa i porównania (K3, K4, bramka) ──

const rho = (u: number, tau: number) => u * (tau - (u < 0 ? 1 : 0));

/** Strata kwantylowa (pinball) sumowana po centylach 10, 50 i 90. */
export const pinballLoss = (actual: number, q10: number, median: number, q90: number) =>
  rho(actual - q10, 0.1) + rho(actual - median, 0.5) + rho(actual - q90, 0.9);

const recordLoss = (r: ExamRecord) => pinballLoss(r.actual!, r.q10!, r.median!, r.q90!);

export interface Comparison {
  rows: number;
  quarters: number;
  lossA: number;
  lossB: number;
  /** Diebold-Mariano na średnich stratach kwartalnych; null, gdy kwartałów za mało. */
  dm: DieboldMarianoResult | null;
  /** Przybliżona liczba niezależnych okresów: kwartały / (4·h). */
  independentPeriods: number;
}

/**
 * Test porównawczy wymaga co najmniej tylu nienachodzących na siebie okien h-letnich. Przy mniejszej liczbie
 * kwartałów wartość p nie ma sensu (korekta Newey-West potrzebuje więcej obserwacji niż długość okna) — wynik to „brak pomiaru”.
 */
export const MIN_INDEPENDENT_WINDOWS = 2;

/**
 * Porównanie dwóch prognozujących na wspólnych obserwacjach horyzontu h. Obserwacje z jednego kwartału są zależne,
 * więc test działa na średniej stracie kwartału; korekta Newey-West na nakładanie się okien h lat (4h kwartałów).
 */
export function compareForecasters(a: ExamRecord[], b: ExamRecord[], h: Horizon): Comparison {
  const key = (r: ExamRecord) => `${r.cik}|${r.asOf}`;
  const bMap = new Map(b.filter((r) => r.h === h && isScored(r)).map((r) => [key(r), r]));
  const pairs: { asOf: string; la: number; lb: number }[] = [];
  for (const r of a) {
    if (r.h !== h || !isScored(r)) continue;
    const other = bMap.get(key(r));
    if (other) pairs.push({ asOf: r.asOf, la: recordLoss(r), lb: recordLoss(other) });
  }
  const byQuarter = groupByQuarter(pairs);
  const qa = [...byQuarter.values()].map((g) => mean(g.map((p) => p.la)));
  const qb = [...byQuarter.values()].map((g) => mean(g.map((p) => p.lb)));
  const lag = 4 * h;
  const n = qa.length;
  const testable = n >= Math.max(3, MIN_INDEPENDENT_WINDOWS * lag);
  return {
    rows: pairs.length,
    quarters: n,
    lossA: pairs.length ? mean(pairs.map((p) => p.la)) : NaN,
    lossB: pairs.length ? mean(pairs.map((p) => p.lb)) : NaN,
    dm: testable ? dieboldMarianoFromLosses(qa, qb, lag) : null,
    independentPeriods: n / lag,
  };
}

export const K34_P = 0.0167;
export const GATE_P = 0.05;

/** K3/K4: specjalista ma niższą stratę i różnica jest istotna. */
export function beatsBenchmark(c: Comparison): 'PASS' | 'FAIL' | 'BRAK POMIARU' {
  if (!c.dm || c.rows === 0) return 'BRAK POMIARU';
  return c.dm.meanLossDiff < 0 && c.dm.pValue < K34_P ? 'PASS' : 'FAIL';
}

/** Łączny wynik bramki: FAIL na którymkolwiek horyzoncie = FAIL; PASS, gdy zmierzono choć jeden horyzont i żaden nie jest FAIL. */
export function gateOverall(statuses: ('PASS' | 'FAIL' | 'BRAK POMIARU')[]): 'PASS' | 'FAIL' | 'BRAK POMIARU' {
  if (statuses.includes('FAIL')) return 'FAIL';
  return statuses.includes('PASS') ? 'PASS' : 'BRAK POMIARU';
}

/** Bramka: drzewa/sieć nie mogą być istotnie gorsze od modelu prostego z tą samą pamięcią. */
export function notSignificantlyWorse(c: Comparison): 'PASS' | 'FAIL' | 'BRAK POMIARU' {
  if (!c.dm || c.rows === 0) return 'BRAK POMIARU';
  return c.dm.meanLossDiff > 0 && c.dm.pValue < GATE_P ? 'FAIL' : 'PASS';
}

// ── K6: stabilność ceny zakupu ──

export const K6_MAX_MEDIAN_CHANGE = 0.15;

/** |zmiana| ceny między kolejnymi kwartałami tej samej spółki (decyzje odległe o 3 miesiące). */
export function quarterlyChanges(buys: BuyRecord[], pick: (b: BuyRecord) => number): number[] {
  const byKey = new Map(buys.map((b) => [`${b.cik}|${b.asOf}`, b]));
  const out: number[] = [];
  for (const b of buys) {
    const next = byKey.get(`${b.cik}|${addMonths(b.asOf, 3).toISOString().slice(0, 10)}`);
    if (!next) continue;
    const p0 = pick(b);
    const p1 = pick(next);
    if (p0 > 0 && p1 > 0) out.push(Math.abs(p1 / p0 - 1));
  }
  return out;
}

export interface StabilityResult {
  medianChange: number | null;
  pairs: number;
  byHorizon: (number | null)[];
  status: 'PASS' | 'FAIL' | 'BRAK POMIARU';
}

export function buyPriceStability(buys: BuyRecord[]): StabilityResult {
  const changes = quarterlyChanges(buys, (b) => b.balanced);
  const byHorizon = HORIZONS.map((h) => {
    const c = quarterlyChanges(buys, (b) => b.balancedByHorizon[h - 1]);
    return c.length ? quantile(c, 0.5) : null;
  });
  if (changes.length === 0) return { medianChange: null, pairs: 0, byHorizon, status: 'BRAK POMIARU' };
  const m = quantile(changes, 0.5);
  return { medianChange: m, pairs: changes.length, byHorizon, status: m <= K6_MAX_MEDIAN_CHANGE ? 'PASS' : 'FAIL' };
}

// ── Różnorodność ──

export const MERGE_CORRELATION = 0.95;

export interface Diversity {
  ids: string[];
  rows: number;
  /** Korelacja median prognoz — podstawa łączenia par i n_eff. */
  corr: (number | null)[][];
  meanPairwiseCorr: number | null;
  /** k / (1 + (k − 1)·ρ̄) — ten sam wzór co w scripts/test-ensemble-diversity.ts. */
  nEff: number | null;
  mergePairs: [string, string, number][];
  /** Informacyjnie: średnia korelacja błędów (prawdziwa zmiana − mediana). */
  meanPairwiseErrorCorr: number | null;
}

function pairwise(ids: string[], cols: number[][]) {
  const corr = cols.map((ci) => cols.map((cj) => (ci.length >= 3 ? pearson(ci, cj) : null)));
  const values: number[] = [];
  const high: [string, string, number][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const c = corr[i][j];
      if (c == null) continue;
      values.push(c);
      if (c >= MERGE_CORRELATION) high.push([ids[i], ids[j], c]);
    }
  }
  return { corr, mean: values.length ? mean(values) : null, high };
}

/**
 * Różnorodność zespołu na obserwacjach, które ocenili wszyscy.
 *
 * Miarą jest korelacja samych prognoz (median), a nie błędów. Błąd = prawdziwa zmiana − prognoza, a prawdziwa zmiana
 * kursu jest dla wszystkich ta sama i zwykle dużo większa niż różnice między prognozami — korelacja błędów wychodzi
 * wtedy bliska 1 nawet dla prognoz zupełnie niezależnych (test w tests/specialist-exam.test.ts).
 */
export function forecastDiversity(recordsById: Map<string, ExamRecord[]>, h: Horizon): Diversity {
  const ids = [...recordsById.keys()];
  const maps = ids.map((id) => new Map(recordsById.get(id)!.filter((r) => r.h === h && isScored(r)).map((r) => [`${r.cik}|${r.asOf}`, r])));
  const common = maps.length ? [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k))).sort() : [];
  const forecasts = pairwise(ids, maps.map((m) => common.map((k) => m.get(k)!.median!)));
  const errors = pairwise(ids, maps.map((m) => common.map((k) => m.get(k)!.actual! - m.get(k)!.median!)));
  const k = ids.length;
  return {
    ids,
    rows: common.length,
    corr: forecasts.corr,
    meanPairwiseCorr: forecasts.mean,
    nEff: forecasts.mean != null ? k / (1 + (k - 1) * forecasts.mean) : null,
    mergePairs: forecasts.high,
    meanPairwiseErrorCorr: errors.mean,
  };
}

// ── Wagi głosów po egzaminie (zapisane przed egzaminem) ──

/**
 * Waga specjalisty z głosem ∝ 1 / (średnia strata kwantylowa), uśredniona po horyzontach 1–5 na obserwacjach
 * ocenionych przez wszystkich głosujących. Bez głosu = waga 0. Suma wag = 1.
 */
export function voteWeights(lossById: Map<string, number>, voting: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  let total = 0;
  for (const [id, loss] of lossById) if (voting.has(id) && loss > 0 && Number.isFinite(loss)) total += 1 / loss;
  for (const [id, loss] of lossById) {
    out.set(id, voting.has(id) && total > 0 && loss > 0 && Number.isFinite(loss) ? 1 / loss / total : 0);
  }
  return out;
}
