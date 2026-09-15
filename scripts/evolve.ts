/**
 * ALGORYTM GENETYCZNY — zespół ekspertów z walk-forward CV (T-19, T-20, T-31).
 *
 *   npx tsx scripts/evolve.ts
 *   EVOLVE_POP=6 EVOLVE_GENS=2 EVOLVE_EXPERTS=0 EVOLVE_THREADS=2 npx tsx scripts/evolve.ts   # test dymny
 *
 * Ekspert i: blok testowy T = MASK_PERIODS[i] (nigdy nie używany w treningu ani przy wyborze),
 * blok walidacyjny V = poprzedni blok (dla pierwszego — następny), trening = pozostałe lata okresu treningowego.
 * Wybór najlepszego genomu: fitness na V (nie maksimum fitnessu treningowego). Na końcu jedna ewaluacja na T.
 */
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { loadCacheToMemory } from '../src/data-loader.js';
import {
  ARTIFACTS_DIR,
  DATA_START_YEAR,
  ENSEMBLE_WEIGHTS,
  EVOLVE_CHECKPOINT_PREFIX,
  EVOLVE_HISTORY_CSV,
  EVOLVE_SUMMARY_MD,
  MASK_PERIODS,
  TRAIN_END_YEAR,
  assertMaskPeriodsWithinTraining,
  ensureArtifactsDir,
  type YearBlock,
} from '../src/paths.js';
import { mulberry32 } from '../src/stats.js';
import {
  crossoverGenome,
  defaultGenome,
  fitnessScore,
  genomeToConfig,
  mutateGenome,
  randomGenome,
  tournamentSelect,
  weightSpread,
  type Genome,
} from './ga.js';
import { buildSimUniverse, loadSimUniverse, runSimulation, type SimMetrics } from './simulate.js';

const POPULATION_SIZE = Number(process.env.EVOLVE_POP ?? 150);
const GENERATIONS = Number(process.env.EVOLVE_GENS ?? 100);
const NUM_THREADS = Number(process.env.EVOLVE_THREADS ?? Math.max(1, os.cpus().length - 1));
const ELITE_PCT = 0.1;
const TOURNAMENT_SIZE = 4;
const IMMIGRANT_PCT = 0.1;
const VALIDATE_EVERY = 10;
const VALIDATE_TOP = 5;
const UNIVERSE_FILE = `${ARTIFACTS_DIR}/sim-universe.json`;

type Years = { kind: 'train' | 'block'; test: YearBlock; val: YearBlock; block?: YearBlock };
interface Evaluated {
  genome: Genome;
  fitness: number;
  metrics: Omit<SimMetrics, never> | null;
}

function includeFn(y: Years): (year: number) => boolean {
  if (y.kind === 'block') return (yr) => yr >= y.block!.startYear && yr <= y.block!.endYear;
  return (yr) =>
    yr >= DATA_START_YEAR &&
    yr <= TRAIN_END_YEAR &&
    !(yr >= y.test.startYear && yr <= y.test.endYear) &&
    !(yr >= y.val.startYear && yr <= y.val.endYear);
}

if (!isMainThread) {
  const universe = loadSimUniverse(workerData.universeFile);
  parentPort!.postMessage('READY');
  parentPort!.on('message', (msg: { chunk: Genome[]; years: Years }) => {
    const include = includeFn(msg.years);
    const out: Evaluated[] = msg.chunk.map((genome) => {
      try {
        const { tradeLog, history, ...metrics } = runSimulation(universe, genomeToConfig(genome), include);
        return { genome, fitness: fitnessScore(metrics), metrics };
      } catch (err) {
        return { genome, fitness: -Infinity, metrics: null };
      }
    });
    parentPort!.postMessage(out);
  });
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

async function main() {
  assertMaskPeriodsWithinTraining(MASK_PERIODS);
  ensureArtifactsDir();
  const expertFilter = process.env.EVOLVE_EXPERTS?.split(',').map(Number);
  const expertIdx = MASK_PERIODS.map((_, i) => i).filter((i) => !expertFilter || expertFilter.includes(i));

  console.log(`Budowa uniwersum symulacji ${DATA_START_YEAR}-${TRAIN_END_YEAR} (snapshoty SEC + makro PIT)...`);
  const cache = loadCacheToMemory();
  fs.writeFileSync(UNIVERSE_FILE, JSON.stringify(buildSimUniverse(cache, DATA_START_YEAR, TRAIN_END_YEAR)));

  const workers = await Promise.all(
    Array.from({ length: NUM_THREADS }, () => {
      const w = new Worker(fileURLToPath(import.meta.url), { execArgv: process.execArgv, workerData: { universeFile: UNIVERSE_FILE } });
      return new Promise<Worker>((resolve, reject) => {
        w.once('message', (m) => (m === 'READY' ? resolve(w) : reject(new Error('worker nie wystartował'))));
        w.once('error', reject);
      });
    })
  );
  console.log(`Wątki: ${workers.length}. Populacja ${POPULATION_SIZE}, pokolenia ${GENERATIONS}, eksperci: ${expertIdx.map((i) => i + 1).join(', ')} z ${MASK_PERIODS.length}.`);

  const evaluate = async (genomes: Genome[], years: Years): Promise<Evaluated[]> => {
    const size = Math.ceil(genomes.length / workers.length);
    const parts = await Promise.all(
      workers.map(
        (w, k) =>
          new Promise<Evaluated[]>((resolve) => {
            const chunk = genomes.slice(k * size, (k + 1) * size);
            if (!chunk.length) return resolve([]);
            w.once('message', resolve);
            w.postMessage({ chunk, years });
          })
      )
    );
    return parts.flat();
  };

  if (!fs.existsSync(EVOLVE_HISTORY_CSV)) fs.writeFileSync(EVOLVE_HISTORY_CSV, 'expert,generation,fitnessMin,fitnessMedian,fitnessMax,finiteShare,bestTrades,bestTurnover,bestCosts,weightSpread\n');
  const experts = fs.existsSync(ENSEMBLE_WEIGHTS) ? (JSON.parse(fs.readFileSync(ENSEMBLE_WEIGHTS, 'utf-8')) as any[]) : [];

  for (const i of expertIdx) {
    const test = MASK_PERIODS[i];
    const val = MASK_PERIODS[i === 0 ? 1 : i - 1];
    const trainYears: Years = { kind: 'train', test, val };
    const rnd = mulberry32(9000 + i);
    const ckptFile = `${EVOLVE_CHECKPOINT_PREFIX}${i + 1}.json`;
    console.log(`\n=== EKSPERT ${i + 1}/${MASK_PERIODS.length}: test ${test.startYear}-${test.endYear}, walidacja ${val.startYear}-${val.endYear} ===`);

    let population: Genome[];
    let startGen = 1;
    let bestByVal: { genome: Genome; fitness: number } | null = null;
    if (fs.existsSync(ckptFile)) {
      const ck = JSON.parse(fs.readFileSync(ckptFile, 'utf-8'));
      population = ck.population;
      startGen = ck.generation + 1;
      bestByVal = ck.bestByVal;
      console.log(`Wznowienie z checkpointu: pokolenie ${ck.generation}`);
    } else {
      population = Array.from({ length: POPULATION_SIZE }, (_, k) =>
        k === 0 ? defaultGenome() : k < POPULATION_SIZE * 0.2 ? mutateGenome(defaultGenome(), 0.3, rnd) : randomGenome(rnd)
      );
    }

    for (let gen = startGen; gen <= GENERATIONS; gen++) {
      const mutationRate = 0.25 - 0.2 * (gen / GENERATIONS);
      const results = (await evaluate(population, trainYears)).sort((a, b) => b.fitness - a.fitness);
      const finite = results.filter((r) => Number.isFinite(r.fitness)).map((r) => r.fitness);

      if (gen % VALIDATE_EVERY === 0 || gen === GENERATIONS) {
        const top = results.slice(0, VALIDATE_TOP).map((r) => r.genome);
        for (const v of await evaluate(top, { kind: 'block', test, val, block: val })) {
          if (Number.isFinite(v.fitness) && (!bestByVal || v.fitness > bestByVal.fitness)) bestByVal = { genome: v.genome, fitness: v.fitness };
        }
        const med = finite.length ? finite[Math.floor(finite.length / 2)] : NaN;
        const best = results[0];
        console.log(
          `gen ${gen}: fitness min ${finite.length ? finite[finite.length - 1].toFixed(3) : '—'} | mediana ${Number.isFinite(med) ? med.toFixed(3) : '—'} | max ${finite.length ? finite[0].toFixed(3) : '—'} | transakcje najlepszego ${best.metrics?.totalTrades ?? '—'} | najlepszy na walidacji ${bestByVal?.fitness.toFixed(3) ?? '—'}`
        );
        if (gen < 50 && finite.length > 1 && med === finite[0]) console.log('  UWAGA: mediana = maksimum przed 50. pokoleniem — populacja skolapsowała.');
        fs.appendFileSync(
          EVOLVE_HISTORY_CSV,
          `${i + 1},${gen},${finite[finite.length - 1] ?? ''},${Number.isFinite(med) ? med : ''},${finite[0] ?? ''},${finite.length / results.length},${best.metrics?.totalTrades ?? ''},${best.metrics?.turnoverAnnual ?? ''},${best.metrics?.totalCosts ?? ''},${weightSpread(population)}\n`
        );
        fs.writeFileSync(ckptFile, JSON.stringify({ expert: i + 1, generation: gen, population, bestByVal }));
      }

      const eliteCount = Math.floor(POPULATION_SIZE * ELITE_PCT);
      const immigrants = Math.floor(POPULATION_SIZE * IMMIGRANT_PCT);
      const next: Genome[] = results.slice(0, eliteCount).map((r) => r.genome);
      while (next.length < POPULATION_SIZE - immigrants) {
        const p1 = tournamentSelect(results, TOURNAMENT_SIZE, rnd).genome;
        const p2 = tournamentSelect(results, TOURNAMENT_SIZE, rnd).genome;
        next.push(mutateGenome(crossoverGenome(p1, p2, rnd), mutationRate, rnd));
      }
      while (next.length < POPULATION_SIZE) next.push(randomGenome(rnd));
      population = next;
    }

    if (!bestByVal) throw new Error(`Ekspert ${i + 1}: żaden genom nie uzyskał skończonego fitnessu na walidacji`);
    const [tr] = await evaluate([bestByVal.genome], trainYears);
    const [va] = await evaluate([bestByVal.genome], { kind: 'block', test, val, block: val });
    const [oos] = await evaluate([bestByVal.genome], { kind: 'block', test, val, block: test });
    const entry = {
      expert: i + 1,
      maskedPeriod: test,
      validationPeriod: val,
      matrixHiking: bestByVal.genome.matrixHiking,
      matrixHolding: bestByVal.genome.matrixHolding,
      matrixCutting: bestByVal.genome.matrixCutting,
      params: bestByVal.genome.params,
      fitness: { train: tr.fitness, val: va.fitness, oos: oos.fitness },
      metricsTrain: tr.metrics,
      metricsVal: va.metrics,
      metricsOOS: oos.metrics,
      trainedAt: new Date().toISOString(),
      config: { POPULATION_SIZE, GENERATIONS },
    };
    const k = experts.findIndex((e) => e.expert === i + 1);
    if (k >= 0) experts[k] = entry;
    else experts.push(entry);
    experts.sort((a, b) => a.expert - b.expert);
    fs.writeFileSync(ENSEMBLE_WEIGHTS, JSON.stringify(experts, null, 2));
    if (fs.existsSync(ckptFile)) fs.unlinkSync(ckptFile);
  }

  const f = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
  let md = `# Ewolucja — train / walidacja / OOS\n\nWygenerowano: ${new Date().toISOString()}. Populacja ${POPULATION_SIZE}, pokolenia ${GENERATIONS}.\n\n`;
  md += '| ekspert | okres maskowany (OOS) | walidacja | fitness train | fitness val | fitness OOS | Sortino OOS | alfa roczna OOS | maxDD OOS | transakcje OOS |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const e of experts) {
    md += `| ${e.expert} | ${e.maskedPeriod.startYear}-${e.maskedPeriod.endYear} | ${e.validationPeriod.startYear}-${e.validationPeriod.endYear} | ${f(e.fitness.train)} | ${f(e.fitness.val)} | ${f(e.fitness.oos)} | ${f(e.metricsOOS?.sortino, 2)} | ${f(e.metricsOOS?.alphaAnnualized)} | ${f(e.metricsOOS?.maxDrawdown)} | ${e.metricsOOS?.totalTrades ?? '—'} |\n`;
  }
  md += '\nRóżnica fitness train − OOS jest jedyną liczbą w tej tabeli, która mówi coś o przeuczeniu.\n';
  fs.writeFileSync(EVOLVE_SUMMARY_MD, md);
  console.log(md);
  await Promise.all(workers.map((w) => w.terminate()));
}
