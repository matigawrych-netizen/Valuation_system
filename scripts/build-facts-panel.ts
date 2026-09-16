/**
 * Buduje panel faktów: jeden wiersz = (spółka, data decyzji), z wielkościami bieżącymi
 * i tym, co stało się z ceną oraz wynikami po 1, 2, 3, 4 i 5 latach.
 *   npx tsx scripts/build-facts-panel.ts
 *
 * Kolumny bieżące powstają wyłącznie z faktów zaakceptowanych przez SEC przed datą decyzji.
 * Kolumny przyszłe są etykietami — im wolno patrzeć w przyszłość.
 *
 * Wynik: data/facts-panel.csv + artifacts/facts-panel-stats.json
 */
import fs from 'node:fs';
import {
  buildQuarterlyTimeline,
  getFundamentalsAsOf,
  getQuoteAtDate,
  getUniverseAsOf,
  loadCacheToMemory,
  type ParsedCache,
} from '../src/data-loader.js';
import { HORIZONS, PANEL_COLUMNS } from '../src/facts-panel.js';
import {
  DATA_END_YEAR,
  DATA_START_YEAR,
  FACTS_PANEL_CSV,
  FACTS_PANEL_STATS,
  SEC_EVENTS_JSON,
  ensureArtifactsDir,
} from '../src/paths.js';
import { addMonths } from '../src/purging.js';
import { sectorFromSic } from '../src/sectors.js';
import { C, XbrlView } from '../src/xbrl.js';

type Cell = string | number | null;

const fmt = (v: Cell): string => {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v.toPrecision(10))) : '';
  return String(v).replace(/,/g, ' ');
};

const ratio = (a: number | null, b: number | null): number | null =>
  a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null;

const dateOf = (asOf: string, years: number) => addMonths(asOf, 12 * years).toISOString().slice(0, 10);

/** Ostatni dzień z notowaniami w całym cache — odróżnia „horyzont poza danymi” od „spółka zniknęła”. */
function lastDataDay(cache: ParsedCache): string {
  let maxT = 0;
  for (const series of Object.values(cache.prices)) {
    const last = series.quotes[series.quotes.length - 1];
    if (last && last.t > maxT) maxT = last.t;
  }
  if (maxT === 0) throw new Error('Cache nie zawiera żadnych notowań.');
  return new Date(maxT).toISOString().slice(0, 10);
}

interface Skips {
  noPrice: number;
  noFundamentals: number;
  noRevenue: number;
  noShares: number;
}

function main() {
  const cache = loadCacheToMemory();
  const endDay = lastDataDay(cache);
  console.error(`Ostatni dzień z notowaniami: ${endDay}`);

  const events: Record<string, { outcome: { kind: string; eventDate: string | null }; lastFilingDate: string | null }> =
    fs.existsSync(SEC_EVENTS_JSON) ? JSON.parse(fs.readFileSync(SEC_EVENTS_JSON, 'utf-8')).companies : {};
  if (!Object.keys(events).length) {
    console.error(`Brak ${SEC_EVENTS_JSON} — uruchom: npm run sec-events`);
    process.exit(1);
  }

  const out = fs.createWriteStream(FACTS_PANEL_CSV);
  out.write(PANEL_COLUMNS.join(',') + '\n');

  const skips: Skips = { noPrice: 0, noFundamentals: 0, noRevenue: 0, noShares: 0 };
  const horizonCounts: Record<number, number> = Object.fromEntries(HORIZONS.map((h) => [h, 0]));
  let rows = 0;
  const ciksSeen = new Set<string>();

  for (const q of buildQuarterlyTimeline(DATA_START_YEAR, DATA_END_YEAR)) {
    const asOf = q.dateStr;
    if (asOf > endDay) continue;

    for (const cik of getUniverseAsOf(cache, asOf)) {
      const series = cache.prices[cik];
      const now = series ? getQuoteAtDate(series, asOf) : null;
      if (!now) {
        skips.noPrice++;
        continue;
      }
      const facts = getFundamentalsAsOf(cache, cik, asOf);
      if (!facts) {
        skips.noFundamentals++;
        continue;
      }

      const view = new XbrlView(facts);
      const asOfT = new Date(`${asOf}T00:00:00Z`).getTime();
      // Ceny Yahoo są skorygowane o splity do dziś, liczba akcji z SEC nie jest.
      // Bez tego przeliczenia kapitalizacja spółki po splicie byłaby zaniżona (AAPL 2020: 4-krotnie).
      const splitFactor = (fromT: number) =>
        series.splits.reduce(
          (m, sp) => (sp.t > fromT && sp.numerator > 0 && sp.denominator > 0 ? (m * sp.numerator) / sp.denominator : m),
          1
        );
      const revenue = view.ttm(C.revenue)?.val ?? null;
      if (revenue == null) {
        skips.noRevenue++;
        continue;
      }
      const sharesFact = view.latestInstant(C.sharesDei, 'dei', 'shares');
      if (sharesFact == null || sharesFact.val <= 0) {
        skips.noShares++;
        continue;
      }
      const shares = sharesFact.val * splitFactor(sharesFact.endT);

      const netIncome = view.ttm(C.netIncome)?.val ?? null;
      const ebit = view.ttm(C.ebit)?.val ?? null;
      const ocf = view.ttm(C.ocf)?.val ?? null;
      const capex = view.ttm(C.capex)?.val ?? null;
      const dividends = view.ttm(C.dividends)?.val ?? null;
      const equity = view.latestInstant(C.equity)?.val ?? null;
      const assets = view.latestInstant(C.assets)?.val ?? null;
      const cash = view.latestInstant(C.cash)?.val ?? null;
      const liabilities = view.latestInstant(C.liabilities)?.val ?? null;
      const fcf = ocf != null && capex != null ? ocf - Math.abs(capex) : null;

      // Wynik sprzed roku i sprzed 3 lat: odniesieniem jest koniec okresu obrotowego, nie data kalendarzowa.
      // SEC raportuje na końce kwartałów spółki, więc pytanie o „dokładnie 3 lata temu" nie trafia w żaden raport.
      const yearMs = 365 * 86_400_000;
      const ends = view.periodEnds(C.revenue, 28);
      const anchorT = view.ttm(C.revenue)?.endT ?? asOfT;
      const endNearest = (targetT: number, tolDays = 60): number | null => {
        let best: number | null = null;
        for (const e of ends) if (best == null || Math.abs(e - targetT) < Math.abs(best - targetT)) best = e;
        return best != null && Math.abs(best - targetT) <= tolDays * 86_400_000 ? best : null;
      };
      const end1y = endNearest(anchorT - yearMs);
      const end3y = endNearest(anchorT - 3 * yearMs);
      const revenue1y = end1y != null ? (view.ttm(C.revenue, end1y)?.val ?? null) : null;
      const revenue3y = end3y != null ? (view.ttm(C.revenue, end3y)?.val ?? null) : null;
      const netIncome1y = end1y != null ? (view.ttm(C.netIncome, end1y)?.val ?? null) : null;
      const netIncome3y = end3y != null ? (view.ttm(C.netIncome, end3y)?.val ?? null) : null;

      const marketCap = now.close * shares;
      const ev = liabilities != null && cash != null ? marketCap + liabilities - cash : null;

      const record = events[cik];
      const row: Record<string, Cell> = {
        ticker: cache.cikToTicker[cik] ?? cik,
        cik,
        asOf,
        sector: sectorFromSic(cache.sic[cik]),
        sic: cache.sic[cik],
        price: now.close,
        shares,
        marketCap,
        revenueTTM: revenue,
        ebitTTM: ebit,
        netIncomeTTM: netIncome,
        ocfTTM: ocf,
        capexTTM: capex,
        fcfTTM: fcf,
        dividendsTTM: dividends,
        equity,
        assets,
        totalDebt: liabilities,
        cash,
        revenueTTM_1y: revenue1y,
        revenueTTM_3y: revenue3y,
        netIncomeTTM_1y: netIncome1y,
        netIncomeTTM_3y: netIncome3y,
        ps: ratio(marketCap, revenue),
        pe: ratio(marketCap, netIncome),
        pb: ratio(marketCap, equity),
        evEbit: ratio(ev, ebit),
        terminalKind: record?.outcome.kind ?? null,
        terminalDate: record?.outcome.eventDate ?? null,
        lastQuoteDate: new Date(series.quotes[series.quotes.length - 1].t).toISOString().slice(0, 10),
      };

      for (const h of HORIZONS) {
        const fwdDate = dateOf(asOf, h);
        const beyondData = fwdDate > endDay;
        const fwd = beyondData ? null : getQuoteAtDate(series, fwdDate);
        row[`fwdPrice${h}`] = fwd?.close ?? null;
        row[`fwdTotalRatio${h}`] = fwd && now.adj > 0 ? fwd.adj / now.adj : null;

        const fwdFacts = beyondData ? null : getFundamentalsAsOf(cache, cik, fwdDate);
        const fwdView = fwdFacts ? new XbrlView(fwdFacts) : null;
        row[`fwdRevenueTTM${h}`] = fwdView?.ttm(C.revenue)?.val ?? null;
        row[`fwdNetIncomeTTM${h}`] = fwdView?.ttm(C.netIncome)?.val ?? null;
        const fwdSharesFact = fwdView?.latestInstant(C.sharesDei, 'dei', 'shares') ?? null;
        row[`fwdShares${h}`] = fwdSharesFact ? fwdSharesFact.val * splitFactor(fwdSharesFact.endT) : null;
        if (fwd) horizonCounts[h]++;
      }

      out.write(PANEL_COLUMNS.map((c) => fmt(row[c] ?? null)).join(',') + '\n');
      rows++;
      ciksSeen.add(cik);
    }
  }

  out.end();

  ensureArtifactsDir();
  const stats = {
    generatedAt: new Date().toISOString(),
    rows,
    ciks: ciksSeen.size,
    lastDataDay: endDay,
    skips,
    /** Ile wierszy ma zmierzoną cenę po h latach. */
    rowsWithForwardPrice: horizonCounts,
  };
  fs.writeFileSync(FACTS_PANEL_STATS, JSON.stringify(stats, null, 2));

  console.error(`\nWierszy: ${rows}, spółek: ${ciksSeen.size}.`);
  console.error(`Pominięte: brak ceny ${skips.noPrice}, brak sprawozdań ${skips.noFundamentals}, brak przychodów ${skips.noRevenue}, brak liczby akcji ${skips.noShares}.`);
  for (const h of HORIZONS) {
    console.error(`  cena po ${h} latach: ${horizonCounts[h]} wierszy (${((horizonCounts[h] / rows) * 100).toFixed(0)}%)`);
  }
  console.error(`Zapisano ${FACTS_PANEL_CSV} i ${FACTS_PANEL_STATS}.`);
  if (rows === 0) {
    console.error('Panel jest pusty — coś jest nie tak z cache.');
    process.exit(1);
  }
}

main();
