import { describe, expect, it } from 'vitest';
import type { PriceSeries } from '../src/data-loader.js';
import { HORIZONS } from '../src/facts-panel.js';
import { sectorFromSic } from '../src/sectors.js';
import {
  FEATURE_NAMES,
  SECTORS,
  abstainReason,
  featureVector,
  keyRanges,
  momentum12to1,
  shareChangeByRow,
} from '../src/specialist-features.js';
import {
  MIN_TRAIN_ROWS,
  MIN_VALIDATION_ROWS,
  cutoffFor,
  isExamDecision,
  memoryIsSufficient,
  memoryRows,
  outcomeDate,
  trainingCutoffs,
} from '../src/specialist-memory.js';
import { row } from './specialist-fixtures.js';

/** Kwartalne daty decyzji jak w panelu: 15 lutego, maja, sierpnia, listopada. */
function quarterlyDates(fromYear: number, toYear: number): string[] {
  const out: string[] = [];
  for (let y = fromYear; y <= toYear; y++) for (const md of ['02-15', '05-15', '08-15', '11-15']) out.push(`${y}-${md}`);
  return out;
}

describe('kalendarz egzaminu', () => {
  it('trenuje 15 lutego każdego roku 2016–2021', () => {
    expect(trainingCutoffs()).toEqual(['2016-02-15', '2017-02-15', '2018-02-15', '2019-02-15', '2020-02-15', '2021-02-15']);
  });

  it('decyzja korzysta z ostatniego treningu nie późniejszego niż ona', () => {
    expect(cutoffFor('2016-02-15')).toBe('2016-02-15');
    expect(cutoffFor('2017-01-31')).toBe('2016-02-15');
    expect(cutoffFor('2021-11-15')).toBe('2021-02-15');
    expect(cutoffFor('2015-11-15')).toBeNull();
    expect(cutoffFor('2016-01-15')).toBeNull();
  });

  it('egzamin obejmuje tylko decyzje z lat 2016–2021', () => {
    expect(isExamDecision('2016-05-15')).toBe(true);
    expect(isExamDecision('2021-11-15')).toBe(true);
    expect(isExamDecision('2022-02-15')).toBe(false);
    expect(isExamDecision('2015-11-15')).toBe(false);
  });
});

describe('pamięć w czasie rzeczywistym', () => {
  const rows = quarterlyDates(2009, 2021).map((asOf) => ({ asOf }));
  const years = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / (365.25 * 86400000);

  it('uczy się tylko na wynikach znanych w dniu treningu, z okna ostatnich M lat', () => {
    const cutoff = '2018-02-15';
    for (const h of HORIZONS) {
      const split = memoryRows(rows, cutoff, h, 4);
      expect(split.all.length).toBe(16);
      for (const r of split.all) {
        const known = outcomeDate(r.asOf, h);
        expect(known <= cutoff).toBe(true);
        expect(years(known, cutoff)).toBeLessThan(4);
        // decyzja + h lat nie może wykraczać poza dzień treningu
        expect(Number(r.asOf.slice(0, 4)) + h).toBeLessThanOrEqual(2018);
      }
    }
  });

  it('ostatni rok pamięci trafia do walidacji, reszta do uczenia', () => {
    const split = memoryRows(rows, '2018-02-15', 1, 8);
    expect(split.validation.map((r) => r.asOf)).toEqual(['2016-05-15', '2016-08-15', '2016-11-15', '2017-02-15']);
    expect(split.train.length + split.validation.length).toBe(split.all.length);
    expect(split.train.every((r) => outcomeDate(r.asOf, 1) <= '2017-02-15')).toBe(true);
  });

  it('cała historia sięga do początku danych', () => {
    const split = memoryRows(rows, '2018-02-15', 1, 'all');
    expect(split.all[0].asOf).toBe('2009-02-15');
    expect(split.all.at(-1)!.asOf).toBe('2017-02-15');
  });

  it('obserwacja z okresu embarga w pamięci to błąd, a nie cichy wynik', () => {
    expect(() => memoryRows([{ asOf: '2022-02-15' }], '2024-02-15', 1, 'all')).toThrow(/podziału danych/);
  });

  it('za mała pamięć = brak modelu, z powodem', () => {
    const tooSmall = { all: new Array(MIN_TRAIN_ROWS - 1), train: [], validation: new Array(MIN_VALIDATION_ROWS) };
    expect(memoryIsSufficient(tooSmall).ok).toBe(false);
    const noValidation = { all: new Array(MIN_TRAIN_ROWS), train: [], validation: new Array(MIN_VALIDATION_ROWS - 1) };
    expect(memoryIsSufficient(noValidation).ok).toBe(false);
    const enough = { all: new Array(MIN_TRAIN_ROWS), train: [], validation: new Array(MIN_VALIDATION_ROWS) };
    expect(memoryIsSufficient(enough).ok).toBe(true);
  });
});

describe('cechy specjalisty', () => {
  const at = (x: Float64Array, name: string) => x[FEATURE_NAMES.indexOf(name)];

  it('liczy każdą cechę ze składników panelu', () => {
    const x = featureVector(row(), 50);
    expect(at(x, 'logPriceToSales')).toBeCloseTo(Math.log(2), 10);
    expect(at(x, 'earningsYield')).toBeCloseTo(0.05, 10);
    expect(at(x, 'bookToPrice')).toBeCloseTo(0.2, 10);
    expect(at(x, 'ebitToEv')).toBeCloseTo(5_000 / 65_000, 10);
    expect(at(x, 'fcfYield')).toBeCloseTo(0.02, 10);
    expect(at(x, 'dividendYield')).toBeCloseTo(0.01, 10);
    expect(at(x, 'revenueGrowth1y')).toBeCloseTo(Math.log(1.25), 10);
    expect(at(x, 'revenueCagr3y')).toBeCloseTo(0.1, 10);
    expect(at(x, 'netMarginChange1y')).toBeCloseTo(0.05, 10);
    expect(at(x, 'netMargin')).toBeCloseTo(0.1, 10);
    expect(at(x, 'fcfMargin')).toBeCloseTo(0.04, 10);
    expect(at(x, 'liabilitiesToAssets')).toBeCloseTo(0.5, 10);
    expect(at(x, 'cashToAssets')).toBeCloseTo(0.125, 10);
    expect(at(x, 'logMarketCap')).toBeCloseTo(Math.log(50_000), 10);
    expect(at(x, 'momentum12_1')).toBe(0.15);
    expect(at(x, 'shareChange1y')).toBe(-0.02);
    expect(at(x, 'sector:Services')).toBe(1);
    expect(SECTORS.filter((s) => s !== 'Services').every((s) => at(x, `sector:${s}`) === 0)).toBe(true);
  });

  it('przy innej cenie zmieniają się tylko cechy zależne od ceny', () => {
    const a = featureVector(row(), 50);
    const b = featureVector(row(), 100);
    expect(at(b, 'logPriceToSales')).toBeCloseTo(Math.log(4), 10);
    expect(at(b, 'earningsYield')).toBeCloseTo(0.025, 10);
    expect(at(b, 'logMarketCap')).toBeCloseTo(Math.log(100_000), 10);
    for (const name of ['revenueGrowth1y', 'revenueCagr3y', 'netMargin', 'momentum12_1', 'shareChange1y']) {
      expect(at(b, name)).toBe(at(a, name));
    }
  });

  it('brak danych = NaN, nie zero', () => {
    const x = featureVector(row({ revenueTTM_3y: null, dividendsTTM: null, cash: null, momentum12_1: null }), 50);
    expect(Number.isNaN(at(x, 'revenueCagr3y'))).toBe(true);
    expect(Number.isNaN(at(x, 'dividendYield'))).toBe(true);
    expect(Number.isNaN(at(x, 'ebitToEv'))).toBe(true);
    expect(Number.isNaN(at(x, 'momentum12_1'))).toBe(true);
  });

  it('lista sektorów obejmuje wszystko, co zwraca klasyfikacja SIC', () => {
    const seen = new Set<string>();
    for (let sic = 0; sic <= 9999; sic++) {
      const s = sectorFromSic(sic);
      if (s) seen.add(s);
    }
    expect([...seen].every((s) => (SECTORS as readonly string[]).includes(s))).toBe(true);
  });

  it('wstrzymuje się bez kluczowej cechy albo poza 1.–99. centylem danych uczących', () => {
    // wzrost z 3 lat w okolicach 10% rocznie, cena/przychody od 0,4 do 8,4
    const train = Array.from({ length: 200 }, (_, i) => row({ price: 10 + i, revenueTTM_3y: (25_000 / 1.331) * (1 + (i - 100) / 1000) }));
    const ranges = keyRanges(train);
    expect(abstainReason(row({ price: 100 }), ranges)).toBeNull();
    expect(abstainReason(row({ revenueTTM_3y: null }), ranges)).toBe('missing:revenueCagr3y');
    expect(abstainReason(row({ price: 10_000 }), ranges)).toBe('out_of_range:logPriceToSales');
  });
});

describe('cechy dopisywane do panelu', () => {
  it('zmiana kursu 12-1 bierze kurs sprzed miesiąca i sprzed roku, z dywidendami', () => {
    const quotes = [];
    for (let t = Date.UTC(2016, 0, 1); t <= Date.UTC(2017, 5, 30); t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      const adj = d <= '2016-05-15' ? 10 : d <= '2017-04-15' ? 12 : 99;
      quotes.push({ date: d, t: t + 14.5 * 3600000, close: 1, adj });
    }
    const series: PriceSeries = { quotes, splits: [] };
    expect(momentum12to1(series, '2017-05-15')).toBeCloseTo(Math.log(12 / 10), 10);
    expect(momentum12to1(series, '2016-06-15')).toBeNull();
  });

  it('zmiana liczby akcji porównuje z wierszem tej samej spółki sprzed roku', () => {
    const rows = [
      row({ cik: 'A', asOf: '2016-05-15', shares: 1000 }),
      row({ cik: 'A', asOf: '2017-05-15', shares: 900 }),
      row({ cik: 'B', asOf: '2017-05-15', shares: 500 }),
    ];
    const m = shareChangeByRow(rows);
    expect(m.get('A|2017-05-15')).toBeCloseTo(Math.log(0.9), 10);
    expect(m.get('A|2016-05-15')).toBeNull();
    expect(m.get('B|2017-05-15')).toBeNull();
  });
});
