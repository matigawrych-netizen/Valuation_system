/**
 * Krok (d): egzamin kroczący specjalistów (docs/specjalisci.md, punkt 7).
 *   npm run specialists:exam -- --method simple      (Reporter, Praktyk, Weteran + punkty odniesienia)
 *   npm run specialists:exam -- --method trees       (Tropiciel, Detektyw, Archiwista)
 *   npm run specialists:exam -- --method nn          (Radar, Sejsmograf, Kompas)
 * Opcje: --only <id>  jeden prognozujący;  --force  licz od nowa;  --probe  zmierz czas jednego treningu i zakończ.
 *
 * Co roku 15 lutego (2016–2021) każdy prognozujący uczy się na swojej pamięci i ocenia decyzje do następnego lutego:
 * mediana i pas 80% dla 1–5 lat, a specjaliści także cenę zakupu (średnia z 1–5 lat, trzy temperamenty).
 * Proces sam obniża swój priorytet. Wyniki po każdym prognozującym — przerwany egzamin można wznowić.
 *
 * Wynik: <UNIVERSE_DATA_DIR>/specialists/{exam,buy,train}-<id>.*
 * Raport: npm run specialists:report
 */
import fs from 'node:fs';
import os from 'node:os';
import { BUY_GRID, averageBuyPrice, buyPricesForHorizon, priceRangeFromValuation, TEMPERAMENTS } from '../src/buy-price.js';
import { HORIZONS, type Horizon } from '../src/facts-panel.js';
import { GBM_PARAMS } from '../src/gbm.js';
import { MLP_PARAMS } from '../src/mlp.js';
import { universeDir } from '../src/paths.js';
import { BUY_HEADER, EXAM_HEADER, buyLine, examLine, isComplete, specialistFiles, type ExamRecord } from '../src/specialist-exam.js';
import { abstainReason, dividendPerShare, loadSpecialistRows, targetLog, type SpecialistRow } from '../src/specialist-features.js';
import { cutoffFor, isExamDecision, memoryIsSufficient, memoryRows, trainingCutoffs } from '../src/specialist-memory.js';
import {
  BENCHMARKS,
  TEAM,
  eligibleRows,
  forecastAt,
  medianLogAtPrice,
  trainForecaster,
  type ForecasterDef,
  type HorizonForecaster,
  type Method,
} from '../src/specialists.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const minutes = (ms: number) => `${(ms / 60000).toFixed(1)} min`;

function lowerPriority() {
  try {
    os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch (err) {
    console.error(`Nie udało się obniżyć priorytetu procesu: ${err instanceof Error ? err.message : err}`);
  }
}

interface Context {
  eligible: Map<Horizon, SpecialistRow[]>;
  decisionsByCutoff: Map<string, SpecialistRow[]>;
}

function trainAll(def: ForecasterDef, ctx: Context, cutoff: string, log: any): (HorizonForecaster | null)[] {
  const models: (HorizonForecaster | null)[] = [];
  log.cutoffs[cutoff] = {};
  for (const h of HORIZONS) {
    const started = Date.now();
    const split = memoryRows(ctx.eligible.get(h)!, cutoff, h, def.memory);
    const sufficient = memoryIsSufficient(split);
    if (!sufficient.ok) {
      models.push(null);
      log.cutoffs[cutoff][h] = { model: false, reason: sufficient.reason, rows: split.all.length, validationRows: split.validation.length };
      continue;
    }
    const outcome = trainForecaster(def, split, h, cutoff);
    if (!outcome.ok) {
      models.push(null);
      log.cutoffs[cutoff][h] = { model: false, reason: outcome.reason, rows: split.all.length };
      continue;
    }
    models.push(outcome.forecaster);
    log.cutoffs[cutoff][h] = {
      model: true,
      ...outcome.forecaster.info,
      errors: outcome.forecaster.errors,
      ranges: outcome.forecaster.ranges,
      seconds: (Date.now() - started) / 1000,
    };
  }
  return models;
}

async function runForecaster(def: ForecasterDef, ctx: Context, dir: string) {
  const files = specialistFiles(dir, def.id);
  const exam = fs.createWriteStream(`${files.exam}.tmp`);
  exam.write(EXAM_HEADER + '\n');
  const buy = def.role === 'specialist' ? fs.createWriteStream(`${files.buy}.tmp`) : null;
  buy?.write(BUY_HEADER + '\n');
  const log: any = { id: def.id, name: def.name, method: def.method, memory: def.memory, role: def.role, startedAt: new Date().toISOString(), cutoffs: {} };
  const counts = { decisions: 0, buyPrices: 0, dividendUnknown: 0 };
  const started = Date.now();

  for (const cutoff of trainingCutoffs()) {
    const models = trainAll(def, ctx, cutoff, log);
    const trainedAt = Date.now();
    for (const r of ctx.decisionsByCutoff.get(cutoff) ?? []) {
      counts.decisions++;
      let allOk = true;
      for (const h of HORIZONS) {
        const f = models[h - 1];
        const rec: ExamRecord = { cik: r.cik, asOf: r.asOf, cutoff, h, status: 'ok', median: null, q10: null, q90: null, actual: targetLog(r, h) };
        if (!f) rec.status = 'no_model';
        else {
          const reason = abstainReason(r, f.ranges);
          const fc = reason ? null : forecastAt(f, r);
          if (reason) rec.status = reason;
          else if (!fc) rec.status = 'no_forecast';
          else Object.assign(rec, { median: fc.median, q10: fc.q10, q90: fc.q90 });
        }
        if (rec.status !== 'ok') allOk = false;
        exam.write(examLine(rec) + '\n');
      }
      if (buy && allOk) {
        const dps = dividendPerShare(r);
        const result = averageBuyPrice(
          models.map((f) => {
            const range = priceRangeFromValuation(f!.ranges.logPriceToSales, r.revenueTTM, r.shares);
            return range ? { medianLog: medianLogAtPrice(f!, r), range } : null;
          }),
          dps.value
        );
        if (result) {
          counts.buyPrices++;
          if (!dps.known) counts.dividendUnknown++;
          buy.write(
            buyLine({
              cik: r.cik,
              asOf: r.asOf,
              price: r.price,
              dividendPerShare: dps.value,
              dividendKnown: dps.known,
              aggressive: result.price.aggressive,
              balanced: result.price.balanced,
              cautious: result.price.cautious,
              balancedByHorizon: result.byHorizon.balanced,
              censored: result.censored,
            }) + '\n'
          );
        }
      }
    }
    const trained = Object.values(log.cutoffs[cutoff]).filter((x: any) => x.model).length;
    console.error(
      `  ${def.name} · trening ${cutoff}: modele ${trained}/5 (${minutes(trainedAt - started)} łącznie), ` +
        `decyzje ${ctx.decisionsByCutoff.get(cutoff)?.length ?? 0} (prognozy${buy ? ' i ceny zakupu' : ''}: ${((Date.now() - trainedAt) / 1000).toFixed(1)} s)`
    );
  }

  await new Promise<void>((resolve) => exam.end(resolve));
  if (buy) await new Promise<void>((resolve) => buy.end(resolve));
  fs.renameSync(`${files.exam}.tmp`, files.exam);
  if (buy) fs.renameSync(`${files.buy}.tmp`, files.buy);
  log.finishedAt = new Date().toISOString();
  log.minutes = (Date.now() - started) / 60000;
  log.counts = counts;
  log.complete = true;
  fs.writeFileSync(files.log, JSON.stringify(log, null, 1));
  console.error(`${def.name}: gotowe w ${minutes(Date.now() - started)}. Decyzji ${counts.decisions}, cen zakupu ${counts.buyPrices}.`);
}

/** Pomiar czasu: jeden trening na największej pamięci i ceny zakupu dla próbki decyzji. Nic nie zapisuje. */
function probe(method: Method, ctx: Context) {
  const def = TEAM.find((d) => d.method === method && d.memory === 'all')!;
  const cutoff = trainingCutoffs().at(-1)!;
  const h: Horizon = 1;
  const split = memoryRows(ctx.eligible.get(h)!, cutoff, h, def.memory);
  const t0 = Date.now();
  const outcome = trainForecaster(def, split, h, cutoff);
  const trainMs = Date.now() - t0;
  if (!outcome.ok) throw new Error(`Próbny trening się nie udał: ${outcome.reason}`);
  const f = outcome.forecaster;
  const sample = (ctx.decisionsByCutoff.get(cutoff) ?? []).slice(0, 100);
  const t1 = Date.now();
  for (const r of sample) {
    const range = priceRangeFromValuation(f.ranges.logPriceToSales, r.revenueTTM, r.shares);
    if (range) buyPricesForHorizon(medianLogAtPrice(f, r), range, dividendPerShare(r).value, 1, TEMPERAMENTS.map((t) => t.rate));
  }
  const buyMsPerHorizon = (Date.now() - t1) / Math.max(1, sample.length);

  // Czas treningu rośnie mniej więcej liniowo z liczbą obserwacji w pamięci.
  let rowsTotal = 0;
  for (const d of TEAM.filter((x) => x.method === method)) {
    for (const c of trainingCutoffs()) for (const hh of HORIZONS) rowsTotal += memoryRows(ctx.eligible.get(hh)!, c, hh, d.memory).all.length;
  }
  const decisions = [...ctx.decisionsByCutoff.values()].reduce((a, l) => a + l.length, 0);
  const trainEstimate = (trainMs / split.all.length) * rowsTotal;
  // Najgorszy przypadek: wcześniejsze zatrzymanie nie zadziała i oba treningi zbudują wszystkie drzewa / epoki.
  const units = method === 'trees' ? Number(f.info.treesBuilt) : method === 'nn' ? Number(f.info.epochsRun) : 1;
  const maxUnits = method === 'trees' ? 2 * GBM_PARAMS.maxTrees : method === 'nn' ? 2 * MLP_PARAMS.maxEpochs : 1;
  const worstEstimate = units > 0 ? (trainEstimate / units) * maxUnits : trainEstimate;
  const buyEstimate = buyMsPerHorizon * 5 * decisions * 3;
  console.error(`Próba (${def.name}, trening ${cutoff}, 1 rok): ${split.all.length} obserwacji, trening ${(trainMs / 1000).toFixed(1)} s.`);
  console.error(`  informacje: ${JSON.stringify(f.info)}`);
  console.error(`  cena zakupu: ${buyMsPerHorizon.toFixed(2)} ms na spółkę i horyzont (siatka ${BUY_GRID.points} cen).`);
  console.error(
    `Szacunek całego egzaminu metody „${method}”: trening ok. ${minutes(trainEstimate)} ` +
      `(najgorzej ${minutes(worstEstimate)}), ceny zakupu ok. ${minutes(buyEstimate)} (przy modelach jak w próbie).`
  );
}

async function main() {
  lowerPriority();
  const method = arg('--method') as Method | null;
  if (method !== 'simple' && method !== 'trees' && method !== 'nn') {
    console.error('Podaj metodę: --method simple | trees | nn');
    process.exit(1);
  }
  const only = arg('--only');
  const force = process.argv.includes('--force');
  const dir = universeDir('specialists');
  fs.mkdirSync(dir, { recursive: true });

  const rows = loadSpecialistRows(universeDir('panel', 'facts-panel.csv'), universeDir('panel', 'specialist-extras.csv'));
  const eligible = new Map<Horizon, SpecialistRow[]>(HORIZONS.map((h) => [h, eligibleRows(rows, h)]));
  const decisionsByCutoff = new Map<string, SpecialistRow[]>();
  for (const r of rows.filter((x) => isExamDecision(x.asOf)).sort((a, b) => a.asOf.localeCompare(b.asOf) || a.cik.localeCompare(b.cik))) {
    const c = cutoffFor(r.asOf)!;
    const list = decisionsByCutoff.get(c) ?? [];
    list.push(r);
    decisionsByCutoff.set(c, list);
  }
  const ctx: Context = { eligible, decisionsByCutoff };
  console.error(
    `Panel: ${rows.length} wierszy. Decyzji egzaminu: ${[...decisionsByCutoff.values()].reduce((a, l) => a + l.length, 0)}. ` +
      `Obserwacji z wynikiem: ${HORIZONS.map((h) => `${h} r. ${eligible.get(h)!.length}`).join(', ')}.`
  );

  if (process.argv.includes('--probe')) {
    probe(method, ctx);
    return;
  }

  const defs = [...TEAM, ...BENCHMARKS].filter((d) => d.method === method && (only == null || d.id === only));
  if (defs.length === 0) {
    console.error(`Brak prognozujących dla metody ${method}${only ? ` i id ${only}` : ''}.`);
    process.exit(1);
  }
  const started = Date.now();
  for (const def of defs) {
    if (isComplete(dir, def.id) && !force) {
      console.error(`${def.name}: już policzony (użyj --force, żeby liczyć od nowa).`);
      continue;
    }
    await runForecaster(def, ctx, dir);
  }
  console.error(`Egzamin metody „${method}” zakończony w ${minutes(Date.now() - started)}. Raport: npm run specialists:report`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
