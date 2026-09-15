import fs from 'node:fs';
import { DEFAULT_MODEL } from './paths.js';

export interface DefaultModelArtifact {
  kind: 'logistic-regression';
  featureNames: string[];
  weights: number[];
  /** Wyraz wolny z treningu na próbie z downsamplingiem negatywów. */
  intercept: number;
  /** intercept + ln(negativeKeepRate) — koryguje zawyżone szanse po downsamplingu. */
  interceptAdjusted: number;
  means: number[];
  stds: number[];
  negativeKeepRate: number;
  seed: number;
  l2: number;
  trainRange: { startYear: number; endYear: number };
  oosAUC: number | null;
  nTrain: number;
  nTest: number;
  nDefaults: number;
  commitHash: string;
  trainedAt: string;
}

let cache: { file: string; model: DefaultModelArtifact | null } | null = null;

function validate(m: DefaultModelArtifact, file: string): DefaultModelArtifact {
  const k = m.featureNames?.length ?? 0;
  if (!k || m.weights?.length !== k || m.means?.length !== k || m.stds?.length !== k) {
    throw new Error(`${file}: niespójne długości wektorów modelu`);
  }
  m.stds.forEach((s, j) => {
    if (!(s > 0)) throw new Error(`${file}: odchylenie cechy ${m.featureNames[j]} = ${s} (cecha stała)`);
  });
  return m;
}

/** Wczytuje artefakt raz. Zwraca null, gdy pliku nie ma — wywołujący MUSI to zgłosić jako ostrzeżenie. */
export function loadDefaultModel(file = DEFAULT_MODEL): DefaultModelArtifact | null {
  if (cache && cache.file === file) return cache.model;
  const model = fs.existsSync(file) ? validate(JSON.parse(fs.readFileSync(file, 'utf-8')), file) : null;
  cache = { file, model };
  return model;
}

export function resetDefaultModelCache(): void {
  cache = null;
}

export function predictDefaultProbability(features: Record<string, number | null>, model: DefaultModelArtifact): number {
  let z = model.interceptAdjusted;
  model.featureNames.forEach((name, j) => {
    const x = features[name];
    if (x == null || !Number.isFinite(x)) throw new Error(`predictDefaultProbability: brak cechy ${name}`);
    z += model.weights[j] * ((x - model.means[j]) / model.stds[j]);
  });
  return 1 / (1 + Math.exp(-z));
}
