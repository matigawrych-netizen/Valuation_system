/**
 * Pobiera z SEC dane finansowe (companyfacts) dla spółek ze składu indeksu.
 *   npx tsx scripts/download-fundamentals.ts [--only-missing] [--removed-only] [--limit N]
 *
 * Po co: cache miał dane finansowe prawie wyłącznie dla spółek nadal notowanych (481 z 491),
 * a dla usuniętych tylko 25 z 338. SEC udostępnia je także dla spółek, których już nie ma.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, MEMBERSHIP_JSON } from '../src/paths.js';

const FUNDAMENTALS_DIR = path.join(DATA_DIR, 'fundamentals');
const REPORT_JSON = path.join(DATA_DIR, 'meta', 'fundamentals-download-report.json');
const USER_AGENT = process.env.SEC_USER_AGENT ?? 'ValuationSystem/0.2 (open-source research project)';
const SEC_MIN_INTERVAL_MS = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Status = 'downloaded' | 'cached' | 'not_found' | 'failed';
interface Row {
  cik: string;
  ticker: string;
  status: Status;
  bytes: number;
  httpStatus?: number;
  error?: string;
}

async function downloadOne(cik: string, ticker: string, onlyMissing: boolean): Promise<Row> {
  const target = path.join(FUNDAMENTALS_DIR, `CIK${cik}.json`);
  if (onlyMissing && fs.existsSync(target)) {
    return { cik, ticker, status: 'cached', bytes: fs.statSync(target).size };
  }
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' },
  });
  await sleep(SEC_MIN_INTERVAL_MS);
  if (res.status === 404) return { cik, ticker, status: 'not_found', bytes: 0, httpStatus: 404 };
  if (!res.ok) {
    return { cik, ticker, status: 'failed', bytes: 0, httpStatus: res.status, error: `HTTP ${res.status} ${res.statusText}` };
  }
  const text = await res.text();
  fs.writeFileSync(target, text);
  return { cik, ticker, status: 'downloaded', bytes: text.length };
}

async function main() {
  const onlyMissing = process.argv.includes('--only-missing');
  const removedOnly = process.argv.includes('--removed-only');
  const limitArg = process.argv.indexOf('--limit');
  let limit = Infinity;
  if (limitArg >= 0) {
    limit = Number(process.argv[limitArg + 1]);
    if (!Number.isInteger(limit) || limit <= 0) {
      console.error('--limit wymaga dodatniej liczby całkowitej.');
      process.exit(1);
    }
  }

  if (!fs.existsSync(MEMBERSHIP_JSON)) {
    console.error(`Brak ${MEMBERSHIP_JSON}.`);
    process.exit(1);
  }
  fs.mkdirSync(FUNDAMENTALS_DIR, { recursive: true });

  const membership = JSON.parse(fs.readFileSync(MEMBERSHIP_JSON, 'utf-8')) as {
    cik: string;
    ticker: string;
    date_removed: string | null;
  }[];

  const stillListed = new Set(membership.filter((m) => !m.date_removed).map((m) => String(m.cik)));
  const byCik = new Map<string, string>();
  for (const m of membership) {
    const cik = String(m.cik);
    if (removedOnly && stillListed.has(cik)) continue;
    if (!byCik.has(cik)) byCik.set(cik, m.ticker);
  }
  const targets = [...byCik.entries()].slice(0, limit === Infinity ? undefined : limit);

  console.error(`Spółek do sprawdzenia: ${targets.length}.`);
  const rows: Row[] = [];
  let done = 0;
  for (const [cik, ticker] of targets) {
    try {
      rows.push(await downloadOne(cik, ticker, onlyMissing));
    } catch (err) {
      rows.push({ cik, ticker, status: 'failed', bytes: 0, error: String(err) });
    }
    done++;
    if (done % 25 === 0) console.error(`  ...${done}/${targets.length}`);
  }

  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const mb = rows.filter((r) => r.status === 'downloaded').reduce((a, r) => a + r.bytes, 0) / 1e6;
  fs.writeFileSync(REPORT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  console.error(
    `\nGotowe: pobrane ${count('downloaded')} (${mb.toFixed(0)} MB), z cache ${count('cached')}, brak w SEC ${count('not_found')}, błędy ${count('failed')}.`
  );
  for (const r of rows.filter((x) => x.status === 'failed').slice(0, 10)) console.error(`  BŁĄD ${r.ticker} (${r.cik}): ${r.error}`);
  if (count('failed') > 0) process.exit(1);
}

main();
