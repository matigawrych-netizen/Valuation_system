/**
 * Pomiar błędu przetrwania (krok c2, preregistracja w docs/plan-terminal.md).
 *
 * Panel cenowy zawiera praktycznie wyłącznie spółki notowane do dziś, bo darmowe źródła nie mają notowań spółek
 * wycofanych. Tutaj używamy miary dostępnej dla WSZYSTKICH spółek — wartości akcji w wolnym obrocie z raportów
 * rocznych SEC — i porównujemy rozkład jej zmian u spółek, które przetrwały, z rozkładem u wszystkich spółek,
 * łącznie z tymi, które zniknęły (z jawnymi założeniami co do wartości końcowej).
 */
import { addMonths } from './purging.js';
import { quantile } from './stats.js';

const DAY = 86_400_000;
/** Najdłuższy odstęp między wnioskiem o upadłość a ostatnim raportem, przy którym upadłość uznajemy za przyczynę zniknięcia. */
export const BANKRUPTCY_TO_END_YEARS = 2;

export interface FloatPoint {
  end: string;
  t: number;
  val: number;
}

export interface CompanyHistory {
  cik: string;
  floats: FloatPoint[];
  /** Ostatni raport okresowy, 8-K albo formularz 25/15 — bez formularzy składanych przez inwestorów. */
  lastReportT: number | null;
  bankruptcyTs: number[];
  delistingTs: number[];
}

export type Fate =
  /** Wartość po h latach jest znana — spółka przetrwała. */
  | 'observed'
  /** Upadłość, po której spółka dalej raportuje, ale liczba akcji zmieniła się skokowo — stare akcje zastąpione nowymi. */
  | 'bankruptcy_reorganized'
  /** Spółka przestała raportować, wcześniej złożyła wniosek o upadłość. */
  | 'bankruptcy'
  /** Spółka przestała raportować po zdjęciu z giełdy / wyrejestrowaniu, bez upadłości (zwykle przejęcie). */
  | 'delisted'
  /** Spółka przestała raportować bez żadnego z tych formularzy. */
  | 'vanished'
  /** Spółka nadal raportuje, ale brak wartości po h latach — nie da się niczego powiedzieć. */
  | 'missing'
  /** Dzień t+h jest za końcem kompletnych danych. */
  | 'not_yet';

export const DISAPPEARED: Fate[] = ['bankruptcy_reorganized', 'bankruptcy', 'delisted', 'vanished'];

export interface ValueObservation {
  cik: string;
  start: string;
  horizon: number;
  startValue: number;
  fate: Fate;
  /** Wartość po h latach i dzień jej wyceny (tylko `observed`). */
  endValue: number | null;
  endDate: string | null;
  /** Ostatnia znana wartość przed zniknięciem (co najmniej wartość startowa). */
  lastValue: number;
}

export interface ObservationOptions {
  minValue: number;
  fromYear: number;
  toYear: number;
  /** Ostatni dzień, dla którego dane SEC o floacie są kompletne. */
  dataEndT: number;
  horizons: number[];
  toleranceDays: number;
  /** Liczba akcji najbliższa danemu dniu; null, gdy brak danych. Potrzebna tylko przy upadłościach. */
  sharesNear?: (cik: string, t: number) => number | null;
  /** Zmiana liczby akcji, powyżej której uznajemy, że po upadłości to już inne akcje. */
  maxSharesChange?: number;
}

export function valueObservations(c: CompanyHistory, o: ObservationOptions): ValueObservation[] {
  const out: ValueObservation[] = [];
  const maxSharesChange = o.maxSharesChange ?? 0.5;

  for (const p of c.floats) {
    const year = Number(p.end.slice(0, 4));
    if (p.val < o.minValue || year < o.fromYear || year > o.toYear) continue;

    for (const h of o.horizons) {
      const T = addMonths(p.end, 12 * h).getTime();
      const base = { cik: c.cik, start: p.end, horizon: h, startValue: p.val, endValue: null, endDate: null, lastValue: p.val };
      if (T > o.dataEndT) {
        out.push({ ...base, fate: 'not_yet' });
        continue;
      }
      const lastBefore = c.floats.filter((f) => f.t >= p.t && f.t < T - o.toleranceDays * DAY).pop() ?? p;
      const match = c.floats.find((f) => Math.abs(f.t - T) <= o.toleranceDays * DAY);
      const bankruptcyInWindow = c.bankruptcyTs.some((b) => b > p.t && b <= T);

      if (match) {
        if (bankruptcyInWindow) {
          // Po reorganizacji float może należeć już do nowych akcjonariuszy. Rozstrzyga liczba akcji.
          const s0 = o.sharesNear?.(c.cik, p.t) ?? null;
          const s1 = o.sharesNear?.(c.cik, match.t) ?? null;
          if (s0 == null || s1 == null) {
            out.push({ ...base, fate: 'missing', lastValue: lastBefore.val });
            continue;
          }
          if (Math.abs(s1 / s0 - 1) > maxSharesChange) {
            out.push({ ...base, fate: 'bankruptcy_reorganized', lastValue: lastBefore.val });
            continue;
          }
        }
        out.push({ ...base, fate: 'observed', endValue: match.val, endDate: match.end });
        continue;
      }

      if (c.lastReportT != null && c.lastReportT < T) {
        const last = c.lastReportT;
        const inLife = (x: number) => x >= p.t && x <= last;
        // Upadłość musi poprzedzać koniec raportowania o najwyżej 2 lata. Starsze zgłoszenia 8-K 1.03 to zwykle
        // upadłości spółek zależnych, a spółka zniknęła później z innego powodu (np. przejęcia).
        const endsInBankruptcy = c.bankruptcyTs.some((b) => inLife(b) && b >= last - BANKRUPTCY_TO_END_YEARS * 365 * DAY);
        const fate: Fate = endsInBankruptcy ? 'bankruptcy' : c.delistingTs.some(inLife) ? 'delisted' : 'vanished';
        out.push({ ...base, fate, lastValue: lastBefore.val });
        continue;
      }
      out.push({ ...base, fate: 'missing', lastValue: lastBefore.val });
    }
  }
  return out;
}

/** Wartość końcowa jako zmiana względem ostatniej znanej wartości, osobno dla każdego losu spółki. */
export interface TerminalAssumptions {
  bankruptcy: number;
  delisted: number;
  vanished: number;
}

export const BASE_ASSUMPTIONS: TerminalAssumptions = { bankruptcy: -0.99, delisted: 0, vanished: 0 };
export const ALTERNATIVE_ASSUMPTIONS: TerminalAssumptions = { bankruptcy: -0.7, delisted: 0.3, vanished: -0.5 };

/** Logarytm zmiany wartości od startu do końca horyzontu; null dla obserwacji spoza grupy. */
export function logChange(obs: ValueObservation, group: 'survivors' | 'all', a: TerminalAssumptions): number | null {
  if (obs.fate === 'observed') return Math.log((obs.endValue as number) / obs.startValue);
  if (group === 'survivors') return null;
  const factor =
    obs.fate === 'bankruptcy' || obs.fate === 'bankruptcy_reorganized'
      ? 1 + a.bankruptcy
      : obs.fate === 'delisted'
        ? 1 + a.delisted
        : obs.fate === 'vanished'
          ? 1 + a.vanished
          : null;
  if (factor == null || factor <= 0) return null;
  return Math.log((obs.lastValue * factor) / obs.startValue);
}

export const QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9] as const;

/** Centyle zmiany wyrażone w procentach (exp − 1). */
export function percentChanges(logs: number[]): Record<string, number> | null {
  if (logs.length < 30) return null;
  const out: Record<string, number> = {};
  for (const q of QUANTILES) out[String(q)] = Math.exp(quantile(logs, q)) - 1;
  return out;
}

/** Udział obserwacji, których zmiana mieści się w pasie [lo, hi] (logarytmy). */
export function coverage(logs: number[], lo: number, hi: number): number | null {
  if (logs.length === 0) return null;
  return logs.filter((x) => x >= lo && x <= hi).length / logs.length;
}
