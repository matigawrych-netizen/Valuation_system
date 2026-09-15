/**
 * T-27 — spread decylowy brutto (12M) i strategie kwartalne netto po kosztach z obrotu liczonego ze składu.
 *   npx tsx scripts/report-deciles.ts
 * Sygnał: upside z datasetu. Rebalans co kwartał, trzymanie 3M (fwdReturn3m), wagi równe.
 * Koszt = obrót (część portfela wymieniona, w jedną stronę) × 2 × bps (sprzedaż starych + zakup nowych).
 */
import fs from 'node:fs';
import { getQuoteAtDate, loadCacheToMemory } from '../src/data-loader.js';
import { groupByQuarter, parseCSV, type Row } from '../src/dataset.js';
import { loadFredPit } from '../src/macro-provider.js';
import { DATASET_CSV, DECILE_JSON, DECILE_REPORT, ensureArtifactsDir, isTrainPeriod, requireDataset } from '../src/paths.js';
import { addMonths } from '../src/purging.js';
import { bootstrapGroups, mean, std } from '../src/stats.js';

const COST_BPS = [10, 30, 60];
const BPS = 10_000;

function turnover(prev: Set<string> | null, next: Set<string>): number {
  if (!prev || prev.size === 0) return 1;
  let kept = 0;
  for (const c of next) if (prev.has(c)) kept++;
  return 1 - kept / next.size;
}

function perfStats(returns: number[], rf: number[] | null) {
  const excess = rf ? returns.map((r, i) => r - rf[i]) : returns;
  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  for (const r of returns) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, 1 - equity / peak);
  }
  const vol = std(returns) * 2;
  return {
    annualizedReturn: Math.pow(equity, 4 / returns.length) - 1,
    annualizedVol: vol,
    sharpe: std(excess) > 0 ? (mean(excess) / std(excess)) * 2 : null,
    maxDrawdown: maxDD,
    meanQuarterly: mean(returns),
  };
}

function main() {
  requireDataset();
  const rows = parseCSV(DATASET_CSV).filter((r) => isTrainPeriod(r.asOf) && r.upside != null);
  const quarters = [...groupByQuarter(rows).entries()];
  const fred = loadFredPit();
  const cache = loadCacheToMemory({ ciks: [], quiet: true });

  const series: {
    asOf: string;
    gross12m: number;
    long: number;
    short: number;
    turnLong: number;
    turnShort: number;
    rf: number;
    spy: number | null;
    nDecile: number;
  }[] = [];
  let prevLong: Set<string> | null = null;
  let prevShort: Set<string> | null = null;
  let missing3m = 0;
  for (const [asOf, q] of quarters) {
    if (q.length < 20) continue;
    const sorted = [...q].sort((a, b) => b.upside! - a.upside!);
    const k = Math.floor(sorted.length / 10);
    const top = sorted.slice(0, k);
    const bottom = sorted.slice(sorted.length - k);
    const r3 = (rs: Row[]) => {
      const vals = rs.map((r) => r.fwdReturn3m).filter((v): v is number => v != null);
      missing3m += rs.length - vals.length;
      return mean(vals);
    };
    const longSet = new Set(top.map((r) => r.cik));
    const shortSet = new Set(bottom.map((r) => r.cik));
    const t3m = fred.dates[asOf]?.series.DGS3MO?.[0]?.value;
    if (t3m == null) throw new Error(`Brak DGS3MO w ${asOf} — nie można policzyć stopy wolnej od ryzyka`);
    const spyNow = getQuoteAtDate(cache.macro['GSPC'], asOf);
    const spyNext = getQuoteAtDate(cache.macro['GSPC'], addMonths(asOf, 3).toISOString().slice(0, 10));
    series.push({
      asOf,
      gross12m: mean(top.map((r) => r.fwdReturn)) - mean(bottom.map((r) => r.fwdReturn)),
      long: r3(top),
      short: r3(bottom),
      turnLong: turnover(prevLong, longSet),
      turnShort: turnover(prevShort, shortSet),
      rf: t3m / 100 / 4,
      spy: spyNow && spyNext ? spyNext.close / spyNow.close - 1 : null,
      nDecile: k,
    });
    prevLong = longSet;
    prevShort = shortSet;
  }

  const groups = series.map((s) => [s]);
  const gross = bootstrapGroups(groups, (g) => mean(g.flat().map((s) => s.gross12m)), 1000, 11);
  const costs = COST_BPS.map((bps) => {
    const c = bps / BPS;
    const lsNet = series.map((s) => s.long - s.short - (s.turnLong + s.turnShort) * 2 * c);
    const loNet = series.map((s) => s.long - s.turnLong * 2 * c);
    const ci = bootstrapGroups(
      series.map((_, i) => [lsNet[i]]),
      (g) => mean(g.flat()),
      1000,
      bps
    );
    return {
      bps,
      longShort: { ...perfStats(lsNet, null), meanQuarterlyCI95: [ci.lo, ci.hi] },
      longOnly: perfStats(loNet, series.map((s) => s.rf)),
    };
  });
  const spyRows = series.filter((s) => s.spy != null);
  const spy = perfStats(spyRows.map((s) => s.spy!), spyRows.map((s) => s.rf));
  const turnLong = mean(series.slice(1).map((s) => s.turnLong));
  const turnShort = mean(series.slice(1).map((s) => s.turnShort));

  const f = (v: number | null | undefined, d = 4) => (v == null ? '—' : v.toFixed(d));
  let md = `# Spread decylowy i koszty transakcyjne\n\nWygenerowano: ${new Date().toISOString()}. Kwartały: ${series.length} (${series[0]?.asOf} … ${series[series.length - 1]?.asOf}), okres treningowy.\n\n`;
  md += `Spread brutto 12M (top − bottom decyl, średnia po kwartałach): ${f(gross.estimate)}; CI95 (bootstrap po kwartałach): [${f(gross.lo)}, ${f(gross.hi)}]. Uwaga: etykiety 12M nachodzą się między kwartałami.\n\n`;
  md += `Obrót kwartalny (w jedną stronę, z rzeczywistych zmian składu): long ${(turnLong * 100).toFixed(1)}%, short ${(turnShort * 100).toFixed(1)}%. Brakujące zwroty 3M w decylach (pominięte w średniej): ${missing3m}.\n\n`;
  md += `| koszt (bps, w jedną stronę) | L/S: roczny zwrot | L/S: Sharpe | L/S: maxDD | L/S: średni kwartał netto | CI95 | long-only: roczny zwrot | long-only: Sharpe | long-only: maxDD |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const c of costs) {
    md += `| ${c.bps} | ${f(c.longShort.annualizedReturn)} | ${f(c.longShort.sharpe, 2)} | ${f(c.longShort.maxDrawdown)} | ${f(c.longShort.meanQuarterly)} | [${f(c.longShort.meanQuarterlyCI95[0])}, ${f(c.longShort.meanQuarterlyCI95[1])}] | ${f(c.longOnly.annualizedReturn)} | ${f(c.longOnly.sharpe, 2)} | ${f(c.longOnly.maxDrawdown)} |\n`;
  }
  md += `\n^GSPC buy-and-hold w tych samych kwartałach (indeks cenowy, BEZ dywidend — zaniża benchmark o ~2 pp rocznie): roczny zwrot ${f(spy.annualizedReturn)}, Sharpe ${f(spy.sharpe, 2)}, maxDD ${f(spy.maxDrawdown)}. Strategie liczone na zwrotach całkowitych (adjclose).\n`;

  ensureArtifactsDir();
  fs.writeFileSync(DECILE_REPORT, md);
  fs.writeFileSync(DECILE_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), nQuarters: series.length, grossSpread12m: gross, turnover: { long: turnLong, short: turnShort }, costs, spy }, null, 2));
  console.log(md);
}

main();
