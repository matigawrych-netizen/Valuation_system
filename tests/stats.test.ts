import { describe, expect, it } from 'vitest';
import {
  bootstrapGroups,
  conditionNumberFromEigen,
  dieboldMariano,
  getRanks,
  mulberry32,
  olsFit,
  pearson,
  spearman,
  spearmanNoTiesFormula,
  studentTCdf,
  symmetricEigenvalues,
} from '../src/stats.js';

describe('Spearman z wiązaniami', () => {
  const x = [1, 2, 2, 3];
  const y = [1, 2, 3, 3];

  it('rangi średnie przy wiązaniach', () => {
    expect(getRanks(x)).toEqual([1, 2.5, 2.5, 4]);
    expect(getRanks(y)).toEqual([1, 2, 3.5, 3.5]);
  });

  it('spearman = Pearson na rangach i różni się od wzoru skróconego', () => {
    // Rangi: [1,2.5,2.5,4] i [1,2,3.5,3.5], średnie 2.5. Σdx·dy = 2.25 + 1.5 = 3.75, Σdx² = 4.5, Σdy² = 4.5
    const expected = 3.75 / Math.sqrt(4.5 * 4.5);
    expect(spearman(x, y)).toBeCloseTo(expected, 12);
    // Wzór skrócony: 1 - 6*1.5/(4*15) = 0.85 — obciążony przy wiązaniach
    expect(spearmanNoTiesFormula(x, y)).toBeCloseTo(0.85, 12);
    expect(Math.abs(spearman(x, y)! - spearmanNoTiesFormula(x, y)!)).toBeGreaterThan(0.01);
  });

  it('bez wiązań oba wzory dają to samo', () => {
    const a = [3, 1, 4, 1.5, 9, 2.6];
    const b = [2, 7, 1, 8, 2.8, 1.8];
    expect(spearman(a, b)).toBeCloseTo(spearmanNoTiesFormula(a, b)!, 12);
  });

  it('pearson zwraca null przy zerowej wariancji', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe('Diebold-Mariano', () => {
  it('identyczne szeregi błędów => dmStat 0 i p = 1', () => {
    const e = [0.1, -0.2, 0.3, 0.05, -0.1, 0.2, 0.15, -0.05, 0.12, -0.3];
    const r = dieboldMariano(e, e, 4);
    expect(r.dmStat).toBe(0);
    expect(r.pValue).toBe(1);
  });

  it('A jawnie lepsze od B => p < 0.05 i ujemna statystyka', () => {
    const rnd = mulberry32(7);
    const n = 80;
    const eA = Array.from({ length: n }, () => (rnd() - 0.5) * 0.1);
    const eB = Array.from({ length: n }, () => (rnd() - 0.5) * 1.0);
    const r = dieboldMariano(eA, eB, 4);
    expect(r.dmStat).toBeLessThan(0);
    expect(r.pValue).toBeLessThan(0.05);
  });

  it('rozkład t: symetria i wartości referencyjne', () => {
    expect(studentTCdf(0, 10)).toBeCloseTo(0.5, 10);
    // t(0.975; df=10) = 2.228138851986273
    expect(studentTCdf(2.228138851986273, 10)).toBeCloseTo(0.975, 6);
  });
});

describe('bootstrap blokowy', () => {
  it('jest deterministyczny dla stałego ziarna', () => {
    const groups = [[1, 2], [3], [4, 5, 6], [7]];
    const stat = (g: number[][]) => g.flat().reduce((a, b) => a + b, 0) / g.flat().length;
    const a = bootstrapGroups(groups, stat, 200, 42);
    const b = bootstrapGroups(groups, stat, 200, 42);
    expect(a).toEqual(b);
    expect(a.lo!).toBeLessThanOrEqual(a.hi!);
  });
});

describe('algebra', () => {
  it('OLS odtwarza współczynniki dokładnie liniowej zależności', () => {
    const X = [[0], [1], [2], [3], [4]];
    const y = X.map(([x]) => 2 + 3 * x);
    const fit = olsFit(X, y);
    expect(fit.intercept).toBeCloseTo(2, 6);
    expect(fit.coefs[0]).toBeCloseTo(3, 6);
  });

  it('wartości własne i wskaźnik uwarunkowania macierzy diagonalnej', () => {
    const ev = symmetricEigenvalues([
      [4, 0],
      [0, 1],
    ]);
    expect(ev).toEqual([4, 1]);
    expect(conditionNumberFromEigen(ev)).toBeCloseTo(4, 12);
  });
});
