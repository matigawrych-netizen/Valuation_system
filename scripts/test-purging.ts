/**
 * T-10 — test wycieku, który MOŻE zawieść, na rzeczywistym datasecie.
 *   npx tsx scripts/test-purging.ts
 * Sprawdza wynik splitFold niezależną definicją wycieku, wstrzykuje wiersz-pułapkę i raportuje
 * rzeczywisty odsetek wypurgowanych obserwacji. Kod wyjścia 1 przy jakimkolwiek wycieku.
 */
import fs from 'node:fs';
import { parseCSV, type Row } from '../src/dataset.js';
import { DATASET_CSV, MASK_PERIODS, PURGING_REPORT, ensureArtifactsDir, isTrainPeriod, requireDataset } from '../src/paths.js';
import { addMonths, blockBounds, leaksIntoBlock, splitFold } from '../src/purging.js';

function main() {
  requireDataset();
  const rows = parseCSV(DATASET_CSV).filter((r) => isTrainPeriod(r.asOf));
  let md = `# Purging — raport\n\nWygenerowano: ${new Date().toISOString()}. Wiersze okresu treningowego: ${rows.length}.\n\n`;
  md += '| fold | test | train | wypurgowane | % wypurgowanych (z puli treningowej) | wycieki (niezależny test) | wiersz-pułapka wykryty |\n|---|---|---|---|---|---|---|\n';

  let failures = 0;
  let totalPool = 0;
  let totalPurged = 0;
  for (const block of MASK_PERIODS) {
    const { train, test, purged } = splitFold(rows, block);
    const leaks = train.filter((r) => leaksIntoBlock(r.asOf, block));

    const trapAsOf = addMonths(blockBounds(block).start, -6).toISOString().slice(0, 10);
    const trap: Row = { ...rows[0], cik: 'TRAP', asOf: trapAsOf };
    const trapDetected = leaksIntoBlock(trapAsOf, block);
    const trapInTrain = splitFold([trap], block).train.length > 0;

    if (leaks.length || !trapDetected || trapInTrain) failures++;
    const pool = train.length + purged.length;
    totalPool += pool;
    totalPurged += purged.length;
    md += `| ${block.startYear}-${block.endYear} | ${test.length} | ${train.length} | ${purged.length} | ${((purged.length / Math.max(pool, 1)) * 100).toFixed(1)}% | ${leaks.length} | ${trapDetected && !trapInTrain ? 'tak' : 'NIE'} |\n`;
  }
  md += `\nŁącznie wypurgowane: ${totalPurged} z ${totalPool} (${((totalPurged / Math.max(totalPool, 1)) * 100).toFixed(2)}%).\n`;
  md += failures ? `\n**Wykryto problemy w ${failures} foldach.**\n` : '\nW żadnym foldzie nie wykryto wycieku; wiersz-pułapka był usuwany w każdym foldzie.\n';

  ensureArtifactsDir();
  fs.writeFileSync(PURGING_REPORT, md);
  console.log(md);
  if (failures) process.exit(1);
}

main();
