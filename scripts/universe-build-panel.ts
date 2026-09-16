/**
 * Krok (c), etap 4: panel faktów dla pełnego uniwersum (NYSE + Nasdaq, kapitalizacja ≥ 1 mld USD).
 *   npx tsx scripts/universe-build-panel.ts
 *
 * Różnice względem panelu S&P:
 *  • o obecności spółki w danym kwartale decyduje kapitalizacja w tym dniu (point-in-time), a nie skład indeksu,
 *  • spółki liczone są pojedynczo — całość nie mieści się w pamięci,
 *  • moment publikacji raportu bierzemy z listy formularzy samej spółki,
 *  • notowania z Yahoo trafiają do panelu tylko po potwierdzeniu, że należą do tej spółki (`price-verification`).
 *
 * Wynik: <UNIVERSE_DATA_DIR>/panel/facts-panel.csv, <UNIVERSE_DATA_DIR>/panel/companies.json,
 *        artifacts/universe/panel-stats.json
 */
import fs from 'node:fs';
import {
  DEI_CONCEPTS,
  US_GAAP_CONCEPTS,
  buildQuarterlyTimeline,
  slimQuotes,
  slimTaxonomy,
  type CompanyFacts,
  type ParsedCache,
  type PriceSeries,
} from '../src/data-loader.js';
import { HORIZONS, panelCsvHeader, panelCsvLine } from '../src/facts-panel.js';
import { buildCompanyRows, emptySkips } from '../src/panel-builder.js';
import { DATA_END_YEAR, DATA_START_YEAR, UNIVERSE_MIN_MARKET_CAP, universeDir } from '../src/paths.js';
import { verifyPriceSeries } from '../src/price-verification.js';
import { companyEvents, loadFilings } from '../src/sec-events.js';
import { floatImpliedPrices, terminalOutcome } from '../src/terminal-outcomes.js';
import { exclusionReason, listingOf, readCandidates } from '../src/universe.js';

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf-8'));

function loadPrices(file: string): PriceSeries | null {
  const raw = readJson(file);
  if (raw.error || !Array.isArray(raw.quotes)) return null;
  const quotes = slimQuotes(raw.quotes);
  if (quotes.length === 0) return null;
  return {
    quotes,
    splits: (raw.events?.splits ?? []).map((s: any) => ({
      date: s.date,
      t: new Date(s.date).getTime(),
      numerator: s.numerator,
      denominator: s.denominator,
    })),
  };
}

/** Czas akceptacji każdego raportu spółki — z jej własnej listy formularzy. */
function acceptanceTimes(cik: string, subsDir: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of loadFilings(cik, subsDir)) {
    const t = new Date(f.acceptanceDateTime ?? f.filingDate).getTime();
    if (f.accessionNumber && Number.isFinite(t)) out[f.accessionNumber] = t;
  }
  return out;
}

async function main() {
  const subsDir = universeDir('submissions');
  const factsDir = universeDir('fundamentals');
  const pricesDir = universeDir('prices');
  const panelDir = universeDir('panel');
  fs.mkdirSync(panelDir, { recursive: true });
  fs.mkdirSync('artifacts/universe', { recursive: true });

  const candidates = readCandidates();

  // Przebieg 1: ostatni dzień notowań w danych. Za nim przyszłość jeszcze się nie wydarzyła.
  let endT = 0;
  const priceFiles = fs.existsSync(pricesDir) ? fs.readdirSync(pricesDir) : [];
  if (priceFiles.length === 0) {
    console.error(`Brak notowań w ${pricesDir}. Uruchom: npx tsx scripts/universe-download-prices.ts`);
    process.exit(1);
  }
  for (const f of priceFiles) {
    const p = loadPrices(`${pricesDir}/${f}`);
    const last = p?.quotes[p.quotes.length - 1];
    if (last && last.t > endT) endT = last.t;
  }
  const endDay = new Date(endT).toISOString().slice(0, 10);
  console.error(`Plików z notowaniami: ${priceFiles.length}. Ostatni dzień notowań: ${endDay}.`);

  const timeline = buildQuarterlyTimeline(DATA_START_YEAR, DATA_END_YEAR).map((q) => q.dateStr);
  const skips = emptySkips();
  const loaderStats: ParsedCache['stats'] = { droppedMissingAccn: 0, keptWithAccn: 0, ciksWithoutFundamentals: 0, ciksWithoutPrices: 0 };
  const companyStatus: Record<string, { status: string; rows?: number; detail?: string }> = {};
  const out = fs.createWriteStream(`${panelDir}/facts-panel.csv`);
  out.write(panelCsvHeader() + '\n');
  let rowCount = 0;
  const horizonCounts: Record<number, number> = Object.fromEntries(HORIZONS.map((h) => [h, 0]));
  const started = Date.now();
  let i = 0;

  for (const c of candidates) {
    i++;
    if (i % 200 === 0) {
      const left = Math.round((((Date.now() - started) / i) * (candidates.length - i)) / 60000);
      console.error(`  ${i}/${candidates.length}, wierszy ${rowCount} (zostało ok. ${left} min)`);
    }
    const reason = exclusionReason(c.cik, subsDir);
    if (reason) {
      companyStatus[c.cik] = { status: 'excluded', detail: reason };
      continue;
    }
    const pricePath = `${pricesDir}/CIK${c.cik}.json`;
    const factsPath = `${factsDir}/CIK${c.cik}.json`;
    if (!fs.existsSync(pricePath)) {
      companyStatus[c.cik] = { status: 'no_prices' };
      continue;
    }
    if (!fs.existsSync(factsPath)) {
      companyStatus[c.cik] = { status: 'no_fundamentals' };
      continue;
    }
    const prices = loadPrices(pricePath);
    if (!prices) {
      companyStatus[c.cik] = { status: 'no_prices' };
      continue;
    }

    const rawFacts = readJson(factsPath);
    const accn = acceptanceTimes(c.cik, subsDir);
    const facts: CompanyFacts = {
      facts: {
        'us-gaap': slimTaxonomy(rawFacts.facts?.['us-gaap'], US_GAAP_CONCEPTS, accn, loaderStats),
        dei: slimTaxonomy(rawFacts.facts?.dei, DEI_CONCEPTS, accn, loaderStats),
      },
    };

    // Weryfikacja na pełnych faktach `dei` (float nie jest wśród wczytywanych konceptów).
    const verification = verifyPriceSeries(prices, { facts: { 'us-gaap': {}, dei: rawFacts.facts?.dei ?? {} } } as CompanyFacts);
    if (verification.status !== 'verified') {
      companyStatus[c.cik] = {
        status: `price_${verification.status}`,
        detail: verification.medianRatio == null ? undefined : `mediana ${verification.medianRatio.toFixed(2)}, n=${verification.overlaps}`,
      };
      continue;
    }

    const ev = companyEvents(c.cik, subsDir);
    const outcome = terminalOutcome({
      events: ev.events,
      floatPrices: floatImpliedPrices({ facts: { 'us-gaap': {}, dei: rawFacts.facts?.dei ?? {} } } as CompanyFacts),
      lastFilingDate: ev.lastFilingDate,
      asOfEnd: endDay,
    });

    const listing = listingOf(c.cik, subsDir);
    const rows = buildCompanyRows(
      {
        cik: c.cik,
        ticker: listing.ticker ?? c.cik,
        sic: listing.sic,
        prices,
        facts,
        terminal: { kind: outcome.kind, eventDate: outcome.eventDate },
      },
      timeline,
      { endDay, minMarketCap: UNIVERSE_MIN_MARKET_CAP },
      skips
    );
    for (const r of rows) {
      out.write(panelCsvLine(r) + '\n');
      for (const h of HORIZONS) if (r[`fwdPrice${h}`] != null) horizonCounts[h]++;
    }
    rowCount += rows.length;
    companyStatus[c.cik] = { status: rows.length ? 'in_panel' : 'no_rows', rows: rows.length };
  }

  await new Promise<void>((resolve) => out.end(resolve));

  const byStatus = Object.values(companyStatus).reduce<Record<string, number>>(
    (acc, s) => ((acc[s.status] = (acc[s.status] ?? 0) + 1), acc),
    {}
  );
  fs.writeFileSync(`${panelDir}/companies.json`, JSON.stringify(companyStatus, null, 1));
  const stats = {
    generatedAt: new Date().toISOString(),
    candidates: candidates.length,
    companiesByStatus: byStatus,
    rows: rowCount,
    lastDataDay: endDay,
    minMarketCap: UNIVERSE_MIN_MARKET_CAP,
    skips,
    rowsWithForwardPrice: horizonCounts,
    factsDroppedWithoutAcceptanceTime: loaderStats.droppedMissingAccn,
    factsKept: loaderStats.keptWithAccn,
  };
  fs.writeFileSync('artifacts/universe/panel-stats.json', JSON.stringify(stats, null, 2));

  console.error(`\nWierszy: ${rowCount}. Spółki: ${JSON.stringify(byStatus)}`);
  console.error(`Pominięte kwartały: ${JSON.stringify(skips)}`);
  for (const h of HORIZONS) console.error(`  cena po ${h} latach: ${horizonCounts[h]}`);
  if (rowCount === 0) {
    console.error('Panel jest pusty.');
    process.exit(1);
  }
}

main();
