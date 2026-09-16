import fs from 'node:fs';

/**
 * Jedyne miejsce w repo z nazwami plików artefaktów i granicami podziału danych.
 * Uzasadnienie podziału: docs/data-splits.md.
 */

// Klucze API (FRED_API_KEY itd.) z pliku .env w katalogu projektu — bez ustawiania zmiennych ręcznie.
if (fs.existsSync('.env')) process.loadEnvFile('.env');

// ── Dane wejściowe (cache) ──
export const DATA_DIR = 'data';
export const MEMBERSHIP_JSON = 'data/meta/index_membership.json';
export const ACCN_MAP_JSON = 'data/meta/accnMap.json';
export const FRED_PIT_JSON = 'data/macro/fred-pit.json';
export const SEC_EVENTS_JSON = 'data/meta/sec-events.json';
/** SPY z Yahoo (kurs skorygowany o dywidendy) — punkt odniesienia K2. Nie trafia do repozytorium. */
export const SPY_JSON = 'data/macro/SPY.json';

// ── Dataset ──
export const DATASET_CSV = 'data/backtest-results.csv';
export const SNAPSHOTS_JSONL = 'data/snapshots.jsonl';
export const LEGACY_YAHOO_BACKTEST_CSV = 'data/legacy-yahoo-backtest.csv';
export const FACTS_PANEL_CSV = 'data/facts-panel.csv';

// ── Artefakty ──
export const ARTIFACTS_DIR = 'artifacts';
export const DATASET_STATS = 'artifacts/generate_stats.json';
export const DATASET_REPORT = 'artifacts/dataset-report.md';
export const ENSEMBLE_WEIGHTS = 'artifacts/ENSEMBLE_WEIGHTS.json';
export const EVOLVE_CHECKPOINT_PREFIX = 'artifacts/evolve-checkpoint-';
export const EVOLVE_HISTORY_CSV = 'artifacts/evolve-fitness-history.csv';
export const EVOLVE_SUMMARY_MD = 'artifacts/evolve-summary.md';
export const BLOCK_WEIGHTS = 'artifacts/block-weights.json';
export const OOS_PREDICTIONS_CSV = 'artifacts/oos-predictions.csv';
export const DEFAULT_MODEL = 'artifacts/default-model.json';
export const DEFAULT_MODEL_REPORT = 'artifacts/default-model-report.md';
export const ACCURACY_PROFILE = 'artifacts/accuracy-profile.json';
export const HOLDOUT_LOG = 'artifacts/holdout_log.json';
export const PURGING_REPORT = 'artifacts/purging-report.md';
export const CALIBRATION_REPORT = 'artifacts/calibration-report.md';
export const CALIBRATION_JSON = 'artifacts/calibration-report.json';
export const BENCHMARKS_REPORT = 'artifacts/benchmarks-report.md';
export const BENCHMARKS_JSON = 'artifacts/benchmarks-report.json';
export const DECILE_REPORT = 'artifacts/decile-report.md';
export const DECILE_JSON = 'artifacts/decile-report.json';
export const MACRO_CAP_REPORT = 'artifacts/macro-cap-report.md';
export const ENSEMBLE_DIVERSITY_REPORT = 'artifacts/ensemble-diversity.md';
export const ENSEMBLE_DIVERSITY_JSON = 'artifacts/ensemble-diversity.json';
export const STABILITY_REPORT = 'artifacts/stability-report.md';
export const CORPSES_TEST_JSON = 'artifacts/corpses-test.json';
export const GONOGO_REPORT = 'artifacts/gonogo-report.md';
export const ARCHETYPE_HISTORY_MD = 'artifacts/archetypes-history.md';
export const EXPERT_REPLAY_PREFIX = 'artifacts/expert-replay-';
export const SEC_EVENTS_REPORT = 'artifacts/sec-events-report.md';
export const FACTS_PANEL_STATS = 'artifacts/facts-panel-stats.json';
export const FACTS_REPORT = 'artifacts/facts-report.md';
export const FACTS_JSON = 'artifacts/facts.json';
export const FACTS_STABILITY_REPORT = 'artifacts/facts-stability.md';
export const FACTS_STABILITY_JSON = 'artifacts/facts-stability.json';
export const BANDS_CALIBRATION_JSON = 'artifacts/bands-calibration.json';
export const ACCEPTANCE_CRITERIA_DOC = 'docs/acceptance-criteria.md';
export const SPECIALISTS_EXAM_REPORT = 'artifacts/universe/specialists-exam.md';
export const SPECIALISTS_EXAM_JSON = 'artifacts/universe/specialists-exam.json';

// ── Pełne uniwersum spółek (duże dane poza repozytorium, katalog z .env) ──

/** Kapitalizacja, od której spółka wchodzi do uniwersum w dniu decyzji (liczona point-in-time). */
export const UNIVERSE_MIN_MARKET_CAP = 1e9;
/**
 * Próg wstępnego wyboru spółek do pobrania: wartość akcji w wolnym obrocie. Niższy niż próg kapitalizacji,
 * bo float nie obejmuje akcji osób powiązanych ze spółką (zmierzone zaniżenie: 10. centyl −14%).
 */
export const UNIVERSE_CANDIDATE_MIN_FLOAT = 5e8;

/** Katalog danych pełnego uniwersum. Brak ustawienia to błąd, a nie cicha wartość domyślna. */
export function universeDir(...parts: string[]): string {
  const root = process.env.UNIVERSE_DATA_DIR;
  if (!root) {
    throw new Error('Brak UNIVERSE_DATA_DIR w pliku .env — to katalog na dane pełnego uniwersum (kilkanaście GB).');
  }
  if (!fs.existsSync(root)) {
    throw new Error(`Katalog UNIVERSE_DATA_DIR nie istnieje: ${root}`);
  }
  return [root, ...parts].join('/');
}

export interface FactsTarget {
  label: string;
  panel: string;
  factsJson: string;
  factsReport: string;
  bandsCalibration: string;
  stabilityReport: string;
  stabilityJson: string;
}

/** Panel i artefakty faktów: domyślnie S&P, z flagą `--universe` pełne uniwersum. */
export function factsTarget(argv: string[] = process.argv): FactsTarget {
  if (argv.includes('--universe')) {
    return {
      label: 'pełne uniwersum (NYSE + Nasdaq, kapitalizacja ≥ 1 mld USD)',
      panel: universeDir('panel', 'facts-panel.csv'),
      factsJson: 'artifacts/universe/facts.json',
      factsReport: 'artifacts/universe/facts-report.md',
      bandsCalibration: 'artifacts/universe/bands-calibration.json',
      stabilityReport: 'artifacts/universe/facts-stability.md',
      stabilityJson: 'artifacts/universe/facts-stability.json',
    };
  }
  return {
    label: 'S&P 500 (skład indeksu point-in-time)',
    panel: FACTS_PANEL_CSV,
    factsJson: FACTS_JSON,
    factsReport: FACTS_REPORT,
    bandsCalibration: BANDS_CALIBRATION_JSON,
    stabilityReport: FACTS_STABILITY_REPORT,
    stabilityJson: FACTS_STABILITY_JSON,
  };
}

// ── Podział czasowy (rok daty decyzji `asOf`) ──
export const DATA_START_YEAR = 2006;
export const TRAIN_END_YEAR = 2021;
export const EMBARGO_YEAR = 2022;
export const HOLDOUT_START_YEAR = 2023;
export const HOLDOUT_END_YEAR = 2025;
/** Ostatni rok kwartału fiskalnego w osi czasu (Q4 tego roku ma datę decyzji w lutym roku następnego). */
export const DATA_END_YEAR = HOLDOUT_END_YEAR;

/** Podział czasowy wewnątrz okresu treningowego dla modelu bankructwa (dobór λ / ocena OOS). */
export const DEFAULT_MODEL_INNER_VAL_START_YEAR = 2014;
export const DEFAULT_MODEL_TEST_START_YEAR = 2018;

export const LABEL_HORIZON_MONTHS = 12;
export const EMBARGO_MONTHS = 3;
export const MASK_BLOCK_YEARS = 2;

export interface YearBlock {
  startYear: number;
  endYear: number;
}

/** Bloki walk-forward CV: 2-letnie, wyłącznie w okresie treningowym. */
export const MASK_PERIODS: YearBlock[] = (() => {
  const blocks: YearBlock[] = [];
  for (let y = DATA_START_YEAR; y + MASK_BLOCK_YEARS - 1 <= TRAIN_END_YEAR; y += MASK_BLOCK_YEARS) {
    blocks.push({ startYear: y, endYear: y + MASK_BLOCK_YEARS - 1 });
  }
  return blocks;
})();

export function assertMaskPeriodsWithinTraining(periods: YearBlock[]): void {
  for (const p of periods) {
    if (p.endYear > TRAIN_END_YEAR || p.startYear < DATA_START_YEAR) {
      throw new Error(
        `Blok ${p.startYear}-${p.endYear} wykracza poza okres treningowy ${DATA_START_YEAR}-${TRAIN_END_YEAR}.`
      );
    }
  }
}

export function asOfYear(asOf: string): number {
  return Number(asOf.slice(0, 4));
}

export const isTrainPeriod = (asOf: string) => asOfYear(asOf) <= TRAIN_END_YEAR;
export const isEmbargoPeriod = (asOf: string) => asOfYear(asOf) === EMBARGO_YEAR;
export const isHoldoutPeriod = (asOf: string) => {
  const y = asOfYear(asOf);
  return y >= HOLDOUT_START_YEAR && y <= HOLDOUT_END_YEAR;
};

export function requireDataset(): void {
  if (!fs.existsSync(DATASET_CSV)) {
    console.error(`Brak datasetu w ${DATASET_CSV}. Uruchom: npx tsx scripts/generate-dataset.ts`);
    process.exit(1);
  }
}

export function requireArtifact(file: string, producer: string): void {
  if (!fs.existsSync(file)) {
    console.error(`Brak artefaktu ${file}. Uruchom: ${producer}`);
    process.exit(1);
  }
}

export function ensureArtifactsDir(): void {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}
