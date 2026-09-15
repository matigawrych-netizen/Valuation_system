/**
 * Jednorazowe pobranie makro point-in-time z FRED/ALFRED dla każdej daty decyzji.
 *
 *   FRED_API_KEY=... npx tsx scripts/download-macro-fred.ts
 *
 * Dla każdej daty `dateStr` z osi czasu i każdej serii pytamy ALFRED o obserwacje
 * widoczne w dniu `dateStr` (realtime_start = realtime_end = dateStr, observation_end = dateStr).
 * Serie rynkowe (rentowności, spread HY) nie są rewidowane — gdy ALFRED nie ma dla nich vintage,
 * bierzemy najnowszy vintage ograniczony do observation_end = dateStr i oznaczamy to w pliku.
 * Serie rewidowane (FEDFUNDS, CPI, UNRATE) nie mają takiego fallbacku: błąd => wpis w `errors`.
 */
import fs from 'node:fs';
import { buildQuarterlyTimeline } from '../src/data-loader.js';
import { fetchFredObservations, requireFredApiKey, type FredPitFile } from '../src/macro-provider.js';
import { DATA_END_YEAR, DATA_START_YEAR, FRED_PIT_JSON } from '../src/paths.js';

const SERIES: { key: string; seriesId: string; units: string; limit: number; revised: boolean }[] = [
  { key: 'FEDFUNDS', seriesId: 'FEDFUNDS', units: 'lin', limit: 6, revised: true },
  { key: 'CPIAUCSL_PC1', seriesId: 'CPIAUCSL', units: 'pc1', limit: 4, revised: true },
  { key: 'UNRATE', seriesId: 'UNRATE', units: 'lin', limit: 3, revised: true },
  { key: 'DGS10', seriesId: 'DGS10', units: 'lin', limit: 10, revised: false },
  { key: 'DGS2', seriesId: 'DGS2', units: 'lin', limit: 10, revised: false },
  { key: 'DGS3MO', seriesId: 'DGS3MO', units: 'lin', limit: 10, revised: false },
  { key: 'BAMLH0A0HYM2', seriesId: 'BAMLH0A0HYM2', units: 'lin', limit: 10, revised: false },
];

const SLEEP_MS = 600; // limit FRED: 120 zapytań/min
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apiKey = requireFredApiKey();
  const timeline = buildQuarterlyTimeline(DATA_START_YEAR, DATA_END_YEAR);
  const out: FredPitFile = fs.existsSync(FRED_PIT_JSON)
    ? JSON.parse(fs.readFileSync(FRED_PIT_JSON, 'utf-8'))
    : { generatedAt: '', dates: {} };

  let requests = 0;
  let failures = 0;
  for (const t of timeline) {
    const entry = (out.dates[t.dateStr] ??= { series: {}, vintage: {} });
    entry.errors = entry.errors ?? {};
    for (const s of SERIES) {
      if (entry.series[s.key]?.length) continue; // wznowienie przerwanego pobierania
      const base = { seriesId: s.seriesId, units: s.units, limit: s.limit, observationEnd: t.dateStr };
      try {
        requests++;
        entry.series[s.key] = await fetchFredObservations({ ...base, realtimeDate: t.dateStr }, apiKey);
        entry.vintage[s.key] = 'alfred';
        delete entry.errors[s.key];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (s.revised) {
          entry.errors[s.key] = msg;
          failures++;
        } else {
          await sleep(SLEEP_MS);
          try {
            requests++;
            entry.series[s.key] = await fetchFredObservations(base, apiKey);
            entry.vintage[s.key] = 'latest-vintage';
            delete entry.errors[s.key];
          } catch (err2) {
            entry.errors[s.key] = err2 instanceof Error ? err2.message : String(err2);
            failures++;
          }
        }
      }
      await sleep(SLEEP_MS);
    }
    if (!Object.keys(entry.errors).length) delete entry.errors;
    out.generatedAt = new Date().toISOString();
    fs.writeFileSync(FRED_PIT_JSON, JSON.stringify(out, null, 1));
    console.log(`${t.dateStr}: ${SERIES.map((s) => `${s.key}=${entry.series[s.key]?.[0]?.value ?? '—'}`).join(' ')}`);
  }

  const empty = SERIES.map((s) => ({
    key: s.key,
    missingDates: timeline.filter((t) => !out.dates[t.dateStr]?.series[s.key]?.length).length,
  }));
  console.log(`\nZapytań: ${requests}, nieudanych: ${failures}`);
  console.table(empty);
  console.log(`Zapisano ${FRED_PIT_JSON}`);
  if (empty.some((e) => ['FEDFUNDS', 'CPIAUCSL_PC1', 'DGS10', 'DGS3MO'].includes(e.key) && e.missingDates > 0)) {
    console.error('Brakuje wymaganych serii dla części dat — getMacroAsOf rzuci wyjątek dla tych dat.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
