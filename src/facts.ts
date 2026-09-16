/**
 * Fakty wspólne — to, czego system uczy się raz i z czego potem korzystają wszyscy specjaliści.
 *
 * Trzy fakty, każdy osobno dla horyzontu 1, 2, 3, 4 i 5 lat:
 *  1. Wygasanie wzrostu — na ile dotychczasowe tempo wzrostu przychodów utrzymuje się w przyszłości.
 *  2. Powrót wielokrotności — na ile dzisiejsza wycena (cena / przychody) utrzymuje się w przyszłości.
 *  3. Dryf liczby akcji — czy spółki średnio skupują własne akcje, czy emitują nowe.
 *
 * Z nich powstają dwa scenariusze ceny, oba pokazywane użytkownikowi:
 *  A — rynek bez zmian: firma rośnie wg faktu 1, rynek płaci tę samą wielokrotność co dziś.
 *  B — powrót do wartości: firma rośnie wg faktu 1, a wielokrotność wraca wg faktu 2.
 *
 * Czwarty fakt to szerokość błędu: rozkład log(cena prawdziwa / cena przewidziana) na każdym
 * horyzoncie. Z niego powstaje pas 80%, a z dolnej części pasa — cena zakupu.
 */
import type { Horizon, PanelRecord } from './facts-panel.js';
import { HORIZONS } from './facts-panel.js';
import { olsFit, quantile } from './stats.js';

export interface LinearFit {
  intercept: number;
  slope: number;
  n: number;
  /** Błąd średniokwadratowy dopasowania — do porównania, nie do budowy pasów. */
  rmse: number;
}

export interface ConstantFit {
  value: number;
  n: number;
}

export interface Observation {
  x: number;
  y: number;
  /** Kwartał decyzji — obserwacje z tego samego kwartału są zależne. */
  quarter: string;
  cik: string;
}

/**
 * Obcięcie skrajnych wartości do podanych centyli. Bez tego kilka spółek z tempem wzrostu
 * rzędu tysięcy procent (wyjście z bardzo niskiej bazy) decyduje o całym dopasowaniu.
 */
export function winsorize(xs: number[], lowerP = 0.01, upperP = 0.99): number[] {
  if (xs.length === 0) return [];
  const lo = quantile(xs, lowerP);
  const hi = quantile(xs, upperP);
  return xs.map((x) => Math.min(hi, Math.max(lo, x)));
}

export function fitLinear(obs: Observation[]): LinearFit | null {
  if (obs.length < 30) return null;
  const x = winsorize(obs.map((o) => o.x));
  const y = winsorize(obs.map((o) => o.y));
  const { intercept, coefs } = olsFit(
    x.map((v) => [v]),
    y
  );
  const slope = coefs[0];
  if (!Number.isFinite(intercept) || !Number.isFinite(slope)) return null;
  let sse = 0;
  for (let i = 0; i < x.length; i++) sse += (y[i] - (intercept + slope * x[i])) ** 2;
  return { intercept, slope, n: obs.length, rmse: Math.sqrt(sse / x.length) };
}

// ── Budowa obserwacji ──

const cagrOf = (from: number | null, to: number | null, years: number): number | null =>
  from != null && to != null && from > 0 && to > 0 ? Math.pow(to / from, 1 / years) - 1 : null;

/** Wzrost: dotychczasowe tempo (3 lata wstecz) kontra tempo zrealizowane przez `h` lat. */
export function growthObservations(rows: PanelRecord[], h: Horizon): Observation[] {
  const out: Observation[] = [];
  for (const r of rows) {
    const past = cagrOf(r.revenueTTM_3y, r.revenueTTM, 3);
    const future = cagrOf(r.revenueTTM, r.fwd[h].revenueTTM, h);
    if (past == null || future == null) continue;
    out.push({ x: past, y: future, quarter: r.asOf, cik: r.cik });
  }
  return out;
}

/** Wielokrotność: logarytm dzisiejszej ceny do przychodów kontra logarytm tej samej miary za `h` lat. */
export function reversionObservations(rows: PanelRecord[], h: Horizon): Observation[] {
  const out: Observation[] = [];
  for (const r of rows) {
    const now = r.ps;
    const f = r.fwd[h];
    if (now == null || now <= 0 || f.price == null || f.shares == null || f.revenueTTM == null || f.revenueTTM <= 0) continue;
    const future = (f.price * f.shares) / f.revenueTTM;
    if (!(future > 0)) continue;
    out.push({ x: Math.log(now), y: Math.log(future), quarter: r.asOf, cik: r.cik });
  }
  return out;
}

/** Dryf liczby akcji: mediana rocznej zmiany logarytmicznej. */
export function shareDriftFact(rows: PanelRecord[], h: Horizon): ConstantFit | null {
  const vals: number[] = [];
  for (const r of rows) {
    const future = r.fwd[h].shares;
    if (future == null || future <= 0 || r.shares <= 0) continue;
    vals.push(Math.log(future / r.shares) / h);
  }
  if (vals.length < 30) return null;
  return { value: quantile(vals, 0.5), n: vals.length };
}

// ── Fakty i prognoza ──

export type Scenario = 'A' | 'B';
export const SCENARIOS: Scenario[] = ['A', 'B'];
export const SCENARIO_LABEL: Record<Scenario, string> = {
  A: 'rynek bez zmian (ta sama wielokrotność co dziś)',
  B: 'powrót do wartości (wielokrotność wraca do typowej)',
};

export interface SharedFacts {
  growthFade: Partial<Record<Horizon, LinearFit>>;
  multipleReversion: Partial<Record<Horizon, LinearFit>>;
  shareDrift: Partial<Record<Horizon, ConstantFit>>;
}

export function learnFacts(rows: PanelRecord[]): SharedFacts {
  const facts: SharedFacts = { growthFade: {}, multipleReversion: {}, shareDrift: {} };
  for (const h of HORIZONS) {
    const g = fitLinear(growthObservations(rows, h));
    if (g) facts.growthFade[h] = g;
    const m = fitLinear(reversionObservations(rows, h));
    if (m) facts.multipleReversion[h] = m;
    const s = shareDriftFact(rows, h);
    if (s) facts.shareDrift[h] = s;
  }
  return facts;
}

/**
 * Przewidywana cena za `h` lat. Zwraca null, gdy brakuje faktu albo danych spółki —
 * nigdy wartości zastępczej.
 */
export function predictPrice(r: PanelRecord, facts: SharedFacts, h: Horizon, scenario: Scenario): number | null {
  const growth = facts.growthFade[h];
  const drift = facts.shareDrift[h];
  if (!growth || !drift) return null;

  const past = cagrOf(r.revenueTTM_3y, r.revenueTTM, 3);
  if (past == null) return null;

  // Tempo wzrostu przewidziane z dotychczasowego, ograniczone do zakresu, w którym model ma sens.
  const predictedGrowth = Math.min(1, Math.max(-0.5, growth.intercept + growth.slope * past));
  const revenueRatio = Math.pow(1 + predictedGrowth, h);
  const sharesRatio = Math.exp(drift.value * h);
  if (!(revenueRatio > 0) || !(sharesRatio > 0)) return null;

  const priceA = (r.price * revenueRatio) / sharesRatio;
  if (scenario === 'A') return priceA;

  const reversion = facts.multipleReversion[h];
  if (!reversion || r.ps == null || r.ps <= 0) return null;
  const predictedPs = Math.exp(reversion.intercept + reversion.slope * Math.log(r.ps));
  if (!(predictedPs > 0)) return null;
  return priceA * (predictedPs / r.ps);
}

// ── Szerokość błędu ──

export const BAND_QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9] as const;
export type BandQuantile = (typeof BAND_QUANTILES)[number];

export interface ErrorBands {
  /** log(cena prawdziwa / cena przewidziana) na wybranych centylach. */
  logQuantiles: Record<string, number>;
  n: number;
}

export interface Residual {
  logError: number;
  quarter: string;
  cik: string;
}

export function residuals(rows: PanelRecord[], facts: SharedFacts, h: Horizon, scenario: Scenario): Residual[] {
  const out: Residual[] = [];
  for (const r of rows) {
    const actual = r.fwd[h].price;
    if (actual == null || actual <= 0) continue;
    const pred = predictPrice(r, facts, h, scenario);
    if (pred == null || pred <= 0) continue;
    out.push({ logError: Math.log(actual / pred), quarter: r.asOf, cik: r.cik });
  }
  return out;
}

export function errorBands(res: Residual[]): ErrorBands | null {
  if (res.length < 100) return null;
  const xs = res.map((r) => r.logError);
  const logQuantiles: Record<string, number> = {};
  for (const p of BAND_QUANTILES) logQuantiles[String(p)] = quantile(xs, p);
  return { logQuantiles, n: res.length };
}

/** Pas cenowy: przewidywana cena przemnożona przez zmierzone centyle błędu. */
export function priceBand(pred: number, bands: ErrorBands): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [p, q] of Object.entries(bands.logQuantiles)) out[p] = pred * Math.exp(q);
  return out;
}
