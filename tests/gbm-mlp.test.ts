import { describe, expect, it } from 'vitest';
import { GBM_PARAMS, explainGbm, predictGbm, trainGbm } from '../src/gbm.js';
import { MLP_PARAMS, predictMlp, trainMlp } from '../src/mlp.js';
import { mulberry32 } from '../src/stats.js';

const vec = (...v: number[]) => Float64Array.from(v);

function data(n: number, seed: number, f: (x: Float64Array, rnd: () => number) => number, nF = 3) {
  const rnd = mulberry32(seed);
  const X: Float64Array[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = new Float64Array(nF);
    for (let k = 0; k < nF; k++) x[k] = rnd() * 2 - 1;
    X.push(x);
    y.push(f(x, rnd));
  }
  return { X, y };
}

const small = { ...GBM_PARAMS, minLeaf: 50, maxTrees: 300 };

describe('drzewa decyzyjne (gradient boosting)', () => {
  it('uczy się progu na właściwej cesze', () => {
    const { X, y } = data(2000, 1, (x, rnd) => (x[1] > 0.2 ? 1 : -1) + (rnd() - 0.5) * 0.1);
    const { model } = trainGbm(X, y, small);
    expect(predictGbm(model, vec(0, 0.8, 0))).toBeCloseTo(1, 1);
    expect(predictGbm(model, vec(0, -0.5, 0))).toBeCloseTo(-1, 1);
    expect(model.trees[0][0].feature).toBe(1);
  });

  it('przewiduje medianę, a nie średnią — skrajne wartości jej nie przesuwają', () => {
    const { X, y } = data(2000, 2, (_x, rnd) => (rnd() < 0.1 ? 100 : 0));
    const { model } = trainGbm(X, y, small);
    expect(Math.abs(predictGbm(model, vec(0.1, 0.1, 0.1)))).toBeLessThan(0.5);
  });

  it('brak danych ma własną drogę w drzewie', () => {
    const { X, y } = data(2000, 3, (x, rnd) => (rnd() < 0.3 ? ((x[0] = NaN), 5) : 0));
    const { model } = trainGbm(X, y, small);
    expect(predictGbm(model, vec(NaN, 0, 0))).toBeGreaterThan(4);
    expect(Math.abs(predictGbm(model, vec(0.3, 0, 0)))).toBeLessThan(0.5);
  });

  it('nie tworzy liści mniejszych niż minimum — przy minimum powyżej połowy danych drzewa się nie dzielą', () => {
    const { X, y } = data(500, 4, (x) => x[0]);
    const { model } = trainGbm(X, y, { ...small, minLeaf: 251, maxTrees: 5 });
    expect(model.trees.every((t) => t.length === 1)).toBe(true);
  });

  it('wcześniejsze zatrzymanie: na szumie zostaje mało drzew', () => {
    const train = data(2000, 5, (_x, rnd) => rnd());
    const val = data(1000, 6, (_x, rnd) => rnd());
    const res = trainGbm(train.X, train.y, small, val);
    expect(res.bestTrees).toBeLessThan(small.maxTrees);
    expect(res.validationLoss.length).toBeLessThanOrEqual(res.bestTrees + small.patience);
    expect(res.model.trees.length).toBe(res.bestTrees);
  });

  it('ten sam trening daje ten sam model', () => {
    const { X, y } = data(1000, 7, (x) => x[0] * 2 + x[2]);
    const a = trainGbm(X, y, small).model;
    const b = trainGbm(X, y, small).model;
    expect(predictGbm(a, vec(0.3, -0.2, 0.9))).toBe(predictGbm(b, vec(0.3, -0.2, 0.9)));
  });

  it('wkłady cech sumują się do prognozy', () => {
    const { X, y } = data(1500, 8, (x) => x[0] - 2 * x[1]);
    const { model } = trainGbm(X, y, small);
    const x = vec(0.4, -0.6, 0.1);
    const contrib = explainGbm(model, x);
    const roots = model.trees.reduce((s, t) => s + t[0].value, 0);
    expect(model.init + roots + contrib.reduce((a, b) => a + b, 0)).toBeCloseTo(predictGbm(model, x), 10);
    expect(Math.abs(contrib[1])).toBeGreaterThan(Math.abs(contrib[2]));
  });
});

describe('sieć neuronowa', () => {
  const quick = { ...MLP_PARAMS, maxEpochs: 60, batchSize: 64 };

  it('uczy się prostej zależności dużo lepiej niż sama mediana', () => {
    const { X, y } = data(1000, 11, (x) => 2 * x[0] - x[1]);
    const { model } = trainMlp(X, y, quick);
    const test = data(300, 12, (x) => 2 * x[0] - x[1]);
    const err = test.X.reduce((s, x, i) => s + Math.abs(predictMlp(model, x) - test.y[i]), 0) / test.X.length;
    expect(err).toBeLessThan(0.15);
  });

  it('kolumna „brak danych” pozwala rozpoznać brak wartości', () => {
    const { X, y } = data(1000, 13, (x, rnd) => (rnd() < 0.3 ? ((x[0] = NaN), 3) : 0));
    const { model } = trainMlp(X, y, quick);
    expect(predictMlp(model, vec(NaN, 0, 0))).toBeGreaterThan(2.5);
    expect(Math.abs(predictMlp(model, vec(0.2, 0, 0)))).toBeLessThan(0.5);
  });

  it('to samo ziarno = ten sam model, inne ziarno = inny', () => {
    const { X, y } = data(300, 14, (x) => x[0]);
    const p = { ...quick, maxEpochs: 3 };
    const x = vec(0.1, 0.2, 0.3);
    expect(predictMlp(trainMlp(X, y, p).model, x)).toBe(predictMlp(trainMlp(X, y, p).model, x));
    expect(predictMlp(trainMlp(X, y, { ...p, seed: 1 }).model, x)).not.toBe(predictMlp(trainMlp(X, y, p).model, x));
  });

  it('wcześniejsze zatrzymanie zwraca model z najlepszej epoki', () => {
    const train = data(500, 15, (_x, rnd) => rnd());
    const val = data(300, 16, (_x, rnd) => rnd());
    const res = trainMlp(train.X, train.y, { ...quick, patience: 3 }, val);
    expect(res.bestEpochs).toBeLessThanOrEqual(res.validationLoss.length);
    if (res.bestEpochs > 0) {
      const best = Math.min(...res.validationLoss);
      const loss = val.X.reduce((s, x, i) => s + Math.abs(val.y[i] - predictMlp(res.model, x)), 0) / val.X.length;
      expect(loss).toBeCloseTo(best, 10);
    }
  });
});
