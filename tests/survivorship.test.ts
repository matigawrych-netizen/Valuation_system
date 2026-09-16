import { describe, expect, it } from 'vitest';
import {
  BASE_ASSUMPTIONS,
  coverage,
  logChange,
  percentChanges,
  valueObservations,
  type CompanyHistory,
  type ObservationOptions,
} from '../src/survivorship.js';

const T = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const pt = (end: string, val: number) => ({ end, t: T(end), val });

const opts: ObservationOptions = {
  minValue: 1e9,
  fromYear: 2010,
  toYear: 2020,
  dataEndT: T('2025-08-15'),
  horizons: [1, 2],
  toleranceDays: 75,
};

const company = (over: Partial<CompanyHistory>): CompanyHistory => ({
  cik: '0000000001',
  floats: [],
  lastReportT: T('2026-08-01'),
  bankruptcyTs: [],
  delistingTs: [],
  ...over,
});

describe('valueObservations', () => {
  it('spółka z wartością po h latach jest ocalałą obserwacją', () => {
    const obs = valueObservations(company({ floats: [pt('2015-06-30', 2e9), pt('2016-06-30', 3e9), pt('2017-06-30', 4e9)] }), opts);
    const first = obs.filter((o) => o.start === '2015-06-30');
    expect(first.map((o) => o.fate)).toEqual(['observed', 'observed']);
    expect(first[0].endValue).toBe(3e9);
  });

  it('spółka poniżej progu wartości nie tworzy obserwacji', () => {
    expect(valueObservations(company({ floats: [pt('2015-06-30', 5e8), pt('2016-06-30', 6e8)] }), opts)).toHaveLength(0);
  });

  it('spółka, która przestała raportować po upadłości, ma los „upadłość” i ostatnią znaną wartość', () => {
    const obs = valueObservations(
      company({
        floats: [pt('2015-06-30', 2e9), pt('2016-06-30', 1.2e9)],
        lastReportT: T('2017-03-01'),
        bankruptcyTs: [T('2016-11-01')],
      }),
      opts
    );
    const h2 = obs.find((o) => o.start === '2015-06-30' && o.horizon === 2)!;
    expect(h2.fate).toBe('bankruptcy');
    expect(h2.lastValue).toBe(1.2e9);
  });

  it('stare zgłoszenie upadłości (spółka zależna) nie zmienia późniejszego przejęcia w upadłość', () => {
    const obs = valueObservations(
      company({
        floats: [pt('2012-06-30', 5e9), pt('2013-06-30', 5e9)],
        lastReportT: T('2016-03-01'),
        bankruptcyTs: [T('2012-10-01')],
        delistingTs: [T('2016-02-15')],
      }),
      { ...opts, horizons: [4] }
    );
    expect(obs.find((o) => o.start === '2012-06-30')!.fate).toBe('delisted');
  });

  it('spółka zdjęta z giełdy bez upadłości to „zniknięcie z formularzem”', () => {
    const obs = valueObservations(
      company({ floats: [pt('2015-06-30', 2e9)], lastReportT: T('2016-02-01'), delistingTs: [T('2016-01-20')] }),
      opts
    );
    expect(obs[0].fate).toBe('delisted');
  });

  it('spółka, która nadal raportuje, ale nie ma wartości po h latach, jest pominięta, a nie zgadnięta', () => {
    const obs = valueObservations(company({ floats: [pt('2015-06-30', 2e9)] }), opts);
    expect(obs.every((o) => o.fate === 'missing')).toBe(true);
  });

  it('horyzont za końcem kompletnych danych to „jeszcze nie wiadomo”', () => {
    const obs = valueObservations(company({ floats: [pt('2020-06-30', 2e9)] }), { ...opts, horizons: [5, 6] });
    // h=5 kończy się w połowie 2025 r. (dane kompletne, ale brak wartości), h=6 — za końcem danych
    expect(obs.map((o) => o.fate)).toEqual(['missing', 'not_yet']);
  });

  it('upadłość z dalszym raportowaniem i skokową zmianą liczby akcji to stare akcje zastąpione nowymi', () => {
    const c = company({ floats: [pt('2015-06-30', 2e9), pt('2016-06-30', 1.5e9)], bankruptcyTs: [T('2015-12-01')] });
    const shares = (_: string, t: number) => (t < T('2015-12-01') ? 100e6 : 20e6);
    const [h1] = valueObservations(c, { ...opts, horizons: [1], sharesNear: shares });
    expect(h1.fate).toBe('bankruptcy_reorganized');
  });

  it('upadłość spółki zależnej przy stałej liczbie akcji nie przekreśla wyniku', () => {
    const c = company({ floats: [pt('2015-06-30', 2e9), pt('2016-06-30', 2.1e9)], bankruptcyTs: [T('2015-12-01')] });
    const [h1] = valueObservations(c, { ...opts, horizons: [1], sharesNear: () => 100e6 });
    expect(h1.fate).toBe('observed');
  });

  it('upadłość z dalszym raportowaniem bez danych o liczbie akcji jest pominięta', () => {
    const c = company({ floats: [pt('2015-06-30', 2e9), pt('2016-06-30', 2.1e9)], bankruptcyTs: [T('2015-12-01')] });
    const [h1] = valueObservations(c, { ...opts, horizons: [1] });
    expect(h1.fate).toBe('missing');
  });
});

describe('logChange', () => {
  const base = { cik: 'x', start: '2015-06-30', horizon: 1, startValue: 100, endValue: null, endDate: null, lastValue: 80 };

  it('ocalała obserwacja używa prawdziwej wartości końcowej w obu grupach', () => {
    const o = { ...base, fate: 'observed' as const, endValue: 150 };
    expect(logChange(o, 'survivors', BASE_ASSUMPTIONS)).toBeCloseTo(Math.log(1.5), 12);
    expect(logChange(o, 'all', BASE_ASSUMPTIONS)).toBeCloseTo(Math.log(1.5), 12);
  });

  it('spółka, która zniknęła, nie wchodzi do grupy ocalałych', () => {
    expect(logChange({ ...base, fate: 'delisted' }, 'survivors', BASE_ASSUMPTIONS)).toBeNull();
  });

  it('upadłość liczy wartość końcową od ostatniej znanej wartości', () => {
    expect(logChange({ ...base, fate: 'bankruptcy' }, 'all', BASE_ASSUMPTIONS)).toBeCloseTo(Math.log((80 * 0.01) / 100), 12);
  });

  it('pominięte obserwacje nie wchodzą do żadnej grupy', () => {
    expect(logChange({ ...base, fate: 'missing' }, 'all', BASE_ASSUMPTIONS)).toBeNull();
    expect(logChange({ ...base, fate: 'not_yet' }, 'all', BASE_ASSUMPTIONS)).toBeNull();
  });
});

describe('percentChanges i coverage', () => {
  it('centyle są wyrażone jako zmiana procentowa', () => {
    const logs = [...Array(101).keys()].map((i) => Math.log(1 + i / 100));
    expect(percentChanges(logs)!['0.5']).toBeCloseTo(0.5, 6);
  });

  it('za mała próbka nie daje centyli', () => {
    expect(percentChanges([0.1, 0.2])).toBeNull();
  });

  it('pokrycie liczy udział obserwacji w pasie', () => {
    expect(coverage([-1, 0, 0.5, 2], -0.5, 1)).toBe(0.5);
  });
});
