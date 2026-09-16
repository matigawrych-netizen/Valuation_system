/**
 * Krok (d), przygotowanie: cechy dopisywane do panelu pełnego uniwersum dla specjalistów.
 *   npm run specialists:features
 *
 *  • zmiana kursu od 12 do 1 miesiąca przed decyzją (z dywidendami) — z notowań spółki,
 *  • zmiana liczby akcji w roku — z wiersza panelu tej samej spółki sprzed roku.
 *
 * Notowania czytane po jednej spółce (mało pamięci). Wynik: <UNIVERSE_DATA_DIR>/panel/specialist-extras.csv
 */
import fs from 'node:fs';
import { parsePanel } from '../src/facts-panel.js';
import { universeDir } from '../src/paths.js';
import { EXTRAS_HEADER, momentum12to1, shareChangeByRow } from '../src/specialist-features.js';
import { loadPriceFile } from '../src/universe.js';

const cell = (v: number | null) => (v == null || !Number.isFinite(v) ? '' : String(Number(v.toPrecision(8))));

async function main() {
  const panelFile = universeDir('panel', 'facts-panel.csv');
  const pricesDir = universeDir('prices');
  const target = universeDir('panel', 'specialist-extras.csv');
  const rows = parsePanel(panelFile);
  if (rows.length === 0) throw new Error(`Panel ${panelFile} jest pusty.`);
  const shareChange = shareChangeByRow(rows);

  const byCik = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byCik.get(r.cik) ?? [];
    list.push(r);
    byCik.set(r.cik, list);
  }

  const tmp = `${target}.tmp`;
  const out = fs.createWriteStream(tmp);
  out.write(EXTRAS_HEADER + '\n');
  let withMomentum = 0;
  let withShareChange = 0;
  let i = 0;
  const started = Date.now();
  for (const [cik, list] of byCik) {
    i++;
    if (i % 200 === 0) {
      const left = Math.round((((Date.now() - started) / i) * (byCik.size - i)) / 60000);
      console.error(`  ${i}/${byCik.size} spółek (zostało ok. ${left} min)`);
    }
    const file = `${pricesDir}/CIK${cik}.json`;
    const series = fs.existsSync(file) ? loadPriceFile(file) : null;
    if (!series) throw new Error(`Spółka ${cik} jest w panelu, ale nie ma notowań w ${file}. Panel jest nieaktualny.`);
    for (const r of list) {
      const m = momentum12to1(series, r.asOf);
      const s = shareChange.get(`${r.cik}|${r.asOf}`) ?? null;
      if (m != null) withMomentum++;
      if (s != null) withShareChange++;
      out.write(`${r.cik},${r.asOf},${cell(m)},${cell(s)}\n`);
    }
  }
  await new Promise<void>((resolve) => out.end(resolve));
  fs.renameSync(tmp, target);
  console.error(`Zapisano ${target}: ${rows.length} wierszy.`);
  console.error(`  zmiana kursu 12-1: ${withMomentum} (${((withMomentum / rows.length) * 100).toFixed(1)}%)`);
  console.error(`  zmiana liczby akcji: ${withShareChange} (${((withShareChange / rows.length) * 100).toFixed(1)}%)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
