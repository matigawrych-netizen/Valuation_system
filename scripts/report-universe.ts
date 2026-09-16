/**
 * Raport kroku (c): skąd się wzięło pełne uniwersum, ile spółek odpadło na każdym etapie i czy fakty
 * wspólne z pełnego uniwersum różnią się od faktów z S&P 500.
 *   npx tsx scripts/report-universe.ts
 *
 * Wymaga: universe-discover, universe-download-sec, universe-download-prices, universe-build-panel,
 *         learn-facts (obie wersje), report-facts-stability --universe.
 * Wynik: artifacts/universe/universe-report.md
 */
import fs from 'node:fs';
import { HORIZONS } from '../src/facts-panel.js';
import { FACTS_JSON, universeDir } from '../src/paths.js';

const need = (file: string, producer: string) => {
  if (!fs.existsSync(file)) {
    console.error(`Brak ${file}. Uruchom: ${producer}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
};

const table = (header: string[], rows: (string | number)[][]) =>
  [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''].join('\n');
const f3 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(3));
const pct = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(1)}%`);

const STATUS_LABEL: Record<string, string> = {
  in_panel: 'w panelu',
  no_rows: 'dane są, ale ani jednego kwartału z kapitalizacją ≥ 1 mld USD i świeżymi danymi',
  no_prices: 'brak notowań (spółka już nie istnieje albo notowana poza NYSE/Nasdaq)',
  no_fundamentals: 'brak sprawozdań w SEC',
  excluded: 'odrzucona (SPAC albo brak raportów 10-K)',
  price_mismatch: 'notowania z Yahoo nie pasują do spółki z SEC (inny podmiot pod tym tickerem)',
  price_no_overlap: 'notowania z Yahoo nie pokrywają się w czasie z danymi SEC',
  price_no_float_data: 'nie da się zweryfikować notowań (brak łącznej liczby akcji — zwykle kilka klas akcji)',
};

function main() {
  const candidates = need(universeDir('meta', 'candidates.json'), 'npx tsx scripts/universe-discover.ts');
  const facts = need(universeDir('meta', 'download-companyfacts.json'), 'npx tsx scripts/universe-download-sec.ts companyfacts');
  const prices = need(universeDir('meta', 'download-prices.json'), 'npx tsx scripts/universe-download-prices.ts');
  const companies: Record<string, { status: string; rows?: number }> = need(
    universeDir('panel', 'companies.json'),
    'npx tsx scripts/universe-build-panel.ts'
  );
  const panelStats = need('artifacts/universe/panel-stats.json', 'npx tsx scripts/universe-build-panel.ts');
  const uFacts = need('artifacts/universe/facts.json', 'npx tsx scripts/learn-facts.ts --universe');
  const uCalib = need('artifacts/universe/bands-calibration.json', 'npx tsx scripts/learn-facts.ts --universe');
  const spFacts = need(FACTS_JSON, 'npx tsx scripts/learn-facts.ts');
  const spCalib = need('artifacts/bands-calibration.json', 'npx tsx scripts/learn-facts.ts');
  const uStab = fs.existsSync('artifacts/universe/facts-stability.json')
    ? JSON.parse(fs.readFileSync('artifacts/universe/facts-stability.json', 'utf-8'))
    : null;

  const inPanel = Object.values(companies).filter((c) => c.status === 'in_panel');
  const statusCounts = Object.values(companies).reduce<Record<string, number>>(
    (acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc),
    {}
  );

  // Spółki w panelu, których notowania skończyły się przed końcem danych — czyli takie, które zniknęły,
  // a mimo to Yahoo zachował ich historię. Mówi, ile błędu przetrwania zostało.
  const panelFile = universeDir('panel', 'facts-panel.csv');
  const lines = fs.readFileSync(panelFile, 'utf-8').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  const iCik = header.indexOf('cik');
  const iLast = header.indexOf('lastQuoteDate');
  const iAsOf = header.indexOf('asOf');
  const lastByCik = new Map<string, string>();
  const quartersByYear = new Map<string, Set<string>>();
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    lastByCik.set(c[iCik], c[iLast]);
    const year = c[iAsOf].slice(0, 4);
    const set = quartersByYear.get(year) ?? new Set<string>();
    set.add(c[iCik]);
    quartersByYear.set(year, set);
  }
  const endDay: string = panelStats.lastDataDay;
  const cutoff = new Date(new Date(endDay).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const endedEarly = [...lastByCik.values()].filter((d) => d < cutoff).length;

  const L: string[] = [];
  L.push('# Krok (c): pełne uniwersum NYSE + Nasdaq', '');
  L.push(`Wygenerowano: ${new Date().toISOString()}. Dane: \`UNIVERSE_DATA_DIR\` (dysk E:), ostatni dzień notowań ${endDay}.`, '');

  L.push('## 1. Skąd lista spółek', '');
  L.push('SEC udostępnia wartość akcji w wolnym obrocie (`dei:EntityPublicFloat`) dla wszystkich raportujących spółek');
  L.push('na każdy kwartał od 2008 r. Kandydat = spółka, której float kiedykolwiek przekroczył 500 mln USD.');
  L.push('Dzięki temu lista obejmuje także spółki, których już nie ma — w przeciwieństwie do dzisiejszej listy z giełdy.', '');

  L.push('## 2. Ile spółek odpada na każdym etapie', '');
  L.push(
    table(
      ['etap', 'spółek'],
      [
        ['kandydaci z SEC (float ≥ 500 mln USD kiedykolwiek)', candidates.candidates.length],
        ['— odrzucone: SPAC albo brak raportów 10-K', facts.excluded],
        ['sprawozdania finansowe pobrane', facts.ok],
        ['notowania pobrane z Yahoo', prices.counts.downloaded ?? 0],
        ['— brak tickera (spółka już nie istnieje)', prices.counts.no_ticker ?? 0],
        ['— notowana poza NYSE/Nasdaq', prices.counts.other_exchange ?? 0],
        ['— Yahoo nie ma danych', prices.counts.yahoo_no_data ?? 0],
        ['**w panelu**', inPanel.length],
      ]
    )
  );
  L.push('Szczegółowy status każdej spółki przy budowie panelu:', '');
  L.push(
    table(
      ['status', 'spółek'],
      Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => [STATUS_LABEL[s] ?? s, n])
    )
  );

  L.push('## 3. Panel', '');
  L.push(
    table(
      ['miara', 'wartość'],
      [
        ['wierszy (spółka × kwartał)', panelStats.rows],
        ['spółek', inPanel.length],
        ['próg kapitalizacji w dniu decyzji', `${panelStats.minMarketCap / 1e9} mld USD`],
        ...HORIZONS.map((h) => [`wierszy z ceną po ${h} latach`, panelStats.rowsWithForwardPrice[h]]),
        ['kwartałów pominiętych: poniżej progu kapitalizacji', panelStats.skips.belowMinMarketCap],
        ['kwartałów pominiętych: przestarzałe dane finansowe', panelStats.skips.staleRevenue + panelStats.skips.staleShares],
        ['faktów SEC odrzuconych z braku czasu publikacji', panelStats.factsDroppedWithoutAcceptanceTime],
      ]
    )
  );
  L.push('Spółek w panelu na rok (kwartał decyzji w danym roku). Mniejsze spółki raportują do SEC w formacie');
  L.push('maszynowym (XBRL) dopiero od 2011 r., największe od 2009 r. — dlatego panel realnie zaczyna się w latach 2010–2011.', '');
  L.push(
    table(
      ['rok', ...[...quartersByYear.keys()].sort()],
      [['spółek', ...[...quartersByYear.keys()].sort().map((y) => quartersByYear.get(y)!.size)]]
    )
  );

  L.push('## 4. Błąd przetrwania — ile go zostało', '');
  L.push(`Spółki w panelu, których notowania kończą się przed końcem danych: **${endedEarly}** z ${inPanel.length}.`);
  L.push(`Czyli praktycznie **cały panel to spółki notowane do dziś**. Yahoo nie przechowuje notowań spółek wycofanych,`);
  L.push(`więc ${prices.counts.no_ticker ?? 0} spółek bez tickera — przejętych, upadłych, wycofanych — nie ma w panelu wcale.`);
  L.push('Część z nich zniknęła z powodu kłopotów (spadek kursu), część dzięki przejęciu (zwykle z premią), więc kierunek');
  L.push('błędu nie jest oczywisty. Pewne jest tylko, że fakty opisują „spółki, które przetrwały do 2026 r.”,');
  L.push('a pasy cenowe mogą być zbyt wąskie w dół — kryterium K1 było mierzone na tych samych ocalałych.', '');
  L.push('Możliwa naprawa bez płatnych danych: dla tych spółek mamy sprawozdania i roczny kurs przybliżony z SEC');
  L.push('(`EntityPublicFloat` / liczba akcji, mediana błędu −0,2%). Da się z niego zmierzyć, o ile szersze byłyby pasy,');
  L.push('gdyby spółki, które zniknęły, były w danych.', '');

  L.push('## 5. Fakty wspólne: S&P 500 kontra pełne uniwersum', '');
  const rowsFor = (key: string) =>
    HORIZONS.map((h) => {
      const a = spFacts.facts[key]?.[h];
      const b = uFacts.facts[key]?.[h];
      return [`${h} lat`, f3(a?.slope), f3(b?.slope), f3(a?.intercept), f3(b?.intercept), a?.n ?? '—', b?.n ?? '—'];
    });
  const factHeader = ['horyzont', 'trwałość S&P', 'trwałość uniwersum', 'stała S&P', 'stała uniwersum', 'obs. S&P', 'obs. uniwersum'];
  L.push('### Wygasanie wzrostu', '');
  L.push(table(factHeader, rowsFor('growthFade')));
  L.push('### Powrót wielokrotności', '');
  L.push(table(factHeader, rowsFor('multipleReversion')));
  L.push('### Dryf liczby akcji (roczny)', '');
  L.push(
    table(
      ['horyzont', 'S&P', 'uniwersum'],
      HORIZONS.map((h) => [`${h} lat`, pct(spFacts.facts.shareDrift?.[h]?.value), pct(uFacts.facts.shareDrift?.[h]?.value)])
    )
  );

  L.push('## 6. Kryterium K1 na pełnym uniwersum', '');
  L.push('Pas 80% zawiera prawdziwą cenę — próg z preregistracji 72–88%. Pomiar na spółkach, których fakty nie widziały.', '');
  const k1 = (calib: any, s: string, h: number) => {
    const c = calib.scenarios[s]?.[h];
    if (!c) return 'BRAK POMIARU';
    return `${pct(c.coverage)} ${c.coverage >= 0.72 && c.coverage <= 0.88 ? 'PASS' : 'FAIL'}`;
  };
  L.push(
    table(
      ['horyzont', 'A — S&P', 'A — uniwersum', 'B — S&P', 'B — uniwersum'],
      HORIZONS.map((h) => [`${h} lat`, k1(spCalib, 'A', h), k1(uCalib, 'A', h), k1(spCalib, 'B', h), k1(uCalib, 'B', h)])
    )
  );

  if (uStab) {
    L.push('## 7. Czy fakty zmieniają się w czasie — pełne uniwersum', '');
    for (const [name, v] of Object.entries<any>(uStab.facts)) {
      L.push(`- **${name === 'growthFade' ? 'wygasanie wzrostu' : 'powrót wielokrotności'}**: ${v.verdict}`);
      if (v.practical?.length) {
        const last = v.practical[v.practical.length - 1];
        L.push(`  (prognozy z modeli z różnych okresów różnią się po ${last.horizon} latach o ${pct(last.priceEffect)})`);
      }
    }
    L.push('', 'Szczegóły: `artifacts/universe/facts-stability.md`.', '');
  }

  fs.mkdirSync('artifacts/universe', { recursive: true });
  fs.writeFileSync('artifacts/universe/universe-report.md', L.join('\n'));
  console.error('Zapisano artifacts/universe/universe-report.md');
}

main();
