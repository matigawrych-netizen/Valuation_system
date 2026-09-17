/**
 * Krok (d): raport z egzaminu specjalistów.
 *   npm run specialists:report
 *   npm run specialists:report -- --variant u1   (wariant z docs/ulepszenia.md → artifacts/universe/u1/)
 *
 * Czyta wyniki `specialists-exam` z <UNIVERSE_DATA_DIR>/specialists, notowania spółek (K2), SPY i VTI.
 * Prognozujący, których egzamin się nie odbył, mają „BRAK POMIARU” — nigdy PASS.
 * Wynik: artifacts/universe/specialists-exam.md i .json (same zestawienia, bez notowań).
 */
import fs from 'node:fs';
import os from 'node:os';
import { HORIZONS, type Horizon } from '../src/facts-panel.js';
import { K2_HOLD_YEARS, findLimitFill, nextSession, tradeVersusMarket, type TradeResult } from '../src/limit-backtest.js';
import { SPECIALISTS_EXAM_JSON, SPECIALISTS_EXAM_REPORT, SPY_JSON, VTI_JSON, universeDir } from '../src/paths.js';
import {
  GATE_P,
  K1_RANGE,
  K34_P,
  K6_MAX_MEDIAN_CHANGE,
  MERGE_CORRELATION,
  beatsBenchmark,
  buyPriceStability,
  compareForecasters,
  coverage,
  forecastDiversity,
  gateOverall,
  isComplete,
  MIN_INDEPENDENT_WINDOWS,
  isScored,
  notSignificantlyWorse,
  pinballLoss,
  readBuyFile,
  readExamFile,
  specialistFiles,
  voteWeights,
  type BuyRecord,
  type Comparison,
  type CoverageResult,
  type ExamRecord,
  type StabilityResult,
} from '../src/specialist-exam.js';
import { EXAM_FIRST_YEAR, EXAM_LAST_YEAR } from '../src/specialist-memory.js';
import { BENCHMARKS, METHOD_LABEL, MEMORY_LABEL, TEAM, VARIANTS, benchmarkFor, variantOptions, type ForecasterDef } from '../src/specialists.js';
import { mean, movingBlockBootstrap } from '../src/stats.js';
import { loadPriceFile } from '../src/universe.js';

type Status = 'PASS' | 'FAIL' | 'BRAK POMIARU';

const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`);
const fx = (x: number | null | undefined, d = 3) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pv = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : x < 0.001 ? '<0,001' : x.toFixed(3));

function table(header: string[], rows: (string | number)[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''].join('\n');
}

/** Wszystkie horyzonty PASS = PASS; jakikolwiek FAIL = FAIL; inaczej brak pomiaru. */
function allHorizons(statuses: Status[]): Status {
  if (statuses.some((s) => s === 'FAIL')) return 'FAIL';
  if (statuses.every((s) => s === 'PASS')) return 'PASS';
  return 'BRAK POMIARU';
}

interface K2Result {
  orders: number;
  fills: number;
  trades: number;
  withoutOutcome: number;
  quarters: number;
  meanExcess: number | null;
  lo: number | null;
  hi: number | null;
  meanStock: number | null;
  meanMarket: number | null;
  noLimit: { trades: number; meanExcess: number | null };
  /** Informacyjnie: te same transakcje względem całego rynku USA (VTI). */
  totalMarket: { trades: number; meanExcess: number | null; lo: number | null; hi: number | null };
  status: Status;
}

const K2_MIN_TRADES = 30;
const K2_MIN_QUARTERS = 4;

/** Nadwyżki pogrupowane po kwartale decyzji, w kolejności czasu. */
function excessByQuarter(trades: TradeResult[]): number[][] {
  const byQuarter = new Map<string, number[]>();
  for (const t of trades) {
    const g = byQuarter.get(t.decision) ?? [];
    g.push(t.excess);
    byQuarter.set(t.decision, g);
  }
  return [...byQuarter.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
}

// Roczne trzymanie akcji kupowanych co kwartał: sąsiednie kwartały zachodzą na siebie — bloki po 4·lata kwartałów.
const meanExcessCi = (groups: number[][]) =>
  movingBlockBootstrap(groups, 4 * K2_HOLD_YEARS, (sample) => {
    const flat = sample.flat();
    return flat.length ? mean(flat) : null;
  });

function k2Summary(orders: number, fills: number, trades: TradeResult[], noLimit: TradeResult[], totalMarket: TradeResult[]): K2Result {
  const groups = excessByQuarter(trades);
  const totalGroups = excessByQuarter(totalMarket);
  const totalCi = totalMarket.length >= K2_MIN_TRADES && totalGroups.length >= K2_MIN_QUARTERS ? meanExcessCi(totalGroups) : null;
  const base = {
    orders,
    fills,
    trades: trades.length,
    withoutOutcome: fills - trades.length,
    quarters: groups.length,
    meanStock: trades.length ? mean(trades.map((t) => t.stockReturn)) : null,
    meanMarket: trades.length ? mean(trades.map((t) => t.marketReturn)) : null,
    noLimit: { trades: noLimit.length, meanExcess: noLimit.length ? mean(noLimit.map((t) => t.excess)) : null },
    totalMarket: {
      trades: totalMarket.length,
      meanExcess: totalMarket.length ? mean(totalMarket.map((t) => t.excess)) : null,
      lo: totalCi?.lo ?? null,
      hi: totalCi?.hi ?? null,
    },
  };
  if (trades.length < K2_MIN_TRADES || groups.length < K2_MIN_QUARTERS) {
    return { ...base, meanExcess: trades.length ? mean(trades.map((t) => t.excess)) : null, lo: null, hi: null, status: 'BRAK POMIARU' };
  }
  const ci = meanExcessCi(groups);
  const m = mean(trades.map((t) => t.excess));
  return { ...base, meanExcess: m, lo: ci.lo, hi: ci.hi, status: m > 0 && ci.lo != null && ci.lo > 0 ? 'PASS' : 'FAIL' };
}

interface SpecialistResult {
  def: ForecasterDef;
  available: boolean;
  coverage: Partial<Record<Horizon, CoverageResult>>;
  abstention: Partial<Record<Horizon, { noModel: number; abstained: number; total: number }>>;
  k3: Partial<Record<Horizon, Comparison>>;
  k4: Partial<Record<Horizon, Comparison>>;
  typical: Partial<Record<Horizon, Comparison>>;
  gate: Partial<Record<Horizon, Comparison>>;
  k1: Status;
  k3Status: Status[];
  k4Status: Status[];
  gateStatus: Status | 'nie dotyczy';
  k6: StabilityResult | null;
  k2: K2Result | null;
  vote: boolean;
  buyByYear: Record<string, number>;
  censoredShare: number | null;
  dividendUnknownShare: number | null;
}

async function main() {
  try {
    os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // brak uprawnień do zmiany priorytetu nie zmienia wyników
  }
  const variantIdx = process.argv.indexOf('--variant');
  const variant = variantIdx >= 0 ? (process.argv[variantIdx + 1] ?? null) : null;
  if (variant) variantOptions(variant);
  const dir = variant ? universeDir('specialists', variant) : universeDir('specialists');
  const reportFile = variant ? `artifacts/universe/${variant}/specialists-exam.md` : SPECIALISTS_EXAM_REPORT;
  const jsonFile = variant ? `artifacts/universe/${variant}/specialists-exam.json` : SPECIALISTS_EXAM_JSON;
  for (const file of [SPY_JSON, VTI_JSON]) {
    if (!fs.existsSync(file)) {
      console.error(`Brak ${file} (potrzebny do K2). Uruchom: npm run download:market`);
      process.exit(1);
    }
  }
  const spy = loadPriceFile(SPY_JSON);
  const vti = loadPriceFile(VTI_JSON);
  if (!spy || !vti) throw new Error(`Plik ${SPY_JSON} albo ${VTI_JSON} nie zawiera notowań.`);

  const exams = new Map<string, ExamRecord[]>();
  const buys = new Map<string, BuyRecord[]>();
  for (const def of [...TEAM, ...BENCHMARKS]) {
    if (!isComplete(dir, def.id)) continue;
    const f = specialistFiles(dir, def.id);
    exams.set(def.id, readExamFile(f.exam));
    if (def.role === 'specialist') buys.set(def.id, fs.existsSync(f.buy) ? readBuyFile(f.buy) : []);
  }
  if (exams.size === 0) {
    console.error(`Brak wyników egzaminu w ${dir}. Uruchom: npm run specialists:exam -- --method simple`);
    process.exit(1);
  }
  console.error(`Wyniki: ${[...exams.keys()].join(', ')}.`);

  // ── K2: zlecenia z limitem (notowania wczytywane po jednej spółce) ──
  const tradesById = new Map<string, { orders: number; fills: number; trades: TradeResult[]; noLimit: TradeResult[]; totalMarket: TradeResult[] }>();
  for (const id of buys.keys()) tradesById.set(id, { orders: 0, fills: 0, trades: [], noLimit: [], totalMarket: [] });
  const buysByCik = new Map<string, { id: string; b: BuyRecord }[]>();
  for (const [id, list] of buys) {
    for (const b of list) {
      const l = buysByCik.get(b.cik) ?? [];
      l.push({ id, b });
      buysByCik.set(b.cik, l);
    }
  }
  const pricesDir = universeDir('prices');
  let done = 0;
  for (const [cik, list] of buysByCik) {
    if (++done % 200 === 0) console.error(`  K2: ${done}/${buysByCik.size} spółek`);
    const file = `${pricesDir}/CIK${cik}.json`;
    const series = fs.existsSync(file) ? loadPriceFile(file) : null;
    if (!series) throw new Error(`Brak notowań spółki ${cik} (${file}), choć ma ceny zakupu z egzaminu.`);
    for (const { id, b } of list) {
      const acc = tradesById.get(id)!;
      acc.orders++;
      const fill = findLimitFill(series, b.asOf, b.balanced);
      if (fill) {
        acc.fills++;
        const t = tradeVersusMarket(cik, b.asOf, series, fill, spy);
        if (t) acc.trades.push(t);
        const total = tradeVersusMarket(cik, b.asOf, series, fill, vti);
        if (total) acc.totalMarket.push(total);
      }
      const next = nextSession(series, b.asOf);
      const free = next ? tradeVersusMarket(cik, b.asOf, series, next, spy) : null;
      if (free) acc.noLimit.push(free);
    }
  }

  // ── Wyniki specjalistów ──
  const results: SpecialistResult[] = [];
  for (const def of TEAM) {
    const recs = exams.get(def.id);
    const r: SpecialistResult = {
      def,
      available: recs != null,
      coverage: {},
      abstention: {},
      k3: {},
      k4: {},
      typical: {},
      gate: {},
      k1: 'BRAK POMIARU',
      k3Status: HORIZONS.map(() => 'BRAK POMIARU'),
      k4Status: HORIZONS.map(() => 'BRAK POMIARU'),
      gateStatus: def.method === 'simple' ? 'nie dotyczy' : 'BRAK POMIARU',
      k6: null,
      k2: null,
      vote: false,
      buyByYear: {},
      censoredShare: null,
      dividendUnknownShare: null,
    };
    results.push(r);
    if (!recs) continue;
    const noChange = exams.get(benchmarkFor('no_change', def.memory).id);
    const constant = exams.get(benchmarkFor('constant_multiple', def.memory).id);
    const typical = exams.get(benchmarkFor('typical_return', def.memory).id);
    const simplePeer = TEAM.find((d) => d.method === 'simple' && d.memory === def.memory)!;
    const peer = def.method === 'simple' ? null : exams.get(simplePeer.id);

    const gateStatuses: Status[] = [];
    for (const h of HORIZONS) {
      r.coverage[h] = coverage(recs, h);
      const ofH = recs.filter((x) => x.h === h);
      r.abstention[h] = {
        noModel: ofH.filter((x) => x.status === 'no_model').length,
        abstained: ofH.filter((x) => x.status !== 'ok' && x.status !== 'no_model').length,
        total: ofH.length,
      };
      if (noChange) {
        r.k3[h] = compareForecasters(recs, noChange, h);
        r.k3Status[h - 1] = beatsBenchmark(r.k3[h]!);
      }
      if (constant) {
        r.k4[h] = compareForecasters(recs, constant, h);
        r.k4Status[h - 1] = beatsBenchmark(r.k4[h]!);
      }
      if (typical) r.typical[h] = compareForecasters(recs, typical, h);
      if (peer) {
        r.gate[h] = compareForecasters(recs, peer, h);
        gateStatuses.push(notSignificantlyWorse(r.gate[h]!));
      }
    }
    r.k1 = allHorizons(HORIZONS.map((h) => r.coverage[h]!.status));
    if (def.method !== 'simple') r.gateStatus = peer ? gateOverall(gateStatuses) : 'BRAK POMIARU';

    const b = buys.get(def.id) ?? [];
    r.k6 = buyPriceStability(b);
    const t = tradesById.get(def.id)!;
    r.k2 = k2Summary(t.orders, t.fills, t.trades, t.noLimit, t.totalMarket);
    for (const x of b) r.buyByYear[x.asOf.slice(0, 4)] = (r.buyByYear[x.asOf.slice(0, 4)] ?? 0) + 1;
    r.censoredShare = b.length ? b.filter((x) => x.censored > 0).length / b.length : null;
    r.dividendUnknownShare = b.length ? b.filter((x) => !x.dividendKnown).length / b.length : null;
    // Głos: zdany K1 [decyzja właściciela]; drzewa i sieć dodatkowo bramka.
    r.vote = r.k1 === 'PASS' && (def.method === 'simple' || r.gateStatus === 'PASS');
  }

  // ── Różnorodność i wagi ──
  const available = results.filter((r) => r.available);
  const diversity = HORIZONS.map((h) => forecastDiversity(new Map(available.map((r) => [r.def.id, exams.get(r.def.id)!])), h));
  const voting = new Set(available.filter((r) => r.vote).map((r) => r.def.id));
  const lossById = new Map<string, number>();
  if (voting.size > 0) {
    const perId = new Map<string, number[]>([...voting].map((id) => [id, []]));
    for (const h of HORIZONS) {
      const maps = [...voting].map((id) => new Map(exams.get(id)!.filter((x) => x.h === h && isScored(x)).map((x) => [`${x.cik}|${x.asOf}`, x])));
      const common = [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k)));
      if (common.length === 0) continue;
      [...voting].forEach((id, i) => {
        perId.get(id)!.push(mean(common.map((k) => {
          const x = maps[i].get(k)!;
          return pinballLoss(x.actual!, x.q10!, x.median!, x.q90!);
        })));
      });
    }
    for (const [id, losses] of perId) if (losses.length) lossById.set(id, mean(losses));
  }
  const weights = voteWeights(lossById, voting);

  // ── Raport ──
  const L: string[] = [];
  const now = new Date().toISOString();
  L.push(variant ? `# Egzamin specjalistów — wariant ${variant}` : '# Egzamin specjalistów (krok d)', '');
  if (variant) L.push(`Wariant: ${VARIANTS[variant].description}. Reguły wariantu: \`docs/ulepszenia.md\`.`, '');
  L.push(`Wygenerowano: ${now}. Projekt i progi: \`docs/specjalisci.md\` (zapisane przed treningiem).`, '');
  L.push(
    `Egzamin kroczący: trening co roku 15 lutego ${EXAM_FIRST_YEAR}–${EXAM_LAST_YEAR}, ocena decyzji do następnego lutego. ` +
      'Sejf 2023–2025 nietknięty: decyzje egzaminu kończą się w 2021 r., pamięć — na wynikach znanych w dniu treningu.',
    ''
  );

  L.push('## Wynik w skrócie', '');
  L.push(
    table(
      ['specjalista', 'metoda', 'pamięć', 'K1 pas 80%', 'K3 (horyzonty)', 'K4 (horyzonty)', 'bramka', 'K2', 'K6', 'głos'],
      results.map((r) => [
        r.def.name,
        METHOD_LABEL[r.def.method],
        MEMORY_LABEL(r.def.memory),
        r.available ? r.k1 : 'BRAK POMIARU',
        r.available ? `${r.k3Status.filter((s) => s === 'PASS').length}/5 PASS` : 'BRAK POMIARU',
        r.available ? `${r.k4Status.filter((s) => s === 'PASS').length}/5 PASS` : 'BRAK POMIARU',
        r.gateStatus,
        r.k2?.status ?? 'BRAK POMIARU',
        r.k6?.status ?? 'BRAK POMIARU',
        r.available ? (r.vote ? `tak (waga ${pct(weights.get(r.def.id), 0)})` : 'nie') : '—',
      ])
    )
  );
  L.push('Głos w konsensusie: zdany K1 na wszystkich horyzontach; drzewa i sieć dodatkowo bramka (nie istotnie gorsze od modelu prostego z tą samą pamięcią).');
  L.push('Specjalista bez głosu pozostaje widoczny w szczegółach z oznaczeniem „nie zdał egzaminu”.', '');

  L.push('## K1 — czy pas 80% zawiera prawdziwą cenę', '');
  L.push(`Próg: ${pct(K1_RANGE[0], 0)}–${pct(K1_RANGE[1], 0)} dla każdego horyzontu. Przedział ufności: bootstrap po kwartałach.`, '');
  L.push(
    table(
      ['specjalista', ...HORIZONS.map((h) => `${h} r.`)],
      results.filter((r) => r.available).map((r) => [
        r.def.name,
        ...HORIZONS.map((h) => {
          const c = r.coverage[h]!;
          return `${pct(c.coverage)} (${pct(c.lo, 0)}–${pct(c.hi, 0)}), n=${c.n}, ${c.status}`;
        }),
      ])
    )
  );
  L.push('Punkty odniesienia (informacyjnie):', '');
  L.push(
    table(
      ['punkt odniesienia', ...HORIZONS.map((h) => `${h} r.`)],
      BENCHMARKS.filter((b) => exams.has(b.id)).map((b) => [
        b.name,
        ...HORIZONS.map((h) => {
          const c = coverage(exams.get(b.id)!, h);
          return `${pct(c.coverage)}, n=${c.n}`;
        }),
      ])
    )
  );

  L.push('## Wstrzymane głosy', '');
  L.push('„brak modelu” = za mało danych w pamięci dla tego horyzontu (dane zaczynają się w 2010 r.); „wstrzymał się” = brak kluczowej cechy albo spółka poza 1.–99. centylem danych uczących.', '');
  L.push(
    table(
      ['specjalista', ...HORIZONS.map((h) => `${h} r.: brak modelu / wstrzymał się`)],
      results.filter((r) => r.available).map((r) => [
        r.def.name,
        ...HORIZONS.map((h) => {
          const a = r.abstention[h]!;
          return `${pct(a.noModel / Math.max(1, a.total), 0)} / ${pct(a.abstained / Math.max(1, a.total), 0)}`;
        }),
      ])
    )
  );

  const comparisonTable = (
    title: string,
    pick: (r: SpecialistResult) => Partial<Record<Horizon, Comparison>>,
    rule: string,
    include: (r: SpecialistResult) => boolean = () => true
  ) => {
    L.push(`## ${title}`, '', rule, '');
    L.push(
      table(
        ['specjalista', ...HORIZONS.map((h) => `${h} r.: strata (odniesienie) · p`)],
        results.filter((r) => r.available && include(r)).map((r) => [
          r.def.name,
          ...HORIZONS.map((h) => {
            const c = pick(r)[h];
            if (!c || c.rows === 0) return '—';
            return `${fx(c.lossA)} (${fx(c.lossB)}) · p=${pv(c.dm?.pValue)} · kw.=${c.quarters}`;
          }),
        ])
      )
    );
  };
  comparisonTable(
    'K3 — lepszy od „cena się nie zmieni”',
    (r) => r.k3,
    `Strata kwantylowa (centyle 10/50/90, logarytm zmiany ceny) na wspólnych obserwacjach; mniej = lepiej. PASS: niższa strata i p < ${K34_P} (Diebold-Mariano na średnich kwartalnych, Newey-West). „kw.” = liczba kwartałów. Test odbywa się tylko przy co najmniej ${MIN_INDEPENDENT_WINDOWS} nienachodzących na siebie oknach (kwartały ≥ ${MIN_INDEPENDENT_WINDOWS} × 4 × horyzont); inaczej „p=—” i brak pomiaru — dla 3–5 lat dane z 2016–2021 zwykle na to nie wystarczają.`
  );
  comparisonTable('K4 — lepszy od „stała wielokrotność”', (r) => r.k4, `Punkt odniesienia: wzrost przychodów jak w modelu prostym z tą samą pamięcią, wycena bez zmian. PASS: niższa strata i p < ${K34_P}.`);
  comparisonTable('Informacyjnie — typowy zwrot z pamięci', (r) => r.typical, 'Mediana = typowa zmiana ceny w pamięci specjalisty, bez patrzenia na spółkę. Nie jest kryterium.');
  comparisonTable('Bramka — drzewa i sieć kontra model prosty z tą samą pamięcią', (r) => r.gate, `FAIL, gdy strata jest wyższa i p < ${GATE_P} dla któregokolwiek horyzontu. PASS, gdy żaden zmierzony horyzont nie jest FAIL i zmierzono co najmniej jeden.`,
    (r) => r.def.method !== 'simple'
  );

  L.push('## K2 — zakup po cenie zrównoważonej kontra S&P 500', '');
  L.push(
    `Zlecenie z limitem ważne 3 miesiące od decyzji; realizacja po pierwszym zamknięciu ≤ limit. Trzymanie ${K2_HOLD_YEARS} rok, ` +
      'zwrot z dywidendami, SPY kupiony w tej samej sesji. PASS: średnia nadwyżka > 0 i dolna granica CI95 > 0 ' +
      '(bootstrap ruchomych bloków po 4 kwartały — roczne trzymania z sąsiednich kwartałów zachodzą na siebie).',
    ''
  );
  L.push(
    table(
      ['specjalista', 'zlecenia', 'zrealizowane', 'z wynikiem', 'kwartały', 'spółka', 'SPY', 'nadwyżka (CI95)', 'wynik', 'bez limitu: nadwyżka', 'cały rynek USA (VTI, inf.): nadwyżka (CI95)'],
      results.filter((r) => r.k2).map((r) => {
        const k = r.k2!;
        return [
          r.def.name,
          k.orders,
          `${k.fills} (${pct(k.fills / Math.max(1, k.orders), 0)})`,
          k.trades,
          k.quarters,
          pct(k.meanStock),
          pct(k.meanMarket),
          `${pct(k.meanExcess)} (${pct(k.lo)} – ${pct(k.hi)})`,
          k.status,
          `${pct(k.noLimit.meanExcess)} (n=${k.noLimit.trades})`,
          `${pct(k.totalMarket.meanExcess)} (${pct(k.totalMarket.lo)} – ${pct(k.totalMarket.hi)})`,
        ];
      })
    )
  );
  L.push(
    '**Zastrzeżenie — błąd przetrwania.** Panel zawiera prawie wyłącznie spółki notowane do dziś (krok c2). Zwroty spółek są więc ' +
      'zawyżone względem rzeczywistości, a nadwyżka nad SPY — razem z nimi. Kolumna „bez limitu” pokazuje, ile daje sam wybór ' +
      'spółek z panelu bez ceny zakupu: dopiero różnica między nią a wynikiem ze zleceniem mówi coś o cenie zakupu. ' +
      'Ostatnia kolumna: te same transakcje względem funduszu całego rynku USA (VTI) — informacyjnie, kryterium K2 liczone jest względem S&P 500.',
    ''
  );

  L.push('## K6 — czy cena zakupu skacze bez powodu', '');
  L.push(`Mediana |zmiany| ceny zrównoważonej między kolejnymi kwartałami tej samej spółki. Próg: ≤ ${pct(K6_MAX_MEDIAN_CHANGE, 0)}. Kolumny horyzontów pokazują, które składniki średniej są najbardziej rozchwiane.`, '');
  L.push(
    table(
      ['specjalista', 'mediana zmiany', 'par kwartałów', ...HORIZONS.map((h) => `tylko ${h} r.`), 'wynik', 'na granicy zakresu wyceny', 'dywidenda nieznana (liczona jako 0)'],
      results.filter((r) => r.k6).map((r) => [
        r.def.name,
        pct(r.k6!.medianChange),
        r.k6!.pairs,
        ...r.k6!.byHorizon.map((x) => pct(x)),
        r.k6!.status,
        pct(r.censoredShare),
        pct(r.dividendUnknownShare),
      ])
    )
  );
  L.push('Ceny zakupu według roku decyzji (cena wymaga modeli dla wszystkich 5 horyzontów):', '');
  const years = Array.from({ length: EXAM_LAST_YEAR - EXAM_FIRST_YEAR + 1 }, (_, i) => String(EXAM_FIRST_YEAR + i));
  L.push(table(['specjalista', ...years], results.filter((r) => r.available).map((r) => [r.def.name, ...years.map((y) => r.buyByYear[y] ?? 0)])));

  L.push('## Różnorodność zespołu', '');
  L.push(
    `Korelacja median prognoz na obserwacjach ocenionych przez wszystkich. Para ≥ ${MERGE_CORRELATION} zostaje połączona. Cel: n_eff > 3. ` +
      'Korelacja błędów podana informacyjnie — jest zawsze wysoka, bo prawdziwy ruch kursu jest wspólny dla wszystkich (docs/specjalisci.md, punkt 7).',
    ''
  );
  L.push(
    table(
      ['horyzont', 'obserwacji', 'średnia korelacja prognoz', 'n_eff', 'średnia korelacja błędów (inf.)', 'pary do połączenia'],
      diversity.map((d, i) => [
        `${HORIZONS[i]} r.`,
        d.rows,
        fx(d.meanPairwiseCorr),
        fx(d.nEff, 2),
        fx(d.meanPairwiseErrorCorr),
        d.mergePairs.length ? d.mergePairs.map(([a, b, c]) => `${a}–${b} (${c.toFixed(3)})`).join(', ') : 'brak',
      ])
    )
  );
  if (diversity[0].ids.length > 1) {
    L.push('Macierz korelacji prognoz, horyzont 1 rok:', '');
    L.push(table(['', ...diversity[0].ids], diversity[0].ids.map((id, i) => [id, ...diversity[0].corr[i].map((c) => fx(c, 2))])));
  }

  L.push('## Wagi głosów (reguła zapisana przed egzaminem)', '');
  L.push('Waga ∝ 1 / średnia strata kwantylowa (horyzonty 1–5, obserwacje ocenione przez wszystkich głosujących). Bez głosu = 0.', '');
  L.push(table(['specjalista', 'średnia strata', 'waga'], results.filter((r) => r.available).map((r) => [r.def.name, fx(lossById.get(r.def.id)), pct(weights.get(r.def.id))])));

  L.push('## Czego ten egzamin nie mówi', '');
  L.push('- Decyzje z lat 2016–2021 to jeden okres rynkowy; horyzonty 3–5 lat mają tylko kilka niezależnych okien.');
  L.push('- Panel zaczyna się w 2010 r., więc modele dla dłuższych horyzontów powstają dopiero w późniejszych latach egzaminu, a pamięć 8 lat i „cała historia” długo widzą to samo.');
  L.push('- Ostateczny sprawdzian to sejf 2023–2025 (limit 3 użyć), którego ten raport nie dotyka.', '');

  fs.mkdirSync(variant ? `artifacts/universe/${variant}` : 'artifacts/universe', { recursive: true });
  fs.writeFileSync(reportFile, L.join('\n'));
  fs.writeFileSync(
    jsonFile,
    JSON.stringify(
      {
        generatedAt: now,
        variant,
        results: results.map((r) => ({
          id: r.def.id,
          name: r.def.name,
          method: r.def.method,
          memory: r.def.memory,
          available: r.available,
          k1: r.k1,
          coverage: r.coverage,
          abstention: r.abstention,
          k3: { status: r.k3Status, comparisons: r.k3 },
          k4: { status: r.k4Status, comparisons: r.k4 },
          typicalReturn: r.typical,
          gate: { status: r.gateStatus, comparisons: r.gate },
          k2: r.k2,
          k6: r.k6,
          vote: r.vote,
          weight: weights.get(r.def.id) ?? 0,
          buyPricesByYear: r.buyByYear,
        })),
        diversity,
      },
      null,
      1
    )
  );
  console.error(`Zapisano ${reportFile} i ${jsonFile}.`);
  for (const r of results) {
    console.error(`  ${r.def.name}: ${r.available ? `K1 ${r.k1}, K2 ${r.k2?.status}, K6 ${r.k6?.status}, bramka ${r.gateStatus}, głos ${r.vote ? 'tak' : 'nie'}` : 'brak wyników'}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
