/**
 * Maps raw yahoo-finance2 v4 `quoteSummary` output into the
 * `YahooFinanceSnapshot` shape the valuation engine consumes.
 *
 * Verified against a live v4 call (2026-07): the three live modules
 * (summaryDetail, defaultKeyStatistics, financialData) match the engine's
 * field names 1:1. The two statement-history modules are effectively dead —
 * Yahoo has returned near-empty statements since Nov 2024 (balance sheets
 * carry only `endDate`, cashflow statements only `endDate` + `netIncome`).
 * When `financialData.freeCashflow` is missing we therefore backfill the
 * first cashflow statement from `fundamentalsTimeSeries` so the engine's
 * DCF fallback (opCF - |capex|) still has something to work with.
 */
import YahooFinance from 'yahoo-finance2';
import type { YahooFinanceSnapshot } from './valuation-engine.js';

export const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const QUOTE_SUMMARY_MODULES = [
  'summaryDetail',
  'defaultKeyStatistics',
  'financialData',
  'balanceSheetHistory',
  'cashflowStatementHistory',
  'recommendationTrend',
  'earningsHistory',
  'assetProfile',
] as const;

/**
 * Structural type for the slice of the quoteSummary result we consume.
 * Kept loose (all optional) because Yahoo omits whole modules for some
 * ticker types (ETFs, delisted symbols, some foreign listings).
 */
export interface RawQuoteSummary {
  summaryDetail?: {
    trailingPE?: number;
    forwardPE?: number;
    dividendRate?: number;
    dividendYield?: number; // fraction, e.g. 0.0033
    payoutRatio?: number; // fraction, e.g. 0.1259
    beta?: number;
    fiftyDayAverage?: number;
    twoHundredDayAverage?: number;
    fiftyTwoWeekLow?: number;
    fiftyTwoWeekHigh?: number;
    previousClose?: number;
    [key: string]: unknown;
  };
  defaultKeyStatistics?: {
    trailingEps?: number;
    bookValue?: number;
    sharesOutstanding?: number;
    pegRatio?: number;
    beta?: number;
    [key: string]: unknown;
  };
  financialData?: {
    currentPrice?: number;
    targetMeanPrice?: number;
    totalRevenue?: number;
    revenuePerShare?: number;
    revenueGrowth?: number;
    earningsGrowth?: number;
    freeCashflow?: number;
    operatingCashflow?: number;
    totalDebt?: number;
    totalCash?: number;
    debtToEquity?: number; // percent-style, e.g. 79.5
    returnOnEquity?: number;
    profitMargins?: number;
    ebitda?: number;
    [key: string]: unknown;
  };
  balanceSheetHistory?: {
    balanceSheetStatements: Array<{
      endDate?: Date;
      totalStockholderEquity?: number; // dead since Nov 2024, kept for compat
      [key: string]: unknown;
    }>;
  };
  cashflowStatementHistory?: {
    cashflowStatements: Array<{
      endDate?: Date;
      netIncome?: number;
      capitalExpenditures?: number; // dead since Nov 2024
      totalCashFromOperatingActivities?: number; // dead since Nov 2024
      [key: string]: unknown;
    }>;
  };
  recommendationTrend?: {
    trend?: Array<{
      period?: string;
      strongBuy?: number;
      buy?: number;
      hold?: number;
      sell?: number;
      strongSell?: number;
      [key: string]: unknown;
    }>;
  };
  earningsHistory?: {
    history?: Array<{
      epsActual?: number;
      epsEstimate?: number;
      epsDifference?: number;
      surprisePercent?: number;
      quarter?: { fmt?: string } | string;
      [key: string]: unknown;
    }>;
  };
  assetProfile?: {
    sector?: string;
    industry?: string;
    fullTimeEmployees?: number;
    [key: string]: unknown;
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Pure mapping — no network. Exported separately so it's unit-testable. */
export function mapQuoteSummaryToSnapshot(qs: RawQuoteSummary): YahooFinanceSnapshot {
  const sd = qs.summaryDetail ?? {};
  const ks = qs.defaultKeyStatistics ?? {};
  const fd = qs.financialData ?? {};

  return {
    summaryDetail: {
      trailingPE: num(sd.trailingPE),
      forwardPE: num(sd.forwardPE),
      dividendRate: num(sd.dividendRate),
      dividendYield: num(sd.dividendYield),
      payoutRatio: num(sd.payoutRatio),
      // Yahoo has been moving beta between modules; take whichever is present.
      beta: num(sd.beta) ?? num(ks.beta),
      fiftyDayAverage: num(sd.fiftyDayAverage),
      twoHundredDayAverage: num(sd.twoHundredDayAverage),
      fiftyTwoWeekLow: num(sd.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: num(sd.fiftyTwoWeekHigh),
      previousClose: num(sd.previousClose),
    },
    defaultKeyStatistics: {
      trailingEps: num(ks.trailingEps),
      bookValue: num(ks.bookValue),
      sharesOutstanding: num(ks.sharesOutstanding),
      pegRatio: num(ks.pegRatio),
    },
    financialData: {
      currentPrice: num(fd.currentPrice),
      targetMeanPrice: num(fd.targetMeanPrice),
      totalRevenue: num(fd.totalRevenue),
      revenuePerShare: num(fd.revenuePerShare),
      revenueGrowth: num(fd.revenueGrowth),
      earningsGrowth: num(fd.earningsGrowth),
      freeCashflow: num(fd.freeCashflow),
      operatingCashflow: num(fd.operatingCashflow),
      totalDebt: num(fd.totalDebt),
      totalCash: num(fd.totalCash),
      debtToEquity: num(fd.debtToEquity),
      returnOnEquity: num(fd.returnOnEquity),
      profitMargins: num(fd.profitMargins),
      ebitda: num(fd.ebitda),
    },
    balanceSheetHistory: {
      balanceSheetStatements: (qs.balanceSheetHistory?.balanceSheetStatements ?? []).map((s) => ({
        totalStockholderEquity: num(s.totalStockholderEquity),
      })),
    },
    cashflowStatementHistory: {
      cashflowStatements: (qs.cashflowStatementHistory?.cashflowStatements ?? []).map((s) => ({
        netIncome: num(s.netIncome),
        capitalExpenditures: num(s.capitalExpenditures),
        totalCashFromOperatingActivities: num(s.totalCashFromOperatingActivities),
      })),
    },
    recommendationTrend: {
      trend: (qs.recommendationTrend?.trend ?? []).map((t) => ({
        period: t.period ?? '',
        strongBuy: num(t.strongBuy) ?? 0,
        buy: num(t.buy) ?? 0,
        hold: num(t.hold) ?? 0,
        sell: num(t.sell) ?? 0,
        strongSell: num(t.strongSell) ?? 0,
      })),
    },
    earningsHistory: {
      history: (qs.earningsHistory?.history ?? []).map((h) => ({
        epsActual: num(h.epsActual),
        epsEstimate: num(h.epsEstimate),
        epsDifference: num(h.epsDifference),
        surprisePercent: num(h.surprisePercent),
        quarter: typeof h.quarter === 'object' ? h.quarter?.fmt : (typeof h.quarter === 'string' ? h.quarter : null),
      })),
    },
    assetProfile: {
      sector: typeof qs.assetProfile?.sector === 'string' ? qs.assetProfile.sector : null,
      industry: typeof qs.assetProfile?.industry === 'string' ? qs.assetProfile.industry : null,
      fullTimeEmployees: num(qs.assetProfile?.fullTimeEmployees),
    },
  };
}

/**
 * Fetches quoteSummary and maps it. If freeCashflow is unavailable from the
 * live module, makes one supplemental fundamentalsTimeSeries call to fill
 * the most recent cashflow statement (opCF/capex) so calcDCF's fallback works.
 */
export async function fetchSnapshot(ticker: string): Promise<YahooFinanceSnapshot> {
  const qs = (await yahooFinance.quoteSummary(ticker, {
    modules: [...QUOTE_SUMMARY_MODULES],
  })) as RawQuoteSummary;

  const snapshot = mapQuoteSummaryToSnapshot(qs);

  try {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 2);
    const rows = (await yahooFinance.fundamentalsTimeSeries(ticker, {
      period1: from,
      type: 'annual',
      module: 'all',
    })) as Array<any>;
    
    const latest = rows.at(-1);
    if (latest) {
      const cf0 = snapshot.cashflowStatementHistory.cashflowStatements[0];
      const needsBackfill =
        snapshot.financialData.freeCashflow == null &&
        (cf0 == null || cf0.totalCashFromOperatingActivities == null || cf0.capitalExpenditures == null);
      
      if (needsBackfill) {
        snapshot.cashflowStatementHistory.cashflowStatements = [
          {
            netIncome: num(latest.netIncome) ?? cf0?.netIncome ?? null,
            capitalExpenditures: num(latest.capitalExpenditure),
            totalCashFromOperatingActivities: num(latest.operatingCashFlow),
          },
          ...snapshot.cashflowStatementHistory.cashflowStatements.slice(1),
        ];
      }

      snapshot.fundamentals = {
        workingCapital: num(latest.workingCapital),
        totalAssets: num(latest.totalAssets),
        retainedEarnings: num(latest.retainedEarnings),
        ebit: num(latest.EBIT),
        totalLiabilities: num(latest.totalLiabilitiesNetMinorityInterest) ?? num(latest.TotalLiabilities),
        investedCapital: num(latest.investedCapital),
        taxRate: num(latest.taxRateForCalcs) ?? num(latest.TaxRateForCalcs),
      };
    }
  } catch (err) {
    // Supplemental data is best-effort
    console.warn(`Failed to fetch fundamentalsTimeSeries for ${ticker}`, err);
  }

  return snapshot;
}
