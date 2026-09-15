import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluation-harness.js';

const q = (quarter: string, n: number) => Array.from({ length: n }, () => ({ quarter }));

describe('evaluate', () => {
  it('idealne predykcje: błąd 0, IC 1, trafność 1', () => {
    const a = [0.1, 0.2, -0.05, 0.5, 0.15, -0.2, 0.05, 0.3, 0.4, 0.8];
    const r = evaluate(a, a, q('2020-05-15', 10));
    expect(r.MAPE).toBe(0);
    expect(r.meanAbsError).toBe(0);
    expect(r.IC_by_quarter.mean).toBeCloseTo(1, 12);
    expect(r.hitRate).toBe(1);
  });

  it('obserwacje z |actual| < 0.01 są wyłączone z MAPE', () => {
    const r = evaluate([0.1, 0.1, 0.1, 0.1, 0.2], [0.001, -0.005, 0.0, 0.1, 0.2], q('2020-05-15', 5));
    expect(r.n_excluded_from_mape).toBe(3);
    expect(r.MAPE).toBe(0);
  });

  it('spread decylowy = średnia top decyla − średnia bottom decyla', () => {
    const r = evaluate([10, 9, 8, 7, 6, 5, 4, 3, 2, 1], [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1], q('2021-02-15', 10));
    expect(r.decile_spread).toBeCloseTo(0.9, 12);
  });

  it('IC_t_stat liczony z IC kwartalnych (IC +1 i −1 => średnia 0 => t = 0)', () => {
    const preds = [1, 2, 3, 1, 2, 3];
    const acts = [1, 2, 3, 3, 2, 1];
    const r = evaluate(preds, acts, [...q('A', 3), ...q('B', 3)]);
    expect(r.IC_by_quarter.nQuarters).toBe(2);
    expect(r.IC_by_quarter.mean).toBeCloseTo(0, 12);
    expect(r.IC_t_stat).toBeCloseTo(0, 12);
  });
});
