import { describe, expect, it } from 'vitest';
import { TEMPERAMENTS, averageBuyPrice, buyPricesForHorizon, priceRangeFromValuation, type PriceRange } from '../src/buy-price.js';

const rates = TEMPERAMENTS.map((t) => t.rate);
const wide: PriceRange = [1, 10_000];

describe('cena zakupu dla jednego horyzontu', () => {
  it('prognoza niezależna od ceny: cena = prognoza zdyskontowana wymaganym zwrotem', () => {
    const forecast = 150;
    const res = buyPricesForHorizon((p) => Math.log(forecast / p), wide, 0, 5, rates)!;
    rates.forEach((r, i) => {
      expect(res[i].censored).toBeNull();
      expect(res[i].price).toBeCloseTo(forecast / Math.pow(1 + r, 5), 3);
    });
  });

  it('model prosty (wycena wraca): zgodność ze wzorem zamkniętym P* = P0·exp((K − H·ln(1+r)) / (1 − b))', () => {
    const P0 = 80;
    const K = 0.4;
    const b = 0.73;
    const H = 3;
    // mediana log(cena za H / P) maleje z ceną: tańsza spółka ma więcej miejsca do powrotu wyceny
    const m = (p: number) => K - (1 - b) * Math.log(p / P0);
    const res = buyPricesForHorizon(m, [0.8, 8000], 0, H, rates)!;
    rates.forEach((r, i) => {
      const closed = P0 * Math.exp((K - H * Math.log(1 + r)) / (1 - b));
      expect(res[i].price / closed).toBeCloseTo(1, 4);
    });
  });

  it('dywidendy podnoszą cenę zakupu: P* = (prognoza + D·H) / (1+r)^H', () => {
    const res = buyPricesForHorizon((p) => Math.log(120 / p), wide, 3, 4, [0.09])!;
    expect(res[0].price).toBeCloseTo((120 + 3 * 4) / Math.pow(1.09, 4), 3);
  });

  it('poza zakresem wyceny z danych uczących cena to granica zakresu z oznaczeniem, a nie zgadywanie', () => {
    const range: PriceRange = [40, 400];
    expect(buyPricesForHorizon(() => -10, range, 0, 1, [0.09])![0]).toEqual({ price: 40, censored: 'below' });
    const always = buyPricesForHorizon(() => 10, range, 0, 1, [0.09])![0];
    expect(always.censored).toBe('above');
    expect(always.price).toBeCloseTo(400, 9);
  });

  it('zakres cen z zakresu ceny/przychodów', () => {
    const [lo, hi] = priceRangeFromValuation([Math.log(0.5), Math.log(20)], 1_000_000, 10_000)!;
    expect(lo).toBeCloseTo(50, 9);
    expect(hi).toBeCloseTo(2000, 9);
    expect(priceRangeFromValuation([0, 1], 0, 10)).toBeNull();
  });

  it('model bez prognozy = brak ceny', () => {
    expect(buyPricesForHorizon(() => null, wide, 0, 1, rates)).toBeNull();
  });
});

describe('średnia z horyzontów 1–5', () => {
  it('uśrednia pięć cen zakupu każdego temperamentu', () => {
    const forecasts = [108, 117, 127, 138, 150];
    const res = averageBuyPrice(
      forecasts.map((f) => ({ medianLog: (p: number) => Math.log(f / p), range: wide })),
      0
    )!;
    for (const t of TEMPERAMENTS) {
      const expected = forecasts.reduce((s, f, i) => s + f / Math.pow(1 + t.rate, i + 1), 0) / 5;
      expect(res.price[t.id]).toBeCloseTo(expected, 3);
      expect(res.byHorizon[t.id]).toHaveLength(5);
    }
    expect(res.price.aggressive).toBeGreaterThan(res.price.balanced);
    expect(res.price.balanced).toBeGreaterThan(res.price.cautious);
    expect(res.censored).toBe(0);
  });

  it('bez modelu dla któregokolwiek horyzontu specjalista nie podaje ceny', () => {
    const f = { medianLog: (p: number) => Math.log(120 / p), range: wide };
    expect(averageBuyPrice([f, f, null, f, f], 0)).toBeNull();
  });
});
