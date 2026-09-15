/**
 * T-09/T-28 — różnorodność zespołu mierzona na prawdziwych danych, bez wstrzykiwania szumu.
 *   npx tsx scripts/test-ensemble-diversity.ts
 *
 * A) Eksperci wag bloków: ekspert i = trening bez bloku MASK_PERIODS[i] (purging), bootstrap po CIK (ziarno i),
 *    losowo pominięty jeden blok wyceny (ziarno i). Predykcje na wspólnym zbiorze: rok embargo (żaden ekspert go nie widział).
 * B) Eksperci algorytmu genetycznego z ENSEMBLE_WEIGHTS.json (jeśli istnieje) — ta sama miara na tym samym zbiorze.
 * Math.random nie jest używane; losowość tylko w bootstrapie i wyborze pomijanego bloku (mulberry32).
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { fitArchetypeWeights, predictRows } from '../src/block-model.js';
import { parseCSV, type Row } from '../src/dataset.js';
import { loadBlockWeightsArtifact } from '../src/engine-config.js';
import {
  DATASET_CSV,
  EMBARGO_YEAR,
  ENSEMBLE_DIVERSITY_JSON,
  ENSEMBLE_DIVERSITY_REPORT,
  ENSEMBLE_WEIGHTS,
  MASK_PERIODS,
  SNAPSHOTS_JSONL,
  asOfYear,
  ensureArtifactsDir,
  isTrainPeriod,
  requireDataset,
} from '../src/paths.js';
import { splitFold } from '../src/purging.js';
import { mean, mulberry32, pearson } from '../src/stats.js';
import { BLOCKS, calculateFairValue, type WeightMatrix } from '../src/valuation-engine.js';

function correlationSummary(vectors: number[][]) {
  const k = vectors.length;
  const corr = vectors.map((a) => vectors.map((b) => pearson(a, b)));
  const off: number[] = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (corr[i][j] != null) off.push(corr[i][j]!);
  const rhoBar = off.length ? mean(off) : null;
  return { k, corr, meanPairwiseCorr: rhoBar, nEff: rhoBar != null ? k / (1 + (k - 1) * rhoBar) : null };
}

const matrixMd = (corr: (number | null)[][], labels: string[]) =>
  `| | ${labels.join(' | ')} |\n|---|${labels.map(() => '---').join('|')}|\n` +
  corr.map((row, i) => `| ${labels[i]} | ${row.map((v) => (v == null ? '—' : v.toFixed(3))).join(' | ')} |`).join('\n');

async function gaExperts(commonKeys: Set<string>) {
  if (!fs.existsSync(ENSEMBLE_WEIGHTS)) return null;
  const experts = JSON.parse(fs.readFileSync(ENSEMBLE_WEIGHTS, 'utf-8')) as {
    maskedPeriod: { startYear: number; endYear: number };
    matrixHiking: WeightMatrix;
    matrixHolding: WeightMatrix;
    matrixCutting: WeightMatrix;
  }[];
  if (!fs.existsSync(SNAPSHOTS_JSONL)) throw new Error(`Brak ${SNAPSHOTS_JSONL} — uruchom scripts/generate-dataset.ts`);
  const preds: number[][] = experts.map(() => []);
  const rl = readline.createInterface({ input: fs.createReadStream(SNAPSHOTS_JSONL) });
  for await (const line of rl) {
    const rec = JSON.parse(line);
    if (!commonKeys.has(`${rec.cik}|${rec.asOf}`)) continue;
    const macro = { ...rec.macro, asOf: new Date(rec.macro.asOf) };
    experts.forEach((e, i) => {
      const m = macro.rateRegime === 'HIKING' ? e.matrixHiking : macro.rateRegime === 'CUTTING' ? e.matrixCutting : e.matrixHolding;
      preds[i].push(calculateFairValue(rec.snapshot, { macro, engineConfig: { baseWeights: m } }).upside);
    });
  }
  const weightVectors = experts.map((e) =>
    [e.matrixHiking, e.matrixHolding, e.matrixCutting].flatMap((m) => Object.keys(m).sort().flatMap((a) => BLOCKS.map((b) => (m as any)[a]?.[b] ?? 0)))
  );
  return {
    labels: experts.map((e) => `${e.maskedPeriod.startYear}-${e.maskedPeriod.endYear}`),
    predictions: correlationSummary(preds),
    weights: correlationSummary(weightVectors),
    n: preds[0]?.length ?? 0,
  };
}

async function main() {
  requireDataset();
  const all = parseCSV(DATASET_CSV);
  const train = all.filter((r) => isTrainPeriod(r.asOf));
  const common = all.filter((r) => asOfYear(r.asOf) === EMBARGO_YEAR);
  if (!common.length) throw new Error(`Brak wierszy z roku embargo ${EMBARGO_YEAR}`);
  const lambda = loadBlockWeightsArtifact()?.lambda ?? 1;

  const experts = MASK_PERIODS.map((block, i) => {
    const rnd = mulberry32(1000 + i);
    const { train: foldTrain } = splitFold(train, block);
    const byCik = new Map<string, Row[]>();
    for (const r of foldTrain) byCik.set(r.cik, [...(byCik.get(r.cik) ?? []), r]);
    const ciks = [...byCik.keys()];
    const boot: Row[] = [];
    for (let j = 0; j < ciks.length; j++) boot.push(...byCik.get(ciks[Math.floor(rnd() * ciks.length)])!);
    const dropped = BLOCKS[Math.floor(rnd() * BLOCKS.length)];
    const drop = (r: Row): Row => ({ ...r, blocks: Object.fromEntries(Object.entries(r.blocks).filter(([b]) => b !== dropped)) });
    const { weights } = fitArchetypeWeights(boot.map(drop), lambda, { kind: 'subgradient' });
    return { block, dropped, weights, drop };
  });

  // Wspólny zbiór: wiersze, dla których KAŻDY ekspert ma prognozę
  const predsByExpert = experts.map((e) => new Map(predictRows(common.map(e.drop), e.weights).map((p) => [`${p.row.cik}|${p.row.asOf}`, p.pred])));
  const keys = [...predsByExpert[0].keys()].filter((key) => predsByExpert.every((m) => m.has(key)));
  const labels = experts.map((e) => `${e.block.startYear}-${e.block.endYear} −${e.dropped.replace('BLOK_', '')}`);
  const blockPreds = correlationSummary(predsByExpert.map((m) => keys.map((key) => m.get(key)!)));
  const blockWeights = correlationSummary(experts.map((e) => Object.keys(e.weights).sort().flatMap((a) => BLOCKS.map((b) => e.weights[a][b]))));
  const ga = await gaExperts(new Set(keys));

  let md = `# Różnorodność zespołu\n\nWygenerowano: ${new Date().toISOString()}. Wspólny zbiór oceny: rok embargo ${EMBARGO_YEAR}, ${keys.length} wierszy.\n\n`;
  md += `## A) Eksperci wag bloków (bootstrap po CIK + pominięty blok), λ=${lambda}\n\nŚrednia korelacja par predykcji ρ̄ = ${blockPreds.meanPairwiseCorr?.toFixed(4) ?? '—'}; n_eff = k/(1+(k−1)ρ̄) = ${blockPreds.nEff?.toFixed(2) ?? '—'} (k=${blockPreds.k}).\n\n### Korelacja predykcji\n\n${matrixMd(blockPreds.corr, labels)}\n\n### Korelacja wektorów wag\n\nρ̄ = ${blockWeights.meanPairwiseCorr?.toFixed(4) ?? '—'}\n\n${matrixMd(blockWeights.corr, labels)}\n\n`;
  md += `## B) Eksperci algorytmu genetycznego (${ENSEMBLE_WEIGHTS})\n\n`;
  if (!ga) {
    md += `⚠️ BRAK POMIARU — plik ${ENSEMBLE_WEIGHTS} nie istnieje (pełny przebieg scripts/evolve.ts nie był uruchomiony).\n`;
  } else {
    md += `n=${ga.n}. ρ̄ predykcji = ${ga.predictions.meanPairwiseCorr?.toFixed(4) ?? '—'}, n_eff = ${ga.predictions.nEff?.toFixed(2) ?? '—'}. ρ̄ wag = ${ga.weights.meanPairwiseCorr?.toFixed(4) ?? '—'}.\n\n${matrixMd(ga.predictions.corr, ga.labels)}\n\n`;
    if (ga.predictions.nEff != null && ga.predictions.nEff < 2) md += `**n_eff < 2: zespół GA praktycznie nie redukuje wariancji.**\n`;
  }

  ensureArtifactsDir();
  fs.writeFileSync(ENSEMBLE_DIVERSITY_REPORT, md);
  fs.writeFileSync(
    ENSEMBLE_DIVERSITY_JSON,
    JSON.stringify({ generatedAt: new Date().toISOString(), nCommon: keys.length, blockExperts: { labels, predictions: blockPreds, weights: blockWeights }, gaExperts: ga }, null, 2)
  );
  console.log(md);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
