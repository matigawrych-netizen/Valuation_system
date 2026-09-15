import { categorizeArchetypes } from './archetypes.js';
import type { MacroEnvironment } from './macro-provider.js';
import type { TechnicalIndicators } from './technical-provider.js';

/**
 * MULTI-FACTOR WEIGHTED VALUATION ENGINE
 * ---------------------------------------------------------------------------
 *   1. Archetype categorization (soft-scored, not boolean)
 *   2. Valuation models grouped into 4 blocks (median inside a block)
 *   3. Archetype -> block weight matrix (blended across archetype confidence, optional macro modifiers)
 *   4. Margin of safety overlay: Fair Value -> Entry Target
 *   5. Null-safe edge cases with weight renormalization
 *
 * KNOWN LIMITATIONS: docs/limitations.md
 */

// ============================================================================
// TYPES
// ============================================================================

export type Archetype =
  | 'HYPER_GROWTH'
  | 'VALUE_COMPOUNDER'
  | 'FINANCIALS_BANKS'
  | 'CYCLICAL_HEAVY'
  | 'INCOME_STABLE'
  | 'DEEP_VALUE_DISTRESSED';

export type ValuationModel =
  | 'DCF'
  | 'GRAHAM_NUMBER'
  | 'DDM'
  | 'PEG_IMPLIED_PE'
  | 'EV_EBITDA'
  | 'PRICE_TO_BOOK'
  | 'FCF_YIELD'
  | 'EPV'
  | 'PRICE_TO_SALES'
  | 'LIQUIDATION_VALUE';

export type ValuationBlock = 'BLOK_CASHFLOW' | 'BLOK_ASSETS' | 'BLOK_MULTIPLES' | 'BLOK_DIVIDEND';

export const ARCHETYPES: Archetype[] = [
  'HYPER_GROWTH',
  'VALUE_COMPOUNDER',
  'FINANCIALS_BANKS',
  'CYCLICAL_HEAVY',
  'INCOME_STABLE',
  'DEEP_VALUE_DISTRESSED',
];
export const BLOCKS: ValuationBlock[] = ['BLOK_CASHFLOW', 'BLOK_ASSETS', 'BLOK_MULTIPLES', 'BLOK_DIVIDEND'];
export const MODEL_KEYS: ValuationModel[] = [
  'DCF',
  'GRAHAM_NUMBER',
  'DDM',
  'PEG_IMPLIED_PE',
  'EV_EBITDA',
  'PRICE_TO_BOOK',
  'FCF_YIELD',
  'EPV',
  'PRICE_TO_SALES',
  'LIQUIDATION_VALUE',
];
export const BLOCK_MODELS: Record<ValuationBlock, ValuationModel[]> = {
  BLOK_CASHFLOW: ['DCF', 'FCF_YIELD', 'EPV'],
  BLOK_ASSETS: ['GRAHAM_NUMBER', 'PRICE_TO_BOOK', 'LIQUIDATION_VALUE'],
  BLOK_MULTIPLES: ['EV_EBITDA', 'PRICE_TO_SALES', 'PEG_IMPLIED_PE'],
  BLOK_DIVIDEND: ['DDM'],
};

export interface ArchetypeScore {
  archetype: Archetype;
  confidence: number; // normalized 0-1, sums to 1 across all archetypes
}

export interface ValuationModelResult {
  model: ValuationModel | 'ANALYST_CONSENSUS' | 'EARNINGS_QUALITY' | 'ALTMAN_Z_SCORE' | 'ROIC_SPREAD' | 'REVERSE_DCF';
  value: number | null; // null = could not be computed for this ticker
  reason?: string;
}

export type WeightMatrix = Record<Archetype, Partial<Record<ValuationBlock, number>>>;

export interface MacroModifiers {
  rateHiking?: WeightMatrix;
  rateCutting?: WeightMatrix;
  highInflation?: WeightMatrix;
  yieldCurveInverted?: WeightMatrix;
  goldRising?: WeightMatrix;
  copperFalling?: WeightMatrix;
  vixHigh?: WeightMatrix;
  marketBear?: WeightMatrix;
}

export interface EngineConfig {
  baseWeights: WeightMatrix;
  macroModifiers?: MacroModifiers;
  /**
   * Mediana błędu procentowego OOS per archetyp (scripts/build-accuracy-profile.ts).
   * null = za mało obserwacji => dokładność nieznana.
   */
  accuracyProfile?: Partial<Record<Archetype, number | null>>;
  haircuts?: {
    cash: number;
    receivables: number;
    inventory: number;
    fixedAssets: number;
  };
  macroCap?: number;
}

export type Verdict = 'BUY' | 'HOLD' | 'SELL';

export interface FairValueResult {
  fairValue: number;
  entryTarget: number;
  marginOfSafety: number;
  upside: number;
  models: Record<string, number | null>;
  blocks: Record<string, number | null>;
  archetypeBlend: ArchetypeScore[];
  validModelCount: number;
  lowConfidence: boolean;
  /** null = prawdopodobieństwo bankructwa nieznane (brak modelu albo cech), 0 = znane i zerowe */
  pDefault: number | null;
  /** 12-month price range derived from the spread of individual model outputs */
  priceRange12m?: { low: number; mid: number; high: number };
  warnings: string[];
  confidenceScore: number;
  verdict: Verdict;
  capHits: Array<{ archetype: string; block: string; direction: 'UP' | 'DOWN'; rawMult: number }>;
}

/** Minimal shape of the data this engine needs (Yahoo quoteSummary or SEC mapper). */
export interface YahooFinanceSnapshot {
  summaryDetail: {
    trailingPE?: number | null;
    forwardPE?: number | null;
    dividendRate?: number | null;
    dividendYield?: number | null;
    payoutRatio?: number | null;
    beta?: number | null;
    fiftyDayAverage?: number | null;
    twoHundredDayAverage?: number | null;
    fiftyTwoWeekLow?: number | null;
    fiftyTwoWeekHigh?: number | null;
    previousClose?: number | null;
  };
  defaultKeyStatistics: {
    trailingEps?: number | null;
    bookValue?: number | null;
    sharesOutstanding?: number | null;
    pegRatio?: number | null;
  };
  financialData: {
    currentPrice?: number | null;
    targetMeanPrice?: number | null;
    totalRevenue?: number | null;
    revenuePerShare?: number | null;
    revenueGrowth?: number | null;
    earningsGrowth?: number | null;
    freeCashflow?: number | null;
    operatingCashflow?: number | null;
    totalDebt?: number | null;
    totalCash?: number | null;
    debtToEquity?: number | null; // percent-style, e.g. 145.2 = 145.2%
    returnOnEquity?: number | null;
    profitMargins?: number | null;
    ebitda?: number | null;
    mScore?: number | null;
    fScore?: number | null;
    pDefault?: number | null;
  };
  balanceSheetHistory: {
    balanceSheetStatements: Array<{
      totalStockholderEquity?: number | null;
    }>;
  };
  cashflowStatementHistory: {
    cashflowStatements: Array<{
      netIncome?: number | null;
      capitalExpenditures?: number | null;
      totalCashFromOperatingActivities?: number | null;
    }>;
  };
  recommendationTrend?: {
    trend: Array<{
      period: string;
      strongBuy: number;
      buy: number;
      hold: number;
      sell: number;
      strongSell: number;
    }>;
  };
  earningsHistory?: {
    history: Array<{
      epsActual?: number | null;
      epsEstimate?: number | null;
      epsDifference?: number | null;
      surprisePercent?: number | null;
      quarter?: string | null;
    }>;
  };
  assetProfile?: {
    sector?: string | null;
    industry?: string | null;
    fullTimeEmployees?: number | null;
  };
  fundamentals?: {
    ebit?: number | null;
    ebitda?: number | null;
    netIncome?: number | null;
    investedCapital?: number | null;
    taxRate?: number | null;
    workingCapital?: number | null;
    totalAssets?: number | null;
    totalLiabilities?: number | null;
    retainedEarnings?: number | null;
    cash?: number | null;
    receivables?: number | null;
    inventory?: number | null;
    fixedAssets?: number | null;
    aoci?: number | null;
    htmBookValue?: number | null;
    htmFairValue?: number | null;
  };
  metadata?: {
    cik?: string;
    asOf?: string;
    stalenessDays?: number;
    warnings?: string[];
  };
}

// ============================================================================
// HELPERS
// ============================================================================

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Kara w confidenceScore, gdy pDefault jest nieznane (nie wiemy, czy ryzyko bankructwa jest niskie). */
export const UNKNOWN_PDEFAULT_CONFIDENCE_PENALTY = 0.15;
/** Neutralna dokładność, gdy brak profilu dokładności dla archetypu. */
export const UNKNOWN_ACCURACY_SCORE = 0.5;

function assertMacro(macro: MacroEnvironment): void {
  for (const key of ['treasury10Y', 'yieldSpread', 'cpiYoY', 'fedFundsRate'] as const) {
    if (!Number.isFinite(macro[key])) {
      throw new Error(`MacroEnvironment.${key} nie jest liczbą (${macro[key]}) — niekompletne dane makro`);
    }
  }
}

function dynamicRiskFreeRate(macro?: MacroEnvironment): number {
  if (!macro) return 0.04;
  return clamp(macro.treasury10Y, 0.01, 0.08);
}

function dynamicEquityRiskPremium(macro?: MacroEnvironment): number {
  if (!macro) return 0.05;
  let erp = 0.05;
  if (macro.yieldSpread < 0) erp += 0.015;
  if (macro.marketRegime === 'BEAR') erp += 0.01;
  if (macro.cpiTrend === 'RISING') erp += 0.005;
  return clamp(erp, 0.04, 0.09);
}

/** CAPM-derived required return, clamped to a sane band. */
function requiredReturn(beta: number | null | undefined, macro?: MacroEnvironment): number {
  const b = beta ?? 1;
  const rfr = dynamicRiskFreeRate(macro);
  const erp = dynamicEquityRiskPremium(macro);
  const cpiPenalty = macro && macro.cpiYoY > 0 ? macro.cpiYoY * 0.5 : 0;
  return clamp(rfr + b * erp + cpiPenalty, 0.06, 0.2);
}

function adjustedGrowthCap(macro?: MacroEnvironment): number {
  if (!macro) return 0.25;
  let cap = 0.25;
  if (macro.fedFundsRate > 0.05) cap -= 0.03;
  if (macro.cpiYoY > 0.04) cap -= 0.02;
  if (macro.rateRegime === 'HIKING') cap -= 0.02;
  return clamp(cap, 0.1, 0.25);
}

/** Składnik inflacyjny wzrostu nominalnego — tylko gdy znamy makro (symetrycznie z karą CPI w stopie dyskontowej). */
const cpiGrowthComponent = (macro?: MacroEnvironment) => (macro && macro.cpiYoY > 0 ? macro.cpiYoY : 0);

/**
 * Wartość księgowa na akcję skorygowana o niezrealizowane straty na papierach HTM.
 * AOCI (straty na papierach AFS) JEST już w kapitale własnym — dawna wersja dodawała je drugi raz.
 */
export function adjustedBookValuePerShare(d: YahooFinanceSnapshot): { bvps: number | null; htmAdjustment: number } {
  const bvps = d.defaultKeyStatistics.bookValue;
  if (bvps == null || !Number.isFinite(bvps)) return { bvps: null, htmAdjustment: 0 };
  const f = d.fundamentals;
  const shares = d.defaultKeyStatistics.sharesOutstanding;
  let adj = 0;
  if (f && shares && shares > 0 && (f.htmBookValue ?? 0) > 0 && (f.htmFairValue ?? 0) > 0) {
    adj = -(f.htmBookValue! - f.htmFairValue!) / shares;
  }
  return { bvps: bvps + adj, htmAdjustment: adj };
}

// ============================================================================
// STEP 2 — VALUATION MODELS
// ============================================================================

export function calcDCF(d: YahooFinanceSnapshot, macro?: MacroEnvironment, topArchetype?: string): ValuationModelResult {
  const shares = d.defaultKeyStatistics.sharesOutstanding;
  let fcf = d.financialData.freeCashflow;
  if (fcf == null) {
    const cf = d.cashflowStatementHistory.cashflowStatements[0];
    if (cf?.totalCashFromOperatingActivities != null && cf?.capitalExpenditures != null) {
      fcf = cf.totalCashFromOperatingActivities - Math.abs(cf.capitalExpenditures);
    }
  }
  if (!shares || fcf == null || fcf <= 0) {
    return { model: 'DCF', value: null, reason: 'missing or non-positive FCF' };
  }

  const rr = requiredReturn(d.summaryDetail.beta, macro);
  const cpiGrowth = cpiGrowthComponent(macro);
  const terminalGrowth = clamp(0.025 + cpiGrowth * 0.5, 0.02, 0.05);
  if (rr <= terminalGrowth) return { model: 'DCF', value: null, reason: 'required return <= terminal growth' };

  let baseGrowth = d.financialData.revenueGrowth ?? 0.05;
  if (topArchetype === 'CYCLICAL_HEAVY' && macro) {
    if (macro.copperYoY) baseGrowth += macro.copperYoY * 0.5;
    if (macro.goldYoY) baseGrowth += macro.goldYoY * 0.5;
  }

  const growthStart = clamp(baseGrowth, -0.1, adjustedGrowthCap(macro)) + cpiGrowth * 0.5;
  let pv = 0;
  let cf = fcf / shares;
  for (let year = 1; year <= 5; year++) {
    const g = growthStart - ((growthStart - terminalGrowth) * year) / 5; // linear taper to terminal growth
    cf = cf * (1 + g);
    pv += cf / Math.pow(1 + rr, year);
  }
  const terminalValue = (cf * (1 + terminalGrowth)) / (rr - terminalGrowth);
  pv += terminalValue / Math.pow(1 + rr, 5);
  return { model: 'DCF', value: pv };
}

export function calcGrahamNumber(d: YahooFinanceSnapshot): ValuationModelResult {
  const eps = d.defaultKeyStatistics.trailingEps;
  const raw = d.defaultKeyStatistics.bookValue;
  if (!eps || eps <= 0 || !raw || raw <= 0) {
    return { model: 'GRAHAM_NUMBER', value: null, reason: 'negative/missing EPS or book value' };
  }
  const { bvps } = adjustedBookValuePerShare(d);
  if (bvps == null || bvps <= 0) {
    return { model: 'GRAHAM_NUMBER', value: null, reason: 'adjusted book value is negative' };
  }
  return { model: 'GRAHAM_NUMBER', value: Math.sqrt(22.5 * eps * bvps) };
}

export function calcDDM(d: YahooFinanceSnapshot, macro?: MacroEnvironment, topArchetype?: string): ValuationModelResult {
  const div = d.summaryDetail.dividendRate;
  if (!div || div <= 0) return { model: 'DDM', value: null, reason: 'no dividend' };

  const rr = requiredReturn(d.summaryDetail.beta, macro);
  let divGrowth = clamp((d.financialData.earningsGrowth ?? 0.02) + cpiGrowthComponent(macro) * 0.5, 0, 0.08);
  if (topArchetype === 'CYCLICAL_HEAVY' && macro) {
    if (macro.copperYoY) divGrowth += macro.copperYoY * 0.2;
    if (macro.goldYoY) divGrowth += macro.goldYoY * 0.2;
  }
  divGrowth = clamp(divGrowth, 0.0, rr - 0.01);
  if (rr <= divGrowth) return { model: 'DDM', value: null, reason: 'required return <= dividend growth' };
  return { model: 'DDM', value: (div * (1 + divGrowth)) / (rr - divGrowth) };
}

export function calcPEGImpliedPE(d: YahooFinanceSnapshot): ValuationModelResult {
  const eps = d.defaultKeyStatistics.trailingEps;
  const growth = d.financialData.earningsGrowth;
  if (!eps || eps <= 0 || growth == null || growth <= 0) {
    return { model: 'PEG_IMPLIED_PE', value: null, reason: 'negative EPS or no growth' };
  }
  const growthPct = clamp(growth * 100, 5, 40); // Lynch-style PEG=1 heuristic
  return { model: 'PEG_IMPLIED_PE', value: eps * growthPct };
}

export function calcEVEBITDA(d: YahooFinanceSnapshot, anchorMultiple: number): ValuationModelResult {
  const ebitda = d.financialData.ebitda;
  const shares = d.defaultKeyStatistics.sharesOutstanding;
  if (!ebitda || ebitda <= 0 || !shares) {
    return { model: 'EV_EBITDA', value: null, reason: 'negative/missing EBITDA' };
  }
  const totalDebt = d.financialData.totalDebt ?? 0;
  const totalCash = d.financialData.totalCash ?? 0;
  return { model: 'EV_EBITDA', value: (ebitda * anchorMultiple - totalDebt + totalCash) / shares };
}

export function calcPriceToBook(d: YahooFinanceSnapshot, anchorMultiple: number): ValuationModelResult {
  const raw = d.defaultKeyStatistics.bookValue;
  if (!raw || raw <= 0) return { model: 'PRICE_TO_BOOK', value: null, reason: 'missing/negative book value' };
  const { bvps } = adjustedBookValuePerShare(d);
  if (bvps == null || bvps <= 0) return { model: 'PRICE_TO_BOOK', value: null, reason: 'adjusted book value is negative' };
  return { model: 'PRICE_TO_BOOK', value: bvps * anchorMultiple };
}

export function calcFCFYield(d: YahooFinanceSnapshot): ValuationModelResult {
  const fcf = d.financialData.freeCashflow;
  const shares = d.defaultKeyStatistics.sharesOutstanding;
  if (!fcf || fcf <= 0 || !shares) return { model: 'FCF_YIELD', value: null, reason: 'missing/negative FCF' };
  const beta = d.summaryDetail.beta ?? 1;
  const targetYield = clamp(0.05 + (beta - 1) * 0.02, 0.04, 0.12);
  return { model: 'FCF_YIELD', value: fcf / shares / targetYield };
}

export function calcEPV(d: YahooFinanceSnapshot, macro?: MacroEnvironment): ValuationModelResult {
  const shares = d.defaultKeyStatistics.sharesOutstanding;
  let netIncome = d.cashflowStatementHistory.cashflowStatements[0]?.netIncome;
  if (netIncome == null && d.defaultKeyStatistics.trailingEps != null && shares) {
    netIncome = d.defaultKeyStatistics.trailingEps * shares;
  }
  if (!netIncome || netIncome <= 0 || !shares) return { model: 'EPV', value: null, reason: 'negative/missing earnings' };

  const costOfCapital = requiredReturn(d.summaryDetail.beta, macro);
  const f = d.fundamentals;
  let growthPremium = 1.0;
  if (f && f.ebit && f.investedCapital && f.investedCapital > 0 && f.taxRate != null) {
    const roic = (f.ebit * (1 - f.taxRate)) / f.investedCapital;
    if (roic > costOfCapital) growthPremium = clamp(1 + (roic - costOfCapital), 1.0, 1.5);
  }
  return { model: 'EPV', value: (netIncome / shares / costOfCapital) * growthPremium };
}

export function calcPriceToSales(d: YahooFinanceSnapshot, anchorMultiple: number): ValuationModelResult {
  const shares = d.defaultKeyStatistics.sharesOutstanding;
  const revPerShare =
    d.financialData.revenuePerShare ??
    (d.financialData.totalRevenue && shares ? d.financialData.totalRevenue / shares : null);
  if (!revPerShare || revPerShare <= 0) {
    return { model: 'PRICE_TO_SALES', value: null, reason: 'missing/negative revenue' };
  }
  return { model: 'PRICE_TO_SALES', value: revPerShare * anchorMultiple };
}

export function calcLiquidationValue(
  d: YahooFinanceSnapshot,
  haircuts?: { cash: number; receivables: number; inventory: number; fixedAssets: number }
): ValuationModelResult {
  const f = d.fundamentals;
  if (!f || f.totalLiabilities == null) return { model: 'LIQUIDATION_VALUE', value: null, reason: 'missing liabilities' };
  const shares = d.defaultKeyStatistics.sharesOutstanding;
  if (!shares || shares <= 0) return { model: 'LIQUIDATION_VALUE', value: null, reason: 'no shares' };

  const hc = haircuts || { cash: 1.0, receivables: 0.7, inventory: 0.5, fixedAssets: 0.3 };
  let recoveryValue =
    (f.cash ?? 0) * hc.cash + (f.receivables ?? 0) * hc.receivables + (f.inventory ?? 0) * hc.inventory + (f.fixedAssets ?? 0) * hc.fixedAssets;
  if (recoveryValue === 0 && f.totalAssets && f.totalAssets > 0) recoveryValue = f.totalAssets * 0.8;
  return { model: 'LIQUIDATION_VALUE', value: Math.max(0, (recoveryValue - f.totalLiabilities) / shares) };
}

export function calcAnalystConsensus(d: YahooFinanceSnapshot): ValuationModelResult {
  const target = d.financialData.targetMeanPrice;
  if (!target) return { model: 'ANALYST_CONSENSUS', value: null, reason: 'no analyst coverage' };
  return { model: 'ANALYST_CONSENSUS', value: target };
}

export function calcAltmanZScore(d: YahooFinanceSnapshot): ValuationModelResult {
  const f = d.fundamentals;
  if (!f || f.workingCapital == null || f.totalAssets == null || f.retainedEarnings == null || f.ebit == null || f.totalLiabilities == null || d.financialData.totalRevenue == null) {
    return { model: 'ALTMAN_Z_SCORE', value: null, reason: 'missing balance sheet data' };
  }
  if (f.totalAssets <= 0 || f.totalLiabilities <= 0) return { model: 'ALTMAN_Z_SCORE', value: null, reason: 'invalid assets/liabilities' };
  if (d.assetProfile?.sector === 'Financial Services') return { model: 'ALTMAN_Z_SCORE', value: null, reason: 'not applicable for financials' };
  const shares = d.defaultKeyStatistics.sharesOutstanding;
  const price = d.financialData.currentPrice;
  if (!shares || !price) return { model: 'ALTMAN_Z_SCORE', value: null, reason: 'missing shares/price' };

  const z =
    1.2 * (f.workingCapital / f.totalAssets) +
    1.4 * (f.retainedEarnings / f.totalAssets) +
    3.3 * (f.ebit / f.totalAssets) +
    0.6 * ((shares * price) / f.totalLiabilities) +
    1.0 * (d.financialData.totalRevenue / f.totalAssets);
  const zone = z < 1.8 ? ' (Distress Zone)' : z < 3 ? ' (Grey Zone)' : ' (Safe Zone)';
  return { model: 'ALTMAN_Z_SCORE', value: null, reason: `Z-Score=${z.toFixed(2)}${zone}` };
}

export function calcROICSpread(d: YahooFinanceSnapshot, macro?: MacroEnvironment): ValuationModelResult {
  const f = d.fundamentals;
  if (!f || f.ebit == null || f.investedCapital == null) return { model: 'ROIC_SPREAD', value: null, reason: 'missing ebit or invested capital' };
  if (f.investedCapital <= 0) return { model: 'ROIC_SPREAD', value: null, reason: 'invested capital <= 0' };
  if (f.taxRate == null) return { model: 'ROIC_SPREAD', value: null, reason: 'missing effective tax rate' };
  const roic = (f.ebit * (1 - f.taxRate)) / f.investedCapital;
  const wacc = requiredReturn(d.summaryDetail.beta, macro);
  const spread = roic - wacc;
  return {
    model: 'ROIC_SPREAD',
    value: null,
    reason: `ROIC=${(roic * 100).toFixed(1)}%, WACC=${(wacc * 100).toFixed(1)}% -> Spread=${(spread * 100).toFixed(1)}%`,
  };
}

export function calcReverseDCF(d: YahooFinanceSnapshot, macro?: MacroEnvironment): ValuationModelResult {
  const shares = d.defaultKeyStatistics.sharesOutstanding;
  let fcf = d.financialData.freeCashflow;
  if (fcf == null) {
    const cf = d.cashflowStatementHistory.cashflowStatements[0];
    if (cf?.totalCashFromOperatingActivities != null && cf?.capitalExpenditures != null) {
      fcf = cf.totalCashFromOperatingActivities - Math.abs(cf.capitalExpenditures);
    }
  }
  const price = d.financialData.currentPrice;
  if (!shares || !price || fcf == null || fcf <= 0) return { model: 'REVERSE_DCF', value: null, reason: 'missing/negative FCF or price' };

  const rr = requiredReturn(d.summaryDetail.beta, macro);
  const terminalGrowth = 0.025;
  if (rr <= terminalGrowth) return { model: 'REVERSE_DCF', value: null, reason: 'rr <= terminal growth' };

  const targetPV = price * shares;
  let low = -0.2;
  let high = 0.5;
  let impliedGrowth = 0.05;
  for (let i = 0; i < 20; i++) {
    impliedGrowth = (low + high) / 2;
    let pv = 0;
    let cf = fcf;
    for (let yr = 1; yr <= 5; yr++) {
      cf *= 1 + impliedGrowth;
      pv += cf / Math.pow(1 + rr, yr);
    }
    pv += (cf * (1 + terminalGrowth)) / (rr - terminalGrowth) / Math.pow(1 + rr, 5);
    if (pv > targetPV) high = impliedGrowth;
    else low = impliedGrowth;
  }
  const histGrowth = d.financialData.revenueGrowth ?? d.financialData.earningsGrowth;
  let reason = `Implied 5Y Growth: ${(impliedGrowth * 100).toFixed(1)}%`;
  if (histGrowth != null) reason += ` vs Historical/Expected: ${(histGrowth * 100).toFixed(1)}%`;
  return { model: 'REVERSE_DCF', value: null, reason };
}

// ============================================================================
// STEP 3 — WEIGHTING MATRIX (ekspercki prior; wagi wytrenowane: artifacts/block-weights.json)
// ============================================================================

export const WEIGHT_MATRIX: WeightMatrix = {
  HYPER_GROWTH: { BLOK_MULTIPLES: 0.8, BLOK_CASHFLOW: 0.2 },
  VALUE_COMPOUNDER: { BLOK_CASHFLOW: 0.5, BLOK_MULTIPLES: 0.3, BLOK_DIVIDEND: 0.1, BLOK_ASSETS: 0.1 },
  FINANCIALS_BANKS: { BLOK_ASSETS: 0.5, BLOK_DIVIDEND: 0.3, BLOK_MULTIPLES: 0.2 },
  CYCLICAL_HEAVY: { BLOK_ASSETS: 0.4, BLOK_CASHFLOW: 0.4, BLOK_MULTIPLES: 0.2 },
  INCOME_STABLE: { BLOK_DIVIDEND: 0.6, BLOK_CASHFLOW: 0.3, BLOK_MULTIPLES: 0.1 },
  DEEP_VALUE_DISTRESSED: { BLOK_ASSETS: 0.8, BLOK_CASHFLOW: 0.2 },
};

/** Static starting-point target multiples per archetype — replace with real peer medians when available. */
const ANCHOR_MULTIPLES: Record<Archetype, { evEbitda: number; priceToBook: number; priceToSales: number }> = {
  HYPER_GROWTH: { evEbitda: 35, priceToBook: 12, priceToSales: 15 },
  VALUE_COMPOUNDER: { evEbitda: 18, priceToBook: 8, priceToSales: 6 },
  FINANCIALS_BANKS: { evEbitda: 10, priceToBook: 1.5, priceToSales: 3 },
  CYCLICAL_HEAVY: { evEbitda: 8, priceToBook: 1.8, priceToSales: 1.5 },
  INCOME_STABLE: { evEbitda: 12, priceToBook: 3, priceToSales: 4 },
  DEEP_VALUE_DISTRESSED: { evEbitda: 6, priceToBook: 0.8, priceToSales: 0.8 },
};

function blendWeights(
  scores: ArchetypeScore[],
  config?: EngineConfig,
  macro?: MacroEnvironment
): { weights: Record<ValuationBlock, number>; capHits: FairValueResult['capHits'] } {
  const baseMatrix = config?.baseWeights ?? WEIGHT_MATRIX;
  const archetypes = scores.map((s) => s.archetype);

  const macroMults = Object.fromEntries(archetypes.map((a) => [a, Object.fromEntries(BLOCKS.map((b) => [b, 1.0]))])) as Record<
    Archetype,
    Record<ValuationBlock, number>
  >;

  if (config?.macroModifiers && macro) {
    const applyModifier = (modMatrix?: WeightMatrix) => {
      if (!modMatrix) return;
      for (const a of archetypes) {
        for (const b of BLOCKS) {
          const multiplier = modMatrix[a]?.[b];
          if (multiplier != null) macroMults[a][b] *= multiplier;
        }
      }
    };
    if (macro.rateRegime === 'HIKING') applyModifier(config.macroModifiers.rateHiking);
    if (macro.rateRegime === 'CUTTING') applyModifier(config.macroModifiers.rateCutting);
    if (macro.cpiYoY > 0.04) applyModifier(config.macroModifiers.highInflation);
    if (macro.yieldSpread < -0.005) applyModifier(config.macroModifiers.yieldCurveInverted);
    if (macro.goldYoY && macro.goldYoY > 0.1) applyModifier(config.macroModifiers.goldRising);
    if (macro.copperYoY && macro.copperYoY < -0.1) applyModifier(config.macroModifiers.copperFalling);
  }

  const acc = Object.fromEntries(BLOCKS.map((b) => [b, 0])) as Record<ValuationBlock, number>;
  const cap = config?.macroCap ?? 0.25;
  const capHits: FairValueResult['capHits'] = [];

  for (const s of scores) {
    for (const b of BLOCKS) {
      const baseW = baseMatrix[s.archetype]?.[b] ?? 0;
      const rawMult = macroMults[s.archetype][b];
      let finalMacroMult = rawMult;
      if (rawMult > 1 + cap) {
        finalMacroMult = 1 + cap;
        capHits.push({ archetype: s.archetype, block: b, direction: 'UP', rawMult });
      } else if (rawMult < 1 - cap) {
        finalMacroMult = 1 - cap;
        capHits.push({ archetype: s.archetype, block: b, direction: 'DOWN', rawMult });
      }
      acc[b] += s.confidence * (baseW * finalMacroMult);
    }
  }
  return { weights: acc, capHits };
}

function blendAnchors(scores: ArchetypeScore[]) {
  const acc = { evEbitda: 0, priceToBook: 0, priceToSales: 0 };
  for (const s of scores) {
    const a = ANCHOR_MULTIPLES[s.archetype];
    acc.evEbitda += s.confidence * a.evEbitda;
    acc.priceToBook += s.confidence * a.priceToBook;
    acc.priceToSales += s.confidence * a.priceToSales;
  }
  return acc;
}

/** Mediana wartości modeli w każdym bloku (null, gdy żaden model bloku nie zwrócił liczby). */
export function computeBlockValues(models: Record<string, number | null | undefined>): Record<ValuationBlock, number | null> {
  const out = {} as Record<ValuationBlock, number | null>;
  for (const block of BLOCKS) {
    const vals = BLOCK_MODELS[block]
      .map((m) => models[m])
      .filter((v): v is number => v != null && Number.isFinite(v))
      .sort((a, b) => a - b);
    if (!vals.length) {
      out[block] = null;
      continue;
    }
    const mid = Math.floor(vals.length / 2);
    out[block] = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  }
  return out;
}

// ============================================================================
// STEP 4 — PRICING & SAFETY MARGIN
// ============================================================================

const BASE_MARGIN_OF_SAFETY: Record<Archetype, number> = {
  HYPER_GROWTH: 0.35,
  VALUE_COMPOUNDER: 0.15,
  FINANCIALS_BANKS: 0.2,
  CYCLICAL_HEAVY: 0.3,
  INCOME_STABLE: 0.1,
  DEEP_VALUE_DISTRESSED: 0.5,
};

function computeMarginOfSafety(
  d: YahooFinanceSnapshot,
  scores: ArchetypeScore[],
  macro?: MacroEnvironment,
  technicals?: TechnicalIndicators
): number {
  const baseMoS = scores.reduce((s, a) => s + a.confidence * BASE_MARGIN_OF_SAFETY[a.archetype], 0);
  const betaAdj = clamp(((d.summaryDetail.beta ?? 1) - 1) * 0.1, -0.05, 0.2);

  const price = d.financialData.currentPrice ?? d.summaryDetail.previousClose ?? null;
  const sma200 = d.summaryDetail.twoHundredDayAverage;
  let techValuationAdj = 0;
  if (price != null && sma200 != null && sma200 > 0) {
    techValuationAdj = clamp(((price - sma200) / sma200) * 0.1, -0.05, 0.1);
  }

  const low = d.summaryDetail.fiftyTwoWeekLow;
  const high = d.summaryDetail.fiftyTwoWeekHigh;
  let rangeAdj = 0;
  if (price != null && low != null && high != null && high > low) {
    const position = (price - low) / (high - low);
    rangeAdj = position > 0.8 ? 0.05 : position < 0.2 ? -0.05 : 0;
  }

  const vixAdj = macro && macro.vix ? 0.005 * Math.max(0, macro.vix - 20) : 0;
  const techAdj = technicals?.technicalAdjustment ?? 0;
  return clamp(baseMoS + betaAdj + techValuationAdj + rangeAdj + vixAdj + techAdj, 0.05, 0.8);
}

export function verdictFor(price: number | null | undefined, fairValue: number, entryTarget: number, lowConfidence: boolean): Verdict {
  if (!price) return 'HOLD';
  if (!lowConfidence && price < entryTarget) return 'BUY';
  if (price > fairValue * 1.1) return 'SELL';
  return 'HOLD';
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export function calculateFairValue(
  data: YahooFinanceSnapshot,
  options?: { macro?: MacroEnvironment; technicals?: TechnicalIndicators; engineConfig?: EngineConfig }
): FairValueResult {
  const macro = options?.macro;
  if (macro) assertMacro(macro);
  const technicals = options?.technicals;
  const archetypeScores = categorizeArchetypes(data);
  const topArchetype = archetypeScores[0]?.archetype;
  const anchors = blendAnchors(archetypeScores);
  const signals: string[] = [...(data.metadata?.warnings ?? [])];

  const modelResults: ValuationModelResult[] = [
    calcDCF(data, macro, topArchetype),
    calcGrahamNumber(data),
    calcDDM(data, macro, topArchetype),
    calcPEGImpliedPE(data),
    calcEVEBITDA(data, anchors.evEbitda),
    calcPriceToBook(data, anchors.priceToBook),
    calcFCFYield(data),
    calcEPV(data, macro),
    calcPriceToSales(data, anchors.priceToSales),
    calcLiquidationValue(data, options?.engineConfig?.haircuts),
    calcAnalystConsensus(data),
    calcAltmanZScore(data),
    calcROICSpread(data, macro),
    calcReverseDCF(data, macro),
  ];

  // NaN/Infinity traktujemy jak brak wyniku — dawniej przepuszczane i zapisywane do CSV jako "NaN".
  const validResults = modelResults.filter(
    (r): r is ValuationModelResult & { value: number } => r.value != null && Number.isFinite(r.value)
  );
  const nonFinite = modelResults.filter((r) => r.value != null && !Number.isFinite(r.value));
  for (const r of nonFinite) signals.push(`model ${r.model} zwrócił wartość nieskończoną/NaN — pominięty`);

  const modelsDict: Record<string, number | null> = {};
  for (const r of modelResults) modelsDict[r.model] = r.value != null && Number.isFinite(r.value) ? r.value : null;

  const blockValues = computeBlockValues(modelsDict);
  const { weights: blendedWeights, capHits } = blendWeights(archetypeScores, options?.engineConfig, macro);
  const validBlocks = BLOCKS.filter((b) => blockValues[b] != null).map((b) => [b, blockValues[b] as number] as const);

  let fairValue: number;
  let lowConfidence = false;
  if (validBlocks.length === 0) {
    fairValue = data.financialData.currentPrice ?? 0;
    lowConfidence = true;
  } else {
    const weightSum = validBlocks.reduce((s, [b]) => s + blendedWeights[b], 0);
    if (weightSum <= 0.0001) {
      fairValue = validBlocks.reduce((s, [, v]) => s + v, 0) / validBlocks.length;
      lowConfidence = true;
    } else {
      fairValue = validBlocks.reduce((s, [b, v]) => s + v * blendedWeights[b], 0) / weightSum;
    }
  }
  if (validBlocks.length < 2 || validResults.length < 4) lowConfidence = true;

  // Earnings quality
  let earningsQualityAdjustment = 1.0;
  const history = data.earningsHistory?.history;
  if (history && history.length >= 2) {
    const surprises = history.filter((h) => h.surprisePercent != null).map((h) => h.surprisePercent!);
    if (surprises.length >= 2) {
      const avgSurprise = surprises.reduce((a, b) => a + b, 0) / surprises.length;
      const consistency = surprises.filter((s) => s > 0).length / surprises.length;
      if (avgSurprise > 0 && consistency >= 0.75) {
        earningsQualityAdjustment = 1.05;
        signals.push(`Consistently beats earnings (avg +${(avgSurprise * 100).toFixed(1)}%) — quality premium applied`);
      } else if (avgSurprise < 0 && consistency <= 0.25) {
        earningsQualityAdjustment = 0.95;
        signals.push(`Consistently misses earnings (avg ${(avgSurprise * 100).toFixed(1)}%) — quality discount applied`);
      }
    }
  }
  if (data.financialData.mScore != null && data.financialData.mScore > -1.78) {
    signals.push(`M-Score Red Flag (${data.financialData.mScore.toFixed(2)})`);
    earningsQualityAdjustment *= 0.5;
  }
  if (data.financialData.fScore != null) {
    if (data.financialData.fScore <= 3) {
      signals.push(`F-Score Red Flag (${data.financialData.fScore}/9)`);
      earningsQualityAdjustment *= 0.7;
    } else if (data.financialData.fScore >= 7) {
      signals.push(`F-Score Green Flag (${data.financialData.fScore}/9)`);
      earningsQualityAdjustment *= 1.1;
    }
  }
  fairValue *= earningsQualityAdjustment;

  const price = data.financialData.currentPrice;
  if (price) fairValue = clamp(fairValue, price * 0.2, price * 5); // guard against wild extrapolation

  // Ryzyko bankructwa: null (nieznane) NIE modyfikuje wyceny, ale obniża confidence.
  const pDefaultRaw = data.financialData.pDefault;
  const pDefault = pDefaultRaw != null && Number.isFinite(pDefaultRaw) ? clamp(pDefaultRaw, 0, 1) : null;
  if (pDefault != null) {
    const vRecovery = calcLiquidationValue(data, options?.engineConfig?.haircuts).value ?? 0;
    fairValue = (1 - pDefault) * fairValue + pDefault * vRecovery;
  }

  const marginOfSafety = computeMarginOfSafety(data, archetypeScores, macro, technicals);
  const entryTarget = fairValue * (1 - marginOfSafety);

  if (macro?.rateRegime === 'HIKING') signals.push('Rate regime HIKING — discount rate and MoS increased');
  else if (macro?.rateRegime === 'CUTTING') signals.push('Rate regime CUTTING — discount rate and MoS decreased');
  const consensus = modelResults.find((m) => m.model === 'ANALYST_CONSENSUS');
  if (consensus?.value != null) signals.push(`Analyst consensus target: ${consensus.value.toFixed(2)}`);
  if (technicals?.signals) signals.push(...technicals.signals);
  if (data.summaryDetail.beta == null) signals.push('beta nieznana — CAPM i MoS liczone z β=1');

  // 12-month price range from the spread of model outputs
  const sortedModelValues = validResults.map((r) => r.value).sort((a, b) => a - b);
  let priceRange12m: FairValueResult['priceRange12m'];
  if (sortedModelValues.length >= 3) {
    priceRange12m = {
      low: sortedModelValues[Math.floor(sortedModelValues.length * 0.1)],
      mid: fairValue,
      high: sortedModelValues[Math.min(sortedModelValues.length - 1, Math.floor(sortedModelValues.length * 0.9))],
    };
  }

  // ── CONFIDENCE SCORE ──
  const coverageScore = clamp(validResults.length / 8, 0, 1);
  let accuracyScore = UNKNOWN_ACCURACY_SCORE;
  const profile = options?.engineConfig?.accuracyProfile;
  const archetypeError = profile && topArchetype ? profile[topArchetype] : undefined;
  if (archetypeError != null) {
    accuracyScore = clamp(1 - archetypeError * 2, 0, 1);
  } else {
    signals.push(
      profile
        ? `dokładność archetypu ${topArchetype} nieznana (za mało obserwacji OOS) — przyjęto ${UNKNOWN_ACCURACY_SCORE}`
        : `brak profilu dokładności (accuracy-profile.json) — przyjęto ${UNKNOWN_ACCURACY_SCORE}`
    );
  }
  const defaultPenalty = pDefault ?? UNKNOWN_PDEFAULT_CONFIDENCE_PENALTY;
  const stalenessDays = data.metadata?.stalenessDays;
  const stalenessPenalty = stalenessDays != null ? clamp((stalenessDays - 90) / 180, 0, 0.5) : 0;
  const vixPenalty = macro?.vix ? 0.005 * Math.max(0, macro.vix - 20) : 0;
  const confidenceScore = clamp(coverageScore * 0.4 + accuracyScore * 0.6 - defaultPenalty - stalenessPenalty - vixPenalty, 0, 1);

  return {
    fairValue,
    entryTarget,
    marginOfSafety,
    upside: price ? fairValue / price - 1 : 0,
    models: modelsDict,
    blocks: blockValues,
    archetypeBlend: archetypeScores,
    validModelCount: validResults.length,
    lowConfidence,
    pDefault,
    priceRange12m,
    warnings: signals,
    confidenceScore,
    verdict: verdictFor(price, fairValue, entryTarget, lowConfidence),
    capHits,
  };
}

// ============================================================================
// ENSEMBLE ORCHESTRATOR
// ============================================================================

export function calculateEnsembleFairValue(
  data: YahooFinanceSnapshot,
  ensembleConfigs: EngineConfig[],
  options?: { macro?: MacroEnvironment; technicals?: TechnicalIndicators }
): FairValueResult & { ensembleSpread?: number } {
  if (!ensembleConfigs || ensembleConfigs.length === 0) return calculateFairValue(data, options);

  const results = ensembleConfigs.map((config) => calculateFairValue(data, { ...options, engineConfig: config }));
  const validResults = results.filter((r) => !r.lowConfidence);
  if (validResults.length === 0) return results[0];

  const avg = (f: (r: FairValueResult) => number) => validResults.reduce((s, r) => s + f(r), 0) / validResults.length;
  const avgFairValue = avg((r) => r.fairValue);
  const avgEntryTarget = avg((r) => r.entryTarget);
  const avgMarginOfSafety = avg((r) => r.marginOfSafety);
  const avgConfidence = avg((r) => r.confidenceScore);

  const minFairValue = Math.min(...validResults.map((r) => r.fairValue));
  const maxFairValue = Math.max(...validResults.map((r) => r.fairValue));
  const ensembleSpread = minFairValue > 0 ? (maxFairValue - minFairValue) / minFairValue : 0;
  const finalConfidence = clamp(avgConfidence - clamp(ensembleSpread * 2, 0, 0.8), 0, 1);

  const baseResult = validResults[0];
  return {
    ...baseResult,
    fairValue: avgFairValue,
    entryTarget: avgEntryTarget,
    marginOfSafety: avgMarginOfSafety,
    confidenceScore: finalConfidence,
    verdict: verdictFor(data.financialData?.currentPrice, avgFairValue, avgEntryTarget, false),
    ensembleSpread,
    warnings: [...baseResult.warnings, `Ensemble size: ${validResults.length} experts (Spread: ${(ensembleSpread * 100).toFixed(1)}%)`],
  };
}
