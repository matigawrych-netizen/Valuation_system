/**
 * T-11/T-33 — jedyna ścieżka dotknięcia zbioru holdout (sejfu).
 *   npx tsx scripts/evaluate-holdout.ts "<szczegółowy opis zmian od poprzedniej próby>"
 *
 * Kolejność: warunki wstępne (bez zużycia dotknięcia) → obliczenia → zapis dotknięcia.
 * Niespełniony warunek albo błąd obliczeń => kod 1 i BRAK wpisu w logu.
 */
import fs from 'node:fs';
import { predictRows } from '../src/block-model.js';
import { groupByQuarter, parseCSV } from '../src/dataset.js';
import { loadBlockWeightsArtifact } from '../src/engine-config.js';
import { evaluate } from '../src/evaluation-harness.js';
import { gitState, recordTouch, vaultStatus } from '../src/holdout-vault.js';
import { BLOCK_WEIGHTS, DATASET_CSV, HOLDOUT_END_YEAR, HOLDOUT_START_YEAR, isHoldoutPeriod, isTrainPeriod } from '../src/paths.js';
import { dieboldMarianoFromLosses, mean } from '../src/stats.js';

const MIN_HOLDOUT_ROWS = 500;
const LABEL_HORIZON_QUARTERS = 4;

function fail(msg: string): never {
  console.error(`[HOLDOUT] ${msg}`);
  console.error('[HOLDOUT] Dotknięcie NIE zostało zużyte.');
  process.exit(1);
}

function main() {
  const description = process.argv.slice(2).join(' ').trim();
  if (description.length < 10) fail('Użycie: npx tsx scripts/evaluate-holdout.ts "szczegółowy opis zmian (min. 10 znaków)"');

  const status = vaultStatus();
  if (status.locked) fail(`Sejf zablokowany (${status.activeTouches}/${status.maxTouches} dotknięć).`);

  // ── Warunki wstępne ──
  const weights = loadBlockWeightsArtifact();
  if (!weights || !Object.keys(weights.weightsByArchetype ?? {}).length) fail(`Brak lub pusty ${BLOCK_WEIGHTS} (uruchom scripts/train.ts).`);
  const git = gitState();
  if (!git.hash || !git.clean) fail(`Git: ${git.problem}.`);
  if (!fs.existsSync(DATASET_CSV)) fail(`Brak datasetu ${DATASET_CSV}.`);
  const rows = parseCSV(DATASET_CSV);
  const holdout = rows.filter((r) => isHoldoutPeriod(r.asOf));
  const train = rows.filter((r) => isTrainPeriod(r.asOf));
  if (holdout.length < MIN_HOLDOUT_ROWS) fail(`Zbiór holdout ${HOLDOUT_START_YEAR}-${HOLDOUT_END_YEAR} ma ${holdout.length} wierszy (< ${MIN_HOLDOUT_ROWS}).`);
  const trainDates = new Set(train.map((r) => r.asOf));
  const overlap = [...new Set(holdout.map((r) => r.asOf))].filter((d) => trainDates.has(d));
  if (overlap.length) fail(`Daty holdoutu występują w zbiorze treningowym: ${overlap.join(', ')}`);

  // ── Obliczenia (wagi wyłącznie z artefaktu) ──
  const preds = predictRows(holdout, weights.weightsByArchetype);
  const ev = evaluate(
    preds.map((p) => p.pred),
    preds.map((p) => p.row.fwdReturn),
    preds.map((p) => ({ quarter: p.row.asOf }))
  );
  const quarters = [...groupByQuarter(preds.map((p) => ({ ...p, asOf: p.row.asOf }))).values()];
  const dmVsRandomWalk = dieboldMarianoFromLosses(
    quarters.map((q) => mean(q.map((p) => Math.abs(p.pred - p.row.fwdReturn)))),
    quarters.map((q) => mean(q.map((p) => Math.abs(0 - p.row.fwdReturn)))),
    LABEL_HORIZON_QUARTERS
  );
  const results = {
    range: { startYear: HOLDOUT_START_YEAR, endYear: HOLDOUT_END_YEAR },
    weightsArtifact: { file: BLOCK_WEIGHTS, trainedAt: weights.trainedAt, commitHash: weights.commitHash },
    n: preds.length,
    nQuarters: ev.IC_by_quarter.nQuarters,
    IC_by_quarter_mean: ev.IC_by_quarter.mean,
    IC_t_stat: ev.IC_t_stat,
    decile_spread_gross: ev.decile_spread,
    meanAbsError: ev.meanAbsError,
    hitRate: ev.hitRate,
    dmVsRandomWalk,
    pValueThreshold: status.nextPValueThreshold,
  };
  console.log(JSON.stringify(results, null, 2));

  const entry = recordTouch(description, results);
  console.log(`[HOLDOUT] Zarejestrowano dotknięcie ${status.activeTouches + 1}/${status.maxTouches} (commit ${entry.commitHash}).`);
}

main();
