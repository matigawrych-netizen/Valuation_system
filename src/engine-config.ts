import fs from 'node:fs';
import type { BlockWeights } from './block-model.js';
import { ACCURACY_PROFILE, BLOCK_WEIGHTS } from './paths.js';
import { ARCHETYPES, BLOCKS, WEIGHT_MATRIX, type Archetype, type EngineConfig, type WeightMatrix } from './valuation-engine.js';

export interface AccuracyProfileEntry {
  medianAPE: number | null;
  n: number;
  nFolds: number;
  ci95: [number, number] | null;
}

export interface AccuracyProfileArtifact {
  generatedAt: string;
  definition: string;
  minObservations: number;
  archetypes: Partial<Record<Archetype, AccuracyProfileEntry>>;
}

export interface BlockWeightsArtifact {
  trainedAt: string;
  commitHash: string;
  trainRange: { startYear: number; endYear: number };
  optimizer: string;
  lambda: number;
  weightsByArchetype: Record<string, BlockWeights>;
  fallbackToPrior: Record<string, boolean>;
  nByArchetype: Record<string, number>;
  cvMetrics: Record<string, unknown>;
  nTrainRows: number;
  nUniqueCiks: number;
}

/** Profil dokładności do EngineConfig; null gdy artefaktu nie ma. Archetypy z n < progu mają wartość null. */
export function loadAccuracyProfile(file = ACCURACY_PROFILE): Partial<Record<Archetype, number | null>> | null {
  if (!fs.existsSync(file)) return null;
  const artifact = JSON.parse(fs.readFileSync(file, 'utf-8')) as AccuracyProfileArtifact;
  const out: Partial<Record<Archetype, number | null>> = {};
  for (const a of ARCHETYPES) out[a] = artifact.archetypes?.[a]?.medianAPE ?? null;
  return out;
}

export function loadBlockWeightsArtifact(file = BLOCK_WEIGHTS): BlockWeightsArtifact | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as BlockWeightsArtifact;
}

export function toWeightMatrix(weightsByArchetype: Record<string, Record<string, number>>): WeightMatrix {
  const m = {} as WeightMatrix;
  for (const a of ARCHETYPES) {
    const w = weightsByArchetype[a];
    if (!w) throw new Error(`Brak wag dla archetypu ${a} w artefakcie wag`);
    m[a] = Object.fromEntries(BLOCKS.map((b) => [b, w[b] ?? 0]));
  }
  return m;
}

/**
 * EngineConfig z artefaktów. `trainedWeights: false` => ekspercki WEIGHT_MATRIX (tak liczony jest dataset).
 * Zwraca też listę źródeł, żeby każdy raport mógł je wypisać.
 */
export function buildEngineConfig(opts: { trainedWeights: boolean }): { config: EngineConfig; sources: string[] } {
  const sources: string[] = [];
  let baseWeights = WEIGHT_MATRIX;
  if (opts.trainedWeights) {
    const artifact = loadBlockWeightsArtifact();
    if (!artifact) throw new Error(`Brak ${BLOCK_WEIGHTS}. Uruchom: npx tsx scripts/train.ts`);
    baseWeights = toWeightMatrix(artifact.weightsByArchetype);
    sources.push(BLOCK_WEIGHTS);
  } else {
    sources.push('WEIGHT_MATRIX (prior ekspercki)');
  }
  const accuracyProfile = loadAccuracyProfile();
  if (accuracyProfile) sources.push(ACCURACY_PROFILE);
  return { config: { baseWeights, ...(accuracyProfile ? { accuracyProfile } : {}) }, sources };
}
