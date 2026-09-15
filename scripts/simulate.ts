/**
 * Symulator portfela używany przez algorytm genetyczny (scripts/evolve.ts).
 *
 * Najpierw `buildSimUniverse` liczy raz wszystko, co nie zależy od genomu (snapshoty SEC point-in-time,
 * makro z FRED/ALFRED, ceny). Potem `runSimulation` dla danego genomu wykonuje tylko wycenę i reguły portfela.
 *
 * Maskowanie okresów: symulacja biegnie po ciągłych segmentach kwartałów. Na końcu segmentu portfel jest
 * likwidowany, a kolejny segment startuje z gotówki — zwrot „przez lukę” (np. zamaskowany blok) nie jest zarabiany.
 */
import fs from 'node:fs';
import {
  buildQuarterlyTimeline,
  getFundamentalsAsOf,
  getQuoteAtDate,
  getUniverseAsOf,
  type ParsedCache,
} from '../src/data-loader.js';
import { getMacroAsOf, type MacroEnvironment } from '../src/macro-provider.js';
import { computeMarketStats } from '../src/market-stats.js';
import { Portfolio } from '../src/portfolio.js';
import { asOfYear } from '../src/paths.js';
import { mapSecToYahooSnapshot } from '../src/sec-edgar-provider.js';
import { calculateFairValue, type WeightMatrix, type YahooFinanceSnapshot } from '../src/valuation-engine.js';

export interface SimConfig {
  matrixHiking: WeightMatrix;
  matrixHolding: WeightMatrix;
  matrixCutting: WeightMatrix;
  maxPositions: number;
  positionSizePct: number;
  sellOvervaluedAt: number;
  stopLossPct: number;
  minUpside: number;
  minModels: number;
  vixThreshold1: number;
  vixThreshold2: number;
  vixThreshold3: number;
  equityPctCalm: number;
  equityPctElevated: number;
  equityPctFear: number;
  equityPctPanic: number;
}

export const DEFAULT_PARAMS: Omit<SimConfig, 'matrixHiking' | 'matrixHolding' | 'matrixCutting'> = {
  maxPositions: 20,
  positionSizePct: 0.05,
  sellOvervaluedAt: 1.2,
  stopLossPct: 0.2,
  minUpside: 0.15,
  minModels: 5,
  vixThreshold1: 20,
  vixThreshold2: 30,
  vixThreshold3: 40,
  equityPctCalm: 0.95,
  equityPctElevated: 0.8,
  equityPctFear: 0.5,
  equityPctPanic: 0.2,
};

export interface SimCandidate {
  cik: string;
  ticker: string;
  price: number;
  snapshot: YahooFinanceSnapshot;
}

export interface SimQuarter {
  dateStr: string;
  macro: MacroEnvironment;
  /** CIK -> cena zamknięcia w dniu decyzji (tylko świeże notowania) */
  prices: Record<string, number>;
  candidates: SimCandidate[];
  gspc: number;
}

export interface SimUniverse {
  builtAt: string;
  quarters: SimQuarter[];
  /** CIK -> ostatni kod przyczyny usunięcia z indeksu (do obsługi pozycji, które przestały być notowane) */
  removalReason: Record<string, string | null>;
}

export function buildSimUniverse(cache: ParsedCache, startYear: number, endYear: number, log = console.log): SimUniverse {
  const quarters: SimQuarter[] = [];
  for (const t of buildQuarterlyTimeline(startYear, endYear)) {
    if (asOfYear(t.dateStr) > endYear) continue;
    const gspc = getQuoteAtDate(cache.macro['GSPC'], t.dateStr);
    if (!gspc) throw new Error(`Brak ^GSPC w ${t.dateStr}`);
    const q: SimQuarter = { dateStr: t.dateStr, macro: getMacroAsOf(cache, t.dateStr), prices: {}, candidates: [], gspc: gspc.close };
    for (const cik of Object.keys(cache.prices)) {
      const quote = getQuoteAtDate(cache.prices[cik], t.dateStr);
      if (quote) q.prices[cik] = quote.close;
    }
    for (const cik of getUniverseAsOf(cache, t.dateStr)) {
      const price = q.prices[cik];
      if (price == null || !cache.fundamentals[cik]) continue;
      const mapped = mapSecToYahooSnapshot({
        ticker: cache.cikToTicker[cik] ?? cik,
        cik,
        asOf: t.dateStr,
        price,
        facts: getFundamentalsAsOf(cache, cik, t.dateStr)!,
        splits: cache.prices[cik].splits,
        market: computeMarketStats(cache, cik, t.dateStr),
        sic: cache.sic[cik] ?? null,
      });
      if (mapped.snapshot) q.candidates.push({ cik, ticker: cache.cikToTicker[cik] ?? cik, price, snapshot: mapped.snapshot });
    }
    quarters.push(q);
    log(`universe ${t.dateStr}: ${q.candidates.length} spółek z wyceną`);
  }
  const removalReason: Record<string, string | null> = {};
  for (const m of cache.membership) if (m.date_removed) removalReason[m.cik] = m.removal_reason;
  return { builtAt: new Date().toISOString(), quarters, removalReason };
}

export function loadSimUniverse(file: string): SimUniverse {
  const u = JSON.parse(fs.readFileSync(file, 'utf-8')) as SimUniverse;
  for (const q of u.quarters) q.macro.asOf = new Date(q.macro.asOf);
  return u;
}

export interface SimMetrics {
  quarters: number;
  segments: number;
  finalValue: number;
  portfolioReturn: number;
  benchmarkReturn: number;
  alpha: number;
  annualizedReturn: number;
  annualizedBenchmark: number;
  alphaAnnualized: number;
  annualizedVol: number;
  sharpe: number | null;
  /** +Infinity, gdy nie było ani jednego kwartału poniżej stopy wolnej od ryzyka */
  sortino: number | null;
  maxDrawdown: number;
  totalTrades: number;
  turnoverAnnual: number;
  totalCosts: number;
}

export interface TradeLogEntry {
  date: string;
  action: 'BUY' | 'SELL' | 'FORCE_SELL' | 'DELIST';
  cik: string;
  ticker: string;
  price: number;
  amount: number;
  reason: string;
  portfolioValue: number;
}

const INITIAL_CAPITAL = 10_000;
const MIN_ORDER_USD = 500;

export function runSimulation(
  universe: SimUniverse,
  config: SimConfig,
  includeYear: (year: number) => boolean,
  logTrades = false
): SimMetrics & { tradeLog: TradeLogEntry[]; history: { date: string; value: number }[] } {
  const idx = universe.quarters.map((q, i) => ({ q, i })).filter(({ q }) => includeYear(asOfYear(q.dateStr)));
  if (idx.length < 2) throw new Error('runSimulation: za mało kwartałów w wybranym okresie');

  const segments: SimQuarter[][] = [];
  for (let k = 0; k < idx.length; k++) {
    if (k === 0 || idx[k].i !== idx[k - 1].i + 1) segments.push([]);
    segments[segments.length - 1].push(idx[k].q);
  }

  const tradeLog: TradeLogEntry[] = [];
  const history: { date: string; value: number }[] = [];
  const returns: number[] = [];
  const bench: number[] = [];
  const rfs: number[] = [];
  let capital = INITIAL_CAPITAL;
  let trades = 0;
  let costs = 0;
  let traded = 0;
  let equityTimeSum = 0;

  for (const seg of segments) {
    const pf = new Portfolio(capital);
    let prevValue = capital;
    for (let s = 0; s < seg.length; s++) {
      const q = seg[s];
      const macro = q.macro;
      const matrix = macro.rateRegime === 'HIKING' ? config.matrixHiking : macro.rateRegime === 'CUTTING' ? config.matrixCutting : config.matrixHolding;
      const vix = macro.vix ?? 0;
      const log = (e: Omit<TradeLogEntry, 'date' | 'portfolioValue'>) => {
        if (logTrades) tradeLog.push({ ...e, date: q.dateStr, portfolioValue: pf.getValue() });
      };

      if (s > 0) pf.cash *= 1 + seg[s - 1].macro.treasury3M / 4;

      // Pozycje bez notowania: przejęcie => ostatnia znana cena, inaczej (bankructwo/nieznane) => 0
      for (const pos of [...pf.positions.values()]) {
        if (q.prices[pos.cik] != null) continue;
        const reason = universe.removalReason[pos.cik];
        const px = reason === 'acquisition' || reason === 'merger' ? pos.lastPrice : 0;
        log({ action: 'DELIST', cik: pos.cik, ticker: pos.cik, price: px, amount: pos.shares * px, reason: `brak notowań (${reason ?? 'nieznany powód'})` });
        pf.sell(pos.cik, px);
      }
      pf.updatePrices(new Map(Object.entries(q.prices)));

      const equityTarget =
        vix > config.vixThreshold3
          ? config.equityPctPanic
          : vix > config.vixThreshold2 || macro.marketRegime === 'BEAR'
            ? config.equityPctFear
            : vix > config.vixThreshold1
              ? config.equityPctElevated
              : config.equityPctCalm;

      const candidates: { c: SimCandidate; upside: number; entryTarget: number }[] = [];
      for (const c of q.candidates) {
        const val = calculateFairValue(c.snapshot, { macro, engineConfig: { baseWeights: matrix } });
        const pos = pf.positions.get(c.cik);
        if (pos) {
          if (c.price > val.fairValue * config.sellOvervaluedAt) {
            log({ action: 'SELL', cik: c.cik, ticker: c.ticker, price: c.price, amount: pos.shares * c.price, reason: 'przewartościowana' });
            pf.sell(c.cik, c.price);
          } else if (c.price < pos.highestPrice * (1 - config.stopLossPct)) {
            log({ action: 'SELL', cik: c.cik, ticker: c.ticker, price: c.price, amount: pos.shares * c.price, reason: 'stop-loss' });
            pf.sell(c.cik, c.price);
          } else if (val.upside < -0.15) {
            log({ action: 'SELL', cik: c.cik, ticker: c.ticker, price: c.price, amount: pos.shares * c.price, reason: 'słabe fundamenty' });
            pf.sell(c.cik, c.price);
          } else {
            const div = Math.min(c.snapshot.summaryDetail.dividendRate ?? 0, c.price * 0.15);
            pf.payDividend(c.cik, div / 4);
          }
        } else if (!val.lowConfidence && val.validModelCount >= config.minModels) {
          candidates.push({ c, upside: val.upside, entryTarget: val.entryTarget });
        }
      }

      const value = pf.getValue();
      const maxInStocks = value * equityTarget;
      let inStocks = value - pf.cash;
      candidates.sort((a, b) => b.upside - a.upside);
      for (const { c, upside, entryTarget } of candidates) {
        if (pf.positions.size >= config.maxPositions || inStocks >= maxInStocks) break;
        if (upside < config.minUpside || c.price > entryTarget) continue;
        const amount = Math.min(pf.cash / (1 + pf.costRate), value * config.positionSizePct, maxInStocks - inStocks);
        if (amount > MIN_ORDER_USD && pf.buy(c.cik, c.price, amount)) {
          log({ action: 'BUY', cik: c.cik, ticker: c.ticker, price: c.price, amount, reason: `upside ${(upside * 100).toFixed(1)}%` });
          inStocks += amount;
        }
      }

      if (inStocks > maxInStocks * 1.1) {
        const worst = [...pf.positions.values()].sort((a, b) => a.lastPrice / a.entryPrice - b.lastPrice / b.entryPrice);
        for (const pos of worst) {
          if (pf.getValue() - pf.cash <= maxInStocks) break;
          log({ action: 'FORCE_SELL', cik: pos.cik, ticker: pos.cik, price: pos.lastPrice, amount: pos.shares * pos.lastPrice, reason: `VIX ${vix.toFixed(1)}` });
          pf.sell(pos.cik, pos.lastPrice);
        }
      }

      const endValue = pf.getValue();
      pf.recordHistory(q.dateStr);
      if (s > 0) {
        returns.push(endValue / prevValue - 1);
        bench.push(q.gspc / seg[s - 1].gspc - 1);
        rfs.push(seg[s - 1].macro.treasury3M / 4);
        equityTimeSum += endValue;
      }
      prevValue = endValue;
    }
    // Likwidacja na końcu segmentu
    for (const pos of [...pf.positions.values()]) pf.sell(pos.cik, pos.lastPrice);
    capital = pf.cash;
    trades += pf.trades;
    costs += pf.totalCosts;
    traded += pf.tradedNotional;
    history.push(...pf.history);
  }

  const n = returns.length;
  const years = n / 4;
  const chain = (rs: number[]) => rs.reduce((acc, r) => acc * (1 + r), 1) - 1;
  const portfolioReturn = chain(returns);
  const benchmarkReturn = chain(bench);
  const annualizedReturn = Math.pow(1 + portfolioReturn, 1 / years) - 1;
  const annualizedBenchmark = Math.pow(1 + benchmarkReturn, 1 / years) - 1;
  const excess = returns.map((r, i) => r - rfs[i]);
  const meanEx = excess.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(returns.reduce((a, r) => a + (r - returns.reduce((x, y) => x + y, 0) / n) ** 2, 0) / Math.max(n - 1, 1));
  const downside = Math.sqrt(excess.reduce((a, e) => a + Math.min(e, 0) ** 2, 0) / n);
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const r of returns) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, 1 - equity / peak);
  }
  const avgEquity = equityTimeSum / Math.max(n, 1);

  return {
    quarters: n,
    segments: segments.length,
    finalValue: capital,
    portfolioReturn,
    benchmarkReturn,
    alpha: portfolioReturn - benchmarkReturn,
    annualizedReturn,
    annualizedBenchmark,
    alphaAnnualized: annualizedReturn - annualizedBenchmark,
    annualizedVol: sd * 2,
    sharpe: sd > 0 ? (meanEx / sd) * 2 : null,
    sortino: downside > 0 ? (meanEx / downside) * 2 : meanEx > 0 ? Infinity : null,
    maxDrawdown,
    totalTrades: trades,
    turnoverAnnual: avgEquity > 0 ? traded / 2 / avgEquity / years : 0,
    totalCosts: costs,
    tradeLog,
    history,
  };
}
