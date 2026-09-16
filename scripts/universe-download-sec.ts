/**
 * Krok (c), etap 2: pobiera z SEC dane kandydatów do pełnego uniwersum.
 *   npx tsx scripts/universe-download-sec.ts submissions
 *   npx tsx scripts/universe-download-sec.ts companyfacts
 *
 * Najpierw listy formularzy (małe), potem sprawozdania (duże) — sprawozdania tylko dla spółek, które
 * składają raporty roczne 10-K. Odpadają m.in. spółki zagraniczne raportujące na 20-F/40-F (standard IFRS,
 * inne nazwy pozycji) i spółki SPAC (kod SIC 6770 — gotówka w funduszu powierniczym, bez działalności).
 *
 * Wznawianie: pliki już pobrane są pomijane, więc przerwany przebieg wystarczy uruchomić ponownie.
 * Wynik: <UNIVERSE_DATA_DIR>/submissions, <UNIVERSE_DATA_DIR>/fundamentals, raporty w <UNIVERSE_DATA_DIR>/meta
 */
import fs from 'node:fs';
import { universeDir } from '../src/paths.js';
import { secGetText } from '../src/sec-http.js';
import { exclusionReason, readCandidates, type Candidate } from '../src/universe.js';

type Mode = 'submissions' | 'companyfacts';

async function downloadSubmissions(c: Candidate, dir: string): Promise<string> {
  const main = `${dir}/CIK${c.cik}.json`;
  let raw: any;
  if (fs.existsSync(main)) {
    raw = JSON.parse(fs.readFileSync(main, 'utf-8'));
  } else {
    const r = await secGetText(`https://data.sec.gov/submissions/CIK${c.cik}.json`);
    if (!r.ok) return r.status === 404 ? 'not_found' : `failed: ${r.error}`;
    fs.writeFileSync(main, r.data);
    raw = JSON.parse(r.data);
  }
  for (const page of raw.filings?.files ?? []) {
    const target = `${dir}/${page.name}`;
    if (fs.existsSync(target)) continue;
    const r = await secGetText(`https://data.sec.gov/submissions/${page.name}`);
    if (!r.ok) return `failed: strona ${page.name}: ${r.error}`;
    fs.writeFileSync(target, r.data);
  }
  return 'ok';
}

async function downloadCompanyFacts(c: Candidate, dir: string): Promise<string> {
  const target = `${dir}/CIK${c.cik}.json`;
  if (fs.existsSync(target)) return 'ok';
  const r = await secGetText(`https://data.sec.gov/api/xbrl/companyfacts/CIK${c.cik}.json`);
  if (!r.ok) return r.status === 404 ? 'not_found' : `failed: ${r.error}`;
  fs.writeFileSync(target, r.data);
  return 'ok';
}

async function main() {
  const mode = process.argv[2] as Mode;
  if (mode !== 'submissions' && mode !== 'companyfacts') {
    console.error('Użycie: npx tsx scripts/universe-download-sec.ts submissions|companyfacts');
    process.exit(1);
  }
  const candidates = readCandidates();
  const subsDir = universeDir('submissions');
  const factsDir = universeDir('fundamentals');
  fs.mkdirSync(subsDir, { recursive: true });
  fs.mkdirSync(factsDir, { recursive: true });

  const statuses: Record<string, string> = {};
  const excluded: Record<string, string> = {};
  const started = Date.now();
  let i = 0;

  for (const c of candidates) {
    i++;
    if (mode === 'submissions') {
      statuses[c.cik] = await downloadSubmissions(c, subsDir);
    } else {
      const reason = exclusionReason(c.cik, subsDir);
      if (reason) {
        excluded[c.cik] = reason;
        continue;
      }
      statuses[c.cik] = await downloadCompanyFacts(c, factsDir);
    }
    if (i % 50 === 0) {
      const perItem = (Date.now() - started) / i;
      const left = Math.round(((candidates.length - i) * perItem) / 60000);
      console.error(`  ${i}/${candidates.length}  (zostało ok. ${left} min)`);
    }
  }

  const values = Object.values(statuses);
  const failed = Object.entries(statuses).filter(([, s]) => s.startsWith('failed'));
  const summary = {
    generatedAt: new Date().toISOString(),
    mode,
    candidates: candidates.length,
    ok: values.filter((s) => s === 'ok').length,
    notFound: values.filter((s) => s === 'not_found').length,
    failed: failed.length,
    excluded: Object.keys(excluded).length,
    excludedByReason: Object.values(excluded).reduce<Record<string, number>>((acc, r) => ((acc[r] = (acc[r] ?? 0) + 1), acc), {}),
    failures: Object.fromEntries(failed),
    excludedCiks: excluded,
  };
  fs.writeFileSync(universeDir('meta', `download-${mode}.json`), JSON.stringify(summary, null, 1));

  console.error(`\n${mode}: pobrane/obecne ${summary.ok}, brak w SEC ${summary.notFound}, błędy ${summary.failed}, odrzucone ${summary.excluded}.`);
  for (const [reason, n] of Object.entries(summary.excludedByReason)) console.error(`  odrzucone — ${reason}: ${n}`);
  for (const [cik, s] of failed.slice(0, 10)) console.error(`  BŁĄD ${cik}: ${s}`);
  if (failed.length) {
    console.error('Część pobrań się nie udała — uruchom ponownie, pobrane pliki zostaną pominięte.');
    process.exit(1);
  }
}

main();
