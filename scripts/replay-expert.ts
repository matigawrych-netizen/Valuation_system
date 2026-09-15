/**
 * Odtworzenie wytrenowanego eksperta z pełnym logiem transakcji (bez ponownego trenowania).
 *   npx tsx scripts/replay-expert.ts <numer eksperta 1..8>
 * Wymaga artifacts/ENSEMBLE_WEIGHTS.json (scripts/evolve.ts) i artifacts/sim-universe.json.
 */
import fs from 'node:fs';
import { ARTIFACTS_DIR, ENSEMBLE_WEIGHTS, EXPERT_REPLAY_PREFIX, requireArtifact } from '../src/paths.js';
import { genomeToConfig } from './ga.js';
import { loadSimUniverse, runSimulation } from './simulate.js';

const UNIVERSE_FILE = `${ARTIFACTS_DIR}/sim-universe.json`;

function main() {
  const n = Number(process.argv[2]);
  requireArtifact(ENSEMBLE_WEIGHTS, 'npx tsx scripts/evolve.ts');
  requireArtifact(UNIVERSE_FILE, 'npx tsx scripts/evolve.ts (buduje uniwersum symulacji)');
  const experts = JSON.parse(fs.readFileSync(ENSEMBLE_WEIGHTS, 'utf-8')) as any[];
  const e = experts.find((x) => x.expert === n);
  if (!e) {
    console.error(`Brak eksperta ${n} w ${ENSEMBLE_WEIGHTS} (dostępni: ${experts.map((x) => x.expert).join(', ')})`);
    process.exit(1);
  }
  const universe = loadSimUniverse(UNIVERSE_FILE);
  const { startYear, endYear } = e.maskedPeriod;
  const sim = runSimulation(universe, genomeToConfig(e), (y) => y >= startYear && y <= endYear, true);

  const prefix = `${EXPERT_REPLAY_PREFIX}${n}`;
  const esc = (s: string) => s.replace(/,/g, ';');
  fs.writeFileSync(
    `${prefix}-trades.csv`,
    ['date,action,cik,ticker,price,amount,reason,portfolioValue', ...sim.tradeLog.map((t) => [t.date, t.action, t.cik, t.ticker, t.price, t.amount, esc(t.reason), t.portfolioValue].join(','))].join('\n')
  );
  fs.writeFileSync(`${prefix}-equity.csv`, ['date,value', ...sim.history.map((h) => `${h.date},${h.value}`)].join('\n'));
  const { tradeLog, history, ...metrics } = sim;
  console.log(`Ekspert ${n}, okres OOS ${startYear}-${endYear}:`, metrics);
  console.log(`Zapisano ${prefix}-trades.csv (${tradeLog.length} transakcji) i ${prefix}-equity.csv`);
}

main();
