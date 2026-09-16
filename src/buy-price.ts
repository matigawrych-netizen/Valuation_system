/**
 * Cena zakupu (docs/specjalisci.md, punkt 6a).
 *
 * Dla horyzontu H i wymaganego zwrotu r: najwyższa cena P, przy której mediana prognozy ceny za H lat
 * razem z dywidendami daje co najmniej wymagany zwrot:
 *     P · exp(m_H(P)) + D · H ≥ P · (1 + r)^H
 * gdzie m_H(P) to mediana log(cena za H lat / P) przy dzisiejszej cenie P, a D — dzisiejsza dywidenda na akcję
 * (bez zmian, bez reinwestowania). Prognoza zależy od ceny (tańsza spółka ma więcej miejsca do powrotu wyceny),
 * dlatego cena jest szukana: najpierw na siatce cen, potem bisekcją między najwyższym punktem siatki, który spełnia
 * warunek, a następnym.
 *
 * Zakres siatki: ceny, przy których cena/przychody spółki mieści się między 1. a 99. centylem danych uczących
 * specjalisty — poza nim prognoza nie ma oparcia w danych (ta sama zasada co przy wstrzymaniu się od głosu).
 *
 * Cena zakupu specjalisty = średnia z cen dla H = 1..5 [decyzja właściciela].
 */

export const TEMPERAMENTS = [
  { id: 'aggressive', label: 'agresywny', rate: 0.06 },
  { id: 'balanced', label: 'zrównoważony', rate: 0.09 },
  { id: 'cautious', label: 'ostrożny', rate: 0.13 },
] as const;
export type TemperamentId = (typeof TEMPERAMENTS)[number]['id'];

export const BUY_GRID = { points: 81, bisectionSteps: 20 } as const;

/** Mediana log(cena za H lat / P) przy dzisiejszej cenie P; null = model nie umie ocenić. */
export type MedianLogAtPrice = (price: number) => number | null;

export interface HorizonBuyPrice {
  price: number;
  /**
   * Warunek niespełniony nawet na dole zakresu ('below' — za drogo nawet przy najniższej wycenie z danych)
   * albo spełniony jeszcze na górze ('above' — opłaca się nawet przy najwyższej wycenie z danych). Cena = granica zakresu.
   */
  censored: 'below' | 'above' | null;
}

/** Zakres szukania ceny: [najniższa, najwyższa] cena akcji. */
export type PriceRange = [number, number];

/** Ceny, przy których log(cena/przychody) = granice zakresu `logPsRange`. */
export function priceRangeFromValuation(logPsRange: [number, number], revenue: number, shares: number): PriceRange | null {
  if (!(revenue > 0) || !(shares > 0) || !(logPsRange[1] > logPsRange[0])) return null;
  return [(Math.exp(logPsRange[0]) * revenue) / shares, (Math.exp(logPsRange[1]) * revenue) / shares];
}

/** Ceny zakupu dla jednego horyzontu, po jednej na każdą stopę z `rates`. Null, gdy model nie daje prognozy. */
export function buyPricesForHorizon(
  medianLog: MedianLogAtPrice,
  range: PriceRange,
  dividendPerShare: number,
  H: number,
  rates: readonly number[]
): HorizonBuyPrice[] | null {
  if (!(range[0] > 0) || !(range[1] > range[0]) || !(dividendPerShare >= 0)) return null;
  const { points, bisectionSteps } = BUY_GRID;
  const logLow = Math.log(range[0]);
  const logHigh = Math.log(range[1]);
  const grid: number[] = [];
  const value: number[] = [];
  for (let k = 0; k < points; k++) {
    const p = Math.exp(logLow + ((logHigh - logLow) * k) / (points - 1));
    const m = medianLog(p);
    if (m == null || !Number.isFinite(m)) return null;
    grid.push(p);
    // Zwrot brutto za H lat na złotówkę ceny: wzrost ceny + dywidendy.
    value.push(Math.exp(m) + (dividendPerShare * H) / p);
  }

  const out: HorizonBuyPrice[] = [];
  for (const r of rates) {
    const required = Math.pow(1 + r, H);
    let top = -1;
    for (let k = points - 1; k >= 0; k--) {
      if (value[k] >= required) {
        top = k;
        break;
      }
    }
    if (top < 0) {
      out.push({ price: grid[0], censored: 'below' });
      continue;
    }
    if (top === points - 1) {
      out.push({ price: grid[points - 1], censored: 'above' });
      continue;
    }
    let lo = Math.log(grid[top]);
    let hi = Math.log(grid[top + 1]);
    for (let s = 0; s < bisectionSteps; s++) {
      const mid = (lo + hi) / 2;
      const p = Math.exp(mid);
      const m = medianLog(p);
      if (m == null || !Number.isFinite(m)) return null;
      if (Math.exp(m) + (dividendPerShare * H) / p >= required) lo = mid;
      else hi = mid;
    }
    out.push({ price: Math.exp(lo), censored: null });
  }
  return out;
}

export interface BuyPriceResult {
  /** Średnia z horyzontów 1..5 dla każdego temperamentu. */
  price: Record<TemperamentId, number>;
  /** Cena dla każdego horyzontu (indeks 0 = 1 rok). */
  byHorizon: Record<TemperamentId, number[]>;
  /** Ile cen składowych trafiło na granicę zakresu wyceny. */
  censored: number;
}

/**
 * Średnia z pięciu horyzontów. `perHorizon[H-1]` = funkcja mediany i zakres cen dla horyzontu H albo null, gdy
 * specjalista nie ma modelu — wtedy nie podaje ceny zakupu (brak średniej z niepełnych horyzontów).
 */
export function averageBuyPrice(
  perHorizon: ({ medianLog: MedianLogAtPrice; range: PriceRange } | null)[],
  dividendPerShare: number
): BuyPriceResult | null {
  const rates = TEMPERAMENTS.map((t) => t.rate);
  const byHorizon = Object.fromEntries(TEMPERAMENTS.map((t) => [t.id, [] as number[]])) as Record<TemperamentId, number[]>;
  let censored = 0;
  for (let i = 0; i < perHorizon.length; i++) {
    const f = perHorizon[i];
    if (!f) return null;
    const prices = buyPricesForHorizon(f.medianLog, f.range, dividendPerShare, i + 1, rates);
    if (!prices) return null;
    TEMPERAMENTS.forEach((t, k) => {
      byHorizon[t.id].push(prices[k].price);
      if (prices[k].censored) censored++;
    });
  }
  const price = Object.fromEntries(
    TEMPERAMENTS.map((t) => [t.id, byHorizon[t.id].reduce((a, b) => a + b, 0) / byHorizon[t.id].length])
  ) as Record<TemperamentId, number>;
  return { price, byHorizon, censored };
}
