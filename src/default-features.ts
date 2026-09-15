/**
 * Cechy modelu prawdopodobieństwa bankructwa — JEDNA implementacja używana
 * zarówno przy treningu (scripts/train-default-model.ts), jak i w mapperze SEC.
 *
 * `goingConcern` z pierwotnej listy został usunięty: koncept `AuditorOpinionGoingConcern`
 * nie występuje w żadnym pliku companyfacts w cache (pokrycie 0%), więc cecha byłaby stałą.
 */
export const DEFAULT_FEATURE_NAMES = ['altmanZ', 'netDebtToEbitda', 'interestCoverage', 'negFcfQuarters', 'drawdown24m'] as const;
export type DefaultFeatureName = (typeof DEFAULT_FEATURE_NAMES)[number];

export interface DefaultFeatureInputs {
  workingCapital: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  retainedEarnings: number | null;
  ebitTTM: number | null;
  salesTTM: number | null;
  marketCap: number | null;
  totalDebt: number | null;
  cash: number | null;
  ebitdaTTM: number | null;
  interestExpenseTTM: number | null;
  negFcfQuarters: number | null;
  drawdown24m: number | null;
}

export interface DefaultFeatures {
  values: Record<DefaultFeatureName, number | null>;
  missing: DefaultFeatureName[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function computeDefaultFeatures(x: DefaultFeatureInputs): DefaultFeatures {
  let altmanZ: number | null = null;
  if (
    x.workingCapital != null &&
    x.totalAssets != null &&
    x.totalAssets > 0 &&
    x.totalLiabilities != null &&
    x.totalLiabilities > 0 &&
    x.retainedEarnings != null &&
    x.ebitTTM != null &&
    x.salesTTM != null &&
    x.marketCap != null
  ) {
    const z =
      1.2 * (x.workingCapital / x.totalAssets) +
      1.4 * (x.retainedEarnings / x.totalAssets) +
      3.3 * (x.ebitTTM / x.totalAssets) +
      0.6 * (x.marketCap / x.totalLiabilities) +
      1.0 * (x.salesTTM / x.totalAssets);
    altmanZ = clamp(z, -10, 10);
  }

  // EBITDA <= 0 => dźwignia nieokreślona; mapujemy na górną granicę (najgorszy sygnał), nie na |EBITDA|.
  let netDebtToEbitda: number | null = null;
  if (x.totalDebt != null && x.cash != null && x.ebitdaTTM != null) {
    netDebtToEbitda = x.ebitdaTTM > 0 ? clamp((x.totalDebt - x.cash) / x.ebitdaTTM, -10, 10) : 10;
  }

  // Brak kosztów odsetek (<= 0) => pokrycie ustawione na górną granicę 50.
  let interestCoverage: number | null = null;
  if (x.ebitTTM != null && x.interestExpenseTTM != null) {
    interestCoverage = x.interestExpenseTTM > 0 ? clamp(x.ebitTTM / x.interestExpenseTTM, -10, 50) : 50;
  }

  const values: Record<DefaultFeatureName, number | null> = {
    altmanZ,
    netDebtToEbitda,
    interestCoverage,
    negFcfQuarters: x.negFcfQuarters,
    drawdown24m: x.drawdown24m,
  };
  return { values, missing: DEFAULT_FEATURE_NAMES.filter((n) => values[n] == null) };
}
