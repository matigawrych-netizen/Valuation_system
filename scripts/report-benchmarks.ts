/**
 * T-25 — model vs 4 benchmarki, test Diebolda-Mariano (Newey-West h−1, poprawka HLN).
 *   npx tsx scripts/report-benchmarks.ts
 *
 * Zbiór: okres treningowy (walidacyjny), NIE holdout. Strata = |prognoza zwrotu − zwrot 12M|,
 * uśredniana przekrojowo w kwartale => szereg czasowy, h = 4 (etykiety 12M nachodzą się przy próbkowaniu kwartalnym).
 * Benchmarki uczone (regresja) są liczone walk-forward z purgingiem.
 */
import fs from 'node:fs';
import { BLOCK_RATIO_CAP, predictReturn, walkForward } from '../src/block-model.js';
import { groupByQuarter, parseCSV, type Row } from '../src/dataset.js';
import { loadBlockWeightsArtifact } from '../src/engine-config.js';
import { evaluate } from '../src/evaluation-harness.js';
import {
  BENCHMARKS_JSON,
  BENCHMARKS_REPORT,
  DATASET_CSV,
  MASK_PERIODS,
  ensureArtifactsDir,
  isTrainPeriod,
  requireDataset,
} from '../src/paths.js';
import { splitFold } from '../src/purging.js';
import { dieboldMarianoFromLosses, mean, median, olsFit, quantile } from '../src/stats.js';
import { BLOCKS, type ValuationBlock } from '../src/valuation-engine.js';

const HORIZON_QUARTERS = 4;
const N_COMPARISONS = 4;
const MIN_SECTOR_PEERS = 5;
const clampRatio = (r: number) => Math.min(Math.max(r, 1 / BLOCK_RATIO_CAP), BLOCK_RATIO_CAP);

type Preds = Map<Row, number>;
const notes: string[] = [];

function equalWeights(rows: Row[]): Preds {
  const w = Object.fromEntries(BLOCKS.map((b) => [b, 1 / BLOCKS.length])) as Record<ValuationBlock, number>;
  let fallback = 0;
  const out: Preds = new Map();
  for (const r of rows) {
    const p = predictReturn(r, w);
    if (p == null) fallback++;
    out.set(r, p ?? 0);
  }
  notes.push(`Równe wagi: ${fallback} wierszy bez żadnego bloku => prognoza 0 (random walk).`);
  return out;
}

function sectorPE(rows: Row[]): Preds {
  const out: Preds = new Map();
  let fallbackEps = 0;
  let marketWide = 0;
  for (const q of groupByQuarter(rows).values()) {
    const pe = (r: Row) => r.price / (r.features.eps as number);
    const positive = q.filter((r) => r.features.eps != null && r.features.eps > 0);
    const market = positive.length ? median(positive.map(pe)) : null;
    const bySector = new Map<string, number[]>();
    for (const r of positive) bySector.set(r.sector ?? '', [...(bySector.get(r.sector ?? '') ?? []), pe(r)]);
    for (const r of q) {
      if (r.features.eps == null || r.features.eps <= 0 || market == null) {
        fallbackEps++;
        out.set(r, 0);
        continue;
      }
      const peers = bySector.get(r.sector ?? '') ?? [];
      const m = peers.length >= MIN_SECTOR_PEERS ? median(peers) : market;
      if (peers.length < MIN_SECTOR_PEERS) marketWide++;
      out.set(r, clampRatio((r.features.eps * m) / r.price) - 1);
    }
  }
  notes.push(`Mediana P/E sektora (SIC, ten sam kwartał): ${fallbackEps} wierszy z EPS ≤ 0 => prognoza 0; ${marketWide} wierszy z < ${MIN_SECTOR_PEERS} spółkami w sektorze => mediana całego rynku.`);
  return out;
}

const FACTOR_NAMES = ['book-to-market', 'E/P', 'FCF yield', 'momentum 12-1', 'log(market cap)'];
function factors(r: Row): (number | null)[] {
  const f = r.features;
  return [
    f.bookValuePerShare != null ? f.bookValuePerShare / r.price : null,
    f.eps != null ? f.eps / r.price : null,
    f.fcfPerShare != null ? f.fcfPerShare / r.price : null,
    f.momentum12_1,
    f.marketCap != null && f.marketCap > 0 ? Math.log(f.marketCap) : null,
  ];
}

function regression(rows: Row[]): Preds {
  const out: Preds = new Map();
  let imputed = 0;
  for (const block of MASK_PERIODS) {
    const { train, test } = splitFold(rows, block);
    const complete = train.map((r) => ({ r, x: factors(r) })).filter((o) => o.x.every((v) => v != null)) as { r: Row; x: number[] }[];
    const lo = FACTOR_NAMES.map((_, j) => quantile(complete.map((o) => o.x[j]), 0.01));
    const hi = FACTOR_NAMES.map((_, j) => quantile(complete.map((o) => o.x[j]), 0.99));
    const med = FACTOR_NAMES.map((_, j) => median(complete.map((o) => o.x[j])));
    const wins = (x: (number | null)[]) =>
      x.map((v, j) => {
        if (v == null) {
          imputed++;
          return med[j];
        }
        return Math.min(Math.max(v, lo[j]), hi[j]);
      });
    const fit = olsFit(complete.map((o) => wins(o.x)), complete.map((o) => o.r.fwdReturn));
    for (const r of test) {
      const x = wins(factors(r));
      out.set(r, x.reduce((s, v, j) => s + v * fit.coefs[j], fit.intercept));
    }
  }
  notes.push(`Regresja 5 czynników (${FACTOR_NAMES.join(', ')}), walk-forward ${MASK_PERIODS.length} foldów z purgingiem, winsoryzacja 1/99%: ${imputed} brakujących wartości cech zastąpionych medianą z treningu danego folda.`);
  return out;
}

function quarterLosses(rows: Row[], preds: Preds): number[] {
  return [...groupByQuarter(rows).values()].map((q) => mean(q.map((r) => Math.abs(preds.get(r)! - r.fwdReturn))));
}

function icStats(rows: Row[], preds: Preds) {
  const ev = evaluate(rows.map((r) => preds.get(r)!), rows.map((r) => r.fwdReturn), rows.map((r) => ({ quarter: r.asOf })));
  return { icMean: ev.IC_by_quarter.mean, icTStat: ev.IC_t_stat, nQuarters: ev.IC_by_quarter.nQuarters, meanAbsError: ev.meanAbsError };
}

function main() {
  requireDataset();
  const rows = parseCSV(DATASET_CSV).filter((r) => isTrainPeriod(r.asOf) && r.upside != null);
  const model: Preds = new Map(rows.map((r) => [r, r.upside!]));

  const benchmarks: { name: string; preds: Preds }[] = [
    { name: 'Random walk (prognoza zwrotu = 0)', preds: new Map(rows.map((r) => [r, 0])) },
    { name: 'Równe wagi bloków (0.25)', preds: equalWeights(rows) },
    { name: 'Mediana P/E sektora', preds: sectorPE(rows) },
    { name: 'Regresja 5 czynników', preds: regression(rows) },
  ];

  const modelLoss = quarterLosses(rows, model);
  const comparisons = benchmarks.map((b) => {
    const dm = dieboldMarianoFromLosses(modelLoss, quarterLosses(rows, b.preds), HORIZON_QUARTERS);
    return {
      benchmark: b.name,
      ...dm,
      pValueBonferroni: Math.min(1, dm.pValue * N_COMPARISONS),
      modelBetter: dm.meanLossDiff < 0,
      benchmarkIC: icStats(rows, b.preds),
    };
  });
  const modelIC = icStats(rows, model);

  // Informacyjnie: wytrenowane wagi bloków OOS (walk-forward) vs random walk
  const weightsArtifact = loadBlockWeightsArtifact();
  let trained: Record<string, unknown> | null = null;
  if (weightsArtifact) {
    const oos: Preds = new Map();
    for (const f of walkForward(rows, MASK_PERIODS, weightsArtifact.lambda, { kind: 'subgradient' })) for (const p of f.oos) oos.set(p.row, p.pred);
    const covered = rows.filter((r) => oos.has(r));
    const dm = dieboldMarianoFromLosses(quarterLosses(covered, oos), quarterLosses(covered, new Map(covered.map((r) => [r, 0]))), HORIZON_QUARTERS);
    trained = { lambda: weightsArtifact.lambda, n: covered.length, dmVsRandomWalk: dm, ic: icStats(covered, oos) };
  }

  let md = `# Benchmarki i test Diebolda-Mariano\n\nWygenerowano: ${new Date().toISOString()}. Wiersze: ${rows.length} (okres treningowy), kwartały: ${modelLoss.length}.\n`;
  md += `Model = upside z datasetu (silnik, ekspercki WEIGHT_MATRIX). Strata = |prognoza − zwrot 12M|, średnia w kwartale. DM: wariancja Newey-West (lag ${HORIZON_QUARTERS - 1}), poprawka HLN, rozkład t(n−1). Bonferroni na ${N_COMPARISONS} porównania.\n\n`;
  md += `Model: średni |błąd| ${modelIC.meanAbsError?.toFixed(4)}, IC (średnia po kwartałach) ${modelIC.icMean?.toFixed(4) ?? '—'}, IC t-stat ${modelIC.icTStat?.toFixed(2) ?? '—'}.\n\n`;
  md += `| benchmark | DM stat | p | p (Bonferroni) | średnia (L_model − L_bench) | CI95 | model lepszy? | IC benchmarku | IC t-stat benchmarku |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const c of comparisons) {
    md += `| ${c.benchmark} | ${c.dmStat.toFixed(3)} | ${c.pValue.toFixed(4)} | ${c.pValueBonferroni.toFixed(4)} | ${c.meanLossDiff.toFixed(4)} | [${c.ci95[0].toFixed(4)}, ${c.ci95[1].toFixed(4)}] | ${c.modelBetter ? 'tak' : 'nie'} | ${c.benchmarkIC.icMean?.toFixed(4) ?? '—'} | ${c.benchmarkIC.icTStat?.toFixed(2) ?? '—'} |\n`;
  }
  md += `\n${notes.map((n) => `- ${n}`).join('\n')}\n`;
  if (trained) {
    const t = trained as any;
    md += `\n## Wytrenowane wagi bloków (OOS walk-forward, λ=${t.lambda})\n\nn=${t.n}; DM vs random walk: stat ${t.dmVsRandomWalk.dmStat.toFixed(3)}, p ${t.dmVsRandomWalk.pValue.toFixed(4)}, średnia różnica strat ${t.dmVsRandomWalk.meanLossDiff.toFixed(4)}; IC ${t.ic.icMean?.toFixed(4) ?? '—'} (t ${t.ic.icTStat?.toFixed(2) ?? '—'}).\n`;
  }

  ensureArtifactsDir();
  fs.writeFileSync(BENCHMARKS_REPORT, md);
  fs.writeFileSync(
    BENCHMARKS_JSON,
    JSON.stringify({ generatedAt: new Date().toISOString(), n: rows.length, nQuarters: modelLoss.length, model: modelIC, comparisons, trainedBlockWeightsOOS: trained, notes }, null, 2)
  );
  console.log(md);
}

main();
