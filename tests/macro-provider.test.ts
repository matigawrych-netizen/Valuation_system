import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedCache, Quote } from '../src/data-loader.js';
import { fetchMacroEnvironment, getMacroAsOf, type FredPitFile } from '../src/macro-provider.js';
import { yahooFinance } from '../src/yahoo-mapper.js';

vi.mock('../src/yahoo-mapper.js', () => ({ yahooFinance: { quoteSummary: vi.fn() } }));

const fredResponse = (values: number[]) => ({
  ok: true,
  json: async () => ({ observations: values.map((v, i) => ({ date: `2024-01-${String(28 - i).padStart(2, '0')}`, value: String(v) })) }),
});

describe('fetchMacroEnvironment (live)', () => {
  const originalKey = process.env.FRED_API_KEY;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FRED_API_KEY = 'test-key';
    global.fetch = vi.fn((url: string) => {
      if (url.includes('FEDFUNDS')) return Promise.resolve(fredResponse([5.5, 5.5, 5.25, 5.0, 5.0]));
      if (url.includes('CPIAUCSL')) return Promise.resolve(fredResponse([3.5, 3.4, 3.0, 2.9]));
      if (url.includes('DGS10')) return Promise.resolve(fredResponse([4.5]));
      if (url.includes('DGS2')) return Promise.resolve(fredResponse([4.8]));
      if (url.includes('DGS3MO')) return Promise.resolve(fredResponse([5.2]));
      if (url.includes('BAMLH0A0HYM2')) return Promise.resolve(fredResponse([3.1]));
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    }) as any;
    (yahooFinance.quoteSummary as any).mockResolvedValue({ financialData: { currentPrice: 5100 }, summaryDetail: { twoHundredDayAverage: 4800 } });
  });
  afterEach(() => {
    process.env.FRED_API_KEY = originalKey;
  });

  it('mapuje serie FRED na MacroEnvironment', async () => {
    const macro = await fetchMacroEnvironment();
    expect(macro.fedFundsRate).toBe(0.055);
    expect(macro.fedFundsRatePrior).toBe(0.05);
    expect(macro.rateRegime).toBe('HIKING');
    expect(macro.cpiYoY).toBe(0.035);
    expect(macro.cpiTrend).toBe('RISING');
    expect(macro.treasury10Y).toBe(0.045);
    expect(macro.treasury3M).toBeCloseTo(0.052, 12);
    expect(macro.yieldSpread).toBeCloseTo(-0.007, 10);
    expect(macro.creditSpread).toBe(0.031);
    expect(macro.marketRegime).toBe('BULL');
  });

  it('bez FRED_API_KEY rzuca wyjątek (klucz nie jest już w kodzie)', async () => {
    delete process.env.FRED_API_KEY;
    await expect(fetchMacroEnvironment()).rejects.toThrow(/FRED_API_KEY/);
  });

  it('błąd sieci => wyjątek, nie ciche wartości domyślne', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any;
    await expect(fetchMacroEnvironment()).rejects.toThrow(/Network error/);
  });
});

describe('getMacroAsOf (backtest, offline)', () => {
  let counter = 0;
  let tmp = '';
  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `fred-pit-test-${process.pid}-${counter++}.json`);
  });
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  function series(start: string, days: number, value: (i: number) => number) {
    const quotes: Quote[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(new Date(`${start}T14:30:00Z`).getTime() + i * 86_400_000);
      quotes.push({ date: d.toISOString(), t: d.getTime(), close: value(i), adj: value(i) });
    }
    return { quotes, splits: [] };
  }

  const cache = {
    macro: {
      VIX: series('2019-01-01', 500, () => 25),
      GSPC: series('2019-01-01', 500, () => 1000),
      GC: series('2019-01-01', 500, (i) => 100 + i * 0.1),
      CL: series('2019-01-01', 500, () => 50),
    },
  } as unknown as ParsedCache;

  it('czyta obserwacje widoczne w dniu decyzji', () => {
    const file: FredPitFile = {
      generatedAt: 'test',
      dates: {
        '2020-05-15': {
          vintage: {},
          series: {
            FEDFUNDS: [
              { date: '2020-04-01', value: 0.05 },
              { date: '2020-03-01', value: 0.65 },
              { date: '2020-02-01', value: 1.58 },
              { date: '2020-01-01', value: 1.55 },
            ],
            CPIAUCSL_PC1: [
              { date: '2020-04-01', value: 0.3 },
              { date: '2020-03-01', value: 1.5 },
              { date: '2020-02-01', value: 2.3 },
            ],
            DGS10: [{ date: '2020-05-14', value: 0.63 }],
            DGS3MO: [{ date: '2020-05-14', value: 0.12 }],
            DGS2: [{ date: '2020-05-14', value: 0.16 }],
            UNRATE: [{ date: '2020-04-01', value: 14.7 }],
          },
        },
      },
    };
    fs.writeFileSync(tmp, JSON.stringify(file));
    const m = getMacroAsOf(cache, '2020-05-15', tmp);
    expect(m.fedFundsRate).toBeCloseTo(0.0005, 10);
    expect(m.rateRegime).toBe('CUTTING');
    expect(m.cpiTrend).toBe('FALLING');
    expect(m.yieldSpread).toBeCloseTo(0.0051, 10);
    expect(m.creditSpread).toBeNull();
    expect(m.unemploymentRate).toBeCloseTo(0.147, 10);
    expect(m.vix).toBe(25);
    expect(m.marketRegime).toBe('NEUTRAL');
    expect(m.copperYoY).toBeNull();
  });

  it('brak wpisu dla daty => wyjątek', () => {
    fs.writeFileSync(tmp, JSON.stringify({ generatedAt: 'test', dates: {} }));
    expect(() => getMacroAsOf(cache, '2020-05-15', tmp)).toThrow(/Brak wpisu makro PIT/);
  });
});
