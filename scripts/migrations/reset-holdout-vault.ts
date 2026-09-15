/**
 * Jednorazowa migracja (T-11): archiwizuje stary holdout_log.json z katalogu głównego i zakłada nowy log
 * z jednym wpisem RESET. Historia nie jest kasowana — stary log zostaje w artifacts/ pod nazwą z datą.
 *   npx tsx scripts/migrations/reset-holdout-vault.ts
 */
import fs from 'node:fs';
import { gitState, readHoldoutLog, type HoldoutReset } from '../../src/holdout-vault.js';
import { ARTIFACTS_DIR, HOLDOUT_LOG, ensureArtifactsDir } from '../../src/paths.js';

const LEGACY_LOG = 'holdout_log.json';

function main() {
  if (!fs.existsSync(LEGACY_LOG)) {
    console.error(`Brak ${LEGACY_LOG} w katalogu głównym — migracja była już wykonana albo plik przeniesiono.`);
    process.exit(1);
  }
  const legacy = JSON.parse(fs.readFileSync(LEGACY_LOG, 'utf-8')) as any[];
  const date = new Date().toISOString().slice(0, 10);
  ensureArtifactsDir();
  const archived = `${ARTIFACTS_DIR}/holdout_log.archived-${date}.json`;
  fs.copyFileSync(LEGACY_LOG, archived);

  const reset: HoldoutReset = {
    type: 'RESET',
    date: new Date().toISOString(),
    commitHash: gitState().hash ?? 'NO_GIT_TRACKING',
    invalidatedTouches: legacy.length,
    reason:
      `Dotknięcia 1–${legacy.length} (${legacy[0]?.date} … ${legacy[legacy.length - 1]?.date}) wykonano w kilkanaście sekund na n=${legacy[0]?.results?.n} ` +
      'wierszach: kolumna daty nie była rozpoznawana (każdy wiersz dostawał 2000-01-01), więc zbiór holdout był pusty i skrypt po cichu ' +
      'podstawiał cały zbiór treningowy, używając równych wag zamiast wytrenowanych. Nie stanowiły ewaluacji modelu — patrz T-01, T-03, T-11.',
    archivedLog: archived,
  };
  const existing = readHoldoutLog(HOLDOUT_LOG);
  fs.writeFileSync(HOLDOUT_LOG, JSON.stringify([...existing, reset], null, 2));
  fs.unlinkSync(LEGACY_LOG);
  console.log(`Zarchiwizowano ${LEGACY_LOG} -> ${archived}; ${HOLDOUT_LOG} zawiera wpis RESET (unieważnione dotknięcia: ${legacy.length}).`);
}

main();
