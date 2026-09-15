/**
 * Panel faktów: jeden wiersz = (spółka, data decyzji), z wielkościami bieżącymi i przyszłymi na 1–5 lat.
 *
 * Do czego służy: uczenia „faktów wspólnych” całego systemu — jak szybko wygasa wzrost firmy,
 * jak szybko wielokrotność wraca do typowej i jak szeroki jest błąd prognozy ceny na 1..5 lat.
 * Kolumny przyszłe są etykietami (wolno im korzystać z danych z przyszłości), kolumny bieżące
 * nie mogą — dlatego powstają wyłącznie z faktów zaakceptowanych przez SEC przed datą decyzji.
 */

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
