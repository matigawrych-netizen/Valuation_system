/**
 * T-08/T-26 — krzywa kalibracji confidenceScore na rzeczywistym datasecie (okres treningowy/walidacyjny).
 *   npx tsx scripts/report-calibration.ts
 * Błąd = |upside − fwdReturn12m|, gdzie upside = fairValue/cena − 1 z datasetu.
 * Bez werdyktów SUCCESS/FAILURE: tabela, różnica kubełków z CI (bootstrap po kwartałach), korelacja.
 */
import fs from 'node:fs';
import { groupByQuarter, parseCSV, type Row } from '../src/dataset.js';
import { evaluate } from '../src/evaluation-harness.js';
import { CALIBRATION_JSON, CALIBRATION_REPORT, DATASET_CSV, ensureArtifactsDir, isTrainPeriod, requireDataset } from '../src/paths.js';
import { bootstrapGroups, mean, median, spearman } from '../src/stats.js';

const MIN_BUCKET_N = 100;
const BUCKETS = 10;

const err = (r: Row) => Math.abs((r.upside as number) - r.fwdReturn);
const bucketOf = (c: number) => Math.min(BUCKETS - 1, Math.floor(c * BUCKETS));

function main() {
  requireDataset();
  const rows = parseCSV(DATASET_CSV).filter((r) => isTrainPeriod(r.asOf) && r.confidenceScore != null && r.upside != null);
  if (!rows.length) throw new Error('Brak wierszy z confidenceScore i upside w okresie treningowym');

  const buckets = Array.from({ length: BUCKETS }, (_, b) => {
    const rs = rows.filter((r) => bucketOf(r.confidenceScore!) === b);
    const ev = rs.length >= 2 ? evaluate(rs.map((r) => r.upside!), rs.map((r) => r.fwdReturn), rs.map((r) => ({ quarter: r.asOf }))) : null;
    return {
      range: `${b * 10}–${(b + 1) * 10}%`,
      n: rs.length,
      tooSmall: rs.length < MIN_BUCKET_N,
      medianAbsError: rs.length ? median(rs.map(err)) : null,
      icByQuarterMean: ev?.IC_by_quarter.mean ?? null,
      meanRealizedReturn: rs.length ? mean(rs.map((r) => r.fwdReturn)) : null,
    };
  });

  const inRange = (r: Row, lo: number, hi: number) => r.confidenceScore! >= lo && (hi >= 1 ? r.confidenceScore! <= 1 : r.confidenceScore! < hi);
  const diffStat = (groups: Row[][]) => {
    const all = groups.flat();
    const mid = all.filter((r) => inRange(r, 0.4, 0.6)).map(err);
    const high = all.filter((r) => inRange(r, 0.8, 1)).map(err);
    return mid.length && high.length ? median(mid) - median(high) : null;
  };
  const quarters = [...groupByQuarter(rows).values()];
  const diff = bootstrapGroups(quarters, diffStat, 1000, 7);
  const rho = spearman(rows.map((r) => r.confidenceScore!), rows.map((r) => -err(r)));

  const populated = buckets.filter((b) => !b.tooSmall && b.medianAbsError != null);
  const monotonic = populated.every((b, i) => i === 0 || b.medianAbsError! <= populated[i - 1].medianAbsError!);
  const nHigh = rows.filter((r) => inRange(r, 0.8, 1)).length;
  const nMid = rows.filter((r) => inRange(r, 0.4, 0.6)).length;
  const flat = diff.lo == null || diff.hi == null || (diff.lo <= 0 && diff.hi >= 0);

  let md = `# Kalibracja confidenceScore\n\nWygenerowano: ${new Date().toISOString()}. Wiersze (okres treningowy): ${rows.length}, kwartały: ${quarters.length}.\n`;
  md += `Błąd = |upside − fwdReturn12m| (upside z eksperckiego WEIGHT_MATRIX).\n\n`;
  md += `| kubełek | N | mediana błędu | IC (średnia po kwartałach) | średni zwrot 12M |\n|---|---|---|---|---|\n`;
  for (const b of buckets) {
    md += `| ${b.range} | ${b.n}${b.tooSmall ? ' [N zbyt małe]' : ''} | ${b.medianAbsError?.toFixed(4) ?? '—'} | ${b.icByQuarterMean?.toFixed(4) ?? '—'} | ${b.meanRealizedReturn?.toFixed(4) ?? '—'} |\n`;
  }
  md += `\nRóżnica mediany błędu: kubełek 40–60% (N=${nMid}) minus 80–100% (N=${nHigh}) = ${diff.estimate?.toFixed(4) ?? 'n/d'}; CI95 (bootstrap po kwartałach, ${diff.validDraws}/${diff.B} ważnych losowań): [${diff.lo?.toFixed(4) ?? '—'}, ${diff.hi?.toFixed(4) ?? '—'}]. Wartość dodatnia oznacza mniejszy błąd przy wysokim confidence.\n\n`;
  md += `Spearman(confidenceScore, −|błąd|) na wszystkich wierszach: ${rho?.toFixed(4) ?? 'n/d'}.\n\n`;
  md += `Mediana błędu nierosnąca w kubełkach z N ≥ ${MIN_BUCKET_N}: ${monotonic ? 'tak' : 'nie'}.\n\n`;
  if (flat) md += `**Krzywa jest płaska: przedział ufności różnicy obejmuje zero (albo nie da się go policzyć). confidenceScore należy traktować jako nieskalibrowany.**\n`;

  ensureArtifactsDir();
  fs.writeFileSync(CALIBRATION_REPORT, md);
  fs.writeFileSync(
    CALIBRATION_JSON,
    JSON.stringify({ generatedAt: new Date().toISOString(), n: rows.length, buckets, diffMidMinusHigh: diff, spearmanConfidenceVsNegError: rho, monotonic, flat }, null, 2)
  );
  console.log(md);
}

main();
