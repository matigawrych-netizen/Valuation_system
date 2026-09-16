/**
 * Reguły pełnego uniwersum: kto jest kandydatem, kto odpada i pod jakim tickerem szukać notowań.
 * Wspólne dla skryptów pobierających dane i budujących panel.
 */
import fs from 'node:fs';
import { slimQuotes, type PriceSeries } from './data-loader.js';
import { universeDir } from './paths.js';
import { baseForm, loadFilings } from './sec-events.js';

export interface Candidate {
  cik: string;
  name: string;
  maxFloat: number;
  firstFloat: string;
  lastFloat: string;
}

export const ANNUAL_REPORT_FORMS = new Set(['10-K', '10-K405', '10-KT', '10-KSB']);
export const EXCLUDED_SIC = new Map<number, string>([[6770, 'SPAC (blank check)']]);

/** Giełdy z planu (NYSE i Nasdaq). SEC podaje je w polu `exchanges` listy formularzy. */
export const ACCEPTED_EXCHANGES = new Set(['NYSE', 'Nasdaq']);

export function readCandidates(): Candidate[] {
  const file = universeDir('meta', 'candidates.json');
  if (!fs.existsSync(file)) throw new Error(`Brak ${file}. Uruchom: npx tsx scripts/universe-discover.ts`);
  return JSON.parse(fs.readFileSync(file, 'utf-8')).candidates;
}

/** Powód odrzucenia spółki z uniwersum albo null, gdy się nadaje. */
export function exclusionReason(cik: string, subsDir = universeDir('submissions')): string | null {
  const main = `${subsDir}/CIK${cik}.json`;
  if (!fs.existsSync(main)) return 'brak listy formularzy';
  const raw = JSON.parse(fs.readFileSync(main, 'utf-8'));
  const sic = Number(raw.sic);
  if (EXCLUDED_SIC.has(sic)) return EXCLUDED_SIC.get(sic)!;
  const filings = loadFilings(cik, subsDir);
  if (!filings.some((f) => ANNUAL_REPORT_FORMS.has(baseForm(f.form)))) {
    return 'brak raportów 10-K (np. spółka zagraniczna na 20-F/40-F)';
  }
  return null;
}

export interface Listing {
  name: string;
  sic: number | null;
  /** Ticker na akceptowanej giełdzie; null, gdy spółka już nie jest notowana albo notowana gdzie indziej. */
  ticker: string | null;
  exchange: string | null;
  /** Wszystkie pary ticker/giełda z SEC — do raportu, dlaczego spółka nie ma notowań. */
  all: { ticker: string; exchange: string | null }[];
}

export function listingOf(cik: string, subsDir = universeDir('submissions')): Listing {
  const raw = JSON.parse(fs.readFileSync(`${subsDir}/CIK${cik}.json`, 'utf-8'));
  const tickers: string[] = raw.tickers ?? [];
  const exchanges: (string | null)[] = raw.exchanges ?? [];
  const all = tickers.map((t, i) => ({ ticker: t, exchange: exchanges[i] ?? null }));
  const accepted = all.find((x) => x.exchange != null && ACCEPTED_EXCHANGES.has(x.exchange));
  const sic = Number(raw.sic);
  return {
    name: raw.name,
    sic: Number.isFinite(sic) && sic > 0 ? sic : null,
    ticker: accepted?.ticker ?? null,
    exchange: accepted?.exchange ?? null,
    all,
  };
}

/** Yahoo zapisuje klasy akcji z myślnikiem: BRK.B → BRK-B. */
export const yahooSymbol = (ticker: string) => ticker.trim().toUpperCase().replace(/\./g, '-');

/** Notowania zapisane przez `universe-download-prices` (format wykresu Yahoo); null, gdy plik jest pusty lub błędny. */
export function loadPriceFile(file: string): PriceSeries | null {
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (raw.error || !Array.isArray(raw.quotes)) return null;
  const quotes = slimQuotes(raw.quotes);
  if (quotes.length === 0) return null;
  return {
    quotes,
    splits: (raw.events?.splits ?? []).map((s: any) => ({
      date: s.date,
      t: new Date(s.date).getTime(),
      numerator: s.numerator,
      denominator: s.denominator,
    })),
  };
}
