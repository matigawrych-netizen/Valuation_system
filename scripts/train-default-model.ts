/**
 * T-05/T-17/T-30 — model prawdopodobieństwa bankructwa (regresja logistyczna z L2).
 *   npx tsx scripts/train-default-model.ts
 *
 * Etykieta: docs/default-label-definition.md. Cechy: src/default-features.ts (liczone przez mapper SEC,
 * tą samą funkcją co w produkcji). Podział czasowy wewnątrz okresu treningowego:
 *   dobór λ:  trening < INNER_VAL_START_YEAR, walidacja [INNER_VAL_START_YEAR, TEST_START_YEAR)
 *   ocena OOS: trening < TEST_START_YEAR (z purgingiem etykiety), test [TEST_START_YEAR, TRAIN_END_YEAR]
 * Negatywy downsamplowane losowo ze stałym ziarnem; intercept korygowany o ln(keepRate).
 * Za mało pozytywów => raport zapisany, model NIE jest zapisywany, kod wyjścia 1.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  buildQuarterlyTimeline,
  getFundamentalsAsOf,
  getQuoteAtDate,
  getUniverseAsOf,
  loadCacheToMemory,
  lastQuoteIndexAtOrBefore,
  type ParsedCache,
} from '../src/data-loader.js';
import { DEFAULT_FEATURE_NAMES } from '../src/default-features.js';
import type { DefaultModelArtifact } from '../src/default-model.js';
import { computeMarketStats } from '../src/market-stats.js';
import {
  DATA_START_YEAR,
  DEFAULT_MODEL,
  DEFAULT_MODEL_INNER_VAL_START_YEAR,
  DEFAULT_MODEL_TEST_START_YEAR,
  DEFAULT_MODEL_REPORT,
  EMBARGO_YEAR,
  HOLDOUT_END_YEAR,
  TRAIN_END_YEAR,
  ensureArtifactsDir,
} from '../src/paths.js';
import { addMonths } from '../src/purging.js';
import { mapSecToYahooSnapshot } from '../src/sec-edgar-provider.js';
import { aucScore, median, mulberry32 } from '../src/stats.js';
import { C, XbrlView } from '../src/xbrl.js';

const SEED = 424242;
const NEG_TO_POS_RATIO = 20;
const MIN_TRAIN_POSITIVES = 20;
const INNER_VAL_START_YEAR = DEFAULT_MODEL_INNER_VAL_START_YEAR;
const TEST_START_YEAR = DEFAULT_MODEL_TEST_START_YEAR;
const L2_GRID = [0, 0.001, 0.01, 0.1, 1];
const EPOCHS = 3000;
const LEARNING_RATE = 0.1;
/** Kody przyczyn usunięcia, które z definicji nie są distress_proxy. `index_decision` celowo NIE jest tu — patrz raport. */
const NON_DISTRESS_REASONS = new Set(['acquisition', 'merger', 'index_rebalance']);

interface Sample {
  cik: string;
  ticker: string;
  asOf: string;
  x: number[];
  y: 0 | 1;
  defaultType: string | null;
}

const year = (d: string) => Number(d.slice(0, 4));
const iso = (d: Date) => d.toISOString().split('T')[0];
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function labelFor(cache: ParsedCache, cik: string, asOf: string, diag: Record<string, number>) {
  const horizon = iso(addMonths(asOf, 12));
  for (const m of cache.membershipByCik[cik] ?? []) {
    if (!m.date_removed || m.date_removed <= asOf || m.date_removed > horizon) continue;
    if (m.removal_reason === 'bankruptcy') return { y: 1 as const, type: 'legal_bankruptcy', removed: m.date_removed };
    if (!m.removal_reason || NON_DISTRESS_REASONS.has(m.removal_reason)) continue;

    const facts = getFundamentalsAsOf(cache, cik, m.date_removed);
    const equity = facts ? new XbrlView(facts).latestInstant(C.equity) : null;
    if (equity && equity.val < 0) return { y: 1 as const, type: 'distress_proxy', removed: m.date_removed };

    const series = cache.prices[cik];
    const atRemoval = getQuoteAtDate(series, m.date_removed, 30);
    if (!series || !atRemoval) {
      diag['distress niesprawdzalny (brak ceny przy usunięciu)'] = (diag['distress niesprawdzalny (brak ceny przy usunięciu)'] ?? 0) + 1;
      continue;
    }
    const startT = addMonths(asOf, -36).getTime();
    const endIdx = lastQuoteIndexAtOrBefore(series.quotes, new Date(`${asOf}T23:59:59Z`).getTime());
    let peak = 0;
    for (let k = endIdx; k >= 0 && series.quotes[k].t >= startT; k--) peak = Math.max(peak, series.quotes[k].close);
    if (peak > 0 && 1 - atRemoval.close / peak > 0.85) return { y: 1 as const, type: 'distress_proxy', removed: m.date_removed };
  }
  return { y: 0 as const, type: null, removed: null };
}

function standardize(train: Sample[]) {
  const k = DEFAULT_FEATURE_NAMES.length;
  const means = Array.from({ length: k }, (_, j) => train.reduce((s, r) => s + r.x[j], 0) / train.length);
  const stds = Array.from({ length: k }, (_, j) => Math.sqrt(train.reduce((s, r) => s + (r.x[j] - means[j]) ** 2, 0) / train.length));
  stds.forEach((s, j) => {
    if (!(s > 0)) throw new Error(`Cecha ${DEFAULT_FEATURE_NAMES[j]} ma zerową wariancję w zbiorze treningowym`);
  });
  return { means, stds };
}

function downsample(samples: Sample[], seed: number) {
  const pos = samples.filter((s) => s.y === 1);
  const neg = samples.filter((s) => s.y === 0);
  const keepRate = neg.length ? Math.min(1, (NEG_TO_POS_RATIO * Math.max(pos.length, 1)) / neg.length) : 1;
  const rnd = mulberry32(seed);
  return { sample: [...pos, ...neg.filter(() => rnd() < keepRate)], keepRate };
}

function fitLogistic(train: Sample[], l2: number, seed: number) {
  const { sample, keepRate } = downsample(train, seed);
  const { means, stds } = standardize(sample);
  const Z = sample.map((s) => s.x.map((v, j) => (v - means[j]) / stds[j]));
  const k = means.length;
  const w = new Array<number>(k).fill(0);
  let b = 0;
  for (let e = 0; e < EPOCHS; e++) {
    const gw = new Array<number>(k).fill(0);
    let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      const err = sigmoid(Z[i].reduce((s, z, j) => s + z * w[j], b)) - sample[i].y;
      for (let j = 0; j < k; j++) gw[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < k; j++) w[j] -= LEARNING_RATE * (gw[j] / Z.length + l2 * w[j]);
    b -= LEARNING_RATE * (gb / Z.length);
  }
  const interceptAdjusted = b + Math.log(keepRate);
  const predict = (s: Sample) => sigmoid(s.x.reduce((acc, v, j) => acc + w[j] * ((v - means[j]) / stds[j]), interceptAdjusted));
  return { w, b, interceptAdjusted, means, stds, keepRate, nFit: sample.length, predict };
}

const logLoss = (ys: number[], ps: number[]) =>
  -ys.reduce((s, y, i) => s + (y ? Math.log(Math.max(ps[i], 1e-12)) : Math.log(Math.max(1 - ps[i], 1e-12))), 0) / ys.length;

function main() {
  const cache = loadCacheToMemory();
  const timeline = buildQuarterlyTimeline(DATA_START_YEAR, TRAIN_END_YEAR).filter((t) => year(t.dateStr) <= TRAIN_END_YEAR);

  const coverage = Object.fromEntries(DEFAULT_FEATURE_NAMES.map((n) => [n, 0])) as Record<string, number>;
  const diag: Record<string, number> = {};
  const bump = (k: string) => (diag[k] = (diag[k] ?? 0) + 1);
  let considered = 0;
  let positivesSeen = 0;
  let positivesMissingFeatures = 0;
  const samples: Sample[] = [];

  for (const t of timeline) {
    for (const cik of getUniverseAsOf(cache, t.dateStr)) {
      const series = cache.prices[cik];
      if (!series || !cache.fundamentals[cik]) {
        bump('brak danych w cache');
        continue;
      }
      const quote = getQuoteAtDate(series, t.dateStr);
      if (!quote) {
        bump('brak ceny w dniu decyzji');
        continue;
      }
      const mapped = mapSecToYahooSnapshot({
        ticker: cache.cikToTicker[cik] ?? cik,
        cik,
        asOf: t.dateStr,
        price: quote.close,
        facts: getFundamentalsAsOf(cache, cik, t.dateStr)!,
        splits: series.splits,
        market: computeMarketStats(cache, cik, t.dateStr),
        sic: cache.sic[cik] ?? null,
      });
      if (!mapped.defaultFeatures) {
        bump(`mapper: ${mapped.skipReason}`);
        continue;
      }
      considered++;
      const label = labelFor(cache, cik, t.dateStr, diag);
      if (label.y === 1 && label.removed && year(label.removed) >= EMBARGO_YEAR && year(label.removed) <= HOLDOUT_END_YEAR) {
        bump('pozytyw w embargo/holdout — wyłączony z treningu');
        continue;
      }
      if (label.y === 1) positivesSeen++;
      const values = mapped.defaultFeatures.values;
      for (const n of DEFAULT_FEATURE_NAMES) if (values[n] != null) coverage[n]++;
      if (mapped.defaultFeatures.missing.length) {
        if (label.y === 1) positivesMissingFeatures++;
        bump(`brak cechy: ${mapped.defaultFeatures.missing.join('+')}`);
        continue;
      }
      samples.push({
        cik,
        ticker: cache.cikToTicker[cik] ?? cik,
        asOf: t.dateStr,
        x: DEFAULT_FEATURE_NAMES.map((n) => values[n] as number),
        y: label.y,
        defaultType: label.type,
      });
    }
  }

  const nDefaults = samples.filter((s) => s.y === 1).length;
  console.log(`Extracted ${samples.length} samples (${nDefaults} defaults).`);

  const labelEndsBefore = (s: Sample, y: number) => iso(addMonths(s.asOf, 12)) < `${y}-01-01`;
  const innerTrain = samples.filter((s) => year(s.asOf) < INNER_VAL_START_YEAR && labelEndsBefore(s, INNER_VAL_START_YEAR));
  const innerVal = samples.filter((s) => year(s.asOf) >= INNER_VAL_START_YEAR && year(s.asOf) < TEST_START_YEAR);
  const train = samples.filter((s) => year(s.asOf) < TEST_START_YEAR && labelEndsBefore(s, TEST_START_YEAR));
  const test = samples.filter((s) => year(s.asOf) >= TEST_START_YEAR);
  const pos = (arr: Sample[]) => arr.filter((s) => s.y === 1).length;

  let md = `# Model prawdopodobieństwa bankructwa — raport\n\nWygenerowano: ${new Date().toISOString()}. Ziarno: ${SEED}.\n\n`;
  md += `## Dane\n\n| pozycja | wartość |\n|---|---|\n`;
  md += `| obserwacje (CIK × kwartał) z cechami policzonymi | ${considered} |\n| pozytywy przed filtrem cech | ${positivesSeen} |\n| pozytywy odrzucone przez brak cech | ${positivesMissingFeatures} |\n`;
  md += `| próbki kompletne | ${samples.length} |\n| w tym defaulty | ${nDefaults} (legal_bankruptcy: ${samples.filter((s) => s.defaultType === 'legal_bankruptcy').length}, distress_proxy: ${samples.filter((s) => s.defaultType === 'distress_proxy').length}) |\n`;
  md += `| trening (< ${TEST_START_YEAR}, z purgingiem) | ${train.length} (pozytywy ${pos(train)}) |\n| test OOS (${TEST_START_YEAR}–${TRAIN_END_YEAR}) | ${test.length} (pozytywy ${pos(test)}) |\n\n`;
  md += `## Pokrycie cech (na ${considered} obserwacjach)\n\n| cecha | z wartością | % |\n|---|---|---|\n`;
  for (const n of DEFAULT_FEATURE_NAMES) md += `| ${n} | ${coverage[n]} | ${((coverage[n] / Math.max(considered, 1)) * 100).toFixed(1)}% |\n`;
  md += `| goingConcern | 0 | 0.0% — koncept AuditorOpinionGoingConcern nie występuje w cache; cecha usunięta |\n\n`;
  md += `## Powody odrzuceń\n\n| powód | liczba |\n|---|---|\n${Object.entries(diag).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n\n`;
  md += `## Interpretacja etykiety\n\nKody przyczyn w \`index_membership.json\`: bankruptcy, delisting_other, index_decision, acquisition, merger. Definicja wyklucza 'acquisition'/'merger'/'index_rebalance'; kodu 'index_rebalance' w danych nie ma. \`index_decision\` NIE jest wykluczany — usunięcie decyzją komitetu połączone ze spadkiem kapitalizacji > 85% albo ujemnym kapitałem liczy się jako distress_proxy. **To interpretacja do zatwierdzenia przez człowieka.**\n\n`;
  md += `Obciążenie przeżycia: z ${cache.membership.filter((m) => m.date_removed).length} spółek usuniętych z indeksu tylko ${cache.membership.filter((m) => m.date_removed && cache.fundamentals[m.cik]).length} ma pliki fundamentów w cache, więc większość bankrutów w ogóle nie jest widoczna dla modelu.\n\n`;

  ensureArtifactsDir();
  if (pos(train) < MIN_TRAIN_POSITIVES) {
    md += `## Wynik\n\n**Model NIE został zapisany**: w zbiorze treningowym jest ${pos(train)} pozytywów (minimum ${MIN_TRAIN_POSITIVES}). Regresja logistyczna na tak małej liczbie zdarzeń nie daje wiarygodnych wag. Konsekwencja: \`pDefault\` pozostaje null w całym systemie (confidence obniżone o stałą karę).\n`;
    fs.writeFileSync(DEFAULT_MODEL_REPORT, md);
    if (fs.existsSync(DEFAULT_MODEL)) fs.unlinkSync(DEFAULT_MODEL);
    console.log(md);
    console.error(`Za mało pozytywów (${pos(train)} < ${MIN_TRAIN_POSITIVES}) — model nie zapisany.`);
    process.exit(1);
  }

  // Dobór λ na walidacji wewnętrznej
  let chosenL2 = 0.01;
  let selection = 'stała λ=0.01 (brak pozytywów w walidacji wewnętrznej)';
  if (pos(innerTrain) > 0 && pos(innerVal) > 0) {
    const scores = L2_GRID.map((l2) => {
      const m = fitLogistic(innerTrain, l2, SEED);
      return { l2, ll: logLoss(innerVal.map((s) => s.y), innerVal.map(m.predict)) };
    });
    chosenL2 = scores.reduce((a, b) => (b.ll < a.ll ? b : a)).l2;
    selection = `min log-loss na walidacji ${INNER_VAL_START_YEAR}-${TEST_START_YEAR - 1}: ${scores.map((s) => `λ=${s.l2}: ${s.ll.toFixed(4)}`).join(', ')}`;
  }

  const model = fitLogistic(train, chosenL2, SEED);
  const pTest = test.map(model.predict);
  const pTrain = train.map(model.predict);
  const oosAUC = aucScore(pTest, test.map((s) => s.y));
  const trainAUC = aucScore(pTrain, train.map((s) => s.y));

  md += `## Model\n\nλ (L2): ${chosenL2} — ${selection}.\nkeepRate negatywów: ${model.keepRate.toFixed(4)}; próbek użytych do dopasowania: ${model.nFit}.\n\n`;
  md += `| cecha | waga (standaryzowana) |\n|---|---|\n${DEFAULT_FEATURE_NAMES.map((n, j) => `| ${n} | ${model.w[j].toFixed(4)} |`).join('\n')}\n| intercept (skorygowany) | ${model.interceptAdjusted.toFixed(4)} |\n\n`;
  const altIdx = DEFAULT_FEATURE_NAMES.indexOf('altmanZ');
  md += model.w[altIdx] < 0 ? 'Znak wagi Altman Z: ujemny (zgodny z oczekiwaniem).\n\n' : '**Znak wagi Altman Z jest nieujemny — niezgodny z oczekiwaniem, cechy wymagają przeglądu.**\n\n';
  md += `## Ocena\n\nAUC trening: ${trainAUC?.toFixed(4) ?? 'n/d'}. AUC OOS (${TEST_START_YEAR}–${TRAIN_END_YEAR}): ${oosAUC?.toFixed(4) ?? 'n/d — brak pozytywów w teście'}.\n\n`;
  if (pos(test) > 0) {
    const order = test.map((s, i) => ({ y: s.y, p: pTest[i] })).sort((a, b) => b.p - a.p);
    md += `### Krzywe (OOS)\n\n| próg (kwantyl) | TPR (recall) | FPR | precision |\n|---|---|---|---|\n`;
    for (const q of [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5]) {
      const k = Math.max(1, Math.floor(order.length * q));
      const tp = order.slice(0, k).filter((o) => o.y === 1).length;
      const fp = k - tp;
      md += `| top ${(q * 100).toFixed(0)}% | ${(tp / pos(test)).toFixed(3)} | ${(fp / (test.length - pos(test))).toFixed(3)} | ${(tp / k).toFixed(3)} |\n`;
    }
    md += `\n### Kalibracja (decyle predykcji, OOS)\n\n| decyl | średnie p | odsetek defaultów | n |\n|---|---|---|---|\n`;
    const asc = [...order].reverse();
    for (let d = 0; d < 10; d++) {
      const part = asc.slice(Math.floor((asc.length * d) / 10), Math.floor((asc.length * (d + 1)) / 10));
      if (!part.length) continue;
      md += `| ${d + 1} | ${(part.reduce((s, o) => s + o.p, 0) / part.length).toFixed(4)} | ${(part.filter((o) => o.y).length / part.length).toFixed(4)} | ${part.length} |\n`;
    }
    md += `\nSanity check (OOS): mediana pDefault spółek z defaultem w 12M = ${median(order.filter((o) => o.y).map((o) => o.p)).toFixed(4)}, pozostałych = ${median(order.filter((o) => !o.y).map((o) => o.p)).toFixed(4)}.\n`;
  }

  const artifact: DefaultModelArtifact = {
    kind: 'logistic-regression',
    featureNames: [...DEFAULT_FEATURE_NAMES],
    weights: model.w,
    intercept: model.b,
    interceptAdjusted: model.interceptAdjusted,
    means: model.means,
    stds: model.stds,
    negativeKeepRate: model.keepRate,
    seed: SEED,
    l2: chosenL2,
    trainRange: { startYear: DATA_START_YEAR, endYear: TEST_START_YEAR - 1 },
    oosAUC,
    nTrain: train.length,
    nTest: test.length,
    nDefaults,
    commitHash: (() => {
      try {
        return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      } catch {
        return 'NO_GIT_TRACKING';
      }
    })(),
    trainedAt: new Date().toISOString(),
  };
  if (artifact.trainRange.endYear > TRAIN_END_YEAR) throw new Error('Model hazardu trenowany poza okresem treningowym');
  fs.writeFileSync(DEFAULT_MODEL, JSON.stringify(artifact, null, 2));
  fs.writeFileSync(DEFAULT_MODEL_REPORT, md);
  console.log(md);
  console.log(`Zapisano ${DEFAULT_MODEL} i ${DEFAULT_MODEL_REPORT}`);
}

main();
