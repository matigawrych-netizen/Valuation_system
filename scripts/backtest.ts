import { LEGACY_YAHOO_BACKTEST_CSV, ENSEMBLE_WEIGHTS, BLOCK_WEIGHTS, DEFAULT_MODEL, ACCURACY_PROFILE, HOLDOUT_LOG, requireDataset } from '../src/paths.js';
/**
 * BACKTEST: reconstruct point-in-time Fair Value / Entry Target snapshots at
 * historical fiscal year-ends and compare against subsequent 12-month price
 * action.
 *
 * Method (no look-ahead):
 *   - Annual fundamentals come from `fundamentalsTimeSeries` (the legacy
 *     balanceSheetHistory/cashflowStatementHistory quoteSummary modules have
 *     been empty shells since Nov 2024; FTS is the same statement data from
 *     the endpoint Yahoo still serves). Yahoo returns ~4 annual periods.
 *   - Each snapshot is evaluated at FY-end + REPORTING_LAG_DAYS (90), i.e.
 *     only once the annual report was publicly available.
 *   - Price-derived fields (SMA50/200, 52-week range, trailing PE, beta vs
 *     ^GSPC) are computed exclusively from chart data on or before that date.
 *   - Fields that cannot be known historically (analyst targets, pegRatio)
 *     are left null — the engine renormalizes weights over surviving models.
 *   - Forward 12-month return uses adjusted closes (dividends included);
 *     price-level comparisons (entry target, fair-value touch) use raw closes.
 *
 * Output: console summary + ${LEGACY_YAHOO_BACKTEST_CSV} (one row per snapshot) for
 * re-tuning WEIGHT_MATRIX.
 *
 * Usage:
 *   npm run backtest              # full ~30-ticker universe
 *   npx tsx scripts/backtest.ts NVDA KO JPM   # quick subset
 */
import { writeFileSync } from 'node:fs';
import {
  calculateFairValue,
  type Archetype,
  type YahooFinanceSnapshot,
} from '../src/valuation-engine.js';
import { yahooFinance } from '../src/yahoo-mapper.js';
import { fetchAlphaVantageFundamentals } from '../src/alpha-vantage-provider.js';

const REPORTING_LAG_DAYS = 90;
const FORWARD_DAYS = 365;
const BETA_LOOKBACK_TRADING_DAYS = 252;
const API_DELAY_MS = 300;

/**
 * A-priori archetype grouping — used ONLY for reporting slices, so results
 * can be compared against what the engine's categorizer decides on its own.
 */
const UNIVERSE: Record<Archetype, string[]> = {
  HYPER_GROWTH: ['META', 'AMZN', 'GOOGL', 'ADBE', 'CRM'],
  VALUE_COMPOUNDER: ['MCD', 'PEP', 'COST', 'WMT', 'CL'],
  FINANCIALS_BANKS: ['GS', 'MS', 'AXP', 'BLK'],
  CYCLICAL_HEAVY: ['XOM', 'CVX', 'BA', 'UNP'],
  INCOME_STABLE: [],
  DEEP_VALUE_DISTRESSED: ['WBA', 'INTC'],
};

interface Bar {
  date: Date;
  close: number;
  adjclose: number;
}

interface FtsRow {
  date: Date;
  [key: string]: unknown;
}

interface SnapshotRow {
  ticker: string;
  group: Archetype;
  fyEnd: string;
  asOf: string;
  price: number;
  fairValue: number;
  entryTarget: number;
  marginOfSafety: number;
  upside: number;
  dominantArchetype: string;
  dominantConfidence: number;
  validModelCount: number;
  lowConfidence: boolean;
  buySignal: boolean;
  fwdReturn12m: number;
  touchedFairValue: boolean;
  models: Record<string, number | null>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

async function fetchBars(symbol: string, from: Date): Promise<Bar[]> {
  const res = await yahooFinance.chart(symbol, {
    period1: from,
    interval: '1d',
  });
  return res.quotes
    .filter((q) => q.close != null)
    .map((q) => ({
      date: new Date(q.date),
      close: q.close as number,
      adjclose: (q.adjclose ?? q.close) as number,
    }));
}

/** Index of the last bar with date <= target, or -1. */
function lastBarIndexOnOrBefore(bars: Bar[], target: Date): number {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date.getTime() <= target.getTime()) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Trailing daily-return beta vs the index, using only bars up to asOfIdx. */
function computeBeta(bars: Bar[], asOfIdx: number, index: Map<string, number>): number | null {
  const start = Math.max(1, asOfIdx - BETA_LOOKBACK_TRADING_DAYS);
  const stockRet: number[] = [];
  const indexRet: number[] = [];
  for (let i = start; i <= asOfIdx; i++) {
    const d1 = bars[i - 1].date.toISOString().slice(0, 10);
    const d2 = bars[i].date.toISOString().slice(0, 10);
    const i1 = index.get(d1);
    const i2 = index.get(d2);
    if (i1 == null || i2 == null || i1 <= 0) continue;
    stockRet.push(bars[i].adjclose / bars[i - 1].adjclose - 1);
    indexRet.push(i2 / i1 - 1);
  }
  if (stockRet.length < 100) return null;
  const mi = mean(indexRet);
  const ms = mean(stockRet);
  let cov = 0;
  let varI = 0;
  for (let i = 0; i < stockRet.length; i++) {
    cov += (stockRet[i] - ms) * (indexRet[i] - mi);
    varI += (indexRet[i] - mi) ** 2;
  }
  return varI > 0 ? cov / varI : null;
}

function buildSnapshot(
  rows: FtsRow[], // annual FTS rows sorted ascending; rows[fyIdx] is the FY being valued
  fyIdx: number,
  bars: Bar[],
  asOfIdx: number,
  beta: number | null
): YahooFinanceSnapshot | null {
  const row = rows[fyIdx];
  const prev = fyIdx > 0 ? rows[fyIdx - 1] : null;

  const shares = n(row.ordinarySharesNumber) ?? n(row.shareIssued) ?? n(row.dilutedAverageShares);
  const equity = n(row.stockholdersEquity) ?? n(row.commonStockEquity);
  const netIncome = n(row.netIncome);
  const revenue = n(row.totalRevenue);
  const price = bars[asOfIdx].close;
  if (!shares || price <= 0) {
    console.log('Skipping', row.date, 'shares:', shares, 'price:', price);
    return null;
  }

  const eps = n(row.dilutedEPS) ?? n(row.basicEPS) ?? (netIncome != null ? netIncome / shares : null);
  const opCF = n(row.operatingCashFlow);
  const capex = n(row.capitalExpenditure);
  const fcf = n(row.freeCashFlow) ?? (opCF != null && capex != null ? opCF - Math.abs(capex) : null);
  const dividendsPaid = n(row.cashDividendsPaid); // negative outflow
  const dps = dividendsPaid != null ? Math.abs(dividendsPaid) / shares : null;
  const totalDebt = n(row.totalDebt);

  const prevRevenue = prev ? n(prev.totalRevenue) : null;
  const prevNetIncome = prev ? n(prev.netIncome) : null;

  // Trailing price stats strictly from bars <= asOf.
  const w52Start = bars[Math.max(0, asOfIdx - 252)].date.getTime();
  const trailing52w = bars.slice(Math.max(0, asOfIdx - 252), asOfIdx + 1);
  const closes52w = trailing52w.map((b) => b.close);
  const sma = (k: number) => {
    const slice = bars.slice(Math.max(0, asOfIdx - k + 1), asOfIdx + 1);
    return mean(slice.map((b) => b.close));
  };
  void w52Start;

  return {
    summaryDetail: {
      trailingPE: eps != null && eps > 0 ? price / eps : null,
      forwardPE: null,
      dividendRate: dps != null && dps > 0 ? dps : null,
      dividendYield: dps != null && dps > 0 ? dps / price : null,
      payoutRatio:
        dps != null && dps > 0 && netIncome != null && netIncome > 0 && dividendsPaid != null
          ? Math.abs(dividendsPaid) / netIncome
          : null,
      beta,
      fiftyDayAverage: sma(50),
      twoHundredDayAverage: sma(200),
      fiftyTwoWeekLow: Math.min(...closes52w),
      fiftyTwoWeekHigh: Math.max(...closes52w),
      previousClose: price,
    },
    defaultKeyStatistics: {
      trailingEps: eps,
      bookValue: equity != null ? equity / shares : null,
      sharesOutstanding: shares,
      pegRatio: null, // not knowable historically
    },
    financialData: {
      currentPrice: price,
      targetMeanPrice: null, // no historical analyst targets — weight renormalizes
      totalRevenue: revenue,
      revenuePerShare: revenue != null ? revenue / shares : null,
      revenueGrowth:
        revenue != null && prevRevenue != null && prevRevenue > 0 ? revenue / prevRevenue - 1 : null,
      earningsGrowth:
        netIncome != null && prevNetIncome != null && prevNetIncome > 0
          ? netIncome / prevNetIncome - 1
          : null,
      freeCashflow: fcf,
      operatingCashflow: opCF,
      totalDebt,
      totalCash: n(row.cashAndCashEquivalents) ?? n(row.cashCashEquivalentsAndShortTermInvestments),
      debtToEquity:
        totalDebt != null && equity != null && equity > 0 ? (totalDebt / equity) * 100 : null,
      returnOnEquity: netIncome != null && equity != null && equity > 0 ? netIncome / equity : null,
      profitMargins: netIncome != null && revenue != null && revenue > 0 ? netIncome / revenue : null,
      ebitda: n(row.EBITDA) ?? n(row.normalizedEBITDA),
    },
    balanceSheetHistory: {
      balanceSheetStatements: rows
        .slice(0, fyIdx + 1)
        .reverse()
        .map((r) => ({ totalStockholderEquity: n(r.stockholdersEquity) })),
    },
    cashflowStatementHistory: {
      cashflowStatements: rows
        .slice(0, fyIdx + 1)
        .reverse()
        .map((r) => ({
          netIncome: n(r.netIncome),
          capitalExpenditures: n(r.capitalExpenditure),
          totalCashFromOperatingActivities: n(r.operatingCashFlow),
        })),
    },
    fundamentals: {
      workingCapital: n(row.workingCapital),
      totalAssets: n(row.totalAssets),
      retainedEarnings: n(row.retainedEarnings),
      ebit: n(row.EBIT),
      totalLiabilities: n(row.totalLiabilitiesNetMinorityInterest) ?? n(row.TotalLiabilities),
      investedCapital: n(row.investedCapital),
      taxRate: n(row.taxRateForCalcs) ?? n(row.TaxRateForCalcs),
    }
  };
}

async function backtestTicker(
  ticker: string,
  group: Archetype,
  indexByDay: Map<string, number>,
  today: Date
): Promise<SnapshotRow[]> {
  const chartFrom = new Date(today);
  chartFrom.setFullYear(chartFrom.getFullYear() - 22);
  const ftsFrom = new Date(today);
  ftsFrom.setFullYear(ftsFrom.getFullYear() - 21);

  const rows = (await fetchAlphaVantageFundamentals(ticker)) as FtsRow[];
  await sleep(API_DELAY_MS);
  const bars = await fetchBars(ticker, chartFrom);
  await sleep(API_DELAY_MS);

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  const out: SnapshotRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const fyEnd = rows[i].date;
    const asOf = addDays(fyEnd, REPORTING_LAG_DAYS);
    const fwdEnd = addDays(asOf, FORWARD_DAYS);
    console.log('Row', i, 'fyEnd:', fyEnd, 'fwdEnd:', fwdEnd, 'today:', today);
    if (fwdEnd.getTime() > today.getTime()) continue; // need a full forward year

    const asOfIdx = lastBarIndexOnOrBefore(bars, asOf);
    const fwdIdx = lastBarIndexOnOrBefore(bars, fwdEnd);
    if (asOfIdx < 210 || fwdIdx <= asOfIdx) {
      console.log('Skipping', fyEnd, 'asOfIdx:', asOfIdx, 'fwdIdx:', fwdIdx);
      continue;
    }

    const beta = computeBeta(bars, asOfIdx, indexByDay);
    const snapshot = buildSnapshot(rows, i, bars, asOfIdx, beta);
    if (!snapshot) continue;

    // Stary backtest Yahoo nie ma makro point-in-time. Zamiast wpisanych na stałe stóp (dawniej Fed 5%, 10Y 4%
    // dla każdej daty) silnik liczy bez makro: CAPM 4% + β·5%, bez korekt CPI/reżimu. Backtest SEC: getMacroAsOf.
    const result = calculateFairValue(snapshot);
    const price = bars[asOfIdx].close;
    const fwdReturn = bars[fwdIdx].adjclose / bars[asOfIdx].adjclose - 1;

    const window = bars.slice(asOfIdx + 1, fwdIdx + 1);
    const touchedFairValue =
      result.fairValue >= price
        ? window.some((b) => b.close >= result.fairValue)
        : window.some((b) => b.close <= result.fairValue);

    out.push({
      ticker,
      group,
      fyEnd: fyEnd.toISOString().slice(0, 10),
      asOf: bars[asOfIdx].date.toISOString().slice(0, 10),
      price,
      fairValue: result.fairValue,
      entryTarget: result.entryTarget,
      marginOfSafety: result.marginOfSafety,
      upside: result.fairValue / price - 1,
      dominantArchetype: result.archetypeBlend[0]?.archetype ?? 'NONE',
      dominantConfidence: result.archetypeBlend[0]?.confidence ?? 0,
      validModelCount: result.validModelCount,
      lowConfidence: result.lowConfidence,
      buySignal: price <= result.entryTarget && !result.lowConfidence,
      fwdReturn12m: fwdReturn,
      touchedFairValue,
      models: result.models,
    });
  }
  return out;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function summarize(label: string, rows: SnapshotRow[]): void {
  if (rows.length === 0) return;
  const buys = rows.filter((r) => r.buySignal);
  const nonBuys = rows.filter((r) => !r.buySignal);
  const corr = pearson(
    rows.map((r) => r.upside),
    rows.map((r) => r.fwdReturn12m)
  );
  const undervalued = rows.filter((r) => r.upside > 0);

  console.log(`\n  ${label}  (${rows.length} snapshots)`);
  console.log(
    `    avg implied upside ${pct(mean(rows.map((r) => r.upside)))} | avg fwd 12m ${pct(
      mean(rows.map((r) => r.fwdReturn12m))
    )} | corr(upside, fwd) ${corr != null ? corr.toFixed(2) : 'n/a'}`
  );
  console.log(
    `    buy signals (price<=entry): ${buys.length}` +
      (buys.length > 0
        ? ` | hit rate (fwd>0) ${pct(buys.filter((r) => r.fwdReturn12m > 0).length / buys.length)} | avg fwd ${pct(
            mean(buys.map((r) => r.fwdReturn12m))
          )}`
        : '')
  );
  if (nonBuys.length > 0) {
    console.log(`    no-signal avg fwd ${pct(mean(nonBuys.map((r) => r.fwdReturn12m)))}`);
  }
  if (undervalued.length > 0) {
    console.log(
      `    undervalued calls: ${undervalued.length} | reached fair value within 12m ${pct(
        undervalued.filter((r) => r.touchedFairValue).length / undervalued.length
      )}`
    );
  }
}

async function main() {
  const today = new Date();
  const subset = process.argv.slice(2).map((t) => t.toUpperCase());

  const chartFrom = new Date(today);
  chartFrom.setFullYear(chartFrom.getFullYear() - 22);
  console.log('fetching ^GSPC for beta calculation...');
  const spx = await fetchBars('^GSPC', chartFrom);
  const indexByDay = new Map(spx.map((b) => [b.date.toISOString().slice(0, 10), b.adjclose]));
  await sleep(API_DELAY_MS);

  const all: SnapshotRow[] = [];
  const failures: string[] = [];

  for (const [group, tickers] of Object.entries(UNIVERSE) as [Archetype, string[]][]) {
    for (const ticker of tickers) {
      if (subset.length > 0 && !subset.includes(ticker)) continue;
      try {
        const rows = await backtestTicker(ticker, group, indexByDay, today);
        all.push(...rows);
        console.log(`${ticker.padEnd(6)} ${group.padEnd(22)} ${rows.length} snapshots`);
      } catch (err) {
        failures.push(ticker);
        console.warn(`${ticker.padEnd(6)} FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  if (all.length === 0) {
    console.error('no snapshots produced — aborting');
    process.exit(1);
  }

  const modelKeys = ['DCF', 'GRAHAM_NUMBER', 'DDM', 'PEG_IMPLIED_PE', 'EV_EBITDA', 'PRICE_TO_BOOK', 'FCF_YIELD', 'EPV', 'PRICE_TO_SALES', 'ANALYST_CONSENSUS', 'EARNINGS_QUALITY', 'ALTMAN_Z_SCORE', 'ROIC_SPREAD', 'REVERSE_DCF'];
  const header =
    'ticker,group,fyEnd,asOf,price,fairValue,entryTarget,marginOfSafety,upside,dominantArchetype,dominantConfidence,validModelCount,lowConfidence,buySignal,fwdReturn12m,touchedFairValue,' + modelKeys.join(',');
  const csv = [
    header,
    ...all.map((r) =>
      [
        r.ticker,
        r.group,
        r.fyEnd,
        r.asOf,
        r.price.toFixed(2),
        r.fairValue.toFixed(2),
        r.entryTarget.toFixed(2),
        r.marginOfSafety.toFixed(4),
        r.upside.toFixed(4),
        r.dominantArchetype,
        r.dominantConfidence.toFixed(4),
        r.validModelCount,
        r.lowConfidence,
        r.buySignal,
        r.fwdReturn12m.toFixed(4),
        r.touchedFairValue,
        ...modelKeys.map(m => r.models[m] != null ? r.models[m]!.toFixed(2) : '')
      ].join(',')
    ),
  ].join('\n');
  writeFileSync(LEGACY_YAHOO_BACKTEST_CSV, csv);

  console.log('\n================ SUMMARY ================');
  summarize('OVERALL', all);

  console.log('\n---- by a-priori group ----');
  for (const group of Object.keys(UNIVERSE) as Archetype[]) {
    summarize(group, all.filter((r) => r.group === group));
  }

  console.log('\n---- by engine-assigned dominant archetype ----');
  const dominant = [...new Set(all.map((r) => r.dominantArchetype))].sort();
  for (const arch of dominant) {
    summarize(arch, all.filter((r) => r.dominantArchetype === arch));
  }

  if (failures.length > 0) console.log(`\nfailed tickers: ${failures.join(', ')}`);
  console.log('\nper-snapshot rows written to ${LEGACY_YAHOO_BACKTEST_CSV}');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
