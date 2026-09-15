/**
 * Historia archetypów point-in-time z datasetu.
 *   npx tsx scripts/report-archetypes.ts
 */
import fs from 'node:fs';
import { parseCSV, type Row } from '../src/dataset.js';
import { ARCHETYPE_HISTORY_MD, DATASET_CSV, ensureArtifactsDir, requireDataset } from '../src/paths.js';

function main() {
  requireDataset();
  const rows = parseCSV(DATASET_CSV);
  const byCik = new Map<string, Row[]>();
  for (const r of rows) byCik.set(r.cik, [...(byCik.get(r.cik) ?? []), r]);

  const transitions: Record<string, number> = {};
  let companies = 0;
  let changed = 0;
  let pairs = 0;
  let changedPairs = 0;
  let details = '';
  for (const [cik, list] of [...byCik.entries()].sort()) {
    list.sort((a, b) => a.asOf.localeCompare(b.asOf));
    if (list.length < 2) continue;
    companies++;
    const changes: string[] = [`${list[0].asOf} ${list[0].dominantArchetype}`];
    for (let i = 1; i < list.length; i++) {
      pairs++;
      if (list[i].dominantArchetype !== list[i - 1].dominantArchetype) {
        changedPairs++;
        const key = `${list[i - 1].dominantArchetype} → ${list[i].dominantArchetype}`;
        transitions[key] = (transitions[key] ?? 0) + 1;
        changes.push(`${list[i].asOf} ${list[i].dominantArchetype}`);
      }
    }
    if (changes.length > 1) changed++;
    details += `- ${list[0].ticker} (${cik}): ${changes.join(' → ')}\n`;
  }

  let md = `# Historia archetypów (point-in-time)\n\nWygenerowano: ${new Date().toISOString()} z ${DATASET_CSV}.\n\n`;
  md += `Spółki z ≥ 2 obserwacjami: ${companies}. Zmieniły archetyp co najmniej raz: ${changed} (${((changed / Math.max(companies, 1)) * 100).toFixed(1)}%).\n`;
  md += `Kolejne kwartały ze zmianą archetypu: ${changedPairs} z ${pairs} (${((changedPairs / Math.max(pairs, 1)) * 100).toFixed(1)}%).\n\n`;
  md += `## Przejścia\n\n| przejście | liczba |\n|---|---|\n${Object.entries(transitions).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n\n`;
  md += `## Punkty zmiany per spółka\n\n${details}`;
  ensureArtifactsDir();
  fs.writeFileSync(ARCHETYPE_HISTORY_MD, md);
  console.log(md.split('## Punkty zmiany')[0]);
  console.log(`Zapisano ${ARCHETYPE_HISTORY_MD}`);
}

main();
