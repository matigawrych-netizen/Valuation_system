import { describe, expect, it } from 'vitest';
import type { CompanyFacts, Fact } from '../src/data-loader.js';
import { resetDefaultModelCache } from '../src/default-model.js';
import { mapSecToYahooSnapshot } from '../src/sec-edgar-provider.js';
import { XbrlView } from '../src/xbrl.js';

let accn = 0;
const dur = (start: string, end: string, val: number, filed = '2024-01-01'): Fact => ({
  start,
  end,
  val,
  accn: String(accn++),
  filedT: new Date(filed).getTime(),
});
const inst = (end: string, val: number, filed = '2024-01-01'): Fact => ({ end, val, accn: String(accn++), filedT: new Date(filed).getTime() });

function facts(gaap: Record<string, Fact[]>, dei: Record<string, Fact[]> = {}, unitFor: Record<string, string> = {}): CompanyFacts {
  const wrap = (m: Record<string, Fact[]>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { units: { [unitFor[k] ?? 'USD']: v } }]));
  return { facts: { 'us-gaap': wrap(gaap), dei: Object.fromEntries(Object.entries(dei).map(([k, v]) => [k, { units: { shares: v } }])) } };
}

describe('XbrlView.ttm', () => {
  it('bierze rok obrotowy, gdy kończy się na najnowszej dacie', () => {
    const v = new XbrlView(facts({ NetIncomeLoss: [dur('2022-01-01', '2022-12-31', 100), dur('2023-01-01', '2023-12-31', 120)] }));
    expect(v.ttm(['NetIncomeLoss'])?.val).toBe(120);
  });

  it('YTD: FY poprzedni + YTD bieżący − YTD sprzed roku (nie FY doliczony jako Q4)', () => {
    const v = new XbrlView(
      facts({
        NetIncomeLoss: [
          dur('2022-01-01', '2022-12-31', 400), // FY2022
          dur('2022-01-01', '2022-06-30', 180), // H1 2022
          dur('2023-01-01', '2023-06-30', 220), // H1 2023
          dur('2023-04-01', '2023-06-30', 110), // Q2 2023 (3M)
        ],
      })
    );
    // TTM do 2023-06-30 = 400 + 220 - 180 = 440
    expect(v.ttm(['NetIncomeLoss'])?.val).toBe(440);
  });

  it('suma czterech kolejnych kwartałów, gdy brak YTD i FY', () => {
    const v = new XbrlView(
      facts({
        Revenues: [
          dur('2022-07-01', '2022-09-30', 10),
          dur('2022-10-01', '2022-12-31', 11),
          dur('2023-01-01', '2023-03-31', 12),
          dur('2023-04-01', '2023-06-30', 13),
        ],
      })
    );
    expect(v.ttm(['Revenues'])?.val).toBe(46);
  });

  it('za mało danych => null (bez mnożenia kwartału razy 4)', () => {
    const v = new XbrlView(facts({ Revenues: [dur('2023-04-01', '2023-06-30', 13)] }));
    expect(v.ttm(['Revenues'])).toBeNull();
  });

  it('przy zmianie tagu wybiera koncept z najnowszym okresem', () => {
    const v = new XbrlView(
      facts({
        SalesRevenueNet: [dur('2016-01-01', '2016-12-31', 900)],
        RevenueFromContractWithCustomerExcludingAssessedTax: [dur('2023-01-01', '2023-12-31', 1000)],
      })
    );
    expect(v.ttm(['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'])?.val).toBe(1000);
  });
});

describe('mapSecToYahooSnapshot', () => {
  const base = () =>
    facts(
      {
        Assets: [inst('2023-12-31', 5000)],
        StockholdersEquity: [inst('2023-12-31', 2000)],
        NetIncomeLoss: [dur('2023-01-01', '2023-12-31', 300)],
        Revenues: [dur('2023-01-01', '2023-12-31', 3000)],
      },
      { EntityCommonStockSharesOutstanding: [inst('2024-02-01', 100)] }
    );

  it('liczbę akcji bierze z dei i koryguje o późniejsze splity', () => {
    resetDefaultModelCache();
    const r = mapSecToYahooSnapshot({
      ticker: 'TST',
      cik: '0000000001',
      asOf: '2024-03-15',
      price: 10,
      facts: base(),
      splits: [{ date: '2025-01-01', t: new Date('2025-01-01').getTime(), numerator: 2, denominator: 1 }],
      market: null,
      sic: 3571,
    });
    expect(r.skipReason).toBeNull();
    const s = r.snapshot!;
    expect(s.defaultKeyStatistics.sharesOutstanding).toBe(200);
    expect(s.defaultKeyStatistics.trailingEps).toBeCloseTo(1.5, 12);
    expect(s.defaultKeyStatistics.bookValue).toBeCloseTo(10, 12);
    expect(s.assetProfile?.sector).toBe('Manufacturing');
    // Brak historii cen => pola rynkowe null, nie atrapy
    expect(s.summaryDetail.beta).toBeNull();
    expect(s.summaryDetail.twoHundredDayAverage).toBeNull();
  });

  it('bez liczby akcji spółka jest pomijana z powodem (dawniej: 1 000 000 akcji)', () => {
    const f = base();
    f.facts.dei = {};
    const r = mapSecToYahooSnapshot({ ticker: 'TST', cik: '1', asOf: '2024-03-15', price: 10, facts: f, splits: [], market: null, sic: null });
    expect(r.snapshot).toBeNull();
    expect(r.skipReason).toMatch(/liczby akcji/);
  });

  it('przeterminowany bilans => pominięcie', () => {
    const r = mapSecToYahooSnapshot({ ticker: 'TST', cik: '1', asOf: '2026-03-15', price: 10, facts: base(), splits: [], market: null, sic: null });
    expect(r.snapshot).toBeNull();
    expect(r.skipReason).toMatch(/bilansu/);
  });

  it('EBITDA = EBIT + amortyzacja albo null (dawniej: zysk + 5% długu)', () => {
    const f = base();
    const r1 = mapSecToYahooSnapshot({ ticker: 'T', cik: '1', asOf: '2024-03-15', price: 10, facts: f, splits: [], market: null, sic: null });
    expect(r1.snapshot!.financialData.ebitda).toBeNull();
    f.facts['us-gaap'].OperatingIncomeLoss = { units: { USD: [dur('2023-01-01', '2023-12-31', 500)] } };
    f.facts['us-gaap'].DepreciationDepletionAndAmortization = { units: { USD: [dur('2023-01-01', '2023-12-31', 80)] } };
    const r2 = mapSecToYahooSnapshot({ ticker: 'T', cik: '1', asOf: '2024-03-15', price: 10, facts: f, splits: [], market: null, sic: null });
    expect(r2.snapshot!.financialData.ebitda).toBe(580);
  });
});
