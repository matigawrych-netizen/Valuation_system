/**
 * Co widzi specjalista: cechy spółki w dniu decyzji (docs/specjalisci.md, punkt 3).
 *
 * Cechy zależne od ceny (wyceny, kapitalizacja) liczone są dla podanej ceny, a nie dla dzisiejszego kursu —
 * cena zakupu to pytanie „jaka byłaby prognoza, gdyby akcja kosztowała P”.
 * Brak danych = NaN. Model prosty używa tylko wzrostu przychodów, ceny/przychodów i liczby akcji.
 */
import fs from 'node:fs';
import { getQuoteAtDate, type PriceSeries } from './data-loader.js';
import { cagr, parsePanel, type Horizon, type PanelRecord } from './facts-panel.js';
import { addMonths } from './purging.js';
import { quantile } from './stats.js';

export interface SpecialistRow extends PanelRecord {
  /** log(kurs sprzed miesiąca / kurs sprzed 12 miesięcy), z dywidendami. */
  momentum12_1: number | null;
  /** log(liczba akcji dziś / liczba akcji rok temu). */
  shareChange1y: number | null;
}

/** Sektory zwracane przez `sectorFromSic` — kolejność ustala kolumny cech. */
export const SECTORS = [
  'Agriculture',
  'Mining & Energy',
  'Construction',
  'Manufacturing',
  'Transportation & Communications',
  'Utilities',
  'Wholesale Trade',
  'Retail Trade',
  'Financial Services',
  'Services',
  'Public Administration',
  'Nonclassifiable',
] as const;

export const NUMERIC_FEATURES = [
  'logPriceToSales',
  'earningsYield',
  'bookToPrice',
  'ebitToEv',
  'fcfYield',
  'dividendYield',
  'revenueGrowth1y',
  'revenueCagr3y',
  'netMarginChange1y',
  'netMargin',
  'fcfMargin',
  'liabilitiesToAssets',
  'cashToAssets',
  'logMarketCap',
  'momentum12_1',
  'shareChange1y',
] as const;

export const FEATURE_NAMES: string[] = [...NUMERIC_FEATURES, ...SECTORS.map((s) => `sector:${s}`)];

export const FEATURE_LABEL: Record<string, string> = {
  logPriceToSales: 'cena / przychody',
  earningsYield: 'zysk / cena',
  bookToPrice: 'wartość księgowa / cena',
  ebitToEv: 'EBIT / wartość firmy',
  fcfYield: 'wolne przepływy / kapitalizacja',
  dividendYield: 'stopa dywidendy',
  revenueGrowth1y: 'przychody rok do roku',
  revenueCagr3y: 'przychody średniorocznie z 3 lat',
  netMarginChange1y: 'zmiana marży netto rok do roku',
  netMargin: 'marża netto',
  fcfMargin: 'marża wolnych przepływów',
  liabilitiesToAssets: 'zobowiązania / aktywa',
  cashToAssets: 'gotówka / aktywa',
  logMarketCap: 'wielkość spółki',
  momentum12_1: 'zmiana kursu z 12 miesięcy bez ostatniego',
  shareChange1y: 'zmiana liczby akcji w roku',
  ...Object.fromEntries(SECTORS.map((s) => [`sector:${s}`, `sektor ${s}`])),
};

/** Cechy, bez których żaden specjalista nie głosuje, i które sprawdzamy względem zakresu danych uczących. */
export const KEY_FEATURES = ['logPriceToSales', 'revenueCagr3y'] as const;
export type KeyFeature = (typeof KEY_FEATURES)[number];
const featureIndex = (name: string) => FEATURE_NAMES.indexOf(name);
export const KEY_FEATURE_INDEX: Record<KeyFeature, number> = {
  logPriceToSales: featureIndex('logPriceToSales'),
  revenueCagr3y: featureIndex('revenueCagr3y'),
};

const div = (a: number | null, b: number | null): number =>
  a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : NaN;

/** Wektor cech spółki przy cenie akcji `price`. */
export function featureVector(r: SpecialistRow, price: number): Float64Array {
  const x = new Float64Array(FEATURE_NAMES.length);
  const marketCap = price * r.shares;
  const ev = r.liabilities != null && r.cash != null ? marketCap + r.liabilities - r.cash : null;
  const revenue = r.revenueTTM > 0 ? r.revenueTTM : null;
  const revenue1y = r.revenueTTM_1y != null && r.revenueTTM_1y > 0 ? r.revenueTTM_1y : null;
  const margin = div(r.netIncomeTTM, revenue);
  const margin1y = div(r.netIncomeTTM_1y, revenue1y);
  const values: number[] = [
    revenue != null && marketCap > 0 ? Math.log(marketCap / revenue) : NaN,
    div(r.netIncomeTTM, marketCap),
    div(r.equity, marketCap),
    div(r.ebitTTM, ev),
    div(r.fcfTTM, marketCap),
    r.dividendsTTM != null ? div(Math.abs(r.dividendsTTM), marketCap) : NaN,
    revenue != null && revenue1y != null ? Math.log(revenue / revenue1y) : NaN,
    cagr(r.revenueTTM_3y, r.revenueTTM, 3) ?? NaN,
    Number.isFinite(margin) && Number.isFinite(margin1y) ? margin - margin1y : NaN,
    margin,
    div(r.fcfTTM, revenue),
    div(r.liabilities, r.assets),
    div(r.cash, r.assets),
    marketCap > 0 ? Math.log(marketCap) : NaN,
    r.momentum12_1 ?? NaN,
    r.shareChange1y ?? NaN,
  ];
  for (let i = 0; i < values.length; i++) x[i] = Number.isFinite(values[i]) ? values[i] : NaN;
  const s = r.sector == null ? -1 : SECTORS.indexOf(r.sector as (typeof SECTORS)[number]);
  if (s >= 0) x[NUMERIC_FEATURES.length + s] = 1;
  return x;
}

/** Cel uczenia: log(cena po h latach / dzisiejsza cena). Null, gdy wynik nie jest znany. */
export function targetLog(r: PanelRecord, h: Horizon): number | null {
  const f = r.fwd[h].price;
  return f != null && f > 0 && r.price > 0 ? Math.log(f / r.price) : null;
}

/** Dywidenda na akcję w skali roku; brak danych w raporcie traktowany jest jako brak dywidendy (zliczany w raporcie). */
export function dividendPerShare(r: PanelRecord): { value: number; known: boolean } {
  if (r.dividendsTTM == null) return { value: 0, known: false };
  return { value: Math.abs(r.dividendsTTM) / r.shares, known: true };
}

// ── Wstrzymanie się od głosu ──

export type KeyRanges = Record<KeyFeature, [number, number]>;

/** 1. i 99. centyl kluczowych cech w danych uczących specjalisty. */
export function keyRanges(trainRows: SpecialistRow[]): KeyRanges {
  const out = {} as KeyRanges;
  for (const k of KEY_FEATURES) {
    const vals: number[] = [];
    for (const r of trainRows) {
      const v = featureVector(r, r.price)[KEY_FEATURE_INDEX[k]];
      if (Number.isFinite(v)) vals.push(v);
    }
    if (vals.length === 0) throw new Error(`keyRanges: brak wartości cechy ${k} w danych uczących.`);
    out[k] = [quantile(vals, 0.01), quantile(vals, 0.99)];
  }
  return out;
}

/** Czy wiersz ma wszystkie kluczowe cechy (warunek wejścia do pamięci i do głosowania). */
export function hasKeyFeatures(r: SpecialistRow): boolean {
  const x = featureVector(r, r.price);
  return KEY_FEATURES.every((k) => Number.isFinite(x[KEY_FEATURE_INDEX[k]]));
}

/** Powód wstrzymania się od głosu albo null, gdy specjalista może ocenić spółkę. */
export function abstainReason(r: SpecialistRow, ranges: KeyRanges): string | null {
  const x = featureVector(r, r.price);
  for (const k of KEY_FEATURES) {
    const v = x[KEY_FEATURE_INDEX[k]];
    if (!Number.isFinite(v)) return `missing:${k}`;
    const [lo, hi] = ranges[k];
    if (v < lo || v > hi) return `out_of_range:${k}`;
  }
  return null;
}

// ── Cechy dopisywane do panelu ──

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Zmiana kursu (z dywidendami) od 12 do 1 miesiąca przed decyzją, w logarytmie. Null bez notowań. */
export function momentum12to1(series: PriceSeries, asOf: string): number | null {
  const recent = getQuoteAtDate(series, iso(addMonths(asOf, -1)));
  const old = getQuoteAtDate(series, iso(addMonths(asOf, -12)));
  if (!recent || !old || !(recent.adj > 0) || !(old.adj > 0)) return null;
  return Math.log(recent.adj / old.adj);
}

/** Zmiana liczby akcji w roku z wierszy panelu tej samej spółki. Brak wiersza sprzed roku = null. */
export function shareChangeByRow(rows: PanelRecord[]): Map<string, number | null> {
  const shares = new Map<string, number>();
  for (const r of rows) shares.set(`${r.cik}|${r.asOf}`, r.shares);
  const out = new Map<string, number | null>();
  for (const r of rows) {
    const prev = shares.get(`${r.cik}|${iso(addMonths(r.asOf, -12))}`);
    out.set(`${r.cik}|${r.asOf}`, prev != null && prev > 0 && r.shares > 0 ? Math.log(r.shares / prev) : null);
  }
  return out;
}

export const EXTRAS_HEADER = 'cik,asOf,momentum12_1,shareChange1y';

/** Panel + cechy dopisane przez `scripts/specialists-features.ts`. Brak pliku albo brak wiersza to błąd. */
export function loadSpecialistRows(panelFile: string, extrasFile: string): SpecialistRow[] {
  if (!fs.existsSync(extrasFile)) {
    throw new Error(`Brak pliku ${extrasFile}. Uruchom: npm run specialists:features`);
  }
  const extras = new Map<string, { m: number | null; s: number | null }>();
  const lines = fs.readFileSync(extrasFile, 'utf-8').split(/\r?\n/).filter((l) => l.length > 0);
  if (lines[0] !== EXTRAS_HEADER) throw new Error(`Nieoczekiwany nagłówek ${extrasFile}: ${lines[0]}`);
  const num = (s: string) => (s === '' ? null : Number(s));
  for (const line of lines.slice(1)) {
    const [cik, asOf, m, s] = line.split(',');
    extras.set(`${cik}|${asOf}`, { m: num(m), s: num(s) });
  }
  const out: SpecialistRow[] = [];
  for (const r of parsePanel(panelFile)) {
    const e = extras.get(`${r.cik}|${r.asOf}`);
    if (!e) throw new Error(`Brak cech dodatkowych dla ${r.cik} ${r.asOf} — plik ${extrasFile} jest nieaktualny.`);
    out.push({ ...r, momentum12_1: e.m, shareChange1y: e.s });
  }
  return out;
}
