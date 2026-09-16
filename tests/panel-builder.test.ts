import { describe, expect, it } from 'vitest';
import type { CompanyFacts, Fact, PriceSeries } from '../src/data-loader.js';
import { buildCompanyRows, emptySkips, type CompanyInput } from '../src/panel-builder.js';

const T = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

let accn = 0;
const annual = (year: number, val: number): Fact => ({
  start: `${year}-01-01`,
  end: `${year}-12-31`,
  val,
  accn: `a${accn++}`,
  filedT: T(`${year + 1}-02-10`),
});
const sharesAt = (year: number, val: number): Fact => ({ end: `${year}-12-31`, val, accn: `s${accn++}`, filedT: T(`${year + 1}-02-10`) });

function company(revenueYears: number[], price = 50, shares = 1_000_000): CompanyInput {
  const facts: CompanyFacts = {
    facts: {
      'us-gaap': { Revenues: { units: { USD: revenueYears.map((y, i) => annual(y, 1_000_000 * (1 + 0.1 * i))) } } },
      dei: { EntityCommonStockSharesOutstanding: { units: { shares: revenueYears.map((y) => sharesAt(y, shares)) } } },
    },
  };
  const quotes = [];
  for (let y = 2012; y <= 2024; y++) {
    for (const md of ['02-15', '05-15', '08-15', '11-15']) {
      const date = `${y}-${md}T14:30:00.000Z`;
      quotes.push({ date, t: new Date(date).getTime(), close: price, adj: price });
    }
  }
  const prices: PriceSeries = { quotes, splits: [] };
  return { cik: '0000000001', ticker: 'TST', sic: 3571, prices, facts, terminal: null };
}

describe('buildCompanyRows', () => {
  it('tworzy wiersz z danych znanych w dniu decyzji', () => {
    const skips = emptySkips();
    const rows = buildCompanyRows(company([2013, 2014, 2015, 2016]), ['2016-05-15'], { endDay: '2024-11-15' }, skips);
    expect(rows).toHaveLength(1);
    // raport za 2016 jest złożony w lutym 2017, więc w maju 2016 ostatnie znane przychody to rok 2015
    expect(rows[0].revenueTTM).toBeCloseTo(1_200_000, 0);
    expect(rows[0].marketCap).toBe(50 * 1_000_000);
  });

  it('pomija kwartał, w którym ostatnie przychody są przestarzałe — spółka przestała raportować', () => {
    const skips = emptySkips();
    const rows = buildCompanyRows(company([2013, 2014, 2015]), ['2019-05-15'], { endDay: '2024-11-15' }, skips);
    expect(rows).toHaveLength(0);
    expect(skips.staleRevenue).toBe(1);
  });

  it('nie wstawia przestarzałych przychodów jako „przyszłych”', () => {
    const skips = emptySkips();
    const [row] = buildCompanyRows(company([2013, 2014, 2015]), ['2016-05-15'], { endDay: '2024-11-15' }, skips);
    expect(row.fwdRevenueTTM1).toBeNull();
    expect(row.fwdPrice1).toBe(50);
  });

  it('pomija spółkę poniżej progu kapitalizacji w dniu decyzji', () => {
    const skips = emptySkips();
    const rows = buildCompanyRows(company([2013, 2014, 2015, 2016]), ['2016-05-15'], { endDay: '2024-11-15', minMarketCap: 1e9 }, skips);
    expect(rows).toHaveLength(0);
    expect(skips.belowMinMarketCap).toBe(1);
  });

  it('nie liczy przyszłości za ostatnim dniem notowań w danych', () => {
    const skips = emptySkips();
    const [row] = buildCompanyRows(company([2013, 2014, 2015, 2016]), ['2016-05-15'], { endDay: '2016-12-31' }, skips);
    expect(row.fwdPrice1).toBeNull();
    expect(row.fwdRevenueTTM1).toBeNull();
  });

  it('bez notowania w dniu decyzji nie tworzy wiersza', () => {
    const skips = emptySkips();
    const rows = buildCompanyRows(company([2013, 2014, 2015, 2016]), ['2030-05-15'], { endDay: '2031-01-01' }, skips);
    expect(rows).toHaveLength(0);
    expect(skips.noPrice).toBe(1);
  });
});
