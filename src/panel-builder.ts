/**
 * Wiersze panelu faktów dla JEDNEJ spółki. Wspólne dla panelu S&P i pełnego uniwersum,
 * żeby obie wersje liczyły dokładnie to samo.
 *
 * Kolumny bieżące: wyłącznie fakty zaakceptowane przez SEC przed dniem decyzji (`factsKnownAt`).
 * Kolumny przyszłe (fwd*): etykiety, liczone z faktów znanych w dniu, na który patrzymy w przyszłość.
 */
import { DAY_MS, factsKnownAt, getQuoteAtDate, type CompanyFacts, type PriceSeries } from './data-loader.js';
import { HORIZONS } from './facts-panel.js';
import { addMonths } from './purging.js';
import { MAX_FUNDAMENTALS_STALENESS_DAYS } from './sec-edgar-provider.js';
import { sectorFromSic } from './sectors.js';
import { C, XbrlView, type XbrlValue } from './xbrl.js';

export type Cell = string | number | null;
export type PanelRowValues = Record<string, Cell>;

export interface CompanyInput {
  cik: string;
  ticker: string;
  sic: number | null;
  prices: PriceSeries;
  /** Wszystkie fakty spółki z czasem akceptacji (`filedT`); filtr point-in-time robi builder. */
  facts: CompanyFacts;
  terminal: { kind: string; eventDate: string | null } | null;
}

export interface PanelSkips {
  noPrice: number;
  noRevenue: number;
  /** Ostatnie przychody starsze niż MAX_FUNDAMENTALS_STALENESS_DAYS — spółka przestała raportować. */
  staleRevenue: number;
  noShares: number;
  staleShares: number;
  belowMinMarketCap: number;
}

export const emptySkips = (): PanelSkips => ({
  noPrice: 0,
  noRevenue: 0,
  staleRevenue: 0,
  noShares: 0,
  staleShares: 0,
  belowMinMarketCap: 0,
});

export interface BuildOptions {
  /** Ostatni dzień z notowaniami w danych — horyzont za nim to „brak danych”, a nie „spółka zniknęła”. */
  endDay: string;
  /** Minimalna kapitalizacja w dniu decyzji (pełne uniwersum). Brak = bez progu (panel S&P). */
  minMarketCap?: number;
}

const ratio = (a: number | null, b: number | null): number | null =>
  a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null;

const dayT = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime();
const isFresh = (v: XbrlValue | null, atT: number) => v != null && atT - v.endT <= MAX_FUNDAMENTALS_STALENESS_DAYS * DAY_MS;

export function buildCompanyRows(c: CompanyInput, asOfDates: string[], opts: BuildOptions, skips: PanelSkips): PanelRowValues[] {
  const series = c.prices;
  // Ceny Yahoo są skorygowane o splity do dziś, liczba akcji z SEC nie jest.
  // Bez tego przeliczenia kapitalizacja spółki po splicie byłaby zaniżona (AAPL 2020: 4-krotnie).
  const splitFactor = (fromT: number) =>
    series.splits.reduce(
      (m, sp) => (sp.t > fromT && sp.numerator > 0 && sp.denominator > 0 ? (m * sp.numerator) / sp.denominator : m),
      1
    );
  const lastQuote = series.quotes[series.quotes.length - 1];
  const out: PanelRowValues[] = [];

  for (const asOf of asOfDates) {
    if (asOf > opts.endDay) continue;
    const now = getQuoteAtDate(series, asOf);
    if (!now) {
      skips.noPrice++;
      continue;
    }
    const asOfT = dayT(asOf);
    const view = new XbrlView(factsKnownAt(c.facts, series, asOf));

    const revenueV = view.ttm(C.revenue);
    if (revenueV == null) {
      skips.noRevenue++;
      continue;
    }
    if (!isFresh(revenueV, asOfT)) {
      skips.staleRevenue++;
      continue;
    }
    const sharesFact = view.latestInstant(C.sharesDei, 'dei', 'shares');
    if (sharesFact == null || sharesFact.val <= 0) {
      skips.noShares++;
      continue;
    }
    if (!isFresh(sharesFact, asOfT)) {
      skips.staleShares++;
      continue;
    }
    const revenue = revenueV.val;
    const shares = sharesFact.val * splitFactor(sharesFact.endT);
    const marketCap = now.close * shares;
    if (opts.minMarketCap != null && marketCap < opts.minMarketCap) {
      skips.belowMinMarketCap++;
      continue;
    }

    const netIncome = view.ttm(C.netIncome)?.val ?? null;
    const ebit = view.ttm(C.ebit)?.val ?? null;
    const ocf = view.ttm(C.ocf)?.val ?? null;
    const capex = view.ttm(C.capex)?.val ?? null;
    const dividends = view.ttm(C.dividends)?.val ?? null;
    const equity = view.latestInstant(C.equity)?.val ?? null;
    const assets = view.latestInstant(C.assets)?.val ?? null;
    const cash = view.latestInstant(C.cash)?.val ?? null;
    const liabilities = view.latestInstant(C.liabilities)?.val ?? null;
    const fcf = ocf != null && capex != null ? ocf - Math.abs(capex) : null;

    // Wynik sprzed roku i sprzed 3 lat: odniesieniem jest koniec okresu obrotowego, nie data kalendarzowa.
    // SEC raportuje na końce kwartałów spółki, więc pytanie o „dokładnie 3 lata temu” nie trafia w żaden raport.
    const yearMs = 365 * DAY_MS;
    const ends = view.periodEnds(C.revenue, 28);
    const endNearest = (targetT: number, tolDays = 60): number | null => {
      let best: number | null = null;
      for (const e of ends) if (best == null || Math.abs(e - targetT) < Math.abs(best - targetT)) best = e;
      return best != null && Math.abs(best - targetT) <= tolDays * DAY_MS ? best : null;
    };
    const end1y = endNearest(revenueV.endT - yearMs);
    const end3y = endNearest(revenueV.endT - 3 * yearMs);
    const ttmAt = (concepts: readonly string[], endT: number | null) =>
      endT != null ? (view.ttm(concepts, endT)?.val ?? null) : null;

    const ev = liabilities != null && cash != null ? marketCap + liabilities - cash : null;

    const row: PanelRowValues = {
      ticker: c.ticker,
      cik: c.cik,
      asOf,
      sector: sectorFromSic(c.sic),
      sic: c.sic,
      price: now.close,
      shares,
      marketCap,
      revenueTTM: revenue,
      ebitTTM: ebit,
      netIncomeTTM: netIncome,
      ocfTTM: ocf,
      capexTTM: capex,
      fcfTTM: fcf,
      dividendsTTM: dividends,
      equity,
      assets,
      totalDebt: liabilities,
      cash,
      revenueTTM_1y: ttmAt(C.revenue, end1y),
      revenueTTM_3y: ttmAt(C.revenue, end3y),
      netIncomeTTM_1y: ttmAt(C.netIncome, end1y),
      netIncomeTTM_3y: ttmAt(C.netIncome, end3y),
      ps: ratio(marketCap, revenue),
      pe: ratio(marketCap, netIncome),
      pb: ratio(marketCap, equity),
      evEbit: ratio(ev, ebit),
      terminalKind: c.terminal?.kind ?? null,
      terminalDate: c.terminal?.eventDate ?? null,
      lastQuoteDate: new Date(lastQuote.t).toISOString().slice(0, 10),
    };

    for (const h of HORIZONS) {
      const fwdDate = addMonths(asOf, 12 * h).toISOString().slice(0, 10);
      const beyondData = fwdDate > opts.endDay;
      const fwd = beyondData ? null : getQuoteAtDate(series, fwdDate);
      row[`fwdPrice${h}`] = fwd?.close ?? null;
      row[`fwdTotalRatio${h}`] = fwd && now.adj > 0 ? fwd.adj / now.adj : null;

      // Przyszłe wyniki tylko wtedy, gdy są świeże na tamten dzień. Spółka, która przestała raportować,
      // nie może dostać „przyszłych przychodów” równych starym — to zaniżałoby zmierzone tempo wzrostu.
      const fwdT = dayT(fwdDate);
      const fwdView = beyondData ? null : new XbrlView(factsKnownAt(c.facts, series, fwdDate));
      const fwdRevenue = fwdView?.ttm(C.revenue) ?? null;
      const fwdNetIncome = fwdView?.ttm(C.netIncome) ?? null;
      const fwdShares = fwdView?.latestInstant(C.sharesDei, 'dei', 'shares') ?? null;
      row[`fwdRevenueTTM${h}`] = isFresh(fwdRevenue, fwdT) ? fwdRevenue!.val : null;
      row[`fwdNetIncomeTTM${h}`] = isFresh(fwdNetIncome, fwdT) ? fwdNetIncome!.val : null;
      row[`fwdShares${h}`] = isFresh(fwdShares, fwdT) ? fwdShares!.val * splitFactor(fwdShares!.endT) : null;
    }
    out.push(row);
  }
  return out;
}
