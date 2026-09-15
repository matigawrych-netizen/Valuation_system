/**
 * T-18 — profil dokładności per archetyp, wyłącznie z predykcji out-of-sample (walk-forward z train.ts).
 *   npx tsx scripts/build-accuracy-profile.ts
 *
 * Błąd procentowy prognozy ceny za 12M: |(1+pred) − (1+actual)| / (1+actual).
 * Archetypy z n < MIN_ARCHETYPE_OBS => medianAPE = null (silnik przyjmie dokładność 0.5 i ostrzeżenie).
 */
import fs from 'node:fs';
import { MIN_ARCHETYPE_OBS } from '../src/block-model.js';
import type { AccuracyProfileArtifact } from '../src/engine-config.js';
import { ACCURACY_PROFILE, OOS_PREDICTIONS_CSV, ensureArtifactsDir, requireArtifact } from '../src/paths.js';
import { bootstrapGroups, median } from '../src/stats.js';
import { ARCHETYPES } from '../src/valuation-engine.js';

function main() {
  requireArtifact(OOS_PREDICTIONS_CSV, 'npx tsx scripts/train.ts');
  const lines = fs.readFileSync(OOS_PREDICTIONS_CSV, 'utf-8').trim().split('\n');
  const header = lines[0].split(',');
  const col = (n: string) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`${OOS_PREDICTIONS_CSV}: brak kolumny ${n}`);
    return i;
  };
  const [iArch, iAsOf, iPred, iAct, iFold] = ['dominantArchetype', 'asOf', 'predReturn', 'fwdReturn12m', 'foldStart'].map(col);

  const byArch = new Map<string, { asOf: string; ape: number; fold: string }[]>();
  let excluded = 0;
  for (const line of lines.slice(1)) {
    const p = line.split(',');
    const act = Number(p[iAct]);
    const pred = Number(p[iPred]);
    if (!(1 + act > 0)) {
      excluded++;
      continue;
    }
    const arr = byArch.get(p[iArch]) ?? [];
    arr.push({ asOf: p[iAsOf], ape: Math.abs(pred - act) / (1 + act), fold: p[iFold] });
    byArch.set(p[iArch], arr);
  }

  const artifact: AccuracyProfileArtifact = {
    generatedAt: new Date().toISOString(),
    definition: 'mediana |(1+pred)-(1+actual)|/(1+actual) na predykcjach OOS walk-forward (artifacts/oos-predictions.csv)',
    minObservations: MIN_ARCHETYPE_OBS,
    archetypes: {},
  };
  console.log('Archetyp | n | foldy | mediana APE | CI95 (bootstrap po kwartałach)');
  for (const a of ARCHETYPES) {
    const obs = byArch.get(a) ?? [];
    const byQuarter = new Map<string, typeof obs>();
    for (const o of obs) byQuarter.set(o.asOf, [...(byQuarter.get(o.asOf) ?? []), o]);
    const groups = [...byQuarter.values()];
    const ci = obs.length ? bootstrapGroups(groups, (g) => median(g.flat().map((o) => o.ape)), 1000, 1) : null;
    const enough = obs.length >= MIN_ARCHETYPE_OBS;
    artifact.archetypes[a] = {
      medianAPE: enough ? median(obs.map((o) => o.ape)) : null,
      n: obs.length,
      nFolds: new Set(obs.map((o) => o.fold)).size,
      ci95: enough && ci?.lo != null && ci.hi != null ? [ci.lo, ci.hi] : null,
    };
    const e = artifact.archetypes[a]!;
    console.log(
      `${a} | ${e.n} | ${e.nFolds} | ${e.medianAPE?.toFixed(4) ?? `null (n < ${MIN_ARCHETYPE_OBS})`} | ${e.ci95 ? e.ci95.map((x) => x.toFixed(4)).join('–') : '—'}`
    );
  }
  if (excluded) console.log(`Pominięto ${excluded} obserwacji z 1+zwrot <= 0.`);
  ensureArtifactsDir();
  fs.writeFileSync(ACCURACY_PROFILE, JSON.stringify(artifact, null, 2));
  console.log(`Zapisano ${ACCURACY_PROFILE}`);
}

main();
