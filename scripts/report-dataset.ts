/**
 * T-06 — raport diagnostyczny datasetu (bramka przed modelowaniem).
 *   npx tsx scripts/report-dataset.ts
 * Wszystkie liczby liczone z data/backtest-results.csv i artifacts/generate_stats.json.
 */
import fs from 'node:fs';
import { parseCSV } from '../src/dataset.js';
import {
  DATASET_CSV,
  DATASET_REPORT,
  DATASET_STATS,
  isEmbargoPeriod,
  isHoldoutPeriod,
  isTrainPeriod,
  requireArtifact,
  requireDataset,
} from '../src/paths.js';
import { quantileSorted } from '../src/stats.js';
import { MODEL_KEYS } from '../src/valuation-engine.js';

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—');
const table = (rows: [string, string | number][]) => rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n');
const hist = (m: Record<string, number>) =>
  Object.entries(m)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');

function main() {
  requireDataset();
  requireArtifact(DATASET_STATS, 'npx tsx scripts/generate-dataset.ts');
  const rows = parseCSV(DATASET_CSV);
  const stats = JSON.parse(fs.readFileSync(DATASET_STATS, 'utf-8'));
  const n = rows.length;

  const ciks = new Set(rows.map((r) => r.cik));
  const dates = [...new Set(rows.map((r) => r.asOf))].sort();
  const byYear: Record<string, number> = {};
  const byArch: Record<string, number> = {};
  const bySector: Record<string, number> = {};
  for (const r of rows) {
    byYear[r.asOf.slice(0, 4)] = (byYear[r.asOf.slice(0, 4)] ?? 0) + 1;
    byArch[r.dominantArchetype] = (byArch[r.dominantArchetype] ?? 0) + 1;
    bySector[r.sector ?? '(brak SIC)'] = (bySector[r.sector ?? '(brak SIC)'] ?? 0) + 1;
  }
  const fwd = rows.map((r) => r.fwdReturn).sort((a, b) => a - b);
  const pDefaults = rows.map((r) => r.pDefault).filter((x): x is number => x != null).sort((a, b) => a - b);
  const lowModels = rows.filter((r) => (r.validModelCount ?? 0) < 3).length;
  const lowConf = rows.filter((r) => r.lowConfidence).length;
  const labelMissingTotal = Object.values(stats.labelMissingReasons as Record<string, number>).reduce((a, b) => a + b, 0);
  const skipTotal = Object.values(stats.skipReasons as Record<string, number>).reduce((a, b) => a + b, 0);
  const dl = stats.dataLoaderStats;

  let md = `# Dataset Report\n\nWygenerowano: ${new Date().toISOString()} z \`${DATASET_CSV}\` (dataset z ${stats.generatedAt}).\n\n`;
  md += `## 1. Liczba wierszy\n\n${n}\n\n`;
  md += `## 2. Liczba unikalnych CIK\n\n${ciks.size}\n\n`;
  md += `## 3. Daty decyzji (asOf)\n\n${table([
    ['unikalne daty', dates.length],
    ['pierwsza', dates[0]],
    ['ostatnia', dates[dates.length - 1]],
    ['wiersze trening (asOf ≤ TRAIN_END_YEAR)', rows.filter((r) => isTrainPeriod(r.asOf)).length],
    ['wiersze embargo', rows.filter((r) => isEmbargoPeriod(r.asOf)).length],
    ['wiersze holdout (sejf)', rows.filter((r) => isHoldoutPeriod(r.asOf)).length],
  ])}\n\n`;
  md += `## 4. Wiersze na rok\n\n| rok | wiersze |\n|---|---|\n${hist(byYear)}\n\n`;
  md += `## 5. Wiersze na dominantArchetype\n\n| archetyp | wiersze |\n|---|---|\n${hist(byArch)}\n\n`;
  md += `## 6. Pokrycie modeli\n\n| model | wiersze z wartością | % |\n|---|---|---|\n${MODEL_KEYS.map((k) => {
    const c = rows.filter((r) => r.models[k] != null).length;
    return `| ${k} | ${c} | ${pct(c, n)} |`;
  }).join('\n')}\n\n`;
  md += `## 7. Pokrycie etykiety fwdReturn12m\n\nZ etykietą: ${n}. Bez etykiety (odrzucone): ${labelMissingTotal}.\n\n| powód braku etykiety | wiersze |\n|---|---|\n${hist(stats.labelMissingReasons)}\n\n`;
  md += `Odrzucone przed wyceną (${skipTotal} z ${stats.universeRows} pozycji uniwersum):\n\n| powód | wiersze |\n|---|---|\n${hist(stats.skipReasons)}\n\n`;
  md += `## 8. data-loader (accnMap)\n\n${table([
    ['fakty zachowane', dl.keptWithAccn],
    ['fakty odrzucone (brak accn w accnMap)', `${dl.droppedMissingAccn} (${pct(dl.droppedMissingAccn, dl.keptWithAccn + dl.droppedMissingAccn)})`],
    ['CIK uniwersum bez pliku fundamentów', dl.ciksWithoutFundamentals],
    ['CIK uniwersum bez pliku cen', dl.ciksWithoutPrices],
    ['wpisy składu indeksu z date_added > date_removed (pomijane)', stats.membershipDateAnomalies.length],
  ])}\n\n`;
  md += `## 9. Niska pewność wyceny\n\nWiersze NIE są już odrzucane — mają flagę \`lowConfidence\`.\n\n${table([
    ['lowConfidence = true', `${lowConf} (${pct(lowConf, n)})`],
    ['validModelCount < 3', `${lowModels} (${pct(lowModels, n)})`],
    ['pDefault znane', `${pDefaults.length} (${pct(pDefaults.length, n)})`],
    ['wiersze z capHits > 0', stats.capHitRows],
  ])}\n\n`;
  md += `## 10. Rozkład fwdReturn12m (zwrot całkowity, adjclose)\n\n${table([
    ['min', fwd[0].toFixed(4)],
    ['p5', quantileSorted(fwd, 0.05).toFixed(4)],
    ['p25', quantileSorted(fwd, 0.25).toFixed(4)],
    ['mediana', quantileSorted(fwd, 0.5).toFixed(4)],
    ['p75', quantileSorted(fwd, 0.75).toFixed(4)],
    ['p95', quantileSorted(fwd, 0.95).toFixed(4)],
    ['max', fwd[fwd.length - 1].toFixed(4)],
    ['wartości < -0.99 (kandydaci na bankructwa)', fwd.filter((x) => x < -0.99).length],
  ])}\n\n`;
  md += `## Dodatkowo: sektory (z kodu SIC)\n\n| sektor | wiersze |\n|---|---|\n${hist(bySector)}\n\n`;
  if (pDefaults.length) {
    md += `## Dodatkowo: rozkład pDefault\n\n${table([
      ['min', pDefaults[0].toFixed(4)],
      ['mediana', quantileSorted(pDefaults, 0.5).toFixed(4)],
      ['p95', quantileSorted(pDefaults, 0.95).toFixed(4)],
      ['max', pDefaults[pDefaults.length - 1].toFixed(4)],
    ])}\n\n`;
  }
  md += `## Bramka T-06 (fakty, bez werdyktu)\n\nUnikalne CIK: ${ciks.size} (próg z backlogu: 100). Wiersze: ${n} (próg z backlogu: 5000).\n`;

  fs.writeFileSync(DATASET_REPORT, md);
  console.log(md);
  console.log(`Zapisano ${DATASET_REPORT}`);
}

main();
