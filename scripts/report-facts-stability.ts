/**
 * Czy fakty wspólne zmieniają się w czasie?
 *   npx tsx scripts/report-facts-stability.ts               (S&P 500)
 *   npx tsx scripts/report-facts-stability.ts --universe    (pełne uniwersum)
 *
 * Pytanie z uzgodnień: czy warto budować „specjalistów od różnych okresów” (o różnej długości pamięci).
 * Reguła zapisana PRZED pomiarem w docs/plan-terminal.md: fakty uznajemy za różne w czasie, gdy
 * przedziały ufności 95% współczynnika nie nachodzą na siebie dla co najmniej 3 z 5 horyzontów.
 *
 * Przedziały liczone bootstrapem po kwartałach — obserwacje z jednego kwartału są zależne,
 * więc losowanie pojedynczych wierszy zawyżałoby pewność.
 *
 * Wynik: artifacts/facts-stability.md + artifacts/facts-stability.json
 */
import fs from 'node:fs';
import { fitLinear, growthObservations, reversionObservations, type Observation } from '../src/facts.js';
import { HORIZONS, parsePanel, type Horizon, type PanelRecord } from '../src/facts-panel.js';
import { asOfYear, ensureArtifactsDir, factsTarget, requireArtifact } from '../src/paths.js';
import { bootstrapGroups } from '../src/stats.js';

const PERIODS = [
  { label: '2009-2013', from: 2009, to: 2013 },
  { label: '2014-2017', from: 2014, to: 2017 },
  { label: '2018-2021', from: 2018, to: 2021 },
];

/** Ile horyzontów musi mieć rozłączne przedziały, żeby uznać fakty za zmienne w czasie. */
const DIFFERENT_HORIZONS_THRESHOLD = 3;
const BOOTSTRAP_DRAWS = 500;

interface SlopeCI {
  slope: number | null;
  lo: number | null;
  hi: number | null;
  n: number;
  quarters: number;
}

type Coefficient = 'slope' | 'intercept';

function coefficientWithCI(obs: Observation[], which: Coefficient): SlopeCI {
  const byQuarter = new Map<string, Observation[]>();
  for (const o of obs) {
    const list = byQuarter.get(o.quarter) ?? [];
    list.push(o);
    byQuarter.set(o.quarter, list);
  }
  // Kolejność grup po dacie — wynik bootstrapu nie może zależeć od kolejności wierszy w pliku.
  const groups = [...byQuarter.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
  if (groups.length < 4 || obs.length < 60) {
    return { slope: null, lo: null, hi: null, n: obs.length, quarters: groups.length };
  }
  const ci = bootstrapGroups(groups, (sample) => fitLinear(sample.flat())?.[which] ?? null, BOOTSTRAP_DRAWS);
  return { slope: ci.estimate, lo: ci.lo, hi: ci.hi, n: obs.length, quarters: groups.length };
}

const overlaps = (a: SlopeCI, b: SlopeCI): boolean | null =>
  a.lo == null || a.hi == null || b.lo == null || b.hi == null ? null : a.lo <= b.hi && b.lo <= a.hi;

const fmt = (x: number | null) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(3));
const ciText = (c: SlopeCI) => (c.lo == null ? '—' : `${fmt(c.slope)} [${fmt(c.lo)}; ${fmt(c.hi)}]`);

function table(header: string[], rows: (string | number)[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''].join('\n');
}

type FactName = 'growthFade' | 'multipleReversion';
const FACT_LABEL: Record<FactName, string> = {
  growthFade: 'wygasanie wzrostu (trwałość dotychczasowego tempa)',
  multipleReversion: 'powrót wielokrotności (trwałość dzisiejszej wyceny)',
};

function observationsFor(fact: FactName, rows: PanelRecord[], h: Horizon): Observation[] {
  return fact === 'growthFade' ? growthObservations(rows, h) : reversionObservations(rows, h);
}

function main() {
  const target = factsTarget();
  const FACTS_STABILITY_JSON = target.stabilityJson;
  const FACTS_STABILITY_REPORT = target.stabilityReport;
  requireArtifact(target.panel, 'npx tsx scripts/build-facts-panel.ts (albo universe-build-panel.ts)');
  const all = parsePanel(target.panel);

  const byPeriod = PERIODS.map((p) => ({
    ...p,
    rows: all.filter((r) => asOfYear(r.asOf) >= p.from && asOfYear(r.asOf) <= p.to),
  }));

  const result: any = { generatedAt: new Date().toISOString(), threshold: DIFFERENT_HORIZONS_THRESHOLD, facts: {} };
  const L: string[] = [];
  L.push('# Czy fakty zmieniają się w czasie?', '');
  L.push(`Zbiór: **${target.label}**.`, '');
  L.push(`Wygenerowano: ${new Date().toISOString()}.`, '');
  L.push('Pytanie: czy budować osobnych specjalistów uczonych na różnych okresach.');
  L.push(`Reguła zapisana przed pomiarem: fakty są różne w czasie, gdy przedziały ufności 95% nie nachodzą`);
  L.push(`na siebie dla co najmniej **${DIFFERENT_HORIZONS_THRESHOLD} z ${HORIZONS.length}** horyzontów.`, '');
  L.push(
    table(
      ['okres', 'wierszy panelu', 'kwartałów'],
      byPeriod.map((p) => [p.label, p.rows.length, new Set(p.rows.map((r) => r.asOf)).size])
    )
  );
  L.push('Uwaga: przy horyzoncie 5 lat wynik wiersza z 2013 r. realizuje się w 2018 r., czyli już w następnym okresie.');
  L.push('Okresy dzielą daty **decyzji**, nie daty wyników — inaczej nie dałoby się ich rozdzielić.', '');

  for (const fact of ['growthFade', 'multipleReversion'] as FactName[]) {
    L.push(`## ${FACT_LABEL[fact]}`, '');
    const rows: (string | number)[][] = [];
    const comparisons: any[] = [];
    let differing = 0;
    let comparable = 0;

    const interceptRows: (string | number)[][] = [];
    for (const h of HORIZONS) {
      const obs = byPeriod.map((p) => observationsFor(fact, p.rows, h));
      const cis = obs.map((o) => coefficientWithCI(o, 'slope'));
      const pairs: (boolean | null)[] = [overlaps(cis[0], cis[1]), overlaps(cis[1], cis[2]), overlaps(cis[0], cis[2])];
      const known = pairs.filter((x) => x != null) as boolean[];
      const anyDisjoint = known.length > 0 && known.some((x) => !x);
      if (known.length > 0) comparable++;
      if (anyDisjoint) differing++;

      rows.push([
        `${h} lat`,
        ...cis.map(ciText),
        known.length === 0 ? 'za mało danych' : anyDisjoint ? 'RÓŻNE' : 'zgodne',
      ]);

      const ints = obs.map((o) => coefficientWithCI(o, 'intercept'));
      const intPairs = [overlaps(ints[0], ints[1]), overlaps(ints[1], ints[2]), overlaps(ints[0], ints[2])].filter(
        (x) => x != null
      ) as boolean[];
      interceptRows.push([
        `${h} lat`,
        ...ints.map(ciText),
        intPairs.length === 0 ? 'za mało danych' : intPairs.some((x) => !x) ? 'RÓŻNE' : 'zgodne',
      ]);

      comparisons.push({
        horizon: h,
        slope: cis.map((c, i) => ({ period: PERIODS[i].label, ...c })),
        intercept: ints.map((c, i) => ({ period: PERIODS[i].label, ...c })),
        anyDisjoint,
      });
    }

    L.push('Współczynnik trwałości (o tym mówi reguła):', '');
    L.push(table(['horyzont', ...PERIODS.map((p) => p.label), 'ocena'], rows));
    L.push('Stała — poziom niezależny od spółki, czyli wspólny dryf całego rynku w danym okresie.');
    L.push('Traktujemy ją jako informację dodatkową: reguła z preregistracji dotyczy współczynnika trwałości.', '');
    L.push(table(['horyzont', ...PERIODS.map((p) => p.label), 'ocena'], interceptRows));
    const verdict =
      comparable === 0
        ? 'BRAK POMIARU — za mało danych, żeby cokolwiek porównać'
        : differing >= DIFFERENT_HORIZONS_THRESHOLD
          ? `RÓŻNE W CZASIE (${differing}/${HORIZONS.length} horyzontów) — specjaliści od okresów mają uzasadnienie`
          : `STABILNE (${differing}/${HORIZONS.length} horyzontów różnych) — jeden wspólny fakt wystarcza`;
    L.push(`**Wniosek z reguły: ${verdict}.**`, '');

    // Same współczynniki bywają mylące: stała i nachylenie poruszają się w przeciwne strony,
    // więc modele o wyraźnie różnych współczynnikach mogą dawać niemal identyczne prognozy.
    // Poniżej liczymy różnicę tam, gdzie ma znaczenie — w samych prognozach, na tych samych spółkach.
    L.push('### O ile różnią się same prognozy', '');
    L.push('Dwa modele o różnych współczynnikach mogą przewidywać prawie to samo, bo stała i nachylenie');
    L.push('kompensują się nawzajem. Dlatego poniżej każdy model z osobnego okresu liczy prognozę dla **tych samych**');
    L.push('spółek (całego panelu), a porównywana jest największa rozbieżność między okresami.', '');

    const practical: (string | number)[][] = [];
    const practicalJson: any[] = [];
    for (const h of HORIZONS) {
      const pooled = observationsFor(fact, all, h);
      const fits = byPeriod.map((p) => fitLinear(observationsFor(fact, p.rows, h)));
      if (pooled.length === 0 || fits.some((f) => f == null)) {
        practical.push([`${h} lat`, '—', '—']);
        continue;
      }
      let maxGap = 0;
      let sumGap = 0;
      for (const o of pooled) {
        const preds = fits.map((f) => f!.intercept + f!.slope * o.x);
        const gap = Math.max(...preds) - Math.min(...preds);
        sumGap += gap;
        if (gap > maxGap) maxGap = gap;
      }
      const meanGap = sumGap / pooled.length;
      // Wzrost: prognoza to roczne tempo — różnica w punktach procentowych i jej skutek po h latach.
      // Wielokrotność: prognoza to logarytm — różnica przelicza się wprost na procent ceny.
      const asPrice =
        fact === 'growthFade' ? Math.pow(1 + meanGap, h) - 1 : Math.exp(meanGap) - 1;
      practical.push([
        `${h} lat`,
        fact === 'growthFade' ? `${(meanGap * 100).toFixed(2)} p.p. rocznie` : `${(meanGap * 100).toFixed(1)}% (log)`,
        `${(asPrice * 100).toFixed(1)}%`,
      ]);
      practicalJson.push({ horizon: h, meanGap, maxGap, priceEffect: asPrice });
    }
    L.push(
      table(['horyzont', 'średnia rozbieżność prognoz', 'przełożenie na cenę po tylu latach'], practical)
    );
    L.push('Ostatnia kolumna mówi, o ile różniłaby się przewidywana cena, gdyby użyć modelu z innego okresu.', '');

    result.facts[fact] = { differing, comparable, verdict, comparisons, practical: practicalJson };
  }

  ensureArtifactsDir();
  fs.mkdirSync('artifacts/universe', { recursive: true });
  fs.writeFileSync(FACTS_STABILITY_JSON, JSON.stringify(result, null, 2));
  fs.writeFileSync(FACTS_STABILITY_REPORT, L.join('\n'));
  console.error(`Zapisano ${FACTS_STABILITY_REPORT} i ${FACTS_STABILITY_JSON}.`);
  for (const fact of Object.keys(result.facts)) console.error(`  ${fact}: ${result.facts[fact].verdict}`);
}

main();
