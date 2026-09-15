/**
 * T-29 — tabela Go/No-Go składana WYŁĄCZNIE z artefaktów. Skrypt niczego nie liczy.
 *   npx tsx scripts/report-gonogo.ts
 * Brak artefaktu => „⚠️ BRAK POMIARU”, nigdy PASS. Progi: docs/acceptance-criteria.md (preregistracja).
 */
import fs from 'node:fs';
import {
  ACCEPTANCE_CRITERIA_DOC,
  BENCHMARKS_JSON,
  BLOCK_WEIGHTS,
  CALIBRATION_JSON,
  CORPSES_TEST_JSON,
  DECILE_JSON,
  ENSEMBLE_DIVERSITY_JSON,
  GONOGO_REPORT,
  ensureArtifactsDir,
} from '../src/paths.js';

// ── Progi (skopiowane z docs/acceptance-criteria.md) ──
const P_THRESHOLD = 0.0125;
const IC_T_STAT_MIN = 2.0;
const DEGRADATION_MAX = 0.25;
const N_EFF_MIN = 3;
const COST_LEVEL_BPS = 30;

type Status = '✅ PASS' | '❌ FAIL' | '⚠️ BRAK POMIARU';
interface Line {
  metric: string;
  threshold: string;
  value: string;
  ci: string;
  source: string;
  generated: string;
  status: Status;
}

function load(file: string): { data: any; generated: string } | null {
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return { data, generated: data.generatedAt ?? data.trainedAt ?? fs.statSync(file).mtime.toISOString() };
}

const missing = (metric: string, threshold: string, source: string, why = 'brak artefaktu'): Line => ({
  metric,
  threshold,
  value: why,
  ci: '—',
  source,
  generated: '—',
  status: '⚠️ BRAK POMIARU',
});
const fmt = (v: unknown, digits = 4) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—');

function main() {
  const lines: Line[] = [];

  const bench = load(BENCHMARKS_JSON);
  for (const [label, needle] of [
    ['DM vs random walk', 'Random walk'],
    ['DM vs równe wagi', 'Równe wagi'],
  ] as const) {
    const c = bench?.data.comparisons?.find((x: any) => x.benchmark.startsWith(needle));
    if (!bench || !c) {
      lines.push(missing(label, `p < ${P_THRESHOLD} i model lepszy`, BENCHMARKS_JSON));
      continue;
    }
    lines.push({
      metric: label,
      threshold: `p < ${P_THRESHOLD} i model lepszy`,
      value: `p = ${fmt(c.pValue)}, różnica strat ${fmt(c.meanLossDiff)} (${c.modelBetter ? 'model lepszy' : 'model gorszy'})`,
      ci: `[${fmt(c.ci95[0])}, ${fmt(c.ci95[1])}]`,
      source: BENCHMARKS_JSON,
      generated: bench.generated,
      status: c.pValue < P_THRESHOLD && c.modelBetter ? '✅ PASS' : '❌ FAIL',
    });
  }

  if (!bench?.data.model || bench.data.model.icTStat == null) lines.push(missing('IC przekrojowy (t-stat)', `> ${IC_T_STAT_MIN}`, BENCHMARKS_JSON));
  else
    lines.push({
      metric: 'IC przekrojowy (t-stat)',
      threshold: `> ${IC_T_STAT_MIN}`,
      value: `t = ${fmt(bench.data.model.icTStat, 2)} (IC ${fmt(bench.data.model.icMean)}, ${bench.data.model.nQuarters} kw.)`,
      ci: '—',
      source: BENCHMARKS_JSON,
      generated: bench.generated,
      status: bench.data.model.icTStat > IC_T_STAT_MIN ? '✅ PASS' : '❌ FAIL',
    });

  const dec = load(DECILE_JSON);
  const cost = dec?.data.costs?.find((c: any) => c.bps === COST_LEVEL_BPS);
  if (!cost) lines.push(missing(`Spread L/S netto @${COST_LEVEL_BPS} bps`, '> 0 i dolna granica CI > 0', DECILE_JSON));
  else {
    const [lo, hi] = cost.longShort.meanQuarterlyCI95;
    lines.push({
      metric: `Spread L/S netto @${COST_LEVEL_BPS} bps (średni kwartał)`,
      threshold: '> 0 i dolna granica CI > 0',
      value: fmt(cost.longShort.meanQuarterly),
      ci: `[${fmt(lo)}, ${fmt(hi)}]`,
      source: DECILE_JSON,
      generated: dec!.generated,
      status: cost.longShort.meanQuarterly > 0 && lo != null && lo > 0 ? '✅ PASS' : '❌ FAIL',
    });
  }

  const bw = load(BLOCK_WEIGHTS);
  const cv = bw?.data.cvMetrics;
  if (!cv || cv.isICMean == null || cv.oosICMean == null) lines.push(missing('Degradacja IC IS→OOS', `< ${DEGRADATION_MAX * 100}% względnie`, BLOCK_WEIGHTS));
  else
    lines.push({
      metric: 'Degradacja IC IS→OOS (wagi bloków)',
      threshold: `< ${DEGRADATION_MAX * 100}% względnie, IC IS > 0`,
      value: `IS ${fmt(cv.isICMean)} → OOS ${fmt(cv.oosICMean)} (${fmt((cv.degradationRelative ?? NaN) * 100, 1)}%)`,
      ci: '—',
      source: BLOCK_WEIGHTS,
      generated: bw!.generated,
      status: cv.isICMean > 0 && cv.degradationRelative != null && cv.degradationRelative < DEGRADATION_MAX ? '✅ PASS' : '❌ FAIL',
    });

  const div = load(ENSEMBLE_DIVERSITY_JSON);
  const ga = div?.data.gaExperts;
  if (!ga) lines.push(missing('n_eff zespołu GA', `> ${N_EFF_MIN}`, ENSEMBLE_DIVERSITY_JSON, div ? 'brak ENSEMBLE_WEIGHTS.json (evolve nieuruchomione)' : 'brak artefaktu'));
  else
    lines.push({
      metric: 'n_eff zespołu GA',
      threshold: `> ${N_EFF_MIN}`,
      value: fmt(ga.predictions.nEff, 2),
      ci: '—',
      source: ENSEMBLE_DIVERSITY_JSON,
      generated: div!.generated,
      status: ga.predictions.nEff > N_EFF_MIN ? '✅ PASS' : '❌ FAIL',
    });

  const cal = load(CALIBRATION_JSON);
  if (!cal) lines.push(missing('Kalibracja confidence', 'monotoniczna, dolna granica CI różnicy > 0', CALIBRATION_JSON));
  else {
    const d = cal.data.diffMidMinusHigh;
    const highN = (cal.data.buckets ?? []).slice(-2).reduce((s: number, b: any) => s + b.n, 0);
    lines.push({
      metric: 'Kalibracja confidence (mediana błędu 40–60% minus 80–100%)',
      threshold: 'monotoniczna, dolna granica CI > 0',
      value: `${d.estimate == null ? `nie do policzenia (N w kubełku 80–100% = ${highN})` : fmt(d.estimate)}; monotoniczna: ${cal.data.monotonic ? 'tak' : 'nie'}`,
      ci: `[${fmt(d.lo)}, ${fmt(d.hi)}]`,
      source: CALIBRATION_JSON,
      generated: cal.generated,
      status: cal.data.monotonic && d.lo != null && d.lo > 0 ? '✅ PASS' : '❌ FAIL',
    });
  }

  const corpses = load(CORPSES_TEST_JSON);
  if (!corpses) lines.push(missing('Testy trupów z grupą kontrolną', 'wszystkie przechodzą, żaden pominięty', CORPSES_TEST_JSON));
  else {
    const t = corpses.data;
    const skipped = (t.numPendingTests ?? 0) + (t.numTodoTests ?? 0);
    const generated = t.startTime ? new Date(t.startTime).toISOString() : corpses.generated;
    lines.push({
      metric: 'Testy trupów z grupą kontrolną',
      threshold: 'wszystkie przechodzą, żaden pominięty',
      value: `zaliczone ${t.numPassedTests}, niezaliczone ${t.numFailedTests}, pominięte ${skipped}`,
      ci: '—',
      source: CORPSES_TEST_JSON,
      generated,
      status: t.numFailedTests > 0 ? '❌ FAIL' : skipped > 0 || t.numTotalTests === 0 ? '⚠️ BRAK POMIARU' : '✅ PASS',
    });
  }

  let md = `# Go/No-Go\n\nWygenerowano: ${new Date().toISOString()}. Progi: ${ACCEPTANCE_CRITERIA_DOC}. Wszystkie pomiary na okresie treningowym/walidacyjnym — holdout (sejf) nie był dotykany.\n\n`;
  md += `| metryka | próg | wartość | CI95 | źródło | wygenerowano | status |\n|---|---|---|---|---|---|---|\n`;
  md += lines.map((l) => `| ${l.metric} | ${l.threshold} | ${l.value} | ${l.ci} | ${l.source} | ${l.generated} | ${l.status} |`).join('\n');
  const counts = (s: Status) => lines.filter((l) => l.status === s).length;
  md += `\n\nPodsumowanie: ${counts('✅ PASS')} PASS, ${counts('❌ FAIL')} FAIL, ${counts('⚠️ BRAK POMIARU')} BRAK POMIARU.\n`;

  ensureArtifactsDir();
  fs.writeFileSync(GONOGO_REPORT, md);
  console.log(md);
}

main();
