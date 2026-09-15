import * as fs from 'node:fs';
import { BLOCKS, MODEL_KEYS, computeBlockValues, type ValuationBlock } from './valuation-engine.js';

/** Kolumny CSV datasetu w kolejności zapisu (scripts/generate-dataset.ts). */
export const DATASET_COLUMNS = [
  'ticker',
  'cik',
  'asOf',
  'sector',
  'sic',
  'price',
  'fwdReturn12m',
  'fwdReturn3m',
  'target_excess',
  ...MODEL_KEYS,
  'fairValue',
  'upside',
  'entryTarget',
  'marginOfSafety',
  'confidenceScore',
  'validModelCount',
  'lowConfidence',
  'pDefault',
  'verdict',
  'capHits',
  'dominantArchetype',
  'beta',
  'bookValuePerShare',
  'eps',
  'fcfPerShare',
  'momentum12_1',
  'marketCap',
  'stalenessDays',
] as const;

export const REQUIRED_COLUMNS = ['ticker', 'cik', 'asOf', 'sector', 'price', 'fwdReturn12m', 'dominantArchetype', ...MODEL_KEYS];

export interface Row {
  ticker: string;
  cik: string;
  asOf: string;
  sector: string | null;
  dominantArchetype: string;
  price: number;
  fwdReturn: number;
  fwdReturn3m: number | null;
  targetExcess: number | null;
  models: Record<string, number>;
  blocks: Partial<Record<ValuationBlock, number>>;
  fairValue: number | null;
  upside: number | null;
  entryTarget: number | null;
  marginOfSafety: number | null;
  confidenceScore: number | null;
  validModelCount: number | null;
  lowConfidence: boolean | null;
  pDefault: number | null;
  verdict: string | null;
  capHits: number | null;
  features: {
    beta: number | null;
    bookValuePerShare: number | null;
    eps: number | null;
    fcfPerShare: number | null;
    momentum12_1: number | null;
    marketCap: number | null;
    stalenessDays: number | null;
  };
}

/** Parsuje dataset. Brak wymaganej kolumny albo nieparsowalna liczba => wyjątek (bez cichych wartości domyślnych). */
export function parseCSV(file: string): Row[] {
  const lines = fs.readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error(`Pusty plik datasetu: ${file}`);
  const header = lines[0].trim().split(',');
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Brakujące kolumny w pliku CSV: ${missing.join(', ')}`);
  const idx = (name: string) => header.indexOf(name);

  return lines.slice(1).map((line, lineNo) => {
    const parts = line.trim().split(',');
    const cell = (name: string) => {
      const i = idx(name);
      return i >= 0 ? (parts[i] ?? '') : '';
    };
    const num = (name: string, required = false): number | null => {
      const raw = cell(name);
      if (raw === '') {
        if (required) throw new Error(`${file}:${lineNo + 2}: pusta wymagana kolumna ${name}`);
        return null;
      }
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new Error(`${file}:${lineNo + 2}: kolumna ${name} = "${raw}" nie jest liczbą`);
      return v;
    };

    const models: Record<string, number> = {};
    for (const k of MODEL_KEYS) {
      const v = num(k);
      if (v != null) models[k] = v;
    }
    const blockValues = computeBlockValues(models);
    const blocks: Partial<Record<ValuationBlock, number>> = {};
    for (const b of BLOCKS) if (blockValues[b] != null) blocks[b] = blockValues[b]!;

    const lowRaw = cell('lowConfidence');
    return {
      ticker: cell('ticker'),
      cik: cell('cik'),
      asOf: cell('asOf'),
      sector: cell('sector') || null,
      dominantArchetype: cell('dominantArchetype'),
      price: num('price', true)!,
      fwdReturn: num('fwdReturn12m', true)!,
      fwdReturn3m: num('fwdReturn3m'),
      targetExcess: num('target_excess'),
      models,
      blocks,
      fairValue: num('fairValue'),
      upside: num('upside'),
      entryTarget: num('entryTarget'),
      marginOfSafety: num('marginOfSafety'),
      confidenceScore: num('confidenceScore'),
      validModelCount: num('validModelCount'),
      lowConfidence: lowRaw === '' ? null : lowRaw === 'true',
      pDefault: num('pDefault'),
      verdict: cell('verdict') || null,
      capHits: num('capHits'),
      features: {
        beta: num('beta'),
        bookValuePerShare: num('bookValuePerShare'),
        eps: num('eps'),
        fcfPerShare: num('fcfPerShare'),
        momentum12_1: num('momentum12_1'),
        marketCap: num('marketCap'),
        stalenessDays: num('stalenessDays'),
      },
    };
  });
}

/** Grupuje wiersze po dacie decyzji (kwartale), zachowując porządek chronologiczny. */
export function groupByQuarter<T extends { asOf: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of [...rows].sort((a, b) => a.asOf.localeCompare(b.asOf))) {
    if (!m.has(r.asOf)) m.set(r.asOf, []);
    m.get(r.asOf)!.push(r);
  }
  return m;
}
