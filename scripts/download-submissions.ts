/**
 * Pobiera z SEC listy formularzy (submissions) dla wszystkich spółek ze składu indeksu.
 *   npx tsx scripts/download-submissions.ts [--only-missing] [--limit N]
 *
 * Po co: cache ma listy formularzy prawie wyłącznie dla spółek nadal notowanych. Bez spółek
 * usuniętych nie da się zmierzyć bankructw ani wycofań z giełdy (błąd przetrwania).
 * SEC trzyma formularze także dla spółek, których dawno nie ma — to darmowe źródło zdarzeń końcowych.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, MEMBERSHIP_JSON } from '../src/paths.js';

const SUBMISSIONS_DIR = path.join(DATA_DIR, 'submissions');
const REPORT_JSON = path.join(DATA_DIR, 'meta', 'submissions-download-report.json');

/** SEC prosi o kontakt w User-Agent. Ustaw SEC_USER_AGENT w .env, żeby podać własny adres. */
const USER_AGENT = process.env.SEC_USER_AGENT ?? 'ValuationSystem/0.2 (open-source research project)';
const SEC_MIN_INTERVAL_MS = 150; // SEC dopuszcza 10 zapytań/s; trzymamy się bezpiecznie poniżej

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Status = 'downloaded' | 'cached' | 'not_found' | 'failed';
interface Row {
  cik: string;
  ticker: string;
  status: Status;
  pages: number;
  httpStatus?: number;
  error?: string;
}

async function getJson(url: string): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' } });
  if (res.status === 404) return { ok: false, status: 404, error: 'not_found' };
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status} ${res.statusText}` };
  return { ok: true, data: await res.json() };
}

async function downloadOne(cik: string, ticker: string, onlyMissing: boolean): Promise<Row> {
  const mainPath = path.join(SUBMISSIONS_DIR, `CIK${cik}.json`);
  if (onlyMissing && fs.existsSync(mainPath)) {
    let pages = 0;
    try {
      pages = (JSON.parse(fs.readFileSync(mainPath, 'utf-8')).filings?.files ?? []).length;
    } catch {
      /* uszkodzony plik potraktujemy jak brak stron */
    }
    return { cik, ticker, status: 'cached', pages };
  }

  const main = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
  await sleep(SEC_MIN_INTERVAL_MS);
  if (!main.ok) {
    return main.status === 404
      ? { cik, ticker, status: 'not_found', pages: 0, httpStatus: 404 }
      : { cik, ticker, status: 'failed', pages: 0, httpStatus: main.status, error: main.error };
  }
  fs.writeFileSync(mainPath, JSON.stringify(main.data));

  let pages = 0;
  for (const extra of main.data.filings?.files ?? []) {
    const target = path.join(SUBMISSIONS_DIR, extra.name);
    if (fs.existsSync(target)) {
      pages++;
      continue;
    }
    const page = await getJson(`https://data.sec.gov/submissions/${extra.name}`);
    await sleep(SEC_MIN_INTERVAL_MS);
    if (!page.ok) {
      return { cik, ticker, status: 'failed', pages, httpStatus: page.status, error: `strona ${extra.name}: ${page.error}` };
    }
    fs.writeFileSync(target, JSON.stringify(page.data));
    pages++;
  }
  return { cik, ticker, status: 'downloaded', pages };
}

async function main() {
  const onlyMissing = process.argv.includes('--only-missing');
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
    console.error(`Brak ${MEMBERSHIP_JSON} — nie wiadomo, które spółki pobierać.`);
    process.exit(1);
  }
  fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });

  const membership = JSON.parse(fs.readFileSync(MEMBERSHIP_JSON, 'utf-8')) as {
    cik: string;
    ticker: string;
    date_removed: string | null;
  }[];

  const byCik = new Map<string, string>();
  for (const m of membership) if (!byCik.has(String(m.cik))) byCik.set(String(m.cik), m.ticker);
  const targets = [...byCik.entries()].slice(0, limit === Infinity ? undefined : limit);

  console.error(`Spółek do sprawdzenia: ${targets.length}. User-Agent: ${USER_AGENT}`);
  const rows: Row[] = [];
  let done = 0;
  for (const [cik, ticker] of targets) {
    try {
      rows.push(await downloadOne(cik, ticker, onlyMissing));
    } catch (err) {
      rows.push({ cik, ticker, status: 'failed', pages: 0, error: String(err) });
    }
    done++;
    if (done % 25 === 0) console.error(`  ...${done}/${targets.length}`);
  }

  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  fs.writeFileSync(
    REPORT_JSON,
    JSON.stringify({ generatedAt: new Date().toISOString(), userAgent: USER_AGENT, rows }, null, 2)
  );

  console.error(
    `\nGotowe: pobrane ${count('downloaded')}, z cache ${count('cached')}, brak w SEC ${count('not_found')}, błędy ${count('failed')}.`
  );
  console.error(`Raport: ${REPORT_JSON}`);
  for (const r of rows.filter((x) => x.status === 'failed').slice(0, 10)) {
    console.error(`  BŁĄD ${r.ticker} (${r.cik}): ${r.error}`);
  }
  if (count('failed') > 0) {
    console.error('Część pobrań się nie udała — uruchom ponownie z --only-missing.');
    process.exit(1);
  }
}

main();
