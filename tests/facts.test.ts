import { describe, expect, it } from 'vitest';
import {
  errorBands,
  fitLinear,
  growthObservations,
  learnFacts,
  predictPrice,
  priceBand,
  residuals,
  reversionObservations,
  shareDriftFact,
  winsorize,
  type Observation,
  type SharedFacts,
} from '../src/facts.js';
import { HORIZONS, type PanelForward, type PanelRecord } from '../src/facts-panel.js';

const emptyFwd = (): PanelForward => ({ price: null, totalRatio: null, revenueTTM: null, netIncomeTTM: null, shares: null });

function record(over: Partial<PanelRecord> = {}): PanelRecord {
  const fwd = Object.fromEntries(HORIZONS.map((h) => [h, emptyFwd()])) as PanelRecord['fwd'];
  return {
    ticker: 'TST',
    cik: '0000000001',
    asOf: '2015-05-15',
    sector: null,
    price: 100,
    shares: 1000,
    marketCap: 100_000,
    revenueTTM: 50_000,
    netIncomeTTM: 5_000,
    ebitTTM: null,
    fcfTTM: null,
    equity: null,
    revenueTTM_1y: null,
    revenueTTM_3y: null,
    netIncomeTTM_3y: null,
    ps: 2,
    pe: 20,
    pb: null,
    terminalKind: null,
    fwd,
    ...over,
  };
}

const obs = (pairs: [number, number][], quarter = '2015-05-15'): Observation[] =>
  pairs.map(([x, y], i) => ({ x, y, quarter, cik: String(i) }));

describe('winsorize', () => {
  it('przycina skrajne wartości do podanych centyli', () => {
    const xs = [...Array(100).keys()].map((i) => i);
    const w = winsorize(xs, 0.1, 0.9);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...w)).toBeLessThanOrEqual(90);
  });

  it('pusta lista zostaje pusta', () => {
    expect(winsorize([])).toEqual([]);
  });
});

describe('fitLinear', () => {
  it('odtwarza prostą bez szumu', () => {
    const pairs = [...Array(60).keys()].map((i) => [i / 10, 2 * (i / 10) + 1] as [number, number]);
    const fit = fitLinear(obs(pairs))!;
    expect(fit.slope).toBeCloseTo(2, 3);
    expect(fit.intercept).toBeCloseTo(1, 3);
    expect(fit.rmse).toBeLessThan(1e-6);
  });

  it('przy zbyt małej próbce nie zwraca dopasowania zamiast zgadywać', () => {
    expect(fitLinear(obs([[1, 1], [2, 2]]))).toBeNull();
  });
});

describe('growthObservations', () => {
  it('liczy tempo dotychczasowe i zrealizowane', () => {
    const r = record({ revenueTTM_3y: 1000, revenueTTM: 1331 });
    r.fwd[1].revenueTTM = 1331 * 1.05;
    const [o] = growthObservations([r], 1);
    expect(o.x).toBeCloseTo(0.1, 6);
    expect(o.y).toBeCloseTo(0.05, 6);
  });

  it('pomija wiersze bez historii albo bez przyszłości', () => {
    expect(growthObservations([record({ revenueTTM_3y: null })], 1)).toHaveLength(0);
    expect(growthObservations([record({ revenueTTM_3y: 1000 })], 1)).toHaveLength(0);
  });

  it('pomija przychody niedodatnie, dla których tempo wzrostu nie ma sensu', () => {
    const r = record({ revenueTTM_3y: -100, revenueTTM: 200 });
    r.fwd[1].revenueTTM = 300;
    expect(growthObservations([r], 1)).toHaveLength(0);
  });
});

describe('reversionObservations', () => {
  it('liczy przyszłą wielokrotność z ceny, liczby akcji i przychodów', () => {
    const r = record({ ps: 2 });
    r.fwd[2] = { price: 150, totalRatio: 1.6, revenueTTM: 60_000, netIncomeTTM: null, shares: 1200 };
    const [o] = reversionObservations([r], 2);
    expect(Math.exp(o.x)).toBeCloseTo(2, 9);
    expect(Math.exp(o.y)).toBeCloseTo((150 * 1200) / 60_000, 9);
  });

  it('pomija wiersz, gdy brakuje któregokolwiek składnika', () => {
    const r = record({ ps: 2 });
    r.fwd[2] = { price: 150, totalRatio: null, revenueTTM: null, netIncomeTTM: null, shares: 1200 };
    expect(reversionObservations([r], 2)).toHaveLength(0);
  });
});

describe('shareDriftFact', () => {
  it('zwraca medianę rocznej zmiany logarytmicznej liczby akcji', () => {
    const rows = [...Array(40).keys()].map((i) => {
      const r = record({ cik: String(i), shares: 1000 });
      r.fwd[2].shares = 1000 * Math.exp(-0.02 * 2);
      return r;
    });
    expect(shareDriftFact(rows, 2)!.value).toBeCloseTo(-0.02, 9);
  });

  it('przy zbyt małej próbce nie zwraca nic', () => {
    expect(shareDriftFact([record()], 1)).toBeNull();
  });
});

describe('predictPrice', () => {
  const facts: SharedFacts = {
    growthFade: { 1: { intercept: 0, slope: 1, n: 100, rmse: 0 } },
    multipleReversion: { 1: { intercept: 0, slope: 0.5, n: 100, rmse: 0 } },
    shareDrift: { 1: { value: 0, n: 100 } },
  };

  it('scenariusz A utrzymuje dzisiejszą wielokrotność', () => {
    const r = record({ revenueTTM_3y: 1000, revenueTTM: 1331, ps: 2 });
    // tempo dotychczasowe 10% utrzymane przez rok => przychody +10%, wielokrotność bez zmian
    expect(predictPrice(r, facts, 1, 'A')).toBeCloseTo(100 * 1.1, 6);
  });

  it('scenariusz B mnoży cenę przez przewidzianą zmianę wielokrotności', () => {
    const r = record({ revenueTTM_3y: 1000, revenueTTM: 1331, ps: 4 });
    const predictedPs = Math.exp(0.5 * Math.log(4));
    expect(predictPrice(r, facts, 1, 'B')).toBeCloseTo(100 * 1.1 * (predictedPs / 4), 6);
  });

  it('brak faktu oznacza brak prognozy, a nie wartość zastępczą', () => {
    const r = record({ revenueTTM_3y: 1000, revenueTTM: 1331 });
    expect(predictPrice(r, { growthFade: {}, multipleReversion: {}, shareDrift: {} }, 1, 'A')).toBeNull();
  });

  it('brak historii przychodów oznacza brak prognozy', () => {
    expect(predictPrice(record({ revenueTTM_3y: null }), facts, 1, 'A')).toBeNull();
  });

  it('skrajne tempo wzrostu jest ograniczane, żeby prognoza nie uciekała w nieskończoność', () => {
    const r = record({ revenueTTM_3y: 1, revenueTTM: 1_000_000, ps: 2 });
    const p = predictPrice(r, facts, 1, 'A')!;
    expect(p).toBeLessThanOrEqual(100 * 2);
  });
});

describe('errorBands i priceBand', () => {
  const facts: SharedFacts = {
    growthFade: { 1: { intercept: 0, slope: 1, n: 100, rmse: 0 } },
    multipleReversion: { 1: { intercept: 0, slope: 1, n: 100, rmse: 0 } },
    shareDrift: { 1: { value: 0, n: 100 } },
  };

  it('poniżej progu obserwacji nie zwraca pasów', () => {
    expect(errorBands([{ logError: 0.1, quarter: 'q', cik: 'a' }])).toBeNull();
  });

  it('centyle odpowiadają rozkładowi błędów', () => {
    const res = [...Array(200).keys()].map((i) => ({ logError: i / 100, quarter: 'q', cik: String(i) }));
    const b = errorBands(res)!;
    expect(b.logQuantiles['0.5']).toBeCloseTo(0.995, 2);
    expect(b.logQuantiles['0.1']).toBeLessThan(b.logQuantiles['0.9']);
  });

  it('pas cenowy to prognoza przemnożona przez wykładniczy błąd', () => {
    const res = [...Array(200).keys()].map((i) => ({ logError: (i - 100) / 100, quarter: 'q', cik: String(i) }));
    const b = errorBands(res)!;
    const band = priceBand(50, b);
    expect(band['0.5']).toBeCloseTo(50 * Math.exp(b.logQuantiles['0.5']), 9);
  });

  it('reszty powstają tylko dla wierszy z prawdziwą ceną i prognozą', () => {
    const withPrice = record({ revenueTTM_3y: 1000, revenueTTM: 1331, ps: 2 });
    withPrice.fwd[1].price = 120;
    const withoutPrice = record({ cik: '2', revenueTTM_3y: 1000, revenueTTM: 1331, ps: 2 });
    expect(residuals([withPrice, withoutPrice], facts, 1, 'A')).toHaveLength(1);
  });
});

describe('learnFacts', () => {
  it('nie tworzy faktu tam, gdzie nie ma danych', () => {
    const facts = learnFacts([record()]);
    expect(facts.growthFade[1]).toBeUndefined();
    expect(facts.multipleReversion[1]).toBeUndefined();
    expect(facts.shareDrift[1]).toBeUndefined();
  });
});
