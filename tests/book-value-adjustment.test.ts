import { describe, expect, it } from 'vitest';
import { adjustedBookValuePerShare, calcGrahamNumber, calcPriceToBook, type YahooFinanceSnapshot } from '../src/valuation-engine.js';

/**
 * Mechanika korekty wartości księgowej o niezrealizowane straty HTM (T-19).
 * To testy arytmetyki formuły na liczbach syntetycznych — NIE testy tego, czy system rozpozna konkretny bank
 * (te są w tests/corpses.test.ts i korzystają wyłącznie z danych point-in-time).
 */
function snapshot(fundamentals: YahooFinanceSnapshot['fundamentals'], bookValue = 266, shares = 60e6): YahooFinanceSnapshot {
  return {
    summaryDetail: {},
    defaultKeyStatistics: { bookValue, sharesOutstanding: shares, trailingEps: 25 },
    financialData: {},
    balanceSheetHistory: { balanceSheetStatements: [] },
    cashflowStatementHistory: { cashflowStatements: [] },
    fundamentals,
  };
}

describe('adjustedBookValuePerShare', () => {
  it('odejmuje niezrealizowaną stratę HTM na akcję', () => {
    const r = adjustedBookValuePerShare(snapshot({ htmBookValue: 91e9, htmFairValue: 76e9 }));
    expect(r.htmAdjustment).toBeCloseTo(-15e9 / 60e6, 10);
    expect(r.bvps).toBeCloseTo(266 - 250, 10);
  });

  it('nie dolicza AOCI drugi raz — AOCI jest już częścią kapitału własnego', () => {
    const r = adjustedBookValuePerShare(snapshot({ aoci: -2.5e9, htmBookValue: 0, htmFairValue: 0 }));
    expect(r.bvps).toBe(266);
    const withHtm = adjustedBookValuePerShare(snapshot({ aoci: -2.5e9, htmBookValue: 10e9, htmFairValue: 9e9 }));
    expect(withHtm.bvps).toBeCloseTo(266 - 1e9 / 60e6, 10);
  });

  it('ujemna skorygowana wartość księgowa wyłącza P/B i liczbę Grahama', () => {
    const s = snapshot({ htmBookValue: 100e9, htmFairValue: 80e9 });
    expect(adjustedBookValuePerShare(s).bvps!).toBeLessThan(0);
    expect(calcPriceToBook(s, 1.5).value).toBeNull();
    expect(calcPriceToBook(s, 1.5).reason).toMatch(/adjusted/);
    expect(calcGrahamNumber(s).value).toBeNull();
  });

  it('bez danych HTM wartość się nie zmienia', () => {
    const s = snapshot(undefined);
    expect(adjustedBookValuePerShare(s)).toEqual({ bvps: 266, htmAdjustment: 0 });
    expect(calcPriceToBook(s, 1.5).value).toBeCloseTo(399, 10);
  });
});
