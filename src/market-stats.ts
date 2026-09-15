import { DAY_MS, MAX_QUOTE_STALENESS_DAYS, lastQuoteIndexAtOrBefore, type ParsedCache, type Quote } from './data-loader.js';

export interface MarketStats {
  price: number;
  sma200: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  beta: number | null;
  momentum12_1: number | null;
  drawdown24m: number | null;
  observations: number;
}

const TRADING_DAYS_YEAR = 252;
const MIN_BETA_PAIRS = 250;

const dayKey = (q: Quote) => q.date.slice(0, 10);

const indexCache = new WeakMap<Quote[], Map<string, number>>();
function adjByDay(quotes: Quote[]): Map<string, number> {
  let m = indexCache.get(quotes);
  if (!m) {
    m = new Map(quotes.map((q) => [dayKey(q), q.adj]));
    indexCache.set(quotes, m);
  }
  return m;
}

/**
 * Statystyki cenowe liczone WYŁĄCZNIE z notowań do dnia `asOf` włącznie.
 * Zastępują dawne atrapy (beta = 1, SMA200 = cena, 52W = cena ±20%).
 * Pole jest null, gdy historia jest za krótka — nigdy nie jest zgadywane.
 */
export function computeMarketStats(cache: ParsedCache, cik: string, asOf: string): MarketStats | null {
  const series = cache.prices[cik];
  if (!series?.quotes.length) return null;
  const q = series.quotes;
  const targetT = new Date(`${asOf.slice(0, 10)}T23:59:59Z`).getTime();
  const i = lastQuoteIndexAtOrBefore(q, targetT);
  if (i < 0 || targetT - q[i].t > MAX_QUOTE_STALENESS_DAYS * DAY_MS) return null;

  const n = i + 1;
  const price = q[i].close;

  let sma200: number | null = null;
  if (n >= 200) {
    let s = 0;
    for (let k = i - 199; k <= i; k++) s += q[k].close;
    sma200 = s / 200;
  }

  let hi: number | null = null;
  let lo: number | null = null;
  if (n >= 200) {
    hi = -Infinity;
    lo = Infinity;
    for (let k = Math.max(0, i - TRADING_DAYS_YEAR + 1); k <= i; k++) {
      hi = Math.max(hi, q[k].close);
      lo = Math.min(lo, q[k].close);
    }
  }

  const momentum12_1 = n > TRADING_DAYS_YEAR ? q[i - 21].adj / q[i - TRADING_DAYS_YEAR].adj - 1 : null;

  let drawdown24m: number | null = null;
  if (n >= TRADING_DAYS_YEAR) {
    let peak = 0;
    for (let k = Math.max(0, i - 2 * TRADING_DAYS_YEAR + 1); k <= i; k++) peak = Math.max(peak, q[k].close);
    drawdown24m = peak > 0 ? 1 - price / peak : null;
  }

  let beta: number | null = null;
  const idx = cache.macro['GSPC'];
  if (idx?.quotes.length && n > MIN_BETA_PAIRS) {
    const idxAdj = adjByDay(idx.quotes);
    const rs: number[] = [];
    const rm: number[] = [];
    for (let k = Math.max(1, i - 2 * TRADING_DAYS_YEAR + 1); k <= i; k++) {
      const m0 = idxAdj.get(dayKey(q[k - 1]));
      const m1 = idxAdj.get(dayKey(q[k]));
      if (m0 == null || m1 == null || m0 <= 0 || q[k - 1].adj <= 0) continue;
      rs.push(Math.log(q[k].adj / q[k - 1].adj));
      rm.push(Math.log(m1 / m0));
    }
    if (rs.length >= MIN_BETA_PAIRS) {
      const ms = rs.reduce((a, b) => a + b, 0) / rs.length;
      const mm = rm.reduce((a, b) => a + b, 0) / rm.length;
      let cov = 0;
      let vm = 0;
      for (let k = 0; k < rs.length; k++) {
        cov += (rs[k] - ms) * (rm[k] - mm);
        vm += (rm[k] - mm) ** 2;
      }
      beta = vm > 0 ? cov / vm : null;
    }
  }

  return {
    price,
    sma200,
    fiftyTwoWeekHigh: hi,
    fiftyTwoWeekLow: lo,
    beta,
    momentum12_1,
    drawdown24m,
    observations: n,
  };
}
