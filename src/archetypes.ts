import type { Archetype, ArchetypeScore, YahooFinanceSnapshot } from './valuation-engine.js';

interface Criterion {
  weight: number;
  test: (d: YahooFinanceSnapshot) => boolean;
}

/**
 * ARCHETYPE_CRITERIA: wagi i progi dla 6 archetypów.
 * UWAGA: progi są arbitralne (heurystyki rynkowe), nie kalibrowane na danych.
 * Brak danych w polu (null) oznacza, że kryterium z wartością domyślną w `??` jest oceniane
 * tak, jak opisuje dany warunek — to świadomy wybór, udokumentowany w docs/limitations.md.
 */
export const ARCHETYPE_CRITERIA: Record<Archetype, Criterion[]> = {
  HYPER_GROWTH: [
    // Wzrost przychodów rdr > 15%
    { weight: 2.0, test: (d) => (d.financialData.revenueGrowth ?? 0) > 0.15 },
    // Marże < 8%
    { weight: 1.5, test: (d) => (d.financialData.profitMargins ?? 0.1) < 0.08 },
    // Brak dywidendy
    { weight: 1.0, test: (d) => !d.summaryDetail.dividendYield },
    // Beta > 1.2
    { weight: 1.0, test: (d) => (d.summaryDetail.beta ?? 1) > 1.2 },
    // Brak C/Z lub C/Z > 40
    { weight: 1.0, test: (d) => !d.summaryDetail.trailingPE || d.summaryDetail.trailingPE > 40 },
  ],
  VALUE_COMPOUNDER: [
    // Stopa dywidendy > 1.5%
    { weight: 1.5, test: (d) => (d.summaryDetail.dividendYield ?? 0) > 0.015 },
    // Payout 15–75%
    {
      weight: 1.0,
      test: (d) => {
        const p = d.summaryDetail.payoutRatio;
        return p != null && p > 0.15 && p < 0.75;
      },
    },
    // Stabilny wzrost zysku: -5%..15%
    {
      weight: 1.0,
      test: (d) => {
        const g = d.financialData.earningsGrowth;
        return g != null && g > -0.05 && g < 0.15;
      },
    },
    // C/Z 8–28
    {
      weight: 1.0,
      test: (d) => {
        const pe = d.summaryDetail.trailingPE;
        return pe != null && pe > 8 && pe < 28;
      },
    },
    // ROE > 12%
    { weight: 1.5, test: (d) => (d.financialData.returnOnEquity ?? 0) > 0.12 },
  ],
  FINANCIALS_BANKS: [
    // Sektor: z Yahoo (live) albo z kodu SIC 6000–6799 (backtest SEC)
    { weight: 3.0, test: (d) => d.assetProfile?.sector === 'Financial Services' },
    // Dług/kapitał > 300%
    { weight: 2.0, test: (d) => (d.financialData.debtToEquity ?? 0) > 300 },
    // ROE 8–20%
    {
      weight: 1.0,
      test: (d) => {
        const roe = d.financialData.returnOnEquity;
        return roe != null && roe > 0.08 && roe < 0.2;
      },
    },
    // Dywidenda > 1%
    { weight: 1.0, test: (d) => (d.summaryDetail.dividendYield ?? 0) > 0.01 },
  ],
  CYCLICAL_HEAVY: [
    { weight: 1.0, test: (d) => (d.financialData.debtToEquity ?? 0) > 100 },
    { weight: 1.5, test: (d) => Math.abs(d.financialData.earningsGrowth ?? 0) > 0.25 },
    { weight: 1.0, test: (d) => (d.summaryDetail.beta ?? 1) > 1.1 },
    {
      weight: 0.5,
      test: (d) => {
        const y = d.summaryDetail.dividendYield;
        return y != null && y > 0.01 && y < 0.04;
      },
    },
    { weight: 1.0, test: (d) => (d.financialData.profitMargins ?? 0.1) < 0.1 },
  ],
  INCOME_STABLE: [
    { weight: 2.0, test: (d) => (d.summaryDetail.dividendYield ?? 0) > 0.035 },
    { weight: 1.5, test: (d) => (d.summaryDetail.payoutRatio ?? 0) > 0.7 },
    { weight: 1.0, test: (d) => (d.summaryDetail.beta ?? 1) < 0.9 },
    { weight: 1.0, test: (d) => (d.financialData.revenueGrowth ?? 0.1) < 0.08 },
  ],
  DEEP_VALUE_DISTRESSED: [
    { weight: 2.0, test: (d) => (d.defaultKeyStatistics.trailingEps ?? 1) <= 0 },
    { weight: 1.5, test: (d) => (d.financialData.freeCashflow ?? 1) <= 0 },
    {
      weight: 1.0,
      test: (d) => {
        const bvps = d.defaultKeyStatistics.bookValue;
        const price = d.financialData.currentPrice;
        return !!bvps && !!price && price / bvps < 1;
      },
    },
    { weight: 1.0, test: (d) => (d.financialData.debtToEquity ?? 0) > 150 },
    { weight: 1.0, test: (d) => (d.financialData.returnOnEquity ?? 0) < 0 },
  ],
};

export function categorizeArchetypes(d: YahooFinanceSnapshot): ArchetypeScore[] {
  const raw = {} as Record<Archetype, number>;
  for (const archetype of Object.keys(ARCHETYPE_CRITERIA) as Archetype[]) {
    const criteria = ARCHETYPE_CRITERIA[archetype];
    const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
    const matchedWeight = criteria.reduce((s, c) => s + (c.test(d) ? c.weight : 0), 0);
    raw[archetype] = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  }

  const sum = Object.values(raw).reduce((s, v) => s + v, 0);
  if (sum <= 0.0001) return [{ archetype: 'VALUE_COMPOUNDER', confidence: 1 }];

  return (Object.keys(raw) as Archetype[])
    .map((archetype) => ({ archetype, confidence: raw[archetype] / sum }))
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}
