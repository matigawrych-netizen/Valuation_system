import { describe, expect, it } from 'vitest';
import {
  calcDCF,
  calcDDM,
  calcEPV,
  calcEVEBITDA,
  calcFCFYield,
  calcGrahamNumber,
  calcPEGImpliedPE,
  calcPriceToBook,
  calcPriceToSales,
  calcAnalystConsensus,
  calculateFairValue,
  WEIGHT_MATRIX,
  type YahooFinanceSnapshot,
} from '../src/valuation-engine.js';
import { categorizeArchetypes } from '../src/archetypes.js';

/** Empty-but-valid snapshot; override only what a test cares about. */
function makeSnapshot(overrides: {
  summaryDetail?: Partial<YahooFinanceSnapshot['summaryDetail']>;
  defaultKeyStatistics?: Partial<YahooFinanceSnapshot['defaultKeyStatistics']>;
  financialData?: Partial<YahooFinanceSnapshot['financialData']>;
  balanceSheets?: YahooFinanceSnapshot['balanceSheetHistory']['balanceSheetStatements'];
  cashflows?: YahooFinanceSnapshot['cashflowStatementHistory']['cashflowStatements'];
} = {}): YahooFinanceSnapshot {
  return {
    summaryDetail: { ...overrides.summaryDetail },
    defaultKeyStatistics: { ...overrides.defaultKeyStatistics },
    financialData: { ...overrides.financialData },
    balanceSheetHistory: { balanceSheetStatements: overrides.balanceSheets ?? [] },
    cashflowStatementHistory: { cashflowStatements: overrides.cashflows ?? [] },
  };
}

describe('calcDCF', () => {
  it('returns null for negative FCF', () => {
    const r = calcDCF(
      makeSnapshot({
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        financialData: { freeCashflow: -5e8 },
      })
    );
    expect(r.value).toBeNull();
    expect(r.reason).toMatch(/non-positive FCF/);
  });

  it('returns null when shares outstanding is missing', () => {
    const r = calcDCF(makeSnapshot({ financialData: { freeCashflow: 1e9 } }));
    expect(r.value).toBeNull();
  });

  it('falls back to opCF - |capex| from the cashflow statement', () => {
    const r = calcDCF(
      makeSnapshot({
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        cashflows: [
          { netIncome: 8e8, totalCashFromOperatingActivities: 1e9, capitalExpenditures: -2e8 },
        ],
      })
    );
    // FCF/share = (1e9 - 2e8) / 1e9 = 0.8; PV of tapered growth + terminal must be positive
    expect(r.value).not.toBeNull();
    expect(r.value!).toBeGreaterThan(0);
  });

  it('produces a positive PV for a plain profitable company', () => {
    const r = calcDCF(
      makeSnapshot({
        summaryDetail: { beta: 1 },
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        financialData: { freeCashflow: 2e9, revenueGrowth: 0.08 },
      })
    );
    expect(r.value).toBeGreaterThan(2); // > current FCF/share of 2 given growth + terminal value
  });
});

describe('calcGrahamNumber', () => {
  it('returns null for negative EPS', () => {
    const r = calcGrahamNumber(
      makeSnapshot({ defaultKeyStatistics: { trailingEps: -3.2, bookValue: 15 } })
    );
    expect(r.value).toBeNull();
    expect(r.reason).toMatch(/EPS or book value/);
  });

  it('returns null for missing book value', () => {
    const r = calcGrahamNumber(makeSnapshot({ defaultKeyStatistics: { trailingEps: 4 } }));
    expect(r.value).toBeNull();
  });

  it('returns null for negative book value', () => {
    const r = calcGrahamNumber(
      makeSnapshot({ defaultKeyStatistics: { trailingEps: 4, bookValue: -2 } })
    );
    expect(r.value).toBeNull();
  });

  it('computes sqrt(22.5 * EPS * BVPS)', () => {
    const r = calcGrahamNumber(
      makeSnapshot({ defaultKeyStatistics: { trailingEps: 5, bookValue: 20 } })
    );
    expect(r.value).toBeCloseTo(Math.sqrt(22.5 * 5 * 20), 6);
  });
});

describe('calcDDM', () => {
  it('returns null when there is no dividend', () => {
    const r = calcDDM(makeSnapshot({ financialData: { earningsGrowth: 0.05 } }));
    expect(r.value).toBeNull();
    expect(r.reason).toBe('no dividend');
  });

  it('returns null for a zero dividend', () => {
    const r = calcDDM(makeSnapshot({ summaryDetail: { dividendRate: 0 } }));
    expect(r.value).toBeNull();
  });

  it('applies Gordon growth with clamped growth', () => {
    // beta 1 -> rr = 0.09; earningsGrowth 0.03 within [0, 0.08] clamp
    const r = calcDDM(
      makeSnapshot({
        summaryDetail: { dividendRate: 2, beta: 1 },
        financialData: { earningsGrowth: 0.03 },
      })
    );
    expect(r.value).toBeCloseTo((2 * 1.03) / (0.09 - 0.03), 6);
  });

  it('caps runaway growth at 8% so growth < required return', () => {
    const r = calcDDM(
      makeSnapshot({
        summaryDetail: { dividendRate: 1, beta: 1.5 }, // rr = 0.04 + 1.5*0.05 = 0.115
        financialData: { earningsGrowth: 0.5 },
      })
    );
    expect(r.value).toBeCloseTo((1 * 1.08) / (0.115 - 0.08), 6);
  });
});

describe('calcPEGImpliedPE', () => {
  it('returns null for negative EPS', () => {
    const r = calcPEGImpliedPE(
      makeSnapshot({
        defaultKeyStatistics: { trailingEps: -1 },
        financialData: { earningsGrowth: 0.2 },
      })
    );
    expect(r.value).toBeNull();
  });

  it('returns null for zero or negative growth', () => {
    const r = calcPEGImpliedPE(
      makeSnapshot({
        defaultKeyStatistics: { trailingEps: 3 },
        financialData: { earningsGrowth: -0.1 },
      })
    );
    expect(r.value).toBeNull();
    expect(r.reason).toMatch(/no growth/);
  });

  it('implies PE = growth% (PEG = 1), clamped to [5, 40]', () => {
    const mid = calcPEGImpliedPE(
      makeSnapshot({
        defaultKeyStatistics: { trailingEps: 4 },
        financialData: { earningsGrowth: 0.2 },
      })
    );
    expect(mid.value).toBeCloseTo(4 * 20, 6);

    const capped = calcPEGImpliedPE(
      makeSnapshot({
        defaultKeyStatistics: { trailingEps: 4 },
        financialData: { earningsGrowth: 0.9 },
      })
    );
    expect(capped.value).toBeCloseTo(4 * 40, 6);

    const floored = calcPEGImpliedPE(
      makeSnapshot({
        defaultKeyStatistics: { trailingEps: 4 },
        financialData: { earningsGrowth: 0.01 },
      })
    );
    expect(floored.value).toBeCloseTo(4 * 5, 6);
  });
});

describe('calcEVEBITDA', () => {
  it('returns null for negative EBITDA', () => {
    const r = calcEVEBITDA(
      makeSnapshot({
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        financialData: { ebitda: -1e8 },
      }),
      10
    );
    expect(r.value).toBeNull();
  });

  it('returns null when shares are missing', () => {
    const r = calcEVEBITDA(makeSnapshot({ financialData: { ebitda: 1e9 } }), 10);
    expect(r.value).toBeNull();
  });

  it('bridges EV to equity via debt and cash', () => {
    const r = calcEVEBITDA(
      makeSnapshot({
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        financialData: { ebitda: 1e9, totalDebt: 3e9, totalCash: 1e9 },
      }),
      10
    );
    // EV = 10e9, equity = 10e9 - 3e9 + 1e9 = 8e9 -> 8/share
    expect(r.value).toBeCloseTo(8, 6);
  });

  it('treats missing debt/cash as zero', () => {
    const r = calcEVEBITDA(
      makeSnapshot({
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        financialData: { ebitda: 1e9 },
      }),
      10
    );
    expect(r.value).toBeCloseTo(10, 6);
  });
});

describe('calcPriceToBook', () => {
  it('returns null for missing book value', () => {
    expect(calcPriceToBook(makeSnapshot(), 1.5).value).toBeNull();
  });

  it('returns null for negative book value', () => {
    const r = calcPriceToBook(makeSnapshot({ defaultKeyStatistics: { bookValue: -4 } }), 1.5);
    expect(r.value).toBeNull();
  });

  it('multiplies BVPS by the anchor multiple', () => {
    const r = calcPriceToBook(makeSnapshot({ defaultKeyStatistics: { bookValue: 12 } }), 1.5);
    expect(r.value).toBeCloseTo(18, 6);
  });
});

describe('calcFCFYield', () => {
  it('returns null for negative FCF', () => {
    const r = calcFCFYield(
      makeSnapshot({
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        financialData: { freeCashflow: -1 },
      })
    );
    expect(r.value).toBeNull();
  });

  it('returns null for missing FCF or shares', () => {
    expect(calcFCFYield(makeSnapshot()).value).toBeNull();
    expect(
      calcFCFYield(makeSnapshot({ financialData: { freeCashflow: 1e9 } })).value
    ).toBeNull();
  });

  it('capitalizes FCF/share at a beta-adjusted target yield', () => {
    const r = calcFCFYield(
      makeSnapshot({
        summaryDetail: { beta: 1 }, // target yield = 0.05
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        financialData: { freeCashflow: 2e9 },
      })
    );
    expect(r.value).toBeCloseTo(2 / 0.05, 6);
  });
});

describe('calcEPV', () => {
  it('returns null for negative earnings', () => {
    const r = calcEPV(
      makeSnapshot({
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        cashflows: [{ netIncome: -2e8 }],
      })
    );
    expect(r.value).toBeNull();
  });

  it('falls back to trailingEps * shares when statement netIncome is missing', () => {
    const r = calcEPV(
      makeSnapshot({
        summaryDetail: { beta: 1 }, // cost of capital = 0.09
        defaultKeyStatistics: { trailingEps: 4.5, sharesOutstanding: 1e9 },
      })
    );
    expect(r.value).toBeCloseTo(4.5 / 0.09, 6);
  });

  it('capitalizes statement net income at the cost of capital', () => {
    const r = calcEPV(
      makeSnapshot({
        summaryDetail: { beta: 1 },
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        cashflows: [{ netIncome: 9e8 }],
      })
    );
    expect(r.value).toBeCloseTo(0.9 / 0.09, 6);
  });
});

describe('calcPriceToSales', () => {
  it('returns null for missing revenue', () => {
    expect(calcPriceToSales(makeSnapshot(), 2).value).toBeNull();
  });

  it('uses revenuePerShare when present', () => {
    const r = calcPriceToSales(
      makeSnapshot({ financialData: { revenuePerShare: 30 } }),
      2
    );
    expect(r.value).toBeCloseTo(60, 6);
  });

  it('derives revenue per share from totalRevenue / shares', () => {
    const r = calcPriceToSales(
      makeSnapshot({
        defaultKeyStatistics: { sharesOutstanding: 1e9 },
        financialData: { totalRevenue: 5e10 },
      }),
      2
    );
    expect(r.value).toBeCloseTo(100, 6);
  });
});

describe('calcAnalystConsensus', () => {
  it('returns null with no analyst coverage', () => {
    const r = calcAnalystConsensus(makeSnapshot());
    expect(r.value).toBeNull();
    expect(r.reason).toBe('no analyst coverage');
  });

  it('passes through the mean target', () => {
    const r = calcAnalystConsensus(makeSnapshot({ financialData: { targetMeanPrice: 123.45 } }));
    expect(r.value).toBe(123.45);
  });
});

describe('categorizeArchetypes', () => {
  it('normalizes confidences to sum to 1, sorted descending', () => {
    const scores = categorizeArchetypes(
      makeSnapshot({
        summaryDetail: { dividendYield: 0.02, payoutRatio: 0.4, trailingPE: 18, beta: 0.9 },
        financialData: { earningsGrowth: 0.08, returnOnEquity: 0.18, revenueGrowth: 0.05 },
      })
    );
    const sum = scores.reduce((s: number, a: any) => s + a.confidence, 0);
    expect(sum).toBeCloseTo(1, 6);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].confidence).toBeGreaterThanOrEqual(scores[i].confidence);
    }
    expect(scores[0].archetype).toBe('VALUE_COMPOUNDER');
  });

  it('flags a distressed profile as DEEP_VALUE_DISTRESSED', () => {
    const scores = categorizeArchetypes(
      makeSnapshot({
        summaryDetail: { trailingPE: 12, beta: 1.0, dividendYield: 0.02 },
        defaultKeyStatistics: { trailingEps: -2.5, bookValue: 20 },
        financialData: {
          currentPrice: 10, // P/B = 0.5
          freeCashflow: -1e8,
          debtToEquity: 200,
          returnOnEquity: -0.1,
          profitMargins: 0.12,
          earningsGrowth: 0.02,
          revenueGrowth: 0.1,
        },
      })
    );
    expect(scores[0].archetype).toBe('DEEP_VALUE_DISTRESSED');
  });
});

describe('calculateFairValue (orchestrator edge cases)', () => {
  it('degrades gracefully when no model is computable', () => {
    // Everything missing except a price: negative EPS, no dividend, no book
    // value, negative FCF, no EBITDA, no revenue, no analyst target.
    const result = calculateFairValue(
      makeSnapshot({
        defaultKeyStatistics: { trailingEps: -1 },
        financialData: { currentPrice: 50, freeCashflow: -1e8 },
      })
    );
    expect(result.validModelCount).toBe(0);
    expect(result.lowConfidence).toBe(true);
    expect(result.fairValue).toBe(50); // falls back to current price
    expect(result.entryTarget).toBeLessThan(result.fairValue);
    expect(result.marginOfSafety).toBeGreaterThanOrEqual(0.05);
    expect(result.marginOfSafety).toBeLessThanOrEqual(0.45);
  });

  it('renormalizes weights over the models that survive', () => {
    // Only PRICE_TO_BOOK and ANALYST_CONSENSUS are computable here.
    const result = calculateFairValue(
      makeSnapshot({
        defaultKeyStatistics: { bookValue: 10 },
        financialData: { currentPrice: 20, targetMeanPrice: 25 },
      })
    );
    expect(result.validModelCount).toBe(2);
    expect(result.lowConfidence).toBe(true); // < 4 valid models
    const values = Object.entries(result.models).filter(([k, v]) => v != null).map(([k, v]) => k);
    expect(values).toEqual(expect.arrayContaining(['PRICE_TO_BOOK', 'ANALYST_CONSENSUS']));
    // Weighted average of the two surviving models must sit between them.
    const pb = result.models['PRICE_TO_BOOK']!;
    const consensus = result.models['ANALYST_CONSENSUS']!;
    expect(result.fairValue).toBeGreaterThanOrEqual(Math.min(pb, consensus));
    expect(result.fairValue).toBeLessThanOrEqual(Math.max(pb, consensus));
  });

  it('clamps fair value to [0.2x, 5x] of the current price', () => {
    const result = calculateFairValue(
      makeSnapshot({
        defaultKeyStatistics: { bookValue: 1000 }, // absurd BVPS vs $5 price
        financialData: { currentPrice: 5 },
      })
    );
    expect(result.fairValue).toBeLessThanOrEqual(25);
    expect(result.fairValue).toBeGreaterThanOrEqual(1);
  });

  it('entry target = fair value * (1 - margin of safety)', () => {
    const result = calculateFairValue(
      makeSnapshot({
        summaryDetail: { beta: 1 },
        defaultKeyStatistics: { trailingEps: 5, bookValue: 20, sharesOutstanding: 1e9 },
        financialData: { currentPrice: 45, freeCashflow: 4e9, targetMeanPrice: 50 },
      })
    );
    expect(result.entryTarget).toBeCloseTo(result.fairValue * (1 - result.marginOfSafety), 6);
  });
});

describe('calculateFairValue — pDefault, dokładność, NaN, werdykt', () => {
  const base = (financial: Partial<YahooFinanceSnapshot['financialData']> = {}, summary: Partial<YahooFinanceSnapshot['summaryDetail']> = { beta: 1 }) =>
    makeSnapshot({
      summaryDetail: summary,
      defaultKeyStatistics: { trailingEps: 5, bookValue: 20, sharesOutstanding: 1e9 },
      financialData: { currentPrice: 45, freeCashflow: 4e9, ...financial },
    });

  it('pDefault null nie zmienia wyceny, ale obniża confidence względem pDefault = 0', () => {
    const known = calculateFairValue(base({ pDefault: 0 }));
    const unknown = calculateFairValue(base());
    expect(unknown.pDefault).toBeNull();
    expect(known.pDefault).toBe(0);
    expect(unknown.fairValue).toBeCloseTo(known.fairValue, 10);
    expect(unknown.confidenceScore).toBeLessThan(known.confidenceScore);
  });

  it('brak profilu dokładności => 0.5 i ostrzeżenie; profil z małym błędem podnosi confidence', () => {
    const noProfile = calculateFairValue(base({ pDefault: 0 }));
    expect(noProfile.warnings.some((w) => /profilu dokładności/.test(w))).toBe(true);
    const top = noProfile.archetypeBlend[0].archetype;
    const withProfile = calculateFairValue(base({ pDefault: 0 }), {
      engineConfig: { baseWeights: WEIGHT_MATRIX, accuracyProfile: { [top]: 0.1 } },
    });
    expect(withProfile.confidenceScore).toBeGreaterThan(noProfile.confidenceScore);
    const unknownArch = calculateFairValue(base({ pDefault: 0 }), {
      engineConfig: { baseWeights: WEIGHT_MATRIX, accuracyProfile: { [top]: null } },
    });
    expect(unknownArch.confidenceScore).toBeCloseTo(noProfile.confidenceScore, 10);
  });

  it('model zwracający NaN nie trafia do wyceny', () => {
    const r = calculateFairValue(base({}, { beta: Number.NaN }));
    expect(Number.isFinite(r.fairValue)).toBe(true);
    expect(r.models.DCF).toBeNull();
    expect(r.warnings.some((w) => /NaN/.test(w))).toBe(true);
  });

  it('niekompletne makro => wyjątek zamiast NaN w stopie dyskontowej', () => {
    expect(() => calculateFairValue(base(), { macro: { fedFundsRate: 0.05 } as any })).toThrow(/treasury10Y/);
  });

  it('werdykt: BUY tylko poniżej entry target przy normalnej pewności', async () => {
    const { verdictFor } = await import('../src/valuation-engine.js');
    expect(verdictFor(10, 20, 15, false)).toBe('BUY');
    expect(verdictFor(10, 20, 15, true)).toBe('HOLD');
    expect(verdictFor(30, 20, 15, false)).toBe('SELL');
    expect(verdictFor(18, 20, 15, false)).toBe('HOLD');
  });
});
