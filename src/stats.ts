/**
 * Jedna implementacja statystyk używanych w raportach i treningu.
 * Brak zależności zewnętrznych — wszystko liczone tutaj, testy w tests/stats.test.ts.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Wariancja z próby (dzielnik n-1). */
export function variance(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

export const std = (xs: number[]) => Math.sqrt(variance(xs));

/** Kwantyl z interpolacją liniową; `sorted` musi być posortowane rosnąco. */
export function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function quantile(xs: number[], p: number): number {
  return quantileSorted([...xs].sort((a, b) => a - b), p);
}

export const median = (xs: number[]) => quantile(xs, 0.5);

/** Rangi średnie (mid-ranks) przy wiązaniach, numerowane od 1. */
export function getRanks(arr: number[]): number[] {
  const sorted = arr.map((val, i) => ({ val, i })).sort((a, b) => a.val - b.val);
  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].val === sorted[i].val) j++;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[sorted[k].i] = rank;
    i = j;
  }
  return ranks;
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman = Pearson policzony na rangach średnich (poprawny przy wiązaniach). */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  return pearson(getRanks(xs), getRanks(ys));
}

/**
 * Wzór skrócony 1 - 6Σd²/(n(n²-1)) — poprawny WYŁĄCZNIE bez wiązań.
 * Zostawiony tylko po to, żeby test mógł pokazać różnicę względem `spearman`.
 */
export function spearmanNoTiesFormula(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return null;
  const rx = getRanks(xs);
  const ry = getRanks(ys);
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/** Deterministyczny generator liczb losowych (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Rozkłady ──

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26, |błąd| < 1.5e-7
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const ci of c) ser += ci / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_IT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_IT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularyzowana niekompletna funkcja beta I_x(a, b). */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(x, a, b)) / a;
  return 1 - (bt * betaContinuedFraction(1 - x, b, a)) / b;
}

export function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedIncompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

// ── Diebold-Mariano ──

/**
 * Wariancja długookresowa szeregu z wagami Bartletta (Newey-West) do opóźnienia `lags`.
 * Zwraca wariancję szeregu (nie średniej) — dzielić przez n, żeby dostać Var(mean).
 */
export function neweyWestLongRunVariance(d: number[], lags: number): number {
  const n = d.length;
  const m = mean(d);
  const gamma = (k: number) => {
    let s = 0;
    for (let t = k; t < n; t++) s += (d[t] - m) * (d[t - k] - m);
    return s / n;
  };
  let v = gamma(0);
  for (let k = 1; k <= Math.min(lags, n - 1); k++) {
    v += 2 * (1 - k / (lags + 1)) * gamma(k);
  }
  return v;
}

export interface DieboldMarianoResult {
  n: number;
  horizon: number;
  meanLossDiff: number; // średnia(L_A - L_B); ujemna => A ma mniejszą stratę
  se: number;
  dmStat: number; // po korekcie Harvey-Leybourne-Newbold
  pValue: number; // dwustronne, rozkład t z n-1 stopniami swobody
  ci95: [number, number];
}

/**
 * Test Diebolda-Mariano na szeregach strat (uporządkowanych w czasie).
 * Wariancja: Newey-West do rzędu h-1. Poprawka małopróbkowa HLN (1997).
 */
export function dieboldMarianoFromLosses(lossA: number[], lossB: number[], horizon: number): DieboldMarianoResult {
  if (lossA.length !== lossB.length) throw new Error('dieboldMariano: szeregi mają różne długości');
  const n = lossA.length;
  if (n < 3) throw new Error(`dieboldMariano: za mało obserwacji (n=${n})`);
  const d = lossA.map((a, i) => a - lossB[i]);
  const dbar = mean(d);
  const lrv = neweyWestLongRunVariance(d, horizon - 1);
  const se = Math.sqrt(Math.max(lrv, 0) / n);
  const h = horizon;
  const hln = Math.sqrt((n + 1 - 2 * h + (h * (h - 1)) / n) / n);

  let dmStat: number;
  let pValue: number;
  if (se === 0) {
    dmStat = dbar === 0 ? 0 : Math.sign(dbar) * Infinity;
    pValue = dbar === 0 ? 1 : 0;
  } else {
    dmStat = (dbar / se) * hln;
    pValue = 2 * (1 - studentTCdf(Math.abs(dmStat), n - 1));
  }
  return {
    n,
    horizon,
    meanLossDiff: dbar,
    se,
    dmStat,
    pValue: Math.min(1, Math.max(0, pValue)),
    ci95: [dbar - 1.96 * se, dbar + 1.96 * se],
  };
}

/** Wariant dla błędów prognoz — strata = |błąd|. */
export function dieboldMariano(errorsA: number[], errorsB: number[], horizon: number): DieboldMarianoResult {
  return dieboldMarianoFromLosses(errorsA.map(Math.abs), errorsB.map(Math.abs), horizon);
}

// ── Bootstrap ──

export interface BootstrapCI {
  estimate: number | null;
  lo: number | null;
  hi: number | null;
  B: number;
  validDraws: number;
  seed: number;
}

/**
 * Bootstrap blokowy: losuje całe grupy (np. kwartały) ze zwracaniem.
 * `stat` dostaje listę wylosowanych grup i zwraca statystykę lub null.
 */
export function bootstrapGroups<T>(
  groups: T[][],
  stat: (sample: T[][]) => number | null,
  B = 1000,
  seed = 12345
): BootstrapCI {
  const rnd = mulberry32(seed);
  const estimate = stat(groups);
  const draws: number[] = [];
  for (let b = 0; b < B; b++) {
    const sample: T[][] = [];
    for (let i = 0; i < groups.length; i++) sample.push(groups[Math.floor(rnd() * groups.length)]);
    const v = stat(sample);
    if (v != null && Number.isFinite(v)) draws.push(v);
  }
  draws.sort((a, b) => a - b);
  return {
    estimate,
    lo: draws.length ? quantileSorted(draws, 0.025) : null,
    hi: draws.length ? quantileSorted(draws, 0.975) : null,
    B,
    validDraws: draws.length,
    seed,
  };
}

// ── Algebra liniowa ──

/** Rozwiązuje A x = b eliminacją Gaussa z częściowym wyborem elementu głównego. */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error('solveLinearSystem: macierz osobliwa');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** OLS z wyrazem wolnym (dodawanym automatycznie) i minimalnym grzbietem dla stabilności. */
export function olsFit(X: number[][], y: number[], ridge = 1e-8): { intercept: number; coefs: number[] } {
  const p = X[0].length + 1;
  const XtX = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const Xty = new Array<number>(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const row = [1, ...X[i]];
    for (let a = 0; a < p; a++) {
      Xty[a] += row[a] * y[i];
      for (let c = 0; c < p; c++) XtX[a][c] += row[a] * row[c];
    }
  }
  for (let a = 1; a < p; a++) XtX[a][a] += ridge * X.length;
  const beta = solveLinearSystem(XtX, Xty);
  return { intercept: beta[0], coefs: beta.slice(1) };
}

/** Wartości własne macierzy symetrycznej (metoda Jacobiego). */
export function symmetricEigenvalues(A: number[][]): number[] {
  const n = A.length;
  const a = A.map((r) => [...r]);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
      }
    }
  }
  return a.map((r, i) => r[i]).sort((x, y) => y - x);
}

/** Wskaźnik uwarunkowania macierzy symetrycznej dodatnio półokreślonej: |λ|max / |λ|min. */
export function conditionNumberFromEigen(eigenvalues: number[]): number {
  const abs = eigenvalues.map(Math.abs);
  const min = Math.min(...abs);
  return min > 0 ? Math.max(...abs) / min : Infinity;
}

/** AUC (Mann-Whitney z rangami średnimi); null gdy brak jednej z klas. */
export function aucScore(scores: number[], labels: (0 | 1)[]): number | null {
  const nPos = labels.filter((l) => l === 1).length;
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return null;
  const ranks = getRanks(scores);
  let sumPos = 0;
  labels.forEach((l, i) => {
    if (l === 1) sumPos += ranks[i];
  });
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export function correlationMatrix(columns: number[][]): (number | null)[][] {
  return columns.map((ci) => columns.map((cj) => pearson(ci, cj)));
}
