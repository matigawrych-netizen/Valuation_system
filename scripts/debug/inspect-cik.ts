/**
 * NARZĘDZIE RĘCZNE (debug) — nie jest częścią pipeline'u.
 * Wypisuje, co system widzi dla jednej spółki w jednym dniu decyzji: fakty XBRL, snapshot, makro, wycenę.
 *   npx tsx scripts/debug/inspect-cik.ts 0000320193 2023-11-15
 * Zastępuje dawne jednorazowe skrypty z katalogu głównego (check_cache.ts, test3.ts, test4.ts, test_models.ts, test_universe.ts).
 */
import { getFundamentalsAsOf, getQuoteAtDate, getUniverseAsOf, loadCacheToMemory } from '../../src/data-loader.js';
import { getMacroAsOf } from '../../src/macro-provider.js';
import { computeMarketStats } from '../../src/market-stats.js';
import { mapSecToYahooSnapshot } from '../../src/sec-edgar-provider.js';
import { calculateFairValue } from '../../src/valuation-engine.js';

const [cik = '0000320193', asOf = '2023-11-15'] = process.argv.slice(2);
const cache = loadCacheToMemory({ ciks: [cik] });
console.log('W składzie indeksu w tym dniu:', getUniverseAsOf(cache, asOf).includes(cik));
const quote = getQuoteAtDate(cache.prices[cik], asOf);
console.log('Notowanie:', quote);
const facts = getFundamentalsAsOf(cache, cik, asOf);
console.log('Koncepty us-gaap dostępne PIT:', Object.keys(facts?.facts['us-gaap'] ?? {}).length, 'dei:', Object.keys(facts?.facts.dei ?? {}));
if (!quote || !facts) process.exit(0);
const mapped = mapSecToYahooSnapshot({
  ticker: cache.cikToTicker[cik] ?? cik,
  cik,
  asOf,
  price: quote.close,
  facts,
  splits: cache.prices[cik].splits,
  market: computeMarketStats(cache, cik, asOf),
  sic: cache.sic[cik] ?? null,
});
console.log('Pominięcie:', mapped.skipReason, '\nSnapshot:', JSON.stringify(mapped.snapshot, null, 2));
if (!mapped.snapshot) process.exit(0);
const macro = getMacroAsOf(cache, asOf);
console.log('Makro:', macro);
const val = calculateFairValue(mapped.snapshot, { macro });
console.log('Wycena:', { ...val, archetypeBlend: val.archetypeBlend.slice(0, 3) });
