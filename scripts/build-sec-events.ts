/**
 * Buduje listę zdarzeń końcowych (upadłość / wycofanie z giełdy / koniec raportowania) ze wszystkich
 * list formularzy SEC w cache, ustala skutek dla akcjonariusza i porównuje to z powodem usunięcia
 * ze składu indeksu.
 *   npx tsx scripts/build-sec-events.ts
 *
 * Wynik: data/meta/sec-events.json + artifacts/sec-events-report.md
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CompanyFacts, Membership } from '../src/data-loader.js';
import { DATA_DIR, MEMBERSHIP_JSON, SEC_EVENTS_JSON, SEC_EVENTS_REPORT, ensureArtifactsDir } from '../src/paths.js';
import { companyEvents, type CompanyEvents, type TerminalEventKind } from '../src/sec-events.js';
import { floatImpliedPrices, terminalOutcome, type OutcomeKind, type TerminalOutcome } from '../src/terminal-outcomes.js';

interface CompanyRecord extends CompanyEvents {
  outcome: TerminalOutcome;
  floatPriceCount: number;
}

const KINDS: TerminalEventKind[] = ['bankruptcy', 'delisting_notice', 'exchange_delisting', 'deregistration'];
const KIND_LABEL: Record<TerminalEventKind, string> = {
  bankruptcy: 'upadłość (8-K 1.03)',
  delisting_notice: 'zawiadomienie o wycofaniu (8-K 3.01)',
  exchange_delisting: 'wycofanie z giełdy (formularz 25)',
  deregistration: 'koniec raportowania (formularz 15)',
};
const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  listed: 'brak zdarzenia końcowego',
  bankruptcy_stopped_filing: 'upadłość i koniec raportowania — akcje przepadły',
  bankruptcy_still_filing: 'upadłość, spółka dalej raportuje — nierozstrzygnięte',
  delisted_no_bankruptcy: 'zniknięcie z giełdy bez upadłości',
  unknown: 'zdarzenie jest, skutku nie da się zmierzyć',
};

function firstOf(ev: CompanyEvents, kind: TerminalEventKind) {
  return ev.events.find((e) => e.kind === kind) ?? null;
}

function table(header: string[], rows: (string | number)[][]): string {
  const sep = `|${header.map(() => '---').join('|')}|`;
  return [`| ${header.join(' | ')} |`, sep, ...rows.map((r) => `| ${r.join(' | ')} |`), ''].join('\n');
}

/** Czyta z pliku companyfacts wyłącznie część `dei`, żeby nie trzymać w pamięci całej reszty. */
function readDeiFacts(file: string): CompanyFacts | null {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!raw.facts?.dei) return null;
    return { facts: { 'us-gaap': {}, dei: raw.facts.dei } } as CompanyFacts;
  } catch {
    return null;
  }
}

const pct = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(0)}%`);
const money = (x: number | null) => (x == null ? '—' : x.toFixed(2));

function main() {
  if (!fs.existsSync(MEMBERSHIP_JSON)) {
    console.error(`Brak ${MEMBERSHIP_JSON}.`);
    process.exit(1);
  }
  const membership = (JSON.parse(fs.readFileSync(MEMBERSHIP_JSON, 'utf-8')) as Membership[]).map((m) => ({
    ...m,
    cik: String(m.cik),
  }));

  const byCik = new Map<string, Membership[]>();
  for (const m of membership) {
    const list = byCik.get(m.cik) ?? [];
    list.push(m);
    byCik.set(m.cik, list);
  }

  const subsDir = path.join(DATA_DIR, 'submissions');
  const out: Record<string, CompanyRecord> = {};
  const missing: string[] = [];
  const asOfEnd = new Date().toISOString().slice(0, 10);

  for (const cik of byCik.keys()) {
    if (!fs.existsSync(path.join(subsDir, `CIK${cik}.json`))) {
      missing.push(cik);
      continue;
    }
    const ev = companyEvents(cik, subsDir);
    const facts = readDeiFacts(path.join(DATA_DIR, 'fundamentals', `CIK${cik}.json`));
    const floatPrices = facts ? floatImpliedPrices(facts) : [];
    out[cik] = {
      ...ev,
      floatPriceCount: floatPrices.length,
      outcome: terminalOutcome({ events: ev.events, floatPrices, lastFilingDate: ev.lastFilingDate, asOfEnd }),
    };
  }

  fs.writeFileSync(
    SEC_EVENTS_JSON,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), source: 'SEC EDGAR submissions + dei:EntityPublicFloat', companies: out },
      null,
      1
    )
  );

  const removedCiks = new Set(membership.filter((m) => m.date_removed).map((m) => m.cik));
  const currentCiks = new Set(membership.filter((m) => !m.date_removed).map((m) => m.cik));
  const withEvents = (set: Set<string>, kind: TerminalEventKind) =>
    [...set].filter((c) => out[c] && firstOf(out[c], kind)).length;

  const L: string[] = [];
  L.push('# Zdarzenia końcowe spółek z formularzy SEC', '');
  L.push(`Wygenerowano: ${new Date().toISOString()}. Źródło: listy formularzy z EDGAR oraz \`dei:EntityPublicFloat\`.`, '');
  L.push('Po co ten raport: dotychczasowy cache znał niemal wyłącznie spółki, które nadal są w indeksie,');
  L.push('więc model uczył się na tych, które przetrwały. Poniżej jest zmierzone, ile spółek zniknęło i dlaczego.', '');

  L.push('## 1. Pokrycie danych', '');
  L.push(
    table(
      ['grupa', 'spółek', 'ma listę formularzy', 'brak'],
      [
        ['wszystkie ze składu', byCik.size, byCik.size - missing.length, missing.length],
        [
          'obecne w indeksie',
          currentCiks.size,
          [...currentCiks].filter((c) => out[c]).length,
          [...currentCiks].filter((c) => !out[c]).length,
        ],
        [
          'usunięte z indeksu',
          removedCiks.size,
          [...removedCiks].filter((c) => out[c]).length,
          [...removedCiks].filter((c) => !out[c]).length,
        ],
      ]
    )
  );

  L.push('## 2. Zdarzenia końcowe', '');
  L.push(
    table(
      ['rodzaj zdarzenia', 'spółek ogółem', 'w tym usunięte z indeksu', 'w tym nadal w indeksie'],
      KINDS.map((k) => [
        KIND_LABEL[k],
        Object.values(out).filter((e) => firstOf(e, k)).length,
        withEvents(removedCiks, k),
        withEvents(currentCiks, k),
      ])
    )
  );
  L.push('Uwaga: wycofanie z giełdy i koniec raportowania towarzyszą także **przejęciom** — same w sobie nie oznaczają kłopotów.', '');

  L.push('## 3. Upadłości a powód usunięcia ze składu indeksu', '');
  const reasons = new Map<string, { n: number; withBankruptcy: number }>();
  for (const cik of removedCiks) {
    const reason = (byCik.get(cik) ?? []).filter((m) => m.date_removed).pop()?.removal_reason ?? 'brak powodu';
    const row = reasons.get(reason) ?? { n: 0, withBankruptcy: 0 };
    row.n++;
    if (out[cik] && firstOf(out[cik], 'bankruptcy')) row.withBankruptcy++;
    reasons.set(reason, row);
  }
  L.push(
    table(
      ['powód w składzie indeksu', 'spółek', 'z 8-K 1.03 (upadłość)'],
      [...reasons.entries()].sort((a, b) => b[1].n - a[1].n).map(([r, v]) => [r, v.n, v.withBankruptcy])
    )
  );

  const bankrupt = Object.values(out)
    .filter((e) => firstOf(e, 'bankruptcy'))
    .map((e) => {
      const m = (byCik.get(e.cik) ?? []).filter((x) => x.date_removed).pop() ?? byCik.get(e.cik)?.[0];
      return { ticker: m?.ticker ?? '?', date: firstOf(e, 'bankruptcy')!.knownAt.slice(0, 10), outcome: e.outcome };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  L.push(`## 4. Zgłoszenia upadłości i skutek dla akcjonariusza (${bankrupt.length})`, '');
  L.push('Samo zgłoszenie 8-K punkt 1.03 nie oznacza, że akcjonariusz stracił: EDGAR oznacza tak również');
  L.push('upadłości spółek zależnych i zatwierdzenia układu przy wychodzeniu z upadłości.');
  L.push('Rozstrzygamy tylko przypadki, w których spółka przestała raportować — wtedy dawne akcje przepadły.');
  L.push('Gdy spółka raportuje dalej, po reorganizacji stare akcje są zwykle umarzane i emitowane nowe,');
  L.push('więc kurs jednej akcji przed i po jest nieporównywalny; takie przypadki zostają nierozstrzygnięte.', '');
  L.push(
    bankrupt.length
      ? table(
          ['ticker', 'data 8-K 1.03', 'rozstrzygnięcie', 'kurs przed', 'kurs po', 'zmiana liczby akcji', 'kursy porównywalne?'],
          bankrupt.map((b) => [
            b.ticker,
            b.date,
            OUTCOME_LABEL[b.outcome.kind],
            money(b.outcome.priceBefore),
            money(b.outcome.priceAfter),
            pct(b.outcome.sharesChange),
            b.outcome.perShareComparable ? 'tak' : 'nie',
          ])
        )
      : 'Brak. To oznacza, że w cache nie ma ani jednej spółki ze zdarzeniem upadłości.\n'
  );

  L.push('## 5. Rozkład skutków', '');
  const outcomeCounts = new Map<OutcomeKind, number>();
  for (const e of Object.values(out)) outcomeCounts.set(e.outcome.kind, (outcomeCounts.get(e.outcome.kind) ?? 0) + 1);
  L.push(
    table(
      ['skutek', 'spółek'],
      [...outcomeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [OUTCOME_LABEL[k], n])
    )
  );
  const withFloat = Object.values(out).filter((e) => e.floatPriceCount > 0).length;
  L.push(`Przybliżony kurs z raportów SEC udało się policzyć dla ${withFloat} z ${Object.keys(out).length} spółek.`);
  L.push('Tam, gdzie go nie ma, skutek albo wynika z trwałego zaprzestania raportowania, albo pozostaje nierozstrzygnięty —');
  L.push('i jest tak oznaczony, zamiast być zastąpiony założeniem.', '');

  const removedNoEvent = [...removedCiks].filter((c) => out[c] && out[c].events.length === 0);
  L.push(`## 6. Spółki usunięte bez żadnego zdarzenia końcowego: ${removedNoEvent.length}`, '');
  L.push('Najczęściej to przejęcia, w których wyrejestrowania dokonuje spółka przejmująca pod własnym numerem CIK,');
  L.push('albo usunięcia decyzją komitetu indeksu przy dalszym notowaniu spółki.', '');

  if (missing.length) {
    L.push(`## 7. Spółki bez listy formularzy w cache: ${missing.length}`, '');
    L.push('Uruchom `npx tsx scripts/download-submissions.ts --only-missing`. Dopóki ich brakuje, pomiar udziału zdarzeń jest zaniżony.', '');
  }

  ensureArtifactsDir();
  fs.writeFileSync(SEC_EVENTS_REPORT, L.join('\n'));
  console.error(`Zapisano ${SEC_EVENTS_JSON} (${Object.keys(out).length} spółek) i ${SEC_EVENTS_REPORT}.`);
  console.error(`Zgłoszeń upadłości: ${bankrupt.length}. Spółek bez listy formularzy: ${missing.length}.`);
}

main();
