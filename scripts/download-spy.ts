/**
 * Notowania funduszu SPY (S&P 500 z dywidendami w kursie skorygowanym) — punkt odniesienia K2.
 *   npm run download:spy
 * Wynik: data/macro/SPY.json (poza repozytorium — dane Yahoo).
 */
import fs from 'node:fs';
import { SPY_JSON } from '../src/paths.js';
import { loadPriceFile } from '../src/universe.js';
import { yahooFinance } from '../src/yahoo-mapper.js';

async function main() {
  const data = await yahooFinance.chart('SPY', { period1: new Date('2004-01-01T00:00:00Z'), interval: '1d' });
  fs.mkdirSync('data/macro', { recursive: true });
  fs.writeFileSync(SPY_JSON, JSON.stringify({ symbol: 'SPY', ...data }));
  const series = loadPriceFile(SPY_JSON);
  if (!series) throw new Error('Pobrany plik SPY nie zawiera notowań.');
  const first = series.quotes[0];
  const last = series.quotes[series.quotes.length - 1];
  console.error(`Zapisano ${SPY_JSON}: ${series.quotes.length} sesji, ${first.date.slice(0, 10)} – ${last.date.slice(0, 10)}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
