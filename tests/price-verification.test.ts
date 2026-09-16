import { describe, expect, it } from 'vitest';
import type { CompanyFacts, PriceSeries, Quote } from '../src/data-loader.js';
import { verifyPriceSeries } from '../src/price-verification.js';

const facts = (points: { end: string; float: number; shares: number }[]): CompanyFacts =>
  ({
    facts: {
      'us-gaap': {},
      dei: {
        EntityPublicFloat: { units: { USD: points.map((p) => ({ end: p.end, val: p.float, accn: p.end, filedT: 0 })) } },
        EntityCommonStockSharesOutstanding: {
          units: { shares: points.map((p) => ({ end: p.end, val: p.shares, accn: `s${p.end}`, filedT: 0 })) },
        },
      },
    },
  }) as unknown as CompanyFacts;

const quote = (date: string, close: number): Quote => ({ date, t: new Date(`${date}T14:30:00Z`).getTime(), close, adj: close });

const series = (quotes: Quote[], splits: PriceSeries['splits'] = []): PriceSeries => ({ quotes, splits });

describe('verifyPriceSeries', () => {
  const years = ['2015-06-30', '2016-06-30', '2017-06-30', '2018-06-29'];

  it('potwierdza notowania tej samej spółki', () => {
    const f = facts(years.map((end) => ({ end, float: 9_000, shares: 100 })));
    const p = series(years.map((d) => quote(d, 100)));
    const v = verifyPriceSeries(p, f);
    expect(v.status).toBe('verified');
    expect(v.overlaps).toBe(4);
  });

  it('odrzuca notowania innej firmy pod tym samym tickerem', () => {
    const f = facts(years.map((end) => ({ end, float: 9_000, shares: 100 })));
    const p = series(years.map((d) => quote(d, 7)));
    expect(verifyPriceSeries(p, f).status).toBe('mismatch');
  });

  it('bierze pod uwagę split po dacie raportu liczby akcji', () => {
    // SEC: 100 akcji po 90. Później split 4:1, więc Yahoo pokazuje historyczną cenę 22,5.
    const f = facts(years.map((end) => ({ end, float: 9_000, shares: 100 })));
    const p = series(
      years.map((d) => quote(d, 22.5)),
      [{ date: '2020-08-31', t: new Date('2020-08-31').getTime(), numerator: 4, denominator: 1 }]
    );
    expect(verifyPriceSeries(p, f).status).toBe('verified');
  });

  it('bez wspólnych dat nie potwierdza — notowania mogą należeć do spółki, która przejęła ticker później', () => {
    const f = facts(years.map((end) => ({ end, float: 9_000, shares: 100 })));
    const p = series([quote('2023-09-14', 100), quote('2024-06-28', 100)]);
    expect(verifyPriceSeries(p, f).status).toBe('no_overlap');
  });

  it('bez danych o wolnym obrocie zwraca osobny status zamiast zgadywać', () => {
    const p = series([quote('2016-06-30', 100)]);
    expect(verifyPriceSeries(p, facts([])).status).toBe('no_float_data');
  });

  it('pojedyncza rozbieżność nie przekreśla zgodnej serii', () => {
    const f = facts(years.map((end) => ({ end, float: 9_000, shares: 100 })));
    const p = series([quote(years[0], 100), quote(years[1], 100), quote(years[2], 100), quote(years[3], 400)]);
    expect(verifyPriceSeries(p, f).status).toBe('verified');
  });
});
