/**
 * Notowania funduszy rynku akcji USA do K2 (kurs skorygowany o dywidendy):
 *  • SPY — S&P 500, punkt odniesienia z preregistracji,
 *  • VTI — cały rynek USA (NYSE, Nasdaq, także małe spółki), porównanie informacyjne.
 *   npm run download:market
 * Wynik: data/macro/SPY.json, data/macro/VTI.json (poza repozytorium — dane Yahoo).
 */
import fs from 'node:fs';
import { SPY_JSON, VTI_JSON } from '../src/paths.js';
import { loadPriceFile } from '../src/universe.js';
import { yahooFinance } from '../src/yahoo-mapper.js';

async function download(symbol: string, target: string) {
  const data = await yahooFinance.chart(symbol, { period1: new Date('2004-01-01T00:00:00Z'), interval: '1d' });
  fs.mkdirSync('data/macro', { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ symbol, ...data }));
  const series = loadPriceFile(target);
  if (!series) throw new Error(`Pobrany plik ${symbol} nie zawiera notowań.`);
  const first = series.quotes[0];
  const last = series.quotes[series.quotes.length - 1];
  console.error(`Zapisano ${target}: ${series.quotes.length} sesji, ${String(first.date).slice(0, 10)} – ${String(last.date).slice(0, 10)}.`);
}

async function main() {
  await download('SPY', SPY_JSON);
  await download('VTI', VTI_JSON);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
