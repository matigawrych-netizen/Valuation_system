/**
 * Krok (c), etap 3: notowania dzienne z Yahoo dla spółek z pełnego uniwersum.
 *   npx tsx scripts/universe-download-prices.ts
 *
 * Ticker bierzemy z SEC (pole `tickers`/`exchanges` listy formularzy), a nie z własnej listy — SEC wiąże
 * go z numerem CIK. Spółki, których już nie ma, nie mają tickera i Yahoo nie ma ich notowań
 * (sprawdzone 2026-09-16) — zostają policzone w raporcie jako brak cen, a nie pominięte po cichu.
 *
 * Czy pobrana seria należy do tej spółki, sprawdza później `src/price-verification.ts`.
 * Wznawianie: pliki już pobrane są pomijane.
 * Wynik: <UNIVERSE_DATA_DIR>/prices/CIK*.json + <UNIVERSE_DATA_DIR>/meta/download-prices.json
 */
import fs from 'node:fs';
import { universeDir } from '../src/paths.js';
import { exclusionReason, listingOf, readCandidates, yahooSymbol } from '../src/universe.js';
import { yahooFinance } from '../src/yahoo-mapper.js';

const START = new Date('2004-01-01T00:00:00Z');
const MIN_INTERVAL_MS = 400;
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Błędy, po których ponawianie nie ma sensu: Yahoo nie zna tego symbolu. */
const isPermanent = (msg: string) => /no data found|symbol may be delisted|not found/i.test(msg);

async function fetchChart(symbol: string): Promise<{ ok: true; data: any } | { ok: false; permanent: boolean; error: string }> {
  let last = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(MIN_INTERVAL_MS);
    try {
      const data = await yahooFinance.chart(symbol, { period1: START, interval: '1d' });
      return { ok: true, data };
    } catch (err: any) {
      last = String(err?.message ?? err);
      if (isPermanent(last)) return { ok: false, permanent: true, error: last };
      await sleep(2000 * 2 ** attempt);
    }
  }
  return { ok: false, permanent: false, error: last };
}

async function main() {
  const pricesDir = universeDir('prices');
  fs.mkdirSync(pricesDir, { recursive: true });
  const candidates = readCandidates();

  const status: Record<string, { status: string; symbol?: string; detail?: string }> = {};
  const started = Date.now();
  let i = 0;

  for (const c of candidates) {
    i++;
    if (i % 100 === 0) {
      const left = Math.round((((Date.now() - started) / i) * (candidates.length - i)) / 60000);
      console.error(`  ${i}/${candidates.length}  (zostało ok. ${left} min)`);
    }
    const reason = exclusionReason(c.cik);
    if (reason) {
      status[c.cik] = { status: 'excluded', detail: reason };
      continue;
    }
    const target = `${pricesDir}/CIK${c.cik}.json`;
    if (fs.existsSync(target)) {
      status[c.cik] = { status: 'cached' };
      continue;
    }
    const listing = listingOf(c.cik);
    if (!listing.ticker) {
      status[c.cik] = {
        status: listing.all.length ? 'other_exchange' : 'no_ticker',
        detail: listing.all.map((x) => `${x.ticker}@${x.exchange ?? '?'}`).join(' ') || undefined,
      };
      continue;
    }
    const symbol = yahooSymbol(listing.ticker);
    const r = await fetchChart(symbol);
    if (!r.ok) {
      status[c.cik] = { status: r.permanent ? 'yahoo_no_data' : 'failed', symbol, detail: r.error.slice(0, 200) };
      continue;
    }
    fs.writeFileSync(target, JSON.stringify({ symbol, exchange: listing.exchange, ...r.data }));
    status[c.cik] = { status: 'downloaded', symbol };
  }

  const counts = Object.values(status).reduce<Record<string, number>>((acc, s) => ((acc[s.status] = (acc[s.status] ?? 0) + 1), acc), {});
  fs.writeFileSync(
    universeDir('meta', 'download-prices.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), counts, status }, null, 1)
  );
  console.error('\nNotowania:', JSON.stringify(counts));
  const failed = Object.entries(status).filter(([, s]) => s.status === 'failed');
  for (const [cik, s] of failed.slice(0, 10)) console.error(`  BŁĄD ${cik} ${s.symbol}: ${s.detail}`);
  if (failed.length) {
    console.error('Część pobrań się nie udała (błędy przejściowe) — uruchom ponownie.');
    process.exit(1);
  }
}

main();
