/**
 * Krok (c), etap 1: lista WSZYSTKICH spółek raportujących do SEC, które kiedykolwiek miały akcje
 * w wolnym obrocie warte co najmniej UNIVERSE_CANDIDATE_MIN_FLOAT — także tych, których już nie ma.
 *   npx tsx scripts/universe-discover.ts
 *
 * Źródło: SEC XBRL frames (`dei:EntityPublicFloat`) — jedno zapytanie zwraca wartość dla wszystkich
 * spółek na dany kwartał kalendarzowy. Pobieramy wszystkie kwartały, bo spółki z rokiem obrotowym
 * innym niż kalendarzowy raportują float na inny dzień.
 *
 * Dlaczego nie dzisiejsza lista spółek z giełdy: zawierałaby tylko te, które przetrwały.
 *
 * Wynik: <UNIVERSE_DATA_DIR>/meta/float-frames.json, <UNIVERSE_DATA_DIR>/meta/candidates.json
 */
import fs from 'node:fs';
import { UNIVERSE_CANDIDATE_MIN_FLOAT, UNIVERSE_MIN_MARKET_CAP, universeDir } from '../src/paths.js';
import { secGetJson } from '../src/sec-http.js';

const FIRST_YEAR = 2008;
const LAST_YEAR = new Date().getUTCFullYear();

interface FrameRow {
  accn: string;
  cik: number;
  entityName: string;
  loc?: string;
  end: string;
  val: number;
}

export interface FloatHistory {
  cik: string;
  name: string;
  loc: string | null;
  floats: { end: string; val: number; accn: string }[];
}

const pad = (cik: number) => String(cik).padStart(10, '0');

async function main() {
  const metaDir = universeDir('meta');
  fs.mkdirSync(metaDir, { recursive: true });

  const byCik = new Map<string, FloatHistory>();
  const perFrame: { frame: string; companies: number; atLeastMinCap: number }[] = [];
  const failures: string[] = [];

  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    for (let q = 1; q <= 4; q++) {
      const frame = `CY${year}Q${q}I`;
      const r = await secGetJson<{ data: FrameRow[] }>(`https://data.sec.gov/api/xbrl/frames/dei/EntityPublicFloat/USD/${frame}.json`);
      if (!r.ok) {
        // 404 = SEC nie ma jeszcze (albo już) danych na ten kwartał — to nie jest błąd pobierania.
        if (r.status !== 404) failures.push(`${frame}: ${r.error}`);
        continue;
      }
      const rows = r.data.data ?? [];
      perFrame.push({ frame, companies: rows.length, atLeastMinCap: rows.filter((x) => x.val >= UNIVERSE_MIN_MARKET_CAP).length });
      for (const row of rows) {
        if (!Number.isFinite(row.val) || row.val <= 0) continue;
        const cik = pad(row.cik);
        const h = byCik.get(cik) ?? { cik, name: row.entityName, loc: row.loc ?? null, floats: [] };
        h.name = row.entityName;
        h.loc = row.loc ?? h.loc;
        if (!h.floats.some((f) => f.end === row.end)) h.floats.push({ end: row.end, val: row.val, accn: row.accn });
        byCik.set(cik, h);
      }
      process.stderr.write(`\r${frame}: ${rows.length} spółek, łącznie ${byCik.size}   `);
    }
  }
  process.stderr.write('\n');

  if (failures.length) {
    console.error(`Nie udało się pobrać ${failures.length} kwartałów:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  if (byCik.size === 0) {
    console.error('SEC nie zwrócił żadnych danych — lista spółek byłaby pusta.');
    process.exit(1);
  }

  for (const h of byCik.values()) h.floats.sort((a, b) => a.end.localeCompare(b.end));
  fs.writeFileSync(`${metaDir}/float-frames.json`, JSON.stringify({ generatedAt: new Date().toISOString(), companies: Object.fromEntries(byCik) }));

  const candidates = [...byCik.values()]
    .map((h) => ({
      cik: h.cik,
      name: h.name,
      loc: h.loc,
      maxFloat: Math.max(...h.floats.map((f) => f.val)),
      firstFloat: h.floats[0].end,
      lastFloat: h.floats[h.floats.length - 1].end,
    }))
    .filter((c) => c.maxFloat >= UNIVERSE_CANDIDATE_MIN_FLOAT)
    .sort((a, b) => b.maxFloat - a.maxFloat);

  fs.writeFileSync(
    `${metaDir}/candidates.json`,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), minFloat: UNIVERSE_CANDIDATE_MIN_FLOAT, frames: perFrame, candidates },
      null,
      1
    )
  );

  const staleNow = candidates.filter((c) => c.lastFloat < `${LAST_YEAR - 2}-01-01`).length;
  console.error(`Spółek z jakimkolwiek floatem: ${byCik.size}.`);
  console.error(`Kandydatów (float ≥ ${UNIVERSE_CANDIDATE_MIN_FLOAT / 1e6} mln USD kiedykolwiek): ${candidates.length}.`);
  console.error(`  w tym nieraportujących od ponad 2 lat (zniknęły, przejęte, upadłe): ${staleNow}.`);
  console.error(`Zapisano ${metaDir}/candidates.json`);
}

main();
