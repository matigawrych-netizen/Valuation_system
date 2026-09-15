import { mean, spearman, std } from './stats.js';

export interface EvaluationResult {
  n: number;
  /** Średni |pred - actual| / |actual|, z pominięciem |actual| < 0.01 (MAPE na zwrotach jest niestabilne — tylko diagnostycznie). */
  MAPE: number | null;
  medianAPE: number | null;
  meanAbsError: number | null;
  /** IC liczone łącznie na wszystkich obserwacjach (miesza przekrój z czasem) — NIE używać w raportach decyzyjnych. */
  IC_pooled: number | null;
  IC_by_quarter: {
    quarters: Record<string, number>;
    mean: number | null;
    std: number | null;
    nQuarters: number;
  };
  /** mean(IC_q) / (std(IC_q) / sqrt(nQuarters)) — właściwa miara istotności IC przekrojowego. */
  IC_t_stat: number | null;
  positiveQuarterShare: number | null;
  decile_spread: number | null;
  decileSpreadsByQuarter: Record<string, number>;
  hitRate: number | null;
  n_excluded_from_mape: number;
  warnings: string[];
}

const finiteOrNull = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);

export function evaluate(
  predictions: number[],
  actuals: number[],
  metadata: { quarter: string }[]
): EvaluationResult {
  const warnings: string[] = [];
  const n = predictions.length;
  const empty: EvaluationResult = {
    n,
    MAPE: null,
    medianAPE: null,
    meanAbsError: null,
    IC_pooled: null,
    IC_by_quarter: { quarters: {}, mean: null, std: null, nQuarters: 0 },
    IC_t_stat: null,
    positiveQuarterShare: null,
    decile_spread: null,
    decileSpreadsByQuarter: {},
    hitRate: null,
    n_excluded_from_mape: 0,
    warnings,
  };
  if (n === 0 || n !== actuals.length || n !== metadata.length) {
    warnings.push('Invalid input lengths');
    return empty;
  }

  const apes: number[] = [];
  let absErr = 0;
  let hits = 0;
  let excluded = 0;
  for (let i = 0; i < n; i++) {
    const act = actuals[i];
    const pred = predictions[i];
    if ((act > 0 && pred > 0) || (act < 0 && pred < 0) || (act === 0 && pred === 0)) hits++;
    absErr += Math.abs(pred - act);
    if (Math.abs(act) < 0.01) excluded++;
    else apes.push(Math.abs((act - pred) / act));
  }
  apes.sort((a, b) => a - b);
  if (!apes.length) warnings.push('All observations excluded from MAPE (actual close to zero)');

  const byQuarter = new Map<string, { pred: number; actual: number }[]>();
  metadata.forEach((m, i) => {
    if (!byQuarter.has(m.quarter)) byQuarter.set(m.quarter, []);
    byQuarter.get(m.quarter)!.push({ pred: predictions[i], actual: actuals[i] });
  });

  const quarters: Record<string, number> = {};
  const decileSpreadsByQuarter: Record<string, number> = {};
  for (const [q, subset] of [...byQuarter.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ic = spearman(
      subset.map((d) => d.pred),
      subset.map((d) => d.actual)
    );
    if (ic != null) quarters[q] = ic;
    if (subset.length >= 10) {
      const sorted = [...subset].sort((a, b) => b.pred - a.pred);
      const k = Math.floor(sorted.length / 10);
      const top = mean(sorted.slice(0, k).map((d) => d.actual));
      const bottom = mean(sorted.slice(sorted.length - k).map((d) => d.actual));
      decileSpreadsByQuarter[q] = top - bottom;
    }
  }

  const icValues = Object.values(quarters);
  const icMean = icValues.length ? mean(icValues) : null;
  const icStd = icValues.length > 1 ? std(icValues) : null;
  if (!icValues.length) warnings.push('Could not compute IC_by_quarter (not enough valid quarters)');
  const spreads = Object.values(decileSpreadsByQuarter);
  if (!spreads.length) warnings.push('Not enough data per quarter to compute decile_spread (requires >= 10 predictions per quarter)');

  return {
    n,
    MAPE: apes.length ? mean(apes) : null,
    medianAPE: apes.length ? apes[Math.floor((apes.length - 1) / 2)] : null,
    meanAbsError: absErr / n,
    IC_pooled: finiteOrNull(spearman(predictions, actuals)),
    IC_by_quarter: { quarters, mean: finiteOrNull(icMean), std: finiteOrNull(icStd), nQuarters: icValues.length },
    IC_t_stat: icMean != null && icStd != null && icStd > 0 ? icMean / (icStd / Math.sqrt(icValues.length)) : null,
    positiveQuarterShare: icValues.length ? icValues.filter((v) => v > 0).length / icValues.length : null,
    decile_spread: spreads.length ? mean(spreads) : null,
    decileSpreadsByQuarter,
    hitRate: hits / n,
    n_excluded_from_mape: excluded,
    warnings,
  };
}
