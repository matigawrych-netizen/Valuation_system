/**
 * T-23 — aktywacja i wrażliwość limitu mnożnika makro (macroCap).
 *   npx tsx scripts/report-macro-cap.ts
 * Przelicza wyceny z data/snapshots.jsonl (okres treningowy) dla różnych wartości capa.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { evaluate } from '../src/evaluation-harness.js';
import { DATASET_CSV, ENSEMBLE_WEIGHTS, MACRO_CAP_REPORT, SNAPSHOTS_JSONL, asOfYear, ensureArtifactsDir, TRAIN_END_YEAR, requireArtifact } from '../src/paths.js';
import { parseCSV } from '../src/dataset.js';
import { WEIGHT_MATRIX, calculateFairValue, type EngineConfig } from '../src/valuation-engine.js';

const CAPS = [0.1, 0.15, 0.25, 0.4, Infinity];

async function main() {
  requireArtifact(SNAPSHOTS_JSONL, 'npx tsx scripts/generate-dataset.ts');
  const datasetRows = parseCSV(DATASET_CSV);
  const withHits = datasetRows.filter((r) => (r.capHits ?? 0) > 0).length;

  // Źródło modyfikatorów makro: tylko artefakty produkcyjne. Żaden obecny artefakt ich nie zawiera.
  let macroModifiers: EngineConfig['macroModifiers'];
  let modifiersSource = 'brak — żaden artefakt (block-weights.json, ENSEMBLE_WEIGHTS.json) nie zawiera macroModifiers';
  if (fs.existsSync(ENSEMBLE_WEIGHTS)) {
    const experts = JSON.parse(fs.readFileSync(ENSEMBLE_WEIGHTS, 'utf-8'));
    const withMods = experts.find((e: any) => e.macroModifiers);
    if (withMods) {
      macroModifiers = withMods.macroModifiers;
      modifiersSource = `${ENSEMBLE_WEIGHTS} (ekspert ${withMods.maskedPeriod?.startYear}-${withMods.maskedPeriod?.endYear})`;
    }
  }

  const results = CAPS.map((cap) => ({ cap, preds: [] as number[], actuals: [] as number[], quarters: [] as { quarter: string }[], hits: 0, rawMults: [] as number[], byArchBlock: {} as Record<string, number> }));
  const rl = readline.createInterface({ input: fs.createReadStream(SNAPSHOTS_JSONL) });
  let n = 0;
  for await (const line of rl) {
    const rec = JSON.parse(line);
    if (asOfYear(rec.asOf) > TRAIN_END_YEAR) continue;
    n++;
    const macro = { ...rec.macro, asOf: new Date(rec.macro.asOf) };
    for (const r of results) {
      const v = calculateFairValue(rec.snapshot, { macro, engineConfig: { baseWeights: WEIGHT_MATRIX, macroModifiers, macroCap: r.cap } });
      r.preds.push(v.upside);
      r.actuals.push(rec.fwdReturn12m);
      r.quarters.push({ quarter: rec.asOf });
      if (v.capHits.length) r.hits++;
      for (const h of v.capHits) {
        r.rawMults.push(h.rawMult);
        r.byArchBlock[`${h.archetype}/${h.block}`] = (r.byArchBlock[`${h.archetype}/${h.block}`] ?? 0) + 1;
      }
    }
  }

  let md = `# Limit mnożnika makro (macroCap)\n\nWygenerowano: ${new Date().toISOString()}. Wyceny przeliczone: ${n} (okres treningowy).\n\n`;
  md += `Źródło macroModifiers: ${modifiersSource}.\n\nW datasecie (${DATASET_CSV}) wiersze z co najmniej jednym capHit: ${withHits} z ${datasetRows.length} (${((withHits / datasetRows.length) * 100).toFixed(2)}%).\n\n`;
  md += `| macroCap | % wycen z capHit | IC (średnia po kwartałach) | spread decylowy brutto 12M |\n|---|---|---|---|\n`;
  for (const r of results) {
    const ev = evaluate(r.preds, r.actuals, r.quarters);
    md += `| ${Number.isFinite(r.cap) ? r.cap : '∞'} | ${((r.hits / Math.max(n, 1)) * 100).toFixed(2)}% | ${ev.IC_by_quarter.mean?.toFixed(4) ?? '—'} | ${ev.decile_spread?.toFixed(4) ?? '—'} |\n`;
  }
  const base = results.find((r) => r.cap === 0.25)!;
  if (base.rawMults.length) {
    const s = [...base.rawMults].sort((a, b) => a - b);
    md += `\nRozkład rawMult przed przycięciem (cap 0.25): min ${s[0].toFixed(3)}, mediana ${s[Math.floor(s.length / 2)].toFixed(3)}, max ${s[s.length - 1].toFixed(3)}. Aktywacje wg archetyp/blok: ${JSON.stringify(base.byArchBlock)}.\n`;
  } else {
    md += `\n**Cap nie aktywował się ani razu i wyniki są identyczne dla wszystkich wartości: bez macroModifiers mechanizm jest nieaktywny.** Algorytm genetyczny ewoluuje osobne macierze bazowe na reżimy stóp (matrixHiking/Holding/Cutting), a nie modyfikatory — więc w obecnym pipeline'ie cap nie jest ani bezpiecznikiem, ani parametrem modelu.\n`;
  }

  ensureArtifactsDir();
  fs.writeFileSync(MACRO_CAP_REPORT, md);
  console.log(md);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
