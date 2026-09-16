import { HORIZONS, type Horizon, type PanelForward } from '../src/facts-panel.js';
import type { SpecialistRow } from '../src/specialist-features.js';

/** Wiersz panelu specjalisty z okrągłymi liczbami (cechy łatwe do policzenia ręcznie). */
export function row(over: Partial<SpecialistRow> = {}): SpecialistRow {
  const fwd = {} as Record<Horizon, PanelForward>;
  for (const h of HORIZONS) fwd[h] = { price: null, totalRatio: null, revenueTTM: null, netIncomeTTM: null, shares: null };
  return {
    ticker: 'TEST',
    cik: '0000000001',
    asOf: '2017-05-15',
    sector: 'Services',
    price: 50,
    shares: 1000,
    marketCap: 50_000,
    revenueTTM: 25_000,
    netIncomeTTM: 2_500,
    ebitTTM: 5_000,
    fcfTTM: 1_000,
    dividendsTTM: -500,
    equity: 10_000,
    assets: 40_000,
    liabilities: 20_000,
    cash: 5_000,
    revenueTTM_1y: 20_000,
    revenueTTM_3y: 25_000 / 1.331,
    netIncomeTTM_1y: 1_000,
    netIncomeTTM_3y: null,
    ps: 2,
    pe: 20,
    pb: 5,
    terminalKind: null,
    momentum12_1: 0.15,
    shareChange1y: -0.02,
    fwd,
    ...over,
  };
}
