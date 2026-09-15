import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

/**
 * Zdarzenia końcowe spółki odczytane z listy formularzy SEC (`data/submissions`).
 *
 * Po co: cache ma dane głównie dla spółek, które nadal są w indeksie, więc model uczy się
 * na tych, które przetrwały. Te zdarzenia dają datę i powód zniknięcia spółki z rynku —
 * i to z dokładnością point-in-time, bo każdy formularz ma znacznik akceptacji przez SEC.
 */

export interface Filing {
  form: string;
  filingDate: string;
  acceptanceDateTime: string | null;
  items: string;
  accessionNumber: string;
  reportDate: string | null;
}

export type TerminalEventKind =
  /** 8-K punkt 1.03 — wniosek o upadłość albo zarząd komisaryczny. */
  | 'bankruptcy'
  /** 8-K punkt 3.01 — zawiadomienie o wycofaniu z giełdy lub niespełnieniu warunków notowania. */
  | 'delisting_notice'
  /** Formularz 25 / 25-NSE — faktyczne wyrejestrowanie papieru z giełdy. */
  | 'exchange_delisting'
  /** Formularz 15* — koniec obowiązku raportowania do SEC. */
  | 'deregistration';

export interface TerminalEvent {
  kind: TerminalEventKind;
  form: string;
  filingDate: string;
  /** Data, od której informacja była publiczna (akceptacja SEC; gdy brak — data złożenia). */
  knownAt: string;
  knownAtT: number;
  accessionNumber: string;
  items: string | null;
}

export interface CompanyEvents {
  cik: string;
  events: TerminalEvent[];
  /** Data ostatniego jakiegokolwiek formularza — przybliżenie „spółka przestała raportować”. */
  lastFilingDate: string | null;
  filingCount: number;
}

const BANKRUPTCY_ITEM = '1.03';
const DELISTING_NOTICE_ITEM = '3.01';
const FORM_25 = new Set(['25', '25-NSE']);
const FORM_15 = new Set(['15-12B', '15-12G', '15-15D', '15F-12B', '15F-12G', '15F-15D']);

/** '8-K/A' → '8-K'. Aneksy niosą te same punkty co pierwotny raport. */
export function baseForm(form: string): string {
  return form.trim().toUpperCase().replace(/\/A$/, '');
}

/** '1.03,9.01' → ['1.03','9.01']. Porównanie po całych tokenach, nie po fragmencie tekstu. */
export function parseItems(items: string | null | undefined): string[] {
  if (!items) return [];
  return items
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function knownAtOf(f: Filing): { knownAt: string; knownAtT: number } {
  const raw = f.acceptanceDateTime ?? f.filingDate;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) {
    throw new Error(`Formularz ${f.accessionNumber}: nieczytelna data akceptacji/złożenia "${raw}".`);
  }
  return { knownAt: new Date(t).toISOString(), knownAtT: t };
}

export function classifyFiling(f: Filing): TerminalEventKind | null {
  const form = baseForm(f.form);
  if (form === '8-K') {
    const items = parseItems(f.items);
    if (items.includes(BANKRUPTCY_ITEM)) return 'bankruptcy';
    if (items.includes(DELISTING_NOTICE_ITEM)) return 'delisting_notice';
    return null;
  }
  if (FORM_25.has(form)) return 'exchange_delisting';
  if (FORM_15.has(form)) return 'deregistration';
  return null;
}

/** Zdarzenia końcowe z listy formularzy, posortowane od najstarszego. */
export function extractTerminalEvents(filings: Filing[]): TerminalEvent[] {
  const events: TerminalEvent[] = [];
  for (const f of filings) {
    const kind = classifyFiling(f);
    if (!kind) continue;
    const { knownAt, knownAtT } = knownAtOf(f);
    events.push({
      kind,
      form: f.form,
      filingDate: f.filingDate,
      knownAt,
      knownAtT,
      accessionNumber: f.accessionNumber,
      items: f.items || null,
    });
  }
  return events.sort((a, b) => a.knownAtT - b.knownAtT);
}

/** Wszystkie pliki z listą formularzy danej spółki: strona główna + archiwalne strony. */
export function submissionFilesForCik(cik: string, dir = path.join(DATA_DIR, 'submissions')): string[] {
  const main = path.join(dir, `CIK${cik}.json`);
  if (!fs.existsSync(main)) return [];
  const files = [main];
  const raw = JSON.parse(fs.readFileSync(main, 'utf-8'));
  for (const extra of raw.filings?.files ?? []) {
    const p = path.join(dir, extra.name);
    if (fs.existsSync(p)) files.push(p);
  }
  return files;
}

function filingsFromTable(table: any): Filing[] {
  if (!table?.form) return [];
  const n = table.form.length;
  const out: Filing[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      form: table.form[i],
      filingDate: table.filingDate?.[i] ?? '',
      acceptanceDateTime: table.acceptanceDateTime?.[i] ?? null,
      items: table.items?.[i] ?? '',
      accessionNumber: table.accessionNumber?.[i] ?? '',
      reportDate: table.reportDate?.[i] ?? null,
    });
  }
  return out;
}

/** Lista formularzy spółki z cache'u. Rzuca, gdy pliku brak — brak danych nie może być cichym zerem. */
export function loadFilings(cik: string, dir = path.join(DATA_DIR, 'submissions')): Filing[] {
  const files = submissionFilesForCik(cik, dir);
  if (files.length === 0) {
    throw new Error(`Brak listy formularzy dla CIK ${cik} w ${dir}. Uruchom: npm run download:submissions`);
  }
  const out: Filing[] = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    // Strona główna trzyma dane w filings.recent, strony archiwalne są płaskie.
    out.push(...filingsFromTable(raw.filings?.recent ?? raw));
  }
  return out.filter((f) => f.form && f.filingDate);
}

export function companyEvents(cik: string, dir = path.join(DATA_DIR, 'submissions')): CompanyEvents {
  const filings = loadFilings(cik, dir);
  let lastFilingDate: string | null = null;
  for (const f of filings) if (!lastFilingDate || f.filingDate > lastFilingDate) lastFilingDate = f.filingDate;
  return { cik, events: extractTerminalEvents(filings), lastFilingDate, filingCount: filings.length };
}
