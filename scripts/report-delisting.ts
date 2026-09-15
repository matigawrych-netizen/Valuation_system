/**
 * Wpływ założeń o zwrocie przy delistingu na metryki (spółki usunięte z indeksu w okresie treningowym).
 *   npx tsx scripts/report-delisting.ts
 *
 * Dataset zawiera tylko wiersze z 12M etykietą cenową. Tutaj dokładamy obserwacje spółek, które przestały być
 * notowane przed horyzontem, z etykietą zależną od przyczyny usunięcia i założenia dla 'delisting_other'.
 */
import {
  buildQuarterlyTimeline,
  getFundamentalsAsOf,
  getQuoteAtDate,
  getUniverseAsOf,
  loadCacheToMemory,
} from '../src/data-loader.js';
import { parseCSV } from '../src/dataset.js';
import { evaluate } from '../src/evaluation-harness.js';
import { getMacroAsOf } from '../src/macro-provider.js';
import { computeMarketStats } from '../src/market-stats.js';
import { DATA_START_YEAR, DATASET_CSV, TRAIN_END_YEAR, asOfYear, isTrainPeriod, requireDataset } from '../src/paths.js';
import { addMonths } from '../src/purging.js';
import { mapSecToYahooSnapshot } from '../src/sec-edgar-provider.js';
import { calculateFairValue } from '../src/valuation-engine.js';

const ASSUMPTIONS = [-1.0, -0.7, -0.3];

function main() {
  requireDataset();
  const base = parseCSV(DATASET_CSV).filter((r) => isTrainPeriod(r.asOf));
  const cache = loadCacheToMemory();
  const removed = new Set(cache.membership.filter((m) => m.date_removed).map((m) => m.cik));

  const terminal: { upside: number; asOf: string; reason: string | null; lastReturn: number | null }[] = [];
  for (const t of buildQuarterlyTimeline(DATA_START_YEAR, TRAIN_END_YEAR)) {
    if (asOfYear(t.dateStr) > TRAIN_END_YEAR) continue;
    const macro = getMacroAsOf(cache, t.dateStr);
    for (const cik of getUniverseAsOf(cache, t.dateStr)) {
      if (!removed.has(cik) || !cache.prices[cik] || !cache.fundamentals[cik]) continue;
      const now = getQuoteAtDate(cache.prices[cik], t.dateStr);
      if (!now) continue;
      const fwdDate = addMonths(t.dateStr, 12).toISOString().slice(0, 10);
      if (getQuoteAtDate(cache.prices[cik], fwdDate)) continue; // ma normalną etykietę => jest w datasecie
      const mapped = mapSecToYahooSnapshot({
        ticker: cik,
        cik,
        asOf: t.dateStr,
        price: now.close,
        facts: getFundamentalsAsOf(cache, cik, t.dateStr)!,
        splits: cache.prices[cik].splits,
        market: computeMarketStats(cache, cik, t.dateStr),
        sic: cache.sic[cik] ?? null,
      });
      if (!mapped.snapshot) continue;
      const quotes = cache.prices[cik].quotes;
      const last = quotes[quotes.length - 1];
      const m = (cache.membershipByCik[cik] ?? []).filter((x) => x.date_removed).pop();
      terminal.push({
        upside: calculateFairValue(mapped.snapshot, { macro }).upside,
        asOf: t.dateStr,
        reason: m?.removal_reason ?? null,
        lastReturn: last.adj / now.adj - 1,
      });
    }
  }

  console.log(`Wiersze datasetu (okres treningowy): ${base.length}. Obserwacje terminalne (brak ceny za 12M): ${terminal.length}.`);
  console.log('| założenie delisting_other | N | IC (średnia po kwartałach) | spread decylowy | trafność |');
  console.log('|---|---|---|---|---|');
  for (const assumption of ASSUMPTIONS) {
    const extra = terminal.map((o) => ({
      upside: o.upside,
      asOf: o.asOf,
      actual:
        o.reason === 'bankruptcy'
          ? -1
          : o.reason === 'acquisition' || o.reason === 'merger'
            ? (o.lastReturn ?? 0)
            : o.reason === 'delisting_other'
              ? assumption
              : (o.lastReturn ?? assumption),
    }));
    const preds = [...base.map((r) => r.upside ?? 0), ...extra.map((e) => e.upside)];
    const acts = [...base.map((r) => r.fwdReturn), ...extra.map((e) => e.actual)];
    const meta = [...base.map((r) => ({ quarter: r.asOf })), ...extra.map((e) => ({ quarter: e.asOf }))];
    const ev = evaluate(preds, acts, meta);
    console.log(`| ${assumption} | ${preds.length} | ${ev.IC_by_quarter.mean?.toFixed(4) ?? '—'} | ${ev.decile_spread?.toFixed(4) ?? '—'} | ${ev.hitRate?.toFixed(4) ?? '—'} |`);
  }
  console.log('\nPrzejęcia/fuzje: ostatnia dostępna cena (adjclose). Usunięcia index_decision bez 12M notowań: ostatnia cena, a gdy brak — założenie.');
}

main();
