/**
 * T-32 — stabilność wag bloków na 20 ziarnach (bootstrap po CIK) + uwarunkowanie macierzy wyjść modeli.
 *   npx tsx scripts/stability-test.ts [--runs 20]
 */
import fs from 'node:fs';
import { fitArchetypeWeights, walkForward } from '../src/block-model.js';
import { parseCSV, type Row } from '../src/dataset.js';
import { loadBlockWeightsArtifact } from '../src/engine-config.js';
import {
  BLOCK_WEIGHTS,
  DATASET_CSV,
  MASK_PERIODS,
  STABILITY_REPORT,
  ensureArtifactsDir,
  isTrainPeriod,
  requireArtifact,
  requireDataset,
} from '../src/paths.js';
import { conditionNumberFromEigen, mean, mulberry32, pearson, std, symmetricEigenvalues } from '../src/stats.js';
import { ARCHETYPES, BLOCKS, MODEL_KEYS } from '../src/valuation-engine.js';

/** Progi interpretacji (jawne, arbitralne): std wagi > MAX_WEIGHT_STD przy względnym rozrzucie błędu < MAX_REL_ERROR_SPREAD. */
const MAX_WEIGHT_STD = 0.05;
const MAX_REL_ERROR_SPREAD = 0.05;

function main() {
  const runsArg = process.argv.indexOf('--runs');
  const RUNS = runsArg >= 0 ? Number(process.argv[runsArg + 1]) : 20;
  requireDataset();
  requireArtifact(BLOCK_WEIGHTS, 'npx tsx scripts/train.ts');
  const lambda = loadBlockWeightsArtifact()!.lambda;
  const rows = parseCSV(DATASET_CSV).filter((r) => isTrainPeriod(r.asOf));
  const byCik = new Map<string, Row[]>();
  for (const r of rows) byCik.set(r.cik, [...(byCik.get(r.cik) ?? []), r]);
  const ciks = [...byCik.keys()];

  const weightRuns: Record<string, number[]> = {};
  const valErrors: number[] = [];
  const fallbackSeen = new Set<string>();
  for (let s = 0; s < RUNS; s++) {
    const rnd = mulberry32(5000 + s);
    const boot: Row[] = [];
    for (let i = 0; i < ciks.length; i++) boot.push(...byCik.get(ciks[Math.floor(rnd() * ciks.length)])!);
    const fit = fitArchetypeWeights(boot, lambda, { kind: 'subgradient' });
    for (const a of ARCHETYPES) {
      if (fit.fallbackToPrior[a]) fallbackSeen.add(a);
      for (const b of BLOCKS) (weightRuns[`${a}|${b}`] ??= []).push(fit.weights[a][b]);
    }
    const folds = walkForward(boot, MASK_PERIODS, lambda, { kind: 'subgradient' });
    valErrors.push(mean(folds.map((f) => f.valL1).filter(Number.isFinite)));
    console.log(`run ${s + 1}/${RUNS}: val L1 ${valErrors[valErrors.length - 1].toFixed(4)}`);
  }

  // Uwarunkowanie: korelacje (model/cena) liczone parami na wspólnie dostępnych wierszach
  const ratio = (r: Row, m: string) => (r.models[m] != null ? r.models[m] / r.price : null);
  const corr: number[][] = MODEL_KEYS.map((a) =>
    MODEL_KEYS.map((b) => {
      if (a === b) return 1;
      const pairs = rows.map((r) => [ratio(r, a), ratio(r, b)]).filter(([x, y]) => x != null && y != null) as number[][];
      return pairs.length >= 30 ? (pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1])) ?? 0) : 0;
    })
  );
  const eig = symmetricEigenvalues(corr);
  const cond = conditionNumberFromEigen(eig);
  const complete = rows.filter((r) => MODEL_KEYS.every((m) => r.models[m] != null)).length;

  const maxStd = Math.max(...Object.values(weightRuns).map(std));
  const relErrSpread = std(valErrors) / mean(valErrors);

  let md = `# Stabilność wag bloków\n\nWygenerowano: ${new Date().toISOString()}. Przebiegi: ${RUNS} (bootstrap po CIK, ziarna 5000…${5000 + RUNS - 1}), λ=${lambda} z ${BLOCK_WEIGHTS}.\n\n`;
  md += `| archetyp | blok | średnia | std | min | max |\n|---|---|---|---|---|---|\n`;
  for (const [key, vals] of Object.entries(weightRuns)) {
    const [a, b] = key.split('|');
    md += `| ${a}${fallbackSeen.has(a) ? ' (prior w części przebiegów: n<200)' : ''} | ${b} | ${mean(vals).toFixed(4)} | ${std(vals).toFixed(4)} | ${Math.min(...vals).toFixed(4)} | ${Math.max(...vals).toFixed(4)} |\n`;
  }
  md += `\nBłąd walidacyjny (średni L1 po foldach) między przebiegami: średnia ${mean(valErrors).toFixed(4)}, std ${std(valErrors).toFixed(4)}, min ${Math.min(...valErrors).toFixed(4)}, max ${Math.max(...valErrors).toFixed(4)} (względny rozrzut ${(relErrSpread * 100).toFixed(2)}%).\n\n`;
  md += `Wskaźnik uwarunkowania macierzy korelacji wyjść ${MODEL_KEYS.length} modeli (model/cena, korelacje parami): ${Number.isFinite(cond) ? cond.toFixed(1) : '∞'}; wartości własne: ${eig.map((e) => e.toFixed(3)).join(', ')}. Wiersze z kompletem wszystkich modeli: ${complete}. Pary z < 30 wspólnymi obserwacjami wpisane jako korelacja 0.\n\n`;
  md += `## Wniosek\n\n`;
  if (maxStd > MAX_WEIGHT_STD && relErrSpread < MAX_REL_ERROR_SPREAD) {
    md += `Wagi skaczą między przebiegami (maks. std ${maxStd.toFixed(3)} > ${MAX_WEIGHT_STD}), a błąd walidacyjny jest stabilny (rozrzut ${(relErrSpread * 100).toFixed(1)}% < ${MAX_REL_ERROR_SPREAD * 100}%). **Macierz wag nie niesie informacji ekonomicznej** — nie wolno jej interpretować jako „system nauczył się, że dla archetypu X liczy się blok Y”. Potrzebna silniejsza regularyzacja do priora albo redukcja modeli do ortogonalnych czynników.\n`;
  } else if (maxStd <= MAX_WEIGHT_STD) {
    md += `Maksymalne odchylenie wagi ${maxStd.toFixed(3)} ≤ ${MAX_WEIGHT_STD}: wagi są stabilne względem resamplingu spółek. Stabilność nie dowodzi wartości predykcyjnej (patrz benchmarks-report.md) — przy silnej regularyzacji wagi mogą po prostu leżeć przy priorze.\n`;
  } else {
    md += `Wagi są niestabilne (maks. std ${maxStd.toFixed(3)}) i błąd walidacyjny też się zmienia (rozrzut ${(relErrSpread * 100).toFixed(1)}%) — wynik zależy od próby; interpretacja wag jako ekonomicznych jest nieuprawniona.\n`;
  }

  ensureArtifactsDir();
  fs.writeFileSync(STABILITY_REPORT, md);
  console.log(md);
}

main();
