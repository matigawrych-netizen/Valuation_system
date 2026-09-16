/**
 * Panel faktów: jeden wiersz = (spółka, data decyzji), z wielkościami bieżącymi i przyszłymi na 1–5 lat.
 *
 * Do czego służy: uczenia „faktów wspólnych” całego systemu — jak szybko wygasa wzrost firmy,
 * jak szybko wielokrotność wraca do typowej i jak szeroki jest błąd prognozy ceny na 1..5 lat.
 * Kolumny przyszłe są etykietami (wolno im korzystać z danych z przyszłości), kolumny bieżące
 * nie mogą — dlatego powstają wyłącznie z faktów zaakceptowanych przez SEC przed datą decyzji.
 */

import fs from 'node:fs';

export const HORIZONS = [1, 2, 3, 4, 5] as const;
export type Horizon = (typeof HORIZONS)[number];

export const PANEL_COLUMNS = [
  'ticker',
  'cik',
  'asOf',
  'sector',
  'sic',
  // stan bieżący (point-in-time)
  'price',
  'shares',
  'marketCap',
  'revenueTTM',
  'ebitTTM',
  'netIncomeTTM',
  'ocfTTM',
  'capexTTM',
  'fcfTTM',
  'dividendsTTM',
  'equity',
  'assets',
  'totalDebt',
  'cash',
  // historia znana w dniu decyzji (do policzenia dotychczasowego tempa wzrostu)
  'revenueTTM_1y',
  'revenueTTM_3y',
  'netIncomeTTM_1y',
  'netIncomeTTM_3y',
  // wielokrotności bieżące
  'ps',
  'pe',
  'pb',
  'evEbit',
  // zdarzenia końcowe i zasięg notowań
  'terminalKind',
  'terminalDate',
  'lastQuoteDate',
  ...HORIZONS.flatMap((h) => [
    `fwdPrice${h}`, // cena po h latach, skorygowana o splity (porównywalna z `price`)
    `fwdTotalRatio${h}`, // zwrot całkowity (cena + dywidendy) jako mnożnik
    `fwdRevenueTTM${h}`,
    `fwdNetIncomeTTM${h}`,
    `fwdShares${h}`,
  ]),
] as const;

export type PanelRow = Record<(typeof PANEL_COLUMNS)[number], string | number | null>;

/** Dochód z dywidend rozdzielony od ruchu ceny: (zwrot całkowity) / (zwrot z ceny) − 1. */
export function dividendContribution(fwdPrice: number | null, price: number | null, totalRatio: number | null): number | null {
  if (fwdPrice == null || price == null || totalRatio == null || price <= 0 || fwdPrice <= 0) return null;
  const priceRatio = fwdPrice / price;
  if (priceRatio <= 0) return null;
  return totalRatio / priceRatio - 1;
}

/** Roczne tempo wzrostu między dwiema wielkościami oddalonymi o `years` lat. Null, gdy baza ≤ 0. */
export function cagr(from: number | null, to: number | null, years: number): number | null {
  if (from == null || to == null || years <= 0) return null;
  if (from <= 0 || to <= 0) return null;
  return Math.pow(to / from, 1 / years) - 1;
}

export interface PanelForward {
  price: number | null;
  totalRatio: number | null;
  revenueTTM: number | null;
  netIncomeTTM: number | null;
  shares: number | null;
}

export interface PanelRecord {
  ticker: string;
  cik: string;
  asOf: string;
  sector: string | null;
  price: number;
  shares: number;
  marketCap: number;
  revenueTTM: number;
  netIncomeTTM: number | null;
  ebitTTM: number | null;
  fcfTTM: number | null;
  equity: number | null;
  revenueTTM_1y: number | null;
  revenueTTM_3y: number | null;
  netIncomeTTM_3y: number | null;
  ps: number | null;
  pe: number | null;
  pb: number | null;
  terminalKind: string | null;
  fwd: Record<Horizon, PanelForward>;
}

const num = (s: string | undefined): number | null => {
  if (s == null || s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

/** Wczytuje panel z CSV. Wiersze bez ceny, liczby akcji albo przychodów nie powstają w generatorze. */
export function parsePanel(file: string): PanelRecord[] {
  const text = fs.readFileSync(file, 'utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(',');
  const idx: Record<string, number> = {};
  header.forEach((h, i) => (idx[h] = i));

  for (const required of ['cik', 'asOf', 'price', 'shares', 'revenueTTM']) {
    if (!(required in idx)) throw new Error(`Panel ${file} nie ma kolumny ${required}.`);
  }

  const out: PanelRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const g = (name: string) => num(c[idx[name]]);
    const price = g('price');
    const shares = g('shares');
    const revenue = g('revenueTTM');
    if (price == null || shares == null || revenue == null) continue;

    const fwd = {} as Record<Horizon, PanelForward>;
    for (const h of HORIZONS) {
      fwd[h] = {
        price: g(`fwdPrice${h}`),
        totalRatio: g(`fwdTotalRatio${h}`),
        revenueTTM: g(`fwdRevenueTTM${h}`),
        netIncomeTTM: g(`fwdNetIncomeTTM${h}`),
        shares: g(`fwdShares${h}`),
      };
    }

    out.push({
      ticker: c[idx.ticker] ?? '',
      cik: c[idx.cik],
      asOf: c[idx.asOf],
      sector: c[idx.sector] || null,
      price,
      shares,
      marketCap: g('marketCap') ?? price * shares,
      revenueTTM: revenue,
      netIncomeTTM: g('netIncomeTTM'),
      ebitTTM: g('ebitTTM'),
      fcfTTM: g('fcfTTM'),
      equity: g('equity'),
      revenueTTM_1y: g('revenueTTM_1y'),
      revenueTTM_3y: g('revenueTTM_3y'),
      netIncomeTTM_3y: g('netIncomeTTM_3y'),
      ps: g('ps'),
      pe: g('pe'),
      pb: g('pb'),
      terminalKind: c[idx.terminalKind] || null,
      fwd,
    });
  }
  return out;
}
