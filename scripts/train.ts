/**
 * T-15/T-16 — wagi bloków per archetyp, walk-forward CV z purgingiem, zapis artefaktu.
 *
 *   npx tsx scripts/train.ts [--optimizer subgradient|random] [--seed 1]
 *
 * Rola (docs/architecture-decisions.md, D-01): narzędzie diagnostyczne IC bloków + wagi do ewaluacji holdoutu.
 * Funkcja celu: L1 między (Σ w·blok/cena, renormalizowane) a (1 + zwrot 12M), kara λ‖w − prior‖².
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fitArchetypeWeights, walkForward, type Optimizer } from '../src/block-model.js';
import { parseCSV } from '../src/dataset.js';
import {
  BLOCK_WEIGHTS,
  DATA_START_YEAR,
  DATASET_CSV,
  MASK_PERIODS,
  OOS_PREDICTIONS_CSV,
  TRAIN_END_YEAR,
  assertMaskPeriodsWithinTraining,
  ensureArtifactsDir,
  isTrainPeriod,
  requireDataset,
} from '../src/paths.js';
import { mean, std } from '../src/stats.js';

const LAMBDA_GRID = [0, 0.01, 0.1, 1, 10, 100];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function commitHash(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'NO_GIT_TRACKING';
  }
}

function main() {
  const optimizerName = arg('optimizer') ?? 'subgradient';
  if (optimizerName !== 'subgradient' && optimizerName !== 'random') {
    throw new Error(`Nieznany optymalizator: ${optimizerName} (dozwolone: subgradient, random)`);
  }
  const optimizer: Optimizer = optimizerName === 'random' ? { kind: 'random', seed: Number(arg('seed') ?? 1) } : { kind: 'subgradient' };
  assertMaskPeriodsWithinTraining(MASK_PERIODS);

  requireDataset();
  const rows = parseCSV(DATASET_CSV).filter((r) => isTrainPeriod(r.asOf));
  console.log(`Wiersze okresu treningowego ${DATA_START_YEAR}-${TRAIN_END_YEAR}: ${rows.length}, foldy: ${MASK_PERIODS.length}`);

  const t0 = Date.now();
  const grid = LAMBDA_GRID.map((lambda) => {
    const folds = walkForward(rows, MASK_PERIODS, lambda, optimizer);
    const val = folds.map((f) => f.valL1).filter(Number.isFinite);
    const tr = folds.map((f) => f.trainL1).filter(Number.isFinite);
    const res = {
      lambda,
      meanTrainL1: mean(tr),
      meanValL1: mean(val),
      stdValL1: std(val),
      meanPurgedShare: mean(folds.map((f) => f.purgedShare)),
      folds,
    };
    console.log(
      `λ=${String(lambda).padEnd(5)} train L1 ${res.meanTrainL1.toFixed(4)} | val L1 ${res.meanValL1.toFixed(4)} ± ${res.stdValL1.toFixed(4)} | purged ${(res.meanPurgedShare * 100).toFixed(1)}%`
    );
    return res;
  });

  const best = grid.reduce((a, b) => (b.meanValL1 < a.meanValL1 ? b : a));
  const isIC = best.folds.map((f) => f.isIC).filter((v): v is number => v != null);
  const oosIC = best.folds.map((f) => f.oosIC).filter((v): v is number => v != null);
  const isICMean = isIC.length ? mean(isIC) : null;
  const oosICMean = oosIC.length ? mean(oosIC) : null;
  const final = fitArchetypeWeights(rows, best.lambda, optimizer);

  console.log('\nFold | test | train | purged% | train L1 | val L1 | IC IS | IC OOS');
  for (const f of best.folds) {
    console.log(
      `${f.block.startYear}-${f.block.endYear} | ${f.nTest} | ${f.nTrain} | ${(f.purgedShare * 100).toFixed(1)} | ${f.trainL1.toFixed(4)} | ${f.valL1.toFixed(4)} | ${f.isIC?.toFixed(4) ?? '—'} | ${f.oosIC?.toFixed(4) ?? '—'}`
    );
  }

  ensureArtifactsDir();
  const artifact = {
    trainedAt: new Date().toISOString(),
    commitHash: commitHash(),
    trainRange: { startYear: DATA_START_YEAR, endYear: TRAIN_END_YEAR },
    optimizer: optimizer.kind === 'random' ? `random-search(seed=${optimizer.seed})` : 'projected-subgradient-L1',
    lambda: best.lambda,
    weightsByArchetype: final.weights,
    fallbackToPrior: final.fallbackToPrior,
    nByArchetype: final.nByArchetype,
    cvMetrics: {
      nFolds: best.folds.filter((f) => f.nTest > 0).length,
      emptyFolds: best.folds.filter((f) => f.nTest === 0).map((f) => `${f.block.startYear}-${f.block.endYear}`),
      meanValL1: best.meanValL1,
      stdValL1: best.stdValL1,
      meanTrainL1: best.meanTrainL1,
      isICMean,
      oosICMean,
      degradationRelative: isICMean != null && oosICMean != null && isICMean !== 0 ? (isICMean - oosICMean) / Math.abs(isICMean) : null,
      lambdaGrid: grid.map((g) => ({ lambda: g.lambda, meanTrainL1: g.meanTrainL1, meanValL1: g.meanValL1, stdValL1: g.stdValL1 })),
      folds: best.folds.map((f) => ({
        block: f.block,
        nTrain: f.nTrain,
        nTest: f.nTest,
        nPurged: f.nPurged,
        purgedShare: f.purgedShare,
        trainL1: f.trainL1,
        valL1: f.valL1,
        isIC: f.isIC,
        oosIC: f.oosIC,
      })),
    },
    nTrainRows: rows.length,
    nUniqueCiks: new Set(rows.map((r) => r.cik)).size,
    runtimeSec: Math.round((Date.now() - t0) / 1000),
  };
  fs.writeFileSync(BLOCK_WEIGHTS, JSON.stringify(artifact, null, 2));

  const oosLines = ['cik,asOf,dominantArchetype,foldStart,foldEnd,predReturn,fwdReturn12m'];
  for (const f of best.folds) {
    for (const p of f.oos) {
      oosLines.push([p.row.cik, p.row.asOf, p.row.dominantArchetype, f.block.startYear, f.block.endYear, p.pred, p.row.fwdReturn].join(','));
    }
  }
  fs.writeFileSync(OOS_PREDICTIONS_CSV, `${oosLines.join('\n')}\n`);

  console.log(`\nWybrana λ=${best.lambda}. IC IS ${isICMean?.toFixed(4) ?? '—'} → OOS ${oosICMean?.toFixed(4) ?? '—'}`);
  console.log(`Zapisano ${BLOCK_WEIGHTS} i ${OOS_PREDICTIONS_CSV}`);
}

main();
