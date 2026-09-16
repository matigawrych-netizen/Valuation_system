import { describe, expect, it } from 'vitest';
import type { PriceSeries, Quote } from '../src/data-loader.js';
import { predictPrice, type SharedFacts } from '../src/facts.js';
import { HORIZONS, type Horizon } from '../src/facts-panel.js';
import { findLimitFill, holdingReturn, nextSession, tradeVersusMarket } from '../src/limit-backtest.js';
import {
  beatsBenchmark,
  buyPriceStability,
  compareForecasters,
  coverage,
  forecastDiversity,
  gateOverall,
  notSignificantlyWorse,
  pinballLoss,
  quarterlyChanges,
  voteWeights,
  type BuyRecord,
  type ExamRecord,
} from '../src/specialist-exam.js';
import { trainBenchmark, trainSimple, forecastAt } from '../src/specialists.js';
import { mulberry32, movingBlockBootstrap } from '../src/stats.js';
import { row } from './specialist-fixtures.js';

function quarters(n: number, from = 2016): string[] {
  const out: string[] = [];
  for (let y = from; out.length < n; y++) for (const md of ['02-15', '05-15', '08-15', '11-15']) if (out.length < n) out.push(`${y}-${md}`);
  return out;
}

const rec = (asOf: string, cik: string, h: Horizon, actual: number, median: number, q10: number, q90: number): ExamRecord => ({
  cik,
  asOf,
  cutoff: `${asOf.slice(0, 4)}-02-15`,
  h,
  status: 'ok',
  median,
  q10,
  q90,
  actual,
});

describe('strata kwantylowa i pokrycie', () => {
  it('strata pinball dla centyli 10/50/90', () => {
    // 0,1·0,3 + 0,5·0,2 + (1 − 0,9)·0,1
    expect(pinballLoss(0.2, -0.1, 0, 0.3)).toBeCloseTo(0.14, 12);
  });

  it('pokrycie: udział prawdziwych wyników w pasie, PASS w przedziale 72–88%', () => {
    const records: ExamRecord[] = [];
    for (const q of quarters(5)) for (let i = 0; i < 40; i++) records.push(rec(q, String(i), 1, i < 32 ? 0 : 1, 0, -0.5, 0.5));
    const c = coverage(records, 1);
    expect(c.coverage).toBeCloseTo(0.8, 12);
    expect(c.status).toBe('PASS');
    expect(c.lo).toBeCloseTo(0.8, 12);
  });

  it('za mało kwartałów = brak pomiaru, nie PASS', () => {
    const records = quarters(3).flatMap((q) => Array.from({ length: 50 }, (_, i) => rec(q, String(i), 1, 0, 0, -1, 1)));
    expect(coverage(records, 1).status).toBe('BRAK POMIARU');
  });

  it('wstrzymane głosy i nieznane wyniki nie wchodzą do oceny', () => {
    const records = quarters(5).flatMap((q) => [
      ...Array.from({ length: 30 }, (_, i) => rec(q, String(i), 1, 0, 0, -1, 1)),
      { ...rec(q, 'x', 1, 5, 0, -1, 1), status: 'out_of_range:logPriceToSales' },
      { ...rec(q, 'y', 1, 5, 0, -1, 1), actual: null },
    ]);
    expect(coverage(records, 1)).toMatchObject({ coverage: 1, n: 150 });
  });
});

describe('porównanie prognozujących (K3, K4, bramka)', () => {
  const rnd = mulberry32(7);
  const build = (qs: string[], h: Horizon, spreadA: number, spreadB: number) => {
    const a: ExamRecord[] = [];
    const b: ExamRecord[] = [];
    for (const q of qs) {
      const shock = rnd() - 0.5;
      for (let i = 0; i < 30; i++) {
        const actual = shock + (rnd() - 0.5) * 0.2;
        a.push(rec(q, String(i), h, actual, actual + (rnd() - 0.5) * spreadA, actual - 0.3, actual + 0.3));
        b.push(rec(q, String(i), h, actual, actual + (rnd() - 0.5) * spreadB, actual - 0.3, actual + 0.3));
      }
    }
    return { a, b };
  };

  it('wyraźnie lepszy prognozujący zdaje, gorszy nie przechodzi bramki', () => {
    const { a, b } = build(quarters(24), 1, 0.05, 1.0);
    const c = compareForecasters(a, b, 1);
    expect(c.rows).toBe(720);
    expect(c.quarters).toBe(24);
    expect(c.lossA).toBeLessThan(c.lossB);
    expect(beatsBenchmark(c)).toBe('PASS');
    expect(notSignificantlyWorse(c)).toBe('PASS');
    expect(notSignificantlyWorse(compareForecasters(b, a, 1))).toBe('FAIL');
  });

  it('porównuje tylko wspólne obserwacje', () => {
    const { a, b } = build(quarters(8), 1, 0.1, 0.1);
    const c = compareForecasters(a, b.slice(0, 30), 1);
    expect(c.rows).toBe(30);
  });

  it('przy mniej niż 2 niezależnych oknach test się nie odbywa', () => {
    const { a, b } = build(quarters(24), 5, 0.05, 1.0);
    const c = compareForecasters(a, b, 5);
    expect(c.dm).toBeNull();
    expect(beatsBenchmark(c)).toBe('BRAK POMIARU');
    const three = build(quarters(24), 3, 0.05, 1.0);
    expect(compareForecasters(three.a, three.b, 3).dm).not.toBeNull();
  });

  it('bramka: FAIL na jednym horyzoncie przesądza, brak pomiaru na długich nie blokuje', () => {
    expect(gateOverall(['PASS', 'PASS', 'BRAK POMIARU', 'BRAK POMIARU', 'BRAK POMIARU'])).toBe('PASS');
    expect(gateOverall(['PASS', 'FAIL', 'BRAK POMIARU', 'BRAK POMIARU', 'BRAK POMIARU'])).toBe('FAIL');
    expect(gateOverall(['BRAK POMIARU', 'BRAK POMIARU'])).toBe('BRAK POMIARU');
  });
});

describe('K6: stabilność ceny zakupu', () => {
  const buy = (cik: string, asOf: string, balanced: number): BuyRecord => ({
    cik,
    asOf,
    price: 100,
    dividendPerShare: 0,
    dividendKnown: true,
    aggressive: balanced * 1.1,
    balanced,
    cautious: balanced * 0.9,
    balancedByHorizon: [balanced, balanced, balanced, balanced, balanced * 2],
    censored: 0,
  });

  it('liczy zmiany tylko między sąsiednimi kwartałami tej samej spółki', () => {
    const buys = [buy('A', '2018-02-15', 100), buy('A', '2018-05-15', 110), buy('A', '2018-11-15', 50), buy('B', '2018-05-15', 10)];
    expect(quarterlyChanges(buys, (b) => b.balanced).map((x) => Number(x.toFixed(10)))).toEqual([0.1]);
  });

  it('mediana zmiany ≤ 15% = PASS', () => {
    const buys = [buy('A', '2018-02-15', 100), buy('A', '2018-05-15', 110), buy('A', '2018-08-15', 99)];
    const s = buyPriceStability(buys);
    expect(s.medianChange).toBeCloseTo(0.1, 10);
    expect(s.status).toBe('PASS');
    expect(buyPriceStability([buy('A', '2018-02-15', 100), buy('A', '2018-05-15', 150)]).status).toBe('FAIL');
    expect(buyPriceStability([]).status).toBe('BRAK POMIARU');
  });
});

describe('różnorodność i wagi', () => {
  it('identyczne prognozy = jeden specjalista (n_eff 1) i para do połączenia', () => {
    const base = quarters(4).flatMap((q) => Array.from({ length: 10 }, (_, i) => rec(q, String(i), 1, 0, i * 0.1, -1, 1)));
    const d = forecastDiversity(new Map([['a', base], ['b', base.map((r) => ({ ...r }))]]), 1);
    expect(d.nEff).toBeCloseTo(1, 10);
    expect(d.mergePairs.map(([x, y]) => `${x}-${y}`)).toEqual(['a-b']);
  });

  it('niezależne prognozy przy dużym szumie kursu: błędy prawie idealnie skorelowane, prognozy nie', () => {
    const rnd = mulberry32(3);
    const a: ExamRecord[] = [];
    const b: ExamRecord[] = [];
    for (const q of quarters(8)) {
      for (let i = 0; i < 100; i++) {
        const actual = (rnd() - 0.5) * 2; // ruch kursu dużo większy niż prognozy
        a.push(rec(q, String(i), 1, actual, (rnd() - 0.5) * 0.2, -1, 1));
        b.push(rec(q, String(i), 1, actual, (rnd() - 0.5) * 0.2, -1, 1));
      }
    }
    const d = forecastDiversity(new Map([['a', a], ['b', b]]), 1);
    expect(d.meanPairwiseErrorCorr!).toBeGreaterThan(0.95);
    expect(Math.abs(d.meanPairwiseCorr!)).toBeLessThan(0.1);
    expect(d.nEff!).toBeGreaterThan(1.8);
    expect(d.mergePairs).toEqual([]);
  });

  it('wagi odwrotnie proporcjonalne do straty, zero bez głosu', () => {
    const w = voteWeights(new Map([['a', 1], ['b', 2], ['c', 0.5]]), new Set(['a', 'b']));
    expect(w.get('a')).toBeCloseTo(2 / 3, 12);
    expect(w.get('b')).toBeCloseTo(1 / 3, 12);
    expect(w.get('c')).toBe(0);
  });

  it('bootstrap bloków na stałych danych daje tę samą wartość', () => {
    const ci = movingBlockBootstrap([[1, 1], [1], [1, 1, 1]], 2, (s) => s.flat().reduce((a, b) => a + b, 0) / s.flat().length);
    expect(ci.lo).toBe(1);
    expect(ci.hi).toBe(1);
  });
});

describe('K2: zlecenie z limitem', () => {
  function series(from: string, days: number, close: (d: string, i: number) => number, adj?: (d: string, i: number) => number): PriceSeries {
    const quotes: Quote[] = [];
    const start = new Date(`${from}T14:30:00Z`).getTime();
    for (let i = 0; i < days; i++) {
      const t = start + i * 86400000;
      const d = new Date(t).toISOString().slice(0, 10);
      quotes.push({ date: d, t, close: close(d, i), adj: (adj ?? close)(d, i) });
    }
    return { quotes, splits: [] };
  }

  it('realizuje w pierwszej sesji po decyzji z zamknięciem ≤ limit, nie w dniu decyzji', () => {
    const s = series('2017-02-01', 200, (d) => (d === '2017-02-15' || d === '2017-03-01' || d === '2017-03-05' ? 90 : 100));
    expect(findLimitFill(s, '2017-02-15', 95)?.date).toBe('2017-03-01');
  });

  it('zlecenie wygasa po 3 miesiącach', () => {
    const s = series('2017-02-01', 200, (d) => (d === '2017-05-16' ? 90 : 100));
    expect(findLimitFill(s, '2017-02-15', 95)).toBeNull();
    const t = series('2017-02-01', 200, (d) => (d === '2017-05-15' ? 90 : 100));
    expect(findLimitFill(t, '2017-02-15', 95)?.date).toBe('2017-05-15');
  });

  it('nadwyżka = zwrot spółki z dywidendami − zwrot SPY w tych samych dniach', () => {
    const stock = series('2017-01-01', 800, () => 100, (d) => (d < '2018-03-01' ? 50 : 60));
    const spy = series('2017-01-01', 800, () => 200, (d) => (d < '2018-03-01' ? 100 : 105));
    const buy = findLimitFill(stock, '2017-02-15', 100)!;
    expect(buy.date).toBe('2017-02-16');
    expect(holdingReturn(stock, buy, 1)).toBeCloseTo(0, 12);
    const late = stock.quotes.find((q) => q.date === '2017-03-10')!;
    const trade = tradeVersusMarket('A', '2017-02-15', stock, late, spy)!;
    expect(trade.stockReturn).toBeCloseTo(0.2, 12);
    expect(trade.marketReturn).toBeCloseTo(0.05, 12);
    expect(trade.excess).toBeCloseTo(0.15, 12);
    expect(nextSession(stock, '2017-02-15')?.date).toBe('2017-02-16');
  });

  it('bez notowań po okresie trzymania transakcja nie ma wyniku', () => {
    const stock = series('2017-01-01', 300, () => 100);
    const spy = series('2017-01-01', 900, () => 200);
    expect(tradeVersusMarket('A', '2017-02-15', stock, stock.quotes[50], spy)).toBeNull();
  });
});

describe('model prosty specjalisty', () => {
  function panel(n: number) {
    const rnd = mulberry32(99);
    return Array.from({ length: n }, (_, i) => {
      const growth = rnd() * 0.4 - 0.05;
      const r = row({ cik: String(i), revenueTTM_3y: 25_000 / Math.pow(1 + growth, 3), price: 20 + rnd() * 100 });
      r.ps = (r.price * r.shares) / r.revenueTTM;
      for (const h of HORIZONS) {
        const revenue = r.revenueTTM * Math.pow(1 + growth * 0.3 + (rnd() - 0.5) * 0.1, h);
        r.fwd[h] = { price: r.price * Math.exp((rnd() - 0.4) * 0.5 * h), totalRatio: null, revenueTTM: revenue, netIncomeTTM: null, shares: r.shares * (1 - 0.01 * h) };
      }
      return r;
    });
  }

  it('ma ten sam wzór co fakty wspólne (predictPrice), także przy innej cenie', () => {
    const rows = panel(400);
    const split = { all: rows, train: rows, validation: [] };
    for (const h of [1, 3, 5] as Horizon[]) {
      const out = trainSimple(split, h, 'B');
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      const info = out.forecaster.info as Record<string, number>;
      const facts: SharedFacts = {
        growthFade: { [h]: { intercept: info.growthIntercept, slope: info.growthSlope, n: 0, rmse: 0 } },
        multipleReversion: { [h]: { intercept: info.reversionIntercept, slope: info.reversionSlope, n: 0, rmse: 0 } },
        shareDrift: { [h]: { value: info.shareDrift, n: 0 } },
      };
      for (const r of rows.slice(0, 20)) {
        for (const price of [r.price, r.price * 0.6]) {
          const shared = predictPrice({ ...r, price, ps: (price * r.shares) / r.revenueTTM }, facts, h, 'B')!;
          expect(out.forecaster.raw(r, price)).toBeCloseTo(Math.log(shared / price), 10);
        }
      }
    }
  });

  it('pas i mediana pochodzą z centyli błędów w pamięci', () => {
    const rows = panel(400);
    const out = trainSimple({ all: rows, train: rows, validation: [] }, 2, 'B');
    if (!out.ok) throw new Error(out.reason);
    const f = out.forecaster;
    const fc = forecastAt(f, rows[0])!;
    const raw = f.raw(rows[0], rows[0].price)!;
    expect(fc.median).toBeCloseTo(raw + f.errors.q50, 12);
    expect(fc.q10).toBeCloseTo(raw + f.errors.q10, 12);
    expect(fc.q90).toBeCloseTo(raw + f.errors.q90, 12);
    // w pamięci pas 80% zawiera ok. 80% wyników
    const inside = rows.filter((r) => {
      const y = Math.log(r.fwd[2].price! / r.price);
      const p = forecastAt(f, r)!;
      return y >= p.q10 && y <= p.q90;
    }).length;
    expect(inside / rows.length).toBeCloseTo(0.8, 1);
  });

  it('„cena się nie zmieni” ma medianę 0, a „typowy zwrot” — medianę z pamięci', () => {
    const rows = panel(400);
    const split = { all: rows, train: rows, validation: [] };
    const none = trainBenchmark(split, 1, 'no_change');
    const typical = trainBenchmark(split, 1, 'typical_return');
    if (!none.ok || !typical.ok) throw new Error('brak modelu');
    expect(forecastAt(none.forecaster, rows[0])!.median).toBe(0);
    expect(forecastAt(typical.forecaster, rows[0])!.median).toBeCloseTo(typical.forecaster.errors.q50, 12);
  });
});
