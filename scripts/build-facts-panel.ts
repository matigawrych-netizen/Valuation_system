/**
 * Buduje panel faktów dla spółek ze składu S&P 500 (point-in-time).
 *   npx tsx scripts/build-facts-panel.ts
 *
 * Wiersze liczy wspólny moduł `src/panel-builder.ts` — ten sam, którego używa pełne uniwersum.
 * Wynik: data/facts-panel.csv + artifacts/facts-panel-stats.json
 */
import fs from 'node:fs';
import { buildQuarterlyTimeline, loadCacheToMemory, type ParsedCache } from '../src/data-loader.js';
import { HORIZONS, panelCsvHeader, panelCsvLine } from '../src/facts-panel.js';
import { buildCompanyRows, emptySkips, type PanelRowValues } from '../src/panel-builder.js';
import {
  DATA_END_YEAR,
  DATA_START_YEAR,
  FACTS_PANEL_CSV,
  FACTS_PANEL_STATS,
  SEC_EVENTS_JSON,
  ensureArtifactsDir,
} from '../src/paths.js';

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

function main() {
  if (!fs.existsSync(SEC_EVENTS_JSON)) {
    console.error(`Brak ${SEC_EVENTS_JSON} — uruchom: npm run sec-events`);
    process.exit(1);
  }
  const events: Record<string, { outcome: { kind: string; eventDate: string | null } }> = JSON.parse(
    fs.readFileSync(SEC_EVENTS_JSON, 'utf-8')
  ).companies;

  const cache = loadCacheToMemory();
  const endDay = lastDataDay(cache);
  console.error(`Ostatni dzień z notowaniami: ${endDay}`);

  const timeline = buildQuarterlyTimeline(DATA_START_YEAR, DATA_END_YEAR).map((q) => q.dateStr);
  const skips = emptySkips();
  const rows: PanelRowValues[] = [];

  for (const cik of cache.ciks) {
    const memberships = cache.membershipByCik[cik] ?? [];
    const memberDates = timeline.filter((d) => {
      const t = new Date(d).getTime();
      return memberships.some(
        (m) =>
          (m.date_added ? new Date(m.date_added).getTime() : -Infinity) <= t &&
          t < (m.date_removed ? new Date(m.date_removed).getTime() : Infinity)
      );
    });
    if (memberDates.length === 0) continue;

    const prices = cache.prices[cik];
    const facts = cache.fundamentals[cik];
    if (!prices || !facts) {
      skips.noPrice += memberDates.filter((d) => d <= endDay).length;
      continue;
    }
    rows.push(
      ...buildCompanyRows(
        {
          cik,
          ticker: cache.cikToTicker[cik] ?? cik,
          sic: cache.sic[cik] ?? null,
          prices,
          facts,
          terminal: events[cik]?.outcome ?? null,
        },
        memberDates,
        { endDay },
        skips
      )
    );
  }

  rows.sort((a, b) => String(a.asOf).localeCompare(String(b.asOf)) || String(a.cik).localeCompare(String(b.cik)));
  fs.writeFileSync(FACTS_PANEL_CSV, [panelCsvHeader(), ...rows.map(panelCsvLine)].join('\n') + '\n');

  const horizonCounts = Object.fromEntries(HORIZONS.map((h) => [h, rows.filter((r) => r[`fwdPrice${h}`] != null).length]));
  ensureArtifactsDir();
  fs.writeFileSync(
    FACTS_PANEL_STATS,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rows: rows.length,
        ciks: new Set(rows.map((r) => r.cik)).size,
        lastDataDay: endDay,
        skips,
        rowsWithForwardPrice: horizonCounts,
      },
      null,
      2
    )
  );

  console.error(`\nWierszy: ${rows.length}, spółek: ${new Set(rows.map((r) => r.cik)).size}.`);
  console.error(`Pominięte: ${JSON.stringify(skips)}`);
  for (const h of HORIZONS) {
    console.error(`  cena po ${h} latach: ${horizonCounts[h]} wierszy (${((horizonCounts[h] / rows.length) * 100).toFixed(0)}%)`);
  }
  if (rows.length === 0) {
    console.error('Panel jest pusty — coś jest nie tak z cache.');
    process.exit(1);
  }
}

main();
