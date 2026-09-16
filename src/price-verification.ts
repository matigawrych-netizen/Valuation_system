/**
 * Czy notowania z Yahoo należą do TEJ spółki z SEC?
 *
 * Yahoo szuka po tickerze, a tickery bywają przypisywane ponownie innym firmom (sprawdzone: SHLD i BTU
 * zwracają notowania nowych spółek). Wstawienie cudzych cen do panelu po cichu zepsułoby wszystkie fakty.
 *
 * Sprawdzenie: w dniach, na które spółka podała SEC wartość akcji w wolnym obrocie, porównujemy kurs z Yahoo
 * z kursem przybliżonym z SEC (float / liczba akcji, skorygowane o splity). Dla tej samej spółki stosunek
 * jest bliski 1 — zmierzone na S&P: 80% przypadków kurs z SEC jest od 14% niższy do 3% wyższy od rynkowego.
 *
 * Górny próg jest szeroki celowo: przy dominującym udziałowcu wolny obrót jest mały, więc kurs z SEC wychodzi
 * zaniżony, choć to ta sama spółka (zmierzone: T-Mobile ×2,6 — Deutsche Telekom; Las Vegas Sands ×2,2 — rodzina
 * Adelsonów; Kraft Heinz ×1,6 — 3G i Berkshire). Dolny próg jest ciasny: kurs rynkowy niższy od kursu z SEC
 * oznacza cudzą spółkę albo liczbę akcji tylko jednej klasy.
 *
 * Odrzucenie chroni też przed spółkami z kilkoma klasami akcji, dla których SEC podaje liczbę akcji tylko
 * jednej klasy: ich kapitalizacja w panelu byłaby i tak błędna.
 */
import { DAY_MS, getQuoteAtDate, type CompanyFacts, type PriceSeries } from './data-loader.js';
import { floatImpliedPrices } from './terminal-outcomes.js';

/** Mediana stosunku kurs Yahoo / kurs z SEC musi mieścić się w tym przedziale. */
export const MEDIAN_RATIO_RANGE: [number, number] = [0.8, 3.0];
/** Pojedyncze porównanie uznajemy za zgodne w tym przedziale (float bywa podany na inny dzień niż notowanie). */
export const SINGLE_RATIO_RANGE: [number, number] = [0.5, 4.0];
/** Tyle porównań musi być zgodnych. Przy 3 porównaniach dopuszcza jedno odstające (Kenvue tuż po wydzieleniu z J&J miał 90% akcji u J&J). */
export const MIN_AGREEING_SHARE = 0.6;

/** `no_float_data`: brak floatu albo brak łącznej liczby akcji (typowe przy kilku klasach akcji). */
export type VerificationStatus = 'verified' | 'mismatch' | 'no_overlap' | 'no_float_data';

export interface PriceVerification {
  status: VerificationStatus;
  overlaps: number;
  medianRatio: number | null;
  agreeingShare: number | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function verifyPriceSeries(prices: PriceSeries, facts: CompanyFacts): PriceVerification {
  const floats = floatImpliedPrices(facts);
  if (floats.length === 0) return { status: 'no_float_data', overlaps: 0, medianRatio: null, agreeingShare: null };

  const splitFactorAfter = (t: number) =>
    prices.splits.reduce((m, s) => (s.t > t && s.numerator > 0 && s.denominator > 0 ? (m * s.numerator) / s.denominator : m), 1);

  const ratios: number[] = [];
  for (const f of floats) {
    const quote = getQuoteAtDate(prices, new Date(f.t).toISOString().slice(0, 10));
    if (!quote || !(quote.close > 0)) continue;
    const secPrice = f.float / (f.shares * splitFactorAfter(f.t));
    if (!(secPrice > 0)) continue;
    // Notowanie musi być z okolicy dnia wyceny floatu, a nie sprzed długiej przerwy w notowaniach.
    if (Math.abs(quote.t - f.t) > 10 * DAY_MS) continue;
    ratios.push(quote.close / secPrice);
  }

  if (ratios.length === 0) return { status: 'no_overlap', overlaps: 0, medianRatio: null, agreeingShare: null };

  const med = median(ratios);
  const agreeing = ratios.filter((r) => r >= SINGLE_RATIO_RANGE[0] && r <= SINGLE_RATIO_RANGE[1]).length / ratios.length;
  const ok = med >= MEDIAN_RATIO_RANGE[0] && med <= MEDIAN_RATIO_RANGE[1] && agreeing >= MIN_AGREEING_SHARE;
  return { status: ok ? 'verified' : 'mismatch', overlaps: ratios.length, medianRatio: med, agreeingShare: agreeing };
}
