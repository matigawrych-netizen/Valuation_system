/**
 * Generator datasetu backtestu (point-in-time), jeden wiersz = (CIK, data decyzji).
 *
 *   npx tsx scripts/generate-dataset.ts
 *
 * Wymaga:   data/macro/fred-pit.json (scripts/download-macro-fred.ts)
 * Używa, jeśli istnieją:  artifacts/default-model.json (pDefault), artifacts/accuracy-profile.json (confidenceScore)
 * Zapisuje: data/backtest-results.csv, data/snapshots.jsonl, artifacts/generate_stats.json
 *
 * Kolumny fairValue/upside/verdict są liczone eksperckim WEIGHT_MATRIX (nie wytrenowanymi wagami),
 * żeby dataset nie zawierał wyników dopasowanych do samego siebie.
 */
import fs from 'node:fs';
import {
  buildQuarterlyTimeline,
  getFundamentalsAsOf,
  getQuoteAtDate,
  getUniverseAsOf,
  loadCacheToMemory,
  type PriceSeries,
} from '../src/data-loader.js';
import { DATASET_COLUMNS } from '../src/dataset.js';
import { loadDefaultModel } from '../src/default-model.js';
import { buildEngineConfig } from '../src/engine-config.js';
import { getMacroAsOf } from '../src/macro-provider.js';
import { computeMarketStats } from '../src/market-stats.js';
import {
  DATA_END_YEAR,
  DATA_START_YEAR,
  DATASET_CSV,
  DATASET_STATS,
  DEFAULT_MODEL,
  FRED_PIT_JSON,
  SNAPSHOTS_JSONL,
  ensureArtifactsDir,
} from '../src/paths.js';
import { addMonths } from '../src/purging.js';
import { mapSecToYahooSnapshot } from '../src/sec-edgar-provider.js';
import { median } from '../src/stats.js';
import { MODEL_KEYS, calculateFairValue } from '../src/valuation-engine.js';

type Cell = string | number | boolean | null | undefined;

const fmt = (v: Cell): string => {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v.toPrecision(10))) : '';
  return String(v).replace(/,/g, ' ');
};

function forwardReturn(series: PriceSeries, asOf: string, months: number, lastDataDay: string) {
  const fwdDate = addMonths(asOf, months).toISOString().slice(0, 10);
  if (fwdDate > lastDataDay) return { value: null, reason: `horyzont ${months}M poza zakresem danych (${lastDataDay})` };
  const now = getQuoteAtDate(series, asOf);
  if (!now) return { value: null, reason: 'brak ceny w dniu decyzji' };
  const fut = getQuoteAtDate(series, fwdDate);
  if (!fut) {
    const last = series.quotes[series.quotes.length - 1];
    const ended = last.t < new Date(`${fwdDate}T00:00:00Z`).getTime();
    return {
      value: null,
      reason: ended ? `notowania zakończone przed horyzontem ${months}M (delisting/przejęcie)` : `luka w notowaniach na horyzoncie ${months}M`,
    };
  }
  return { value: fut.adj / now.adj - 1, reason: null };
}

async function main() {
  const t0 = Date.now();
  const cache = loadCacheToMemory();
  const timeline = buildQuarterlyTimeline(DATA_START_YEAR, DATA_END_YEAR);
  const gspc = cache.macro['GSPC'];
  if (!gspc?.quotes.length) throw new Error('Brak ^GSPC w cache — nie da się ustalić zakresu danych');
  const lastDataDay = gspc.quotes[gspc.quotes.length - 1].date.slice(0, 10);

  const { config: engineConfig, sources } = buildEngineConfig({ trainedWeights: false });
  const defaultModelPresent = loadDefaultModel() != null;
  if (!defaultModelPresent) console.warn(`UWAGA: brak ${DEFAULT_MODEL} — kolumna pDefault będzie pusta (confidence obniżone).`);
  console.log(`Źródła konfiguracji silnika: ${sources.join(', ')}`);

  const reasons: Record<string, number> = {};
  const labelMissing: Record<string, number> = {};
  const bump = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);
  let universeRows = 0;
  let rowsWritten = 0;
  let lowConfidenceRows = 0;
  let pDefaultKnownRows = 0;
  let capHitRows = 0;

  if (fs.existsSync(DATASET_CSV)) fs.unlinkSync(DATASET_CSV);
  const tmpCsv = `${DATASET_CSV}.tmp`;
  const tmpSnap = `${SNAPSHOTS_JSONL}.tmp`;
  const csvFd = fs.openSync(tmpCsv, 'w');
  const snapFd = fs.openSync(tmpSnap, 'w');
  fs.writeSync(csvFd, `${DATASET_COLUMNS.join(',')}\n`);

  for (const t of timeline) {
    const macro = getMacroAsOf(cache, t.dateStr);
    const quarterRows: Record<string, Cell>[] = [];

    for (const cik of getUniverseAsOf(cache, t.dateStr)) {
      universeRows++;
      const series = cache.prices[cik];
      if (!series) {
        bump(reasons, 'brak pliku cen w cache');
        continue;
      }
      if (!cache.fundamentals[cik]) {
        bump(reasons, 'brak pliku fundamentów w cache');
        continue;
      }
      const quote = getQuoteAtDate(series, t.dateStr);
      if (!quote) {
        bump(reasons, 'brak notowania w dniu decyzji');
        continue;
      }
      const ticker = cache.cikToTicker[cik] ?? cik;
      const market = computeMarketStats(cache, cik, t.dateStr);
      const mapped = mapSecToYahooSnapshot({
        ticker,
        cik,
        asOf: t.dateStr,
        price: quote.close,
        facts: getFundamentalsAsOf(cache, cik, t.dateStr)!,
        splits: series.splits,
        market,
        sic: cache.sic[cik] ?? null,
      });
      if (!mapped.snapshot) {
        bump(reasons, `mapper: ${mapped.skipReason}`);
        continue;
      }
      const f12 = forwardReturn(series, t.dateStr, 12, lastDataDay);
      if (f12.value == null) {
        bump(labelMissing, f12.reason!);
        continue;
      }
      const f3 = forwardReturn(series, t.dateStr, 3, lastDataDay);

      const s = mapped.snapshot;
      const val = calculateFairValue(s, { macro, engineConfig });
      const shares = s.defaultKeyStatistics.sharesOutstanding!;
      if (val.lowConfidence) lowConfidenceRows++;
      if (val.pDefault != null) pDefaultKnownRows++;
      if (val.capHits.length) capHitRows++;

      const row: Record<string, Cell> = {
        ticker,
        cik,
        asOf: t.dateStr,
        sector: s.assetProfile?.sector ?? null,
        sic: cache.sic[cik] ?? null,
        price: quote.close,
        fwdReturn12m: f12.value,
        fwdReturn3m: f3.value,
        target_excess: null,
        fairValue: val.fairValue,
        upside: val.upside,
        entryTarget: val.entryTarget,
        marginOfSafety: val.marginOfSafety,
        confidenceScore: val.confidenceScore,
        validModelCount: val.validModelCount,
        lowConfidence: val.lowConfidence,
        pDefault: val.pDefault,
        verdict: val.verdict,
        capHits: val.capHits.length,
        dominantArchetype: val.archetypeBlend[0]?.archetype ?? null,
        beta: s.summaryDetail.beta,
        bookValuePerShare: s.defaultKeyStatistics.bookValue,
        eps: s.defaultKeyStatistics.trailingEps,
        fcfPerShare: s.financialData.freeCashflow != null ? s.financialData.freeCashflow / shares : null,
        momentum12_1: null,
        marketCap: quote.close * shares,
        stalenessDays: s.metadata?.stalenessDays,
      };
      for (const m of MODEL_KEYS) row[m] = val.models[m];
      row.momentum12_1 = computeMarketStats(cache, cik, t.dateStr)?.momentum12_1 ?? null;
      quarterRows.push(row);
      fs.writeSync(
        snapFd,
        `${JSON.stringify({ cik, ticker, asOf: t.dateStr, price: quote.close, fwdReturn12m: f12.value, macro, snapshot: s })}\n`
      );
    }

    // Zwrot nadwyżkowy względem mediany sektora w tym samym kwartale (sektor nieznany => cała próba)
    const bySector = new Map<string, number[]>();
    for (const r of quarterRows) {
      const key = (r.sector as string | null) ?? '__ALL__';
      if (!bySector.has(key)) bySector.set(key, []);
      bySector.get(key)!.push(r.fwdReturn12m as number);
    }
    const allMedian = median(quarterRows.map((r) => r.fwdReturn12m as number));
    for (const r of quarterRows) {
      const peers = bySector.get((r.sector as string | null) ?? '__ALL__')!;
      r.target_excess = (r.fwdReturn12m as number) - (peers.length >= 5 ? median(peers) : allMedian);
      fs.writeSync(csvFd, `${DATASET_COLUMNS.map((c) => fmt(r[c])).join(',')}\n`);
      rowsWritten++;
    }
    console.log(`${t.dateStr}: ${quarterRows.length} wierszy (łącznie ${rowsWritten})`);
  }

  fs.closeSync(csvFd);
  fs.closeSync(snapFd);
  fs.renameSync(tmpCsv, DATASET_CSV);
  fs.renameSync(tmpSnap, SNAPSHOTS_JSONL);

  const membershipAnomalies = cache.membership.filter((m) => m.date_added && m.date_removed && m.date_added > m.date_removed);
  const stats = {
    generatedAt: new Date().toISOString(),
    runtimeSec: Math.round((Date.now() - t0) / 1000),
    timeline: { first: timeline[0].dateStr, last: timeline[timeline.length - 1].dateStr, quarters: timeline.length },
    lastPriceDay: lastDataDay,
    macroSource: FRED_PIT_JSON,
    engineConfigSources: sources,
    defaultModelPresent,
    universeRows,
    skipReasons: reasons,
    labelMissingReasons: labelMissing,
    rowsWritten,
    lowConfidenceRows,
    pDefaultKnownRows,
    capHitRows,
    dataLoaderStats: cache.stats,
    membershipDateAnomalies: membershipAnomalies.map((m) => ({ cik: m.cik, ticker: m.ticker, added: m.date_added, removed: m.date_removed })),
  };
  ensureArtifactsDir();
  fs.writeFileSync(DATASET_STATS, JSON.stringify(stats, null, 2));
  console.log(`\nZapisano ${rowsWritten} wierszy do ${DATASET_CSV} w ${stats.runtimeSec}s. Statystyki: ${DATASET_STATS}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
