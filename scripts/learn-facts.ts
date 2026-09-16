/**
 * Uczy „faktów wspólnych” i sprawdza, czy pasy cenowe są uczciwie szerokie.
 *   npx tsx scripts/learn-facts.ts               (S&P 500)
 *   npx tsx scripts/learn-facts.ts --universe    (pełne uniwersum)
 *
 * Uczciwość pomiaru:
 *  • uczenie i pomiar wyłącznie na okresie treningowym (asOf ≤ TRAIN_END_YEAR) — sejf 2023–2025 nietknięty,
 *  • spółki dzielone na dwie połowy: fakty uczą się na jednej, pokrycie pasów mierzone na drugiej.
 *    Bez tego przy horyzoncie 5 lat okna uczenia i pomiaru zlewają się ze sobą.
 *
 * Wynik: artifacts/facts.json, artifacts/facts-report.md, artifacts/bands-calibration.json
 */
import fs from 'node:fs';
import {
  BAND_QUANTILES,
  SCENARIOS,
  SCENARIO_LABEL,
  errorBands,
  learnFacts,
  predictPrice,
  residuals,
  type Scenario,
  type SharedFacts,
} from '../src/facts.js';
import { HORIZONS, parsePanel, type Horizon, type PanelRecord } from '../src/facts-panel.js';
import { TRAIN_END_YEAR, asOfYear, ensureArtifactsDir, factsTarget, requireArtifact } from '../src/paths.js';
import { bootstrapGroups, mean } from '../src/stats.js';

/** Stały podział spółek na dwie połowy — ta sama spółka zawsze trafia po tej samej stronie. */
export function companyBucket(cik: string): 0 | 1 {
  let h = 2166136261;
  for (let i = 0; i < cik.length; i++) {
    h ^= cik.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2) as 0 | 1;
}

const fmt = (x: number | null | undefined, d = 3) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));

function table(header: string[], rows: (string | number)[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''].join('\n');
}

/** Udział przypadków, w których prawdziwa cena mieści się między 10. a 90. centylem prognozy. */
function coverage(rows: PanelRecord[], facts: SharedFacts, bands: ReturnType<typeof errorBands>, h: Horizon, scenario: Scenario) {
  if (!bands) return null;
  const lo = bands.logQuantiles['0.1'];
  const hi = bands.logQuantiles['0.9'];
  const byQuarter = new Map<string, number[]>();
  let inside = 0;
  let total = 0;
  for (const r of rows) {
    const actual = r.fwd[h].price;
    if (actual == null || actual <= 0) continue;
    const pred = predictPrice(r, facts, h, scenario);
    if (pred == null || pred <= 0) continue;
    const logErr = Math.log(actual / pred);
    const hit = logErr >= lo && logErr <= hi ? 1 : 0;
    inside += hit;
    total++;
    const list = byQuarter.get(r.asOf) ?? [];
    list.push(hit);
    byQuarter.set(r.asOf, list);
  }
  if (total === 0) return null;
  // Kolejność grup po dacie — wynik bootstrapu nie może zależeć od kolejności wierszy w pliku.
  const groups = [...byQuarter.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
  const ci = bootstrapGroups(groups, (sample) => {
    const flat = sample.flat();
    return flat.length ? mean(flat) : null;
  });
  return { coverage: inside / total, n: total, quarters: groups.length, lo: ci.lo, hi: ci.hi };
}

function main() {
  const target = factsTarget();
  const FACTS_PANEL_CSV = target.panel;
  const FACTS_JSON = target.factsJson;
  const FACTS_REPORT = target.factsReport;
  const BANDS_CALIBRATION_JSON = target.bandsCalibration;
  requireArtifact(FACTS_PANEL_CSV, 'npx tsx scripts/build-facts-panel.ts (albo universe-build-panel.ts)');
  const all = parsePanel(FACTS_PANEL_CSV);
  const train = all.filter((r) => asOfYear(r.asOf) <= TRAIN_END_YEAR);
  if (train.length === 0) {
    console.error('Panel nie zawiera wierszy z okresu treningowego.');
    process.exit(1);
  }

  const fitRows = train.filter((r) => companyBucket(r.cik) === 0);
  const testRows = train.filter((r) => companyBucket(r.cik) === 1);
  console.error(`Panel: ${all.length} wierszy, okres treningowy ${train.length}.`);
  console.error(`Uczenie na ${new Set(fitRows.map((r) => r.cik)).size} spółkach, pomiar na ${new Set(testRows.map((r) => r.cik)).size}.`);

  const facts = learnFacts(fitRows);
  /** Fakty produkcyjne uczone na całym okresie treningowym — do użytku, nie do oceny. */
  const factsFull = learnFacts(train);

  const bandsFit: Record<Scenario, Partial<Record<Horizon, ReturnType<typeof errorBands>>>> = { A: {}, B: {} };
  const bandsFull: Record<Scenario, Partial<Record<Horizon, ReturnType<typeof errorBands>>>> = { A: {}, B: {} };
  for (const s of SCENARIOS) {
    for (const h of HORIZONS) {
      bandsFit[s][h] = errorBands(residuals(fitRows, facts, h, s));
      bandsFull[s][h] = errorBands(residuals(train, factsFull, h, s));
    }
  }

  const calibration: any = { generatedAt: new Date().toISOString(), scenarios: {} };
  for (const s of SCENARIOS) {
    calibration.scenarios[s] = {};
    for (const h of HORIZONS) {
      calibration.scenarios[s][h] = coverage(testRows, facts, bandsFit[s][h] ?? null, h, s);
    }
  }

  ensureArtifactsDir();
  fs.mkdirSync('artifacts/universe', { recursive: true });
  fs.writeFileSync(
    FACTS_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        trainedOn: { rows: train.length, ciks: new Set(train.map((r) => r.cik)).size, throughYear: TRAIN_END_YEAR },
        facts: factsFull,
        errorBands: bandsFull,
      },
      null,
      2
    )
  );
  fs.writeFileSync(BANDS_CALIBRATION_JSON, JSON.stringify(calibration, null, 2));

  // ── Raport ──
  const L: string[] = [];
  L.push('# Fakty wspólne: wzrost, wielokrotność, szerokość błędu', '');
  L.push(`Zbiór: **${target.label}**.`, '');
  L.push(`Wygenerowano: ${new Date().toISOString()}.`, '');
  L.push(`Dane: panel \`${FACTS_PANEL_CSV}\`, ${all.length} wierszy, z tego ${train.length} w okresie treningowym (do ${TRAIN_END_YEAR}).`);
  L.push(`Fakty oceniane są na **innych spółkach** niż te, na których się uczyły: ${new Set(fitRows.map((r) => r.cik)).size} do nauki, ${new Set(testRows.map((r) => r.cik)).size} do pomiaru.`, '');

  L.push('## 1. Wygasanie wzrostu', '');
  L.push('Ile z dotychczasowego tempa wzrostu przychodów (3 lata wstecz) utrzymuje się przez kolejne lata.');
  L.push('Współczynnik bliski 1 oznacza, że wzrost się utrzymuje; bliski 0 — że szybko wygasa do średniej.', '');
  L.push(
    table(
      ['horyzont', 'stała', 'współczynnik trwałości', 'obserwacji', 'błąd dopasowania'],
      HORIZONS.map((h) => {
        const f = factsFull.growthFade[h];
        return [`${h} lat`, fmt(f?.intercept), fmt(f?.slope), f?.n ?? '—', fmt(f?.rmse)];
      })
    )
  );

  L.push('## 2. Powrót wielokrotności', '');
  L.push('Ile z dzisiejszej wyceny (kapitalizacja / przychody, w skali logarytmicznej) zostaje po latach.');
  L.push('Współczynnik bliski 1 = wycena się utrzymuje; bliski 0 = wraca do poziomu typowego dla rynku.', '');
  L.push(
    table(
      ['horyzont', 'stała', 'współczynnik trwałości', 'obserwacji', 'błąd dopasowania'],
      HORIZONS.map((h) => {
        const f = factsFull.multipleReversion[h];
        return [`${h} lat`, fmt(f?.intercept), fmt(f?.slope), f?.n ?? '—', fmt(f?.rmse)];
      })
    )
  );

  L.push('## 3. Dryf liczby akcji', '');
  L.push('Mediana rocznej zmiany liczby akcji. Wartość ujemna = spółki średnio skupują własne akcje.', '');
  L.push(
    table(
      ['horyzont', 'roczna zmiana', 'obserwacji'],
      HORIZONS.map((h) => {
        const f = factsFull.shareDrift[h];
        return [`${h} lat`, f ? `${(f.value * 100).toFixed(2)}%` : '—', f?.n ?? '—'];
      })
    )
  );

  L.push('## 4. Szerokość błędu prognozy', '');
  L.push('Rozkład log(cena prawdziwa / cena przewidziana). Z centyli 10% i 90% powstaje pas 80%.', '');
  for (const s of SCENARIOS) {
    L.push(`### Scenariusz ${s} — ${SCENARIO_LABEL[s]}`, '');
    L.push(
      table(
        ['horyzont', ...BAND_QUANTILES.map((p) => `${p * 100}%`), 'obserwacji'],
        HORIZONS.map((h) => {
          const b = bandsFull[s][h];
          return [`${h} lat`, ...BAND_QUANTILES.map((p) => fmt(b?.logQuantiles[String(p)])), b?.n ?? '—'];
        })
      )
    );
  }

  L.push('## 5. Kryterium K1: czy pas 80% naprawdę zawiera prawdziwą cenę w 80% przypadków', '');
  L.push('Pomiar na spółkach, których fakty nie widziały. Próg z preregistracji: **72–88%**.', '');
  L.push('Przedział ufności liczony bootstrapem po kwartałach, bo obserwacje z jednego kwartału są zależne.', '');
  for (const s of SCENARIOS) {
    L.push(`### Scenariusz ${s} — ${SCENARIO_LABEL[s]}`, '');
    L.push(
      table(
        ['horyzont', 'pokrycie', 'CI95', 'obserwacji', 'kwartałów', 'wynik'],
        HORIZONS.map((h) => {
          const c = calibration.scenarios[s][h];
          if (!c) return [`${h} lat`, '—', '—', '—', '—', 'BRAK POMIARU'];
          const pass = c.coverage >= 0.72 && c.coverage <= 0.88;
          return [
            `${h} lat`,
            `${(c.coverage * 100).toFixed(1)}%`,
            c.lo == null ? '—' : `${(c.lo * 100).toFixed(1)}–${(c.hi * 100).toFixed(1)}%`,
            c.n,
            c.quarters,
            pass ? 'PASS' : 'FAIL',
          ];
        })
      )
    );
  }
  L.push('### Czego ten pomiar NIE dowodzi', '');
  L.push('Podział jest **po spółkach, nie po czasie**: pasy uczyły się i były sprawdzane na tych samych latach.');
  L.push('Wynik mówi więc: „szerokość błędu przenosi się z jednych spółek na inne w okresie 2009–2021”.');
  L.push('Nie mówi: „pasy byłyby tak samo szerokie w roku krachu albo w latach 2022+”. Do tego służy sejf 2023–2025,');
  L.push('którego celowo nie dotykamy (limit 3 użyć, `docs/data-splits.md`).', '');
  L.push('Horyzonty 4–5 lat mają niewiele niezależnych okresów — wynik dla nich jest słabszym dowodem niż dla 1 roku.');
  L.push('Przy 45 kwartałach decyzji i horyzoncie 5 lat niezależnych okien jest około 3.', '');

  fs.writeFileSync(FACTS_REPORT, L.join('\n'));
  console.error(`Zapisano ${FACTS_JSON}, ${BANDS_CALIBRATION_JSON} i ${FACTS_REPORT}.`);
  for (const s of SCENARIOS) {
    for (const h of HORIZONS) {
      const c = calibration.scenarios[s][h];
      console.error(`  ${s} / ${h} lat: pokrycie ${c ? (c.coverage * 100).toFixed(1) + '%' : 'brak'} (n=${c?.n ?? 0})`);
    }
  }
}

main();
