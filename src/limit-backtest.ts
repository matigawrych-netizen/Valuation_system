/**
 * K2: zlecenia z limitem po cenie zrównoważonej kontra kupno S&P 500 (SPY, zwrot całkowity) w tym samym dniu.
 *
 * Reguły (zapisane przed egzaminem, docs/specjalisci.md, punkt 7):
 *  • zlecenie z decyzji z dnia t obowiązuje od następnej sesji do dnia następnej decyzji (t + 3 miesiące) włącznie,
 *  • realizacja w pierwszej sesji, w której kurs zamknięcia ≤ limit, po tym kursie zamknięcia,
 *  • trzymanie przez K2_HOLD_YEARS; zwrot z dywidendami (kurs skorygowany) — dla spółki i dla SPY w tych samych dniach,
 *  • nadwyżka = zwrot spółki − zwrot SPY; bez wyniku, gdy brak notowań spółki po okresie trzymania.
 */
import { DAY_MS, getQuoteAtDate, lastQuoteIndexAtOrBefore, type PriceSeries, type Quote } from './data-loader.js';
import { addMonths } from './purging.js';

export const K2_HOLD_YEARS = 1;
export const ORDER_VALID_MONTHS = 3;

const endOfDay = (d: string) => new Date(`${d.slice(0, 10)}T23:59:59Z`).getTime();
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Pierwsza sesja po dniu decyzji (do dnia następnej decyzji włącznie) z zamknięciem ≤ limit. */
export function findLimitFill(series: PriceSeries, decisionDate: string, limit: number): Quote | null {
  const from = endOfDay(decisionDate);
  const to = endOfDay(iso(addMonths(decisionDate, ORDER_VALID_MONTHS)));
  const q = series.quotes;
  for (let i = Math.max(0, lastQuoteIndexAtOrBefore(q, from) + 1); i < q.length && q[i].t <= to; i++) {
    if (q[i].close <= limit) return q[i];
  }
  return null;
}

/** Pierwsza sesja po dniu decyzji — zakup bez limitu (porównanie informacyjne). */
export function nextSession(series: PriceSeries, decisionDate: string): Quote | null {
  const q = series.quotes;
  const i = lastQuoteIndexAtOrBefore(q, endOfDay(decisionDate)) + 1;
  const next = q[i];
  return next && next.t - endOfDay(decisionDate) <= 10 * DAY_MS ? next : null;
}

/** Zwrot całkowity od sesji `start` po `years` latach; null bez notowania w dniu końcowym (± 10 dni). */
export function holdingReturn(series: PriceSeries, start: Quote, years: number): number | null {
  const end = getQuoteAtDate(series, iso(addMonths(new Date(start.t), 12 * years)));
  if (!end || !(start.adj > 0) || !(end.adj > 0) || end.t <= start.t) return null;
  return end.adj / start.adj - 1;
}

export interface TradeResult {
  cik: string;
  decision: string;
  buyDate: string;
  stockReturn: number;
  marketReturn: number;
  excess: number;
}

/** Wynik jednej transakcji względem SPY kupionego w tej samej sesji. Null, gdy brak danych do końca trzymania. */
export function tradeVersusMarket(cik: string, decision: string, stock: PriceSeries, buy: Quote, spy: PriceSeries, years = K2_HOLD_YEARS): TradeResult | null {
  const stockReturn = holdingReturn(stock, buy, years);
  if (stockReturn == null) return null;
  const buyDay = iso(new Date(buy.t));
  const spyStart = getQuoteAtDate(spy, buyDay, 3);
  if (!spyStart) return null;
  const marketReturn = holdingReturn(spy, spyStart, years);
  if (marketReturn == null) return null;
  return { cik, decision, buyDate: buyDay, stockReturn, marketReturn, excess: stockReturn - marketReturn };
}
