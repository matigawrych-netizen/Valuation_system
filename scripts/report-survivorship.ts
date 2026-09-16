/**
 * Krok (c2): pomiar błędu przetrwania. Definicja i progi zapisane PRZED pomiarem w docs/plan-terminal.md.
 *   npx tsx scripts/report-survivorship.ts
 *
 * Wymaga danych pełnego uniwersum (universe-discover, universe-download-sec, universe-download-prices,
 * universe-build-panel). Wynik: artifacts/universe/survivorship.md + artifacts/universe/survivorship.json
 */
import fs from 'node:fs';
import { getQuoteAtDate } from '../src/data-loader.js';
import { universeDir } from '../src/paths.js';
import { baseForm, extractTerminalEvents, loadFilings } from '../src/sec-events.js';
import { bootstrapGroups, quantile } from '../src/stats.js';
import {
  ALTERNATIVE_ASSUMPTIONS,
  BANKRUPTCY_TO_END_YEARS,
  BASE_ASSUMPTIONS,
  DISAPPEARED,
  QUANTILES,
  coverage,
  logChange,
  percentChanges,
  valueObservations,
  type CompanyHistory,
  type Fate,
  type ValueObservation,
} from '../src/survivorship.js';
import { loadPriceFile, readCandidates } from '../src/universe.js';

// ── Parametry z preregistracji (docs/plan-terminal.md, krok c2) ──
const MIN_VALUE = 1e9;
const FROM_YEAR = 2009;
const TO_YEAR = 2021;
const DATA_END = '2025-08-15';
const HORIZONS = [1, 2, 3, 4, 5];
const TOLERANCE_DAYS = 75;
const S1_THRESHOLD_PP = 5;
const K1_MIN = 0.72;
const PROXY_MAX_DIFF_PP = 10;
const MAX_SHARES_GAP_DAYS = 200;

/** Formularze składane przez samą spółkę; formularze inwestorów (4, 13G) potrafią pojawiać się po jej zniknięciu. */
const COMPANY_REPORT_FORMS = new Set([
  '10-K', '10-K405', '10-KSB', '10-KT', '10-Q', '10-QSB', '10-QT', '8-K', '20-F', '40-F', '6-K', 'DEF 14A',
  '25', '25-NSE', '15-12B', '15-12G', '15-15D', '15F-12B', '15F-12G', '15F-15D',
]);

const FATE_LABEL: Record<Fate, string> = {
  observed: 'przetrwała (wartość po h latach znana)',
  bankruptcy_reorganized: 'upadłość, stare akcje zastąpione nowymi',
  bankruptcy: 'upadłość i koniec raportowania',
  delisted: 'zniknęła z formularzem 25/15 (zwykle przejęcie)',
  vanished: 'zniknęła bez formularza',
  missing: 'pominięta: raportuje dalej, brak wartości',
  not_yet: 'pominięta: za końcem kompletnych danych',
};

const table = (header: string[], rows: (string | number)[][]) =>
  [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''].join('\n');
const pct = (x: number | null | undefined, d = 0) => (x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`);
const pp = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} p.p.`);

function main() {
  const floatsFile = universeDir('meta', 'float-frames.json');
  if (!fs.existsSync(floatsFile)) {
    console.error(`Brak ${floatsFile}. Uruchom: npx tsx scripts/universe-discover.ts`);
    process.exit(1);
  }
  const frames: Record<string, { floats: { end: string; val: number }[] }> = JSON.parse(fs.readFileSync(floatsFile, 'utf-8')).companies;
  const subsDir = universeDir('submissions');
  const factsDir = universeDir('fundamentals');
  const candidates = readCandidates();

  // ── Liczba akcji — wczytywana tylko dla spółek, które jej potrzebują (upadłość z dalszym raportowaniem) ──
  const sharesCache = new Map<string, { t: number; val: number }[]>();
  const sharesNear = (cik: string, t: number): number | null => {
    if (!sharesCache.has(cik)) {
      const file = `${factsDir}/CIK${cik}.json`;
      const list: { t: number; val: number }[] = [];
      if (fs.existsSync(file)) {
        const units = JSON.parse(fs.readFileSync(file, 'utf-8')).facts?.dei?.EntityCommonStockSharesOutstanding?.units ?? {};
        for (const arr of Object.values<any[]>(units)) for (const f of arr) if (f.val > 0) list.push({ t: new Date(f.end).getTime(), val: f.val });
      }
      sharesCache.set(cik, list);
    }
    let best: { gap: number; val: number } | null = null;
    for (const s of sharesCache.get(cik)!) {
      const gap = Math.abs(s.t - t);
      if (!best || gap < best.gap) best = { gap, val: s.val };
    }
    return best && best.gap <= MAX_SHARES_GAP_DAYS * 86_400_000 ? best.val : null;
  };

  // ── Obserwacje ──
  const all: ValueObservation[] = [];
  for (const c of candidates) {
    const fr = frames[c.cik];
    if (!fr) continue;
    const filings = loadFilings(c.cik, subsDir);
    const events = extractTerminalEvents(filings);
    let lastReportT: number | null = null;
    for (const f of filings) {
      if (!COMPANY_REPORT_FORMS.has(baseForm(f.form))) continue;
      const t = new Date(f.filingDate).getTime();
      if (Number.isFinite(t) && (lastReportT == null || t > lastReportT)) lastReportT = t;
    }
    const history: CompanyHistory = {
      cik: c.cik,
      floats: fr.floats.map((f) => ({ end: f.end, t: new Date(f.end).getTime(), val: f.val })).sort((a, b) => a.t - b.t),
      lastReportT,
      bankruptcyTs: events.filter((e) => e.kind === 'bankruptcy').map((e) => e.knownAtT),
      delistingTs: events.filter((e) => e.kind === 'exchange_delisting' || e.kind === 'deregistration').map((e) => e.knownAtT),
    };
    all.push(
      ...valueObservations(history, {
        minValue: MIN_VALUE,
        fromYear: FROM_YEAR,
        toYear: TO_YEAR,
        dataEndT: new Date(DATA_END).getTime(),
        horizons: HORIZONS,
        toleranceDays: TOLERANCE_DAYS,
        sharesNear,
      })
    );
  }
  console.error(`Obserwacji (spółka × rok × horyzont): ${all.length}.`);

  // ── Kontrola zastępnika: zmiana floatu kontra zmiana kursu z Yahoo, te same obserwacje ──
  const companiesFile = universeDir('panel', 'companies.json');
  const verified = fs.existsSync(companiesFile)
    ? new Set(Object.entries<any>(JSON.parse(fs.readFileSync(companiesFile, 'utf-8'))).filter(([, s]) => s.status === 'in_panel').map(([cik]) => cik))
    : new Set<string>();
  if (verified.size === 0) {
    console.error(`Brak listy spółek z potwierdzonymi notowaniami (${companiesFile}). Uruchom: npm run universe:panel`);
    process.exit(1);
  }
  // Notowania wczytywane po jednej spółce i od razu zwalniane — wszystkie naraz zajęłyby kilka GB pamięci.
  const observedByCik = new Map<string, ValueObservation[]>();
  for (const o of all) {
    if (o.fate !== 'observed' || !verified.has(o.cik) || !o.endDate) continue;
    const list = observedByCik.get(o.cik) ?? [];
    list.push(o);
    observedByCik.set(o.cik, list);
  }
  const proxyPairs = new Map<number, { float: number[]; price: number[] }>(HORIZONS.map((h) => [h, { float: [], price: [] }]));
  for (const [cik, list] of observedByCik) {
    const series = loadPriceFile(universeDir('prices', `CIK${cik}.json`));
    if (!series) continue;
    for (const o of list) {
      const q0 = getQuoteAtDate(series, o.start);
      const q1 = getQuoteAtDate(series, o.endDate as string);
      if (!q0 || !q1 || q0.close <= 0 || q1.close <= 0) continue;
      const pair = proxyPairs.get(o.horizon)!;
      pair.float.push(Math.log((o.endValue as number) / o.startValue));
      pair.price.push(Math.log(q1.close / q0.close));
    }
  }

  // ── Wyniki na horyzont ──
  const result: any = {
    generatedAt: new Date().toISOString(),
    parameters: { MIN_VALUE, FROM_YEAR, TO_YEAR, DATA_END, TOLERANCE_DAYS, BANKRUPTCY_TO_END_YEARS, S1_THRESHOLD_PP, K1_MIN, PROXY_MAX_DIFF_PP },
    assumptions: { base: BASE_ASSUMPTIONS, alternative: ALTERNATIVE_ASSUMPTIONS },
    horizons: {},
  };

  for (const h of HORIZONS) {
    const obs = all.filter((o) => o.horizon === h);
    const fates = Object.fromEntries((Object.keys(FATE_LABEL) as Fate[]).map((f) => [f, obs.filter((o) => o.fate === f).length]));
    const inScope = obs.filter((o) => o.fate === 'observed' || DISAPPEARED.includes(o.fate));
    const rate = (f: Fate) => (inScope.length ? fates[f] / inScope.length : null);

    const logsOf = (group: 'survivors' | 'all', a = BASE_ASSUMPTIONS) =>
      obs.map((o) => logChange(o, group, a)).filter((x): x is number => x != null);
    const A = logsOf('survivors');
    const B = logsOf('all', BASE_ASSUMPTIONS);
    const Balt = logsOf('all', ALTERNATIVE_ASSUMPTIONS);

    const qA = percentChanges(A);
    const qB = percentChanges(B);
    const qBalt = percentChanges(Balt);
    const s1Diff = qA && qB ? qB['0.1'] - qA['0.1'] : null;

    // Przedział ufności różnicy 10. centyla — bootstrap po miesiącach wyceny (obserwacje z tego samego dnia są zależne).
    const byMonth = new Map<string, ValueObservation[]>();
    for (const o of obs) {
      const key = o.start.slice(0, 7);
      const list = byMonth.get(key) ?? [];
      list.push(o);
      byMonth.set(key, list);
    }
    const groups = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
    const ci = bootstrapGroups(
      groups,
      (sample) => {
        const flat = sample.flat();
        const a = flat.map((o) => logChange(o, 'survivors', BASE_ASSUMPTIONS)).filter((x): x is number => x != null);
        const b = flat.map((o) => logChange(o, 'all', BASE_ASSUMPTIONS)).filter((x): x is number => x != null);
        if (a.length < 30 || b.length < 30) return null;
        return Math.exp(quantile(b, 0.1)) - Math.exp(quantile(a, 0.1));
      },
      500
    );

    const bandLo = A.length ? quantile(A, 0.1) : null;
    const bandHi = A.length ? quantile(A, 0.9) : null;
    const covA = bandLo != null ? coverage(A, bandLo, bandHi!) : null;
    const covB = bandLo != null ? coverage(B, bandLo, bandHi!) : null;
    const covBalt = bandLo != null ? coverage(Balt, bandLo, bandHi!) : null;

    const pair = proxyPairs.get(h)!;
    const proxy =
      pair.float.length >= 30
        ? {
            n: pair.float.length,
            float: percentChanges(pair.float),
            price: percentChanges(pair.price),
          }
        : null;
    const proxyDiff10 = proxy ? proxy.float!['0.1'] - proxy.price!['0.1'] : null;
    const proxyDiff90 = proxy ? proxy.float!['0.9'] - proxy.price!['0.9'] : null;
    const proxyOk = proxyDiff10 != null && proxyDiff90 != null && Math.abs(proxyDiff10) < PROXY_MAX_DIFF_PP / 100 && Math.abs(proxyDiff90) < PROXY_MAX_DIFF_PP / 100;

    result.horizons[h] = {
      fates,
      disappearanceRates: { bankruptcy: (rate('bankruptcy') ?? 0) + (rate('bankruptcy_reorganized') ?? 0), delisted: rate('delisted'), vanished: rate('vanished') },
      n: { survivors: A.length, all: B.length },
      quantiles: { survivors: qA, allBase: qB, allAlternative: qBalt },
      s1: { diffP10: s1Diff, ciLo: ci.lo, ciHi: ci.hi, material: s1Diff != null && s1Diff <= -S1_THRESHOLD_PP / 100 },
      k1b: { coverageSurvivors: covA, coverageAllBase: covB, coverageAllAlternative: covBalt, passBase: covB != null && covB >= K1_MIN, passAlternative: covBalt != null && covBalt >= K1_MIN },
      proxy: proxy ? { ...proxy, diffP10: proxyDiff10, diffP90: proxyDiff90, useful: proxyOk } : null,
    };
  }

  fs.mkdirSync('artifacts/universe', { recursive: true });
  fs.writeFileSync('artifacts/universe/survivorship.json', JSON.stringify(result, null, 2));

  // ── Raport ──
  const H = (h: number) => result.horizons[h];
  const L: string[] = [];
  L.push('# Krok (c2): pomiar błędu przetrwania', '');
  L.push(`Wygenerowano: ${result.generatedAt}. Definicja i progi zapisane przed pomiarem: \`docs/plan-terminal.md\`, krok (c2).`, '');
  L.push('Miara: wartość akcji w wolnym obrocie z raportów rocznych SEC (`dei:EntityPublicFloat`), dostępna dla wszystkich');
  L.push(`spółek — także tych, których notowań nie ma. Obserwacja: spółka z floatem ≥ ${MIN_VALUE / 1e9} mld USD na dzień wyceny`);
  L.push(`z lat ${FROM_YEAR}–${TO_YEAR}; wynik: zmiana tej wartości po h latach, gdy dzień t+h ≤ ${DATA_END}.`, '');

  L.push('## 1. Co się stało ze spółkami', '');
  L.push(
    table(
      ['los spółki', ...HORIZONS.map((h) => `${h} lat`)],
      (Object.keys(FATE_LABEL) as Fate[]).map((f) => [FATE_LABEL[f], ...HORIZONS.map((h) => H(h).fates[f])])
    )
  );
  L.push('Udział spółek, które zniknęły w ciągu h lat (spośród przetrwałych i zniknięłych):', '');
  L.push(
    table(
      ['przyczyna', ...HORIZONS.map((h) => `${h} lat`)],
      [
        ['upadłość', ...HORIZONS.map((h) => pct(H(h).disappearanceRates.bankruptcy, 1))],
        ['przejęcie / wycofanie', ...HORIZONS.map((h) => pct(H(h).disappearanceRates.delisted, 1))],
        ['bez formularza', ...HORIZONS.map((h) => pct(H(h).disappearanceRates.vanished, 1))],
      ]
    )
  );

  L.push('## 2. Kontrola zastępnika: czy zmiana floatu odpowiada zmianie kursu', '');
  L.push(`Te same obserwacje spółek z potwierdzonymi notowaniami. Próg użyteczności: 10. i 90. centyl różnią się o mniej niż ${PROXY_MAX_DIFF_PP} p.p.`, '');
  L.push(
    table(
      ['horyzont', 'obserwacji', '10. centyl — float', '10. centyl — kurs', '90. centyl — float', '90. centyl — kurs', 'wynik'],
      HORIZONS.map((h) => {
        const p = H(h).proxy;
        return p
          ? [`${h} lat`, p.n, pct(p.float['0.1']), pct(p.price['0.1']), pct(p.float['0.9']), pct(p.price['0.9']), p.useful ? 'użyteczny' : 'NIEUŻYTECZNY']
          : [`${h} lat`, '—', '—', '—', '—', '—', 'BRAK POMIARU'];
      })
    )
  );

  L.push('## 3. Rozkład zmiany wartości: ocalałe kontra wszystkie', '');
  L.push('Wariant podstawowy: upadłość −99%, przejęcie i zniknięcie bez formularza — ostatnia znana wartość.');
  L.push('Wariant alternatywny: upadłość −70%, przejęcie +30%, zniknięcie bez formularza −50%.', '');
  for (const h of HORIZONS) {
    const q = H(h).quantiles;
    L.push(`### ${h} lat`, '');
    L.push(
      table(
        ['grupa', 'obserwacji', ...QUANTILES.map((x) => `${x * 100}. centyl`)],
        [
          ['A — ocalałe', H(h).n.survivors, ...QUANTILES.map((x) => pct(q.survivors?.[String(x)]))],
          ['B — wszystkie (podstawowy)', H(h).n.all, ...QUANTILES.map((x) => pct(q.allBase?.[String(x)]))],
          ['B — wszystkie (alternatywny)', H(h).n.all, ...QUANTILES.map((x) => pct(q.allAlternative?.[String(x)]))],
        ]
      )
    );
  }

  L.push('## 4. Kryterium S1: czy błąd przetrwania jest istotny', '');
  L.push(`Próg: 10. centyl w grupie B (wariant podstawowy) niżej niż w grupie A o ≥ ${S1_THRESHOLD_PP} p.p. dla któregokolwiek horyzontu.`, '');
  L.push(
    table(
      ['horyzont', 'różnica 10. centyla (B − A)', 'CI95 (bootstrap po miesiącach wyceny)', 'istotny?'],
      HORIZONS.map((h) => [`${h} lat`, pp(H(h).s1.diffP10), `${pp(H(h).s1.ciLo)} … ${pp(H(h).s1.ciHi)}`, H(h).s1.material ? 'TAK' : 'nie'])
    )
  );
  const s1Any = HORIZONS.some((h) => H(h).s1.material);
  L.push(`**Wynik S1: ${s1Any ? 'ISTOTNY — pasy w terminalu trzeba poszerzyć w dół.' : 'nieistotny — pasy nie wymagają poprawki.'}**`, '');

  L.push('## 5. Kryterium K1b: pas 80% z ocalałych sprawdzony na wszystkich spółkach', '');
  L.push(`Próg: pokrycie ≥ ${K1_MIN * 100}% dla każdego horyzontu. Na grupie A pokrycie wynosi ok. 80% z definicji.`, '');
  L.push(
    table(
      ['horyzont', 'A — ocalałe', 'B — podstawowy', 'B — alternatywny', 'wynik (podstawowy)'],
      HORIZONS.map((h) => [
        `${h} lat`,
        pct(H(h).k1b.coverageSurvivors, 1),
        pct(H(h).k1b.coverageAllBase, 1),
        pct(H(h).k1b.coverageAllAlternative, 1),
        H(h).k1b.passBase ? 'PASS' : 'FAIL',
      ])
    )
  );
  const k1bAll = HORIZONS.every((h) => H(h).k1b.passBase);
  L.push(`**Wynik K1b: ${k1bAll ? 'PASS' : 'FAIL'}.** Preregistracja nie wskazała wariantu, więc werdykt dotyczy wariantu podstawowego, a alternatywny jest pokazany obok.`, '');

  L.push('## 6. Ograniczenia', '');
  L.push('- Float nie obejmuje akcji osób powiązanych ze spółką; zmienia się też przy ich sprzedaży. Dlatego sprawdzamy go względem kursów (sekcja 2).');
  L.push('- Wartość końcowa spółek, które zniknęły, jest założeniem, a nie pomiarem — stąd dwa warianty.');
  L.push('- Dane roczne: zmiana wartości w środku roku przed zniknięciem spółki nie jest widoczna.');
  L.push('- Horyzonty 4–5 lat mają mało niezależnych okresów.', '');

  fs.writeFileSync('artifacts/universe/survivorship.md', L.join('\n'));
  console.error('Zapisano artifacts/universe/survivorship.md i survivorship.json');
  for (const h of HORIZONS) {
    const r = H(h);
    console.error(
      `  ${h} lat: zniknęło ${pct((r.disappearanceRates.bankruptcy ?? 0) + (r.disappearanceRates.delisted ?? 0) + (r.disappearanceRates.vanished ?? 0), 1)}, S1 ${pp(r.s1.diffP10)}, K1b ${pct(r.k1b.coverageAllBase, 1)}, zastępnik ${r.proxy?.useful ? 'OK' : 'nie'}`
    );
  }
}

main();
