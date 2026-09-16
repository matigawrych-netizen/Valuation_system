/**
 * Drzewa decyzyjne ze wzmacnianiem gradientowym (gradient boosting), strata bezwzględna — model przewiduje medianę.
 *
 * Każde kolejne małe drzewo poprawia błąd poprzednich. Wartości cech dzielone są na przedziały (jak w LightGBM),
 * brak danych ma własny przedział i przy każdym podziale trafia na tę stronę, która daje mniejszy błąd.
 * Wartość liścia = mediana reszt w liściu × krok uczenia.
 *
 * Parametry ustalone przed treningiem (docs/specjalisci.md, punkt 5) — nie dobieramy ich do wyniku egzaminu.
 */
import { quantileSorted } from './stats.js';

export interface GbmParams {
  maxDepth: number;
  learningRate: number;
  minLeaf: number;
  maxTrees: number;
  /** Zatrzymanie, gdy błąd na walidacji nie spadł od tylu drzew. */
  patience: number;
  maxBins: number;
  clipLower: number;
  clipUpper: number;
}

export const GBM_PARAMS: GbmParams = {
  maxDepth: 4,
  learningRate: 0.05,
  minLeaf: 200,
  maxTrees: 400,
  patience: 50,
  maxBins: 64,
  clipLower: 0.01,
  clipUpper: 0.99,
};

export interface GbmNode {
  /** −1 = liść. */
  feature: number;
  threshold: number;
  missingLeft: boolean;
  left: number;
  right: number;
  /** Mediana reszt w węźle × krok uczenia (w liściu: wkład drzewa; w węźle wewnętrznym: do wyjaśnień). */
  value: number;
}

export interface GbmModel {
  init: number;
  trees: GbmNode[][];
  /** Granice obcięcia cech (1. i 99. centyl danych uczących); NaN = cecha bez wartości. */
  clip: [number, number][];
}

export interface GbmTrainResult {
  model: GbmModel;
  /** Średni błąd bezwzględny na walidacji po każdym drzewie (pusty bez walidacji). */
  validationLoss: number[];
  bestTrees: number;
}

const MISSING_BIN = 255;

function medianOf(values: Float64Array): number {
  if (values.length === 0) return 0;
  const s = Float64Array.from(values).sort();
  return quantileSorted(s as unknown as number[], 0.5);
}

function clipBounds(X: Float64Array[], nF: number, params: GbmParams): [number, number][] {
  const out: [number, number][] = [];
  for (let f = 0; f < nF; f++) {
    const vals: number[] = [];
    for (const row of X) if (!Number.isNaN(row[f])) vals.push(row[f]);
    if (vals.length === 0) {
      out.push([NaN, NaN]);
      continue;
    }
    vals.sort((a, b) => a - b);
    out.push([quantileSorted(vals, params.clipLower), quantileSorted(vals, params.clipUpper)]);
  }
  return out;
}

const clipValue = (v: number, b: [number, number]) => (v < b[0] ? b[0] : v > b[1] ? b[1] : v);

/** Progi przedziałów: centyle wartości (po obcięciu), bez powtórzeń. */
function binThresholds(values: number[], maxBins: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (let k = 1; k < maxBins; k++) {
    const t = quantileSorted(sorted, k / maxBins);
    if (out.length === 0 || t > out[out.length - 1]) out.push(t);
  }
  // Próg równy maksimum nie dzieli niczego.
  while (out.length && out[out.length - 1] >= sorted[sorted.length - 1]) out.pop();
  return out;
}

/** Numer przedziału: pierwszy próg ≥ wartości (wartość ≤ próg[b] ⇔ przedział ≤ b). */
function binOf(v: number, thresholds: number[]): number {
  let lo = 0;
  let hi = thresholds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (v <= thresholds[mid]) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function predictTree(tree: GbmNode[], x: Float64Array, clip: [number, number][]): number {
  let i = 0;
  for (;;) {
    const node = tree[i];
    if (node.feature < 0) return node.value;
    const raw = x[node.feature];
    if (Number.isNaN(raw)) i = node.missingLeft ? node.left : node.right;
    else i = clipValue(raw, clip[node.feature]) <= node.threshold ? node.left : node.right;
  }
}

export function predictGbm(model: GbmModel, x: Float64Array): number {
  let f = model.init;
  for (const tree of model.trees) f += predictTree(tree, x, model.clip);
  return f;
}

/**
 * Wkład każdej cechy w prognozę (suma zmian wartości węzła wzdłuż ścieżki, metoda Saabasa).
 * Prognoza = init + Σ wartości korzeni + Σ wkładów.
 */
export function explainGbm(model: GbmModel, x: Float64Array): Float64Array {
  const contrib = new Float64Array(model.clip.length);
  for (const tree of model.trees) {
    let i = 0;
    for (;;) {
      const node = tree[i];
      if (node.feature < 0) break;
      const raw = x[node.feature];
      const next = Number.isNaN(raw)
        ? node.missingLeft
          ? node.left
          : node.right
        : clipValue(raw, model.clip[node.feature]) <= node.threshold
          ? node.left
          : node.right;
      contrib[node.feature] += tree[next].value - node.value;
      i = next;
    }
  }
  return contrib;
}

interface SplitChoice {
  feature: number;
  bin: number;
  missingLeft: boolean;
  gain: number;
}

export function trainGbm(
  X: Float64Array[],
  y: ArrayLike<number>,
  params: GbmParams = GBM_PARAMS,
  validation?: { X: Float64Array[]; y: ArrayLike<number> }
): GbmTrainResult {
  const n = X.length;
  if (n === 0) throw new Error('trainGbm: brak obserwacji.');
  if (y.length !== n) throw new Error('trainGbm: różna liczba cech i celów.');
  const nF = X[0].length;
  const clip = clipBounds(X, nF, params);

  // Przedziały cech (kolumnowo).
  const thresholds: number[][] = [];
  const bins: Uint8Array[] = [];
  for (let f = 0; f < nF; f++) {
    const vals: number[] = [];
    for (const row of X) if (!Number.isNaN(row[f])) vals.push(clipValue(row[f], clip[f]));
    const th = binThresholds(vals, Math.min(params.maxBins, 250));
    thresholds.push(th);
    const col = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const v = X[i][f];
      col[i] = Number.isNaN(v) ? MISSING_BIN : binOf(clipValue(v, clip[f]), th);
    }
    bins.push(col);
  }

  const yArr = Float64Array.from(y);
  const init = medianOf(yArr);
  const F = new Float64Array(n).fill(init);
  const residual = new Float64Array(n);
  const grad = new Float64Array(n);

  const nVal = validation?.X.length ?? 0;
  const Fval = new Float64Array(nVal).fill(init);
  const validationLoss: number[] = [];
  // Punkt odniesienia: sama mediana, bez drzew. Jeśli żadne drzewo nie pomaga, model zostaje przy niej.
  let bestLoss = Infinity;
  let bestTrees = 0;
  if (validation) {
    if (validation.y.length !== nVal) throw new Error('trainGbm: różna liczba cech i celów w walidacji.');
    let loss = 0;
    for (let i = 0; i < nVal; i++) loss += Math.abs(validation.y[i] - init);
    bestLoss = loss / Math.max(1, nVal);
  }

  const trees: GbmNode[][] = [];
  const maxBin = params.maxBins + 1;
  const histCount = new Float64Array(nF * maxBin);
  const histSum = new Float64Array(nF * maxBin);
  const missCount = new Float64Array(nF);
  const missSum = new Float64Array(nF);

  const findSplit = (idx: Int32Array): SplitChoice | null => {
    const m = idx.length;
    if (m < 2 * params.minLeaf) return null;
    histCount.fill(0);
    histSum.fill(0);
    missCount.fill(0);
    missSum.fill(0);
    let G = 0;
    for (let k = 0; k < m; k++) G += grad[idx[k]];
    for (let f = 0; f < nF; f++) {
      const col = bins[f];
      const base = f * maxBin;
      for (let k = 0; k < m; k++) {
        const i = idx[k];
        const b = col[i];
        if (b === MISSING_BIN) {
          missCount[f]++;
          missSum[f] += grad[i];
        } else {
          histCount[base + b]++;
          histSum[base + b] += grad[i];
        }
      }
    }
    const parentScore = (G * G) / m;
    let best: SplitChoice | null = null;
    for (let f = 0; f < nF; f++) {
      const nThr = thresholds[f].length;
      const base = f * maxBin;
      let cCount = 0;
      let cSum = 0;
      for (let b = 0; b < nThr; b++) {
        cCount += histCount[base + b];
        cSum += histSum[base + b];
        for (let variant = 0; variant < 2; variant++) {
          const missingLeft = variant === 1;
          const nL = cCount + (missingLeft ? missCount[f] : 0);
          const gL = cSum + (missingLeft ? missSum[f] : 0);
          const nR = m - nL;
          if (nL < params.minLeaf || nR < params.minLeaf) continue;
          const gR = G - gL;
          const gain = (gL * gL) / nL + (gR * gR) / nR - parentScore;
          if (gain > 1e-9 && (best == null || gain > best.gain)) best = { feature: f, bin: b, missingLeft, gain };
          if (missCount[f] === 0) break; // bez braków oba warianty są identyczne
        }
      }
    }
    return best;
  };

  const leafValue = (idx: Int32Array) => {
    const r = new Float64Array(idx.length);
    for (let k = 0; k < idx.length; k++) r[k] = residual[idx[k]];
    return medianOf(r) * params.learningRate;
  };

  const all = new Int32Array(n);
  for (let i = 0; i < n; i++) all[i] = i;

  for (let t = 0; t < params.maxTrees; t++) {
    for (let i = 0; i < n; i++) {
      residual[i] = yArr[i] - F[i];
      grad[i] = residual[i] > 0 ? 1 : residual[i] < 0 ? -1 : 0;
    }
    const tree: GbmNode[] = [];
    const build = (idx: Int32Array, depth: number): number => {
      const id = tree.length;
      tree.push({ feature: -1, threshold: NaN, missingLeft: false, left: -1, right: -1, value: leafValue(idx) });
      const split = depth < params.maxDepth ? findSplit(idx) : null;
      if (!split) {
        for (let k = 0; k < idx.length; k++) F[idx[k]] += tree[id].value;
        return id;
      }
      const col = bins[split.feature];
      let nL = 0;
      for (let k = 0; k < idx.length; k++) {
        const b = col[idx[k]];
        if (b === MISSING_BIN ? split.missingLeft : b <= split.bin) nL++;
      }
      const left = new Int32Array(nL);
      const right = new Int32Array(idx.length - nL);
      let li = 0;
      let ri = 0;
      for (let k = 0; k < idx.length; k++) {
        const b = col[idx[k]];
        if (b === MISSING_BIN ? split.missingLeft : b <= split.bin) left[li++] = idx[k];
        else right[ri++] = idx[k];
      }
      tree[id].feature = split.feature;
      tree[id].threshold = thresholds[split.feature][split.bin];
      tree[id].missingLeft = split.missingLeft;
      tree[id].left = build(left, depth + 1);
      tree[id].right = build(right, depth + 1);
      return id;
    };
    build(all, 0);
    trees.push(tree);

    if (validation) {
      let loss = 0;
      for (let i = 0; i < nVal; i++) {
        Fval[i] += predictTree(tree, validation.X[i], clip);
        loss += Math.abs(validation.y[i] - Fval[i]);
      }
      loss /= Math.max(1, nVal);
      validationLoss.push(loss);
      if (loss < bestLoss - 1e-12) {
        bestLoss = loss;
        bestTrees = t + 1;
      } else if (t + 1 - bestTrees >= params.patience) {
        break;
      }
    }
  }

  const kept = validation ? trees.slice(0, bestTrees) : trees;
  return { model: { init, trees: kept, clip }, validationLoss, bestTrees: validation ? bestTrees : trees.length };
}
