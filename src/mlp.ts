/**
 * Mała sieć neuronowa: dwie warstwy ukryte po 32 neurony (ReLU), strata bezwzględna — przewiduje medianę.
 *
 * Wejście: cechy obcięte do 1.–99. centyla danych uczących i standaryzowane na nich; brak wartości = 0
 * plus kolumna „brak danych” dla cech, którym w danych uczących zdarzały się braki.
 * Uczenie: Adam, paczki po 256 obserwacji, regularyzacja L2 wag, wcześniejsze zatrzymanie na walidacji.
 * Losowość (wagi początkowe, kolejność obserwacji) z ustalonego ziarna — ten sam trening daje ten sam model.
 *
 * Parametry ustalone przed treningiem (docs/specjalisci.md, punkt 5).
 */
import { mulberry32, quantile } from './stats.js';

export interface MlpParams {
  hidden: number[];
  learningRate: number;
  batchSize: number;
  l2: number;
  maxEpochs: number;
  patience: number;
  clipLower: number;
  clipUpper: number;
  seed: number;
}

export const MLP_PARAMS: MlpParams = {
  hidden: [32, 32],
  learningRate: 1e-3,
  batchSize: 256,
  l2: 1e-4,
  maxEpochs: 100,
  patience: 10,
  clipLower: 0.01,
  clipUpper: 0.99,
  seed: 20260917,
};

export interface MlpModel {
  clip: [number, number][];
  mean: number[];
  std: number[];
  /** Cechy, które dostają dodatkową kolumnę „brak danych”. */
  missingColumns: number[];
  sizes: number[];
  /** weights[l][j * fanIn + i] — waga z neuronu i warstwy l do neuronu j warstwy l+1. */
  weights: Float64Array[];
  biases: Float64Array[];
}

export interface MlpTrainResult {
  model: MlpModel;
  validationLoss: number[];
  bestEpochs: number;
}

function inputSpec(X: Float64Array[], params: MlpParams) {
  const nF = X[0].length;
  const clip: [number, number][] = [];
  const mean: number[] = [];
  const std: number[] = [];
  const missingColumns: number[] = [];
  for (let f = 0; f < nF; f++) {
    const vals: number[] = [];
    for (const row of X) if (!Number.isNaN(row[f])) vals.push(row[f]);
    if (vals.length < X.length) missingColumns.push(f);
    if (vals.length === 0) {
      clip.push([0, 0]);
      mean.push(0);
      std.push(1);
      continue;
    }
    const lo = quantile(vals, params.clipLower);
    const hi = quantile(vals, params.clipUpper);
    const clipped = vals.map((v) => Math.min(hi, Math.max(lo, v)));
    const m = clipped.reduce((a, b) => a + b, 0) / clipped.length;
    const sd = Math.sqrt(clipped.reduce((a, b) => a + (b - m) ** 2, 0) / clipped.length);
    clip.push([lo, hi]);
    mean.push(m);
    std.push(sd > 1e-12 ? sd : 1);
  }
  return { clip, mean, std, missingColumns };
}

/** Wektor wejściowy sieci z surowych cech. */
export function encodeInput(model: Pick<MlpModel, 'clip' | 'mean' | 'std' | 'missingColumns'>, x: Float64Array, out?: Float64Array): Float64Array {
  const nF = model.clip.length;
  const v = out ?? new Float64Array(nF + model.missingColumns.length);
  for (let f = 0; f < nF; f++) {
    const raw = x[f];
    if (Number.isNaN(raw)) v[f] = 0;
    else {
      const [lo, hi] = model.clip[f];
      const c = raw < lo ? lo : raw > hi ? hi : raw;
      v[f] = (c - model.mean[f]) / model.std[f];
    }
  }
  for (let k = 0; k < model.missingColumns.length; k++) v[nF + k] = Number.isNaN(x[model.missingColumns[k]]) ? 1 : 0;
  return v;
}

function forward(model: MlpModel, input: Float64Array, activations: Float64Array[]): number {
  activations[0] = input;
  const L = model.weights.length;
  for (let l = 0; l < L; l++) {
    const fanIn = model.sizes[l];
    const fanOut = model.sizes[l + 1];
    const W = model.weights[l];
    const b = model.biases[l];
    const a = activations[l];
    const z = activations[l + 1];
    for (let j = 0; j < fanOut; j++) {
      let s = b[j];
      const off = j * fanIn;
      for (let i = 0; i < fanIn; i++) s += W[off + i] * a[i];
      z[j] = l < L - 1 ? (s > 0 ? s : 0) : s;
    }
  }
  return activations[L][0];
}

export function predictMlp(model: MlpModel, x: Float64Array): number {
  const acts = model.sizes.map((s) => new Float64Array(s));
  return forward(model, encodeInput(model, x), acts);
}

export function trainMlp(
  X: Float64Array[],
  y: ArrayLike<number>,
  params: MlpParams = MLP_PARAMS,
  validation?: { X: Float64Array[]; y: ArrayLike<number> }
): MlpTrainResult {
  const n = X.length;
  if (n === 0) throw new Error('trainMlp: brak obserwacji.');
  if (y.length !== n) throw new Error('trainMlp: różna liczba cech i celów.');
  const rnd = mulberry32(params.seed);
  const gaussian = () => {
    const u = Math.max(rnd(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };

  const spec = inputSpec(X, params);
  const inputs = X.map((x) => encodeInput(spec, x));
  const valInputs = validation ? validation.X.map((x) => encodeInput(spec, x)) : [];
  const sizes = [inputs[0].length, ...params.hidden, 1];
  const L = sizes.length - 1;

  const yArr = Float64Array.from(y);
  const yMedian = quantile(Array.from(yArr), 0.5);
  const weights: Float64Array[] = [];
  const biases: Float64Array[] = [];
  for (let l = 0; l < L; l++) {
    const fanIn = sizes[l];
    const W = new Float64Array(fanIn * sizes[l + 1]);
    // Warstwy ukryte: inicjalizacja He. Wyjście: zera i mediana celu jako punkt startu.
    if (l < L - 1) for (let k = 0; k < W.length; k++) W[k] = gaussian() * Math.sqrt(2 / fanIn);
    weights.push(W);
    const b = new Float64Array(sizes[l + 1]);
    if (l === L - 1) b[0] = yMedian;
    biases.push(b);
  }
  const model: MlpModel = { ...spec, sizes, weights, biases };

  // Adam
  const mW = weights.map((w) => new Float64Array(w.length));
  const vW = weights.map((w) => new Float64Array(w.length));
  const mB = biases.map((b) => new Float64Array(b.length));
  const vB = biases.map((b) => new Float64Array(b.length));
  const gW = weights.map((w) => new Float64Array(w.length));
  const gB = biases.map((b) => new Float64Array(b.length));
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  let step = 0;

  const acts = sizes.map((s) => new Float64Array(s));
  const deltas = sizes.map((s) => new Float64Array(s));
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  const validationLossOf = () => {
    let loss = 0;
    for (let i = 0; i < valInputs.length; i++) loss += Math.abs(validation!.y[i] - forward(model, valInputs[i], acts));
    return loss / Math.max(1, valInputs.length);
  };

  const validationLoss: number[] = [];
  let bestLoss = validation ? validationLossOf() : Infinity;
  let bestEpochs = 0;
  let bestWeights = weights.map((w) => Float64Array.from(w));
  let bestBiases = biases.map((b) => Float64Array.from(b));

  for (let epoch = 0; epoch < params.maxEpochs; epoch++) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    for (let start = 0; start < n; start += params.batchSize) {
      const end = Math.min(n, start + params.batchSize);
      const m = end - start;
      for (const g of gW) g.fill(0);
      for (const g of gB) g.fill(0);
      for (let k = start; k < end; k++) {
        const idx = order[k];
        const out = forward(model, inputs[idx], acts);
        const diff = out - yArr[idx];
        deltas[L][0] = (diff > 0 ? 1 : diff < 0 ? -1 : 0) / m;
        for (let l = L - 1; l >= 0; l--) {
          const fanIn = sizes[l];
          const fanOut = sizes[l + 1];
          const W = weights[l];
          const a = acts[l];
          const dNext = deltas[l + 1];
          const dCur = deltas[l];
          if (l > 0) dCur.fill(0);
          for (let j = 0; j < fanOut; j++) {
            const d = dNext[j];
            if (d === 0) continue;
            gB[l][j] += d;
            const off = j * fanIn;
            for (let i = 0; i < fanIn; i++) {
              gW[l][off + i] += d * a[i];
              if (l > 0) dCur[i] += d * W[off + i];
            }
          }
          // Pochodna ReLU warstwy poniżej.
          if (l > 0) for (let i = 0; i < fanIn; i++) if (a[i] <= 0) dCur[i] = 0;
        }
      }
      step++;
      const c1 = 1 - Math.pow(beta1, step);
      const c2 = 1 - Math.pow(beta2, step);
      for (let l = 0; l < L; l++) {
        const W = weights[l];
        for (let k = 0; k < W.length; k++) {
          const g = gW[l][k] + params.l2 * W[k];
          mW[l][k] = beta1 * mW[l][k] + (1 - beta1) * g;
          vW[l][k] = beta2 * vW[l][k] + (1 - beta2) * g * g;
          W[k] -= (params.learningRate * (mW[l][k] / c1)) / (Math.sqrt(vW[l][k] / c2) + eps);
        }
        const b = biases[l];
        for (let k = 0; k < b.length; k++) {
          const g = gB[l][k];
          mB[l][k] = beta1 * mB[l][k] + (1 - beta1) * g;
          vB[l][k] = beta2 * vB[l][k] + (1 - beta2) * g * g;
          b[k] -= (params.learningRate * (mB[l][k] / c1)) / (Math.sqrt(vB[l][k] / c2) + eps);
        }
      }
    }

    if (validation) {
      const loss = validationLossOf();
      validationLoss.push(loss);
      if (loss < bestLoss - 1e-12) {
        bestLoss = loss;
        bestEpochs = epoch + 1;
        bestWeights = weights.map((w) => Float64Array.from(w));
        bestBiases = biases.map((b) => Float64Array.from(b));
      } else if (epoch + 1 - bestEpochs >= params.patience) {
        break;
      }
    }
  }

  if (validation) {
    model.weights = bestWeights;
    model.biases = bestBiases;
    return { model, validationLoss, bestEpochs };
  }
  return { model, validationLoss, bestEpochs: params.maxEpochs };
}
