/**
 * Pamięć specjalistów w czasie rzeczywistym i kalendarz egzaminu (docs/specjalisci.md, punkty 4 i 7).
 *
 * Trening odbywa się raz w roku, 15 lutego. Specjalista uczy się wyłącznie na obserwacjach, których wynik
 * po h latach był już znany w dniu treningu, i które zrealizowały się w jego oknie pamięci.
 * Model z danego lutego obsługuje decyzje do następnego lutego.
 */
import type { Horizon } from './facts-panel.js';
import { EMBARGO_YEAR, TRAIN_END_YEAR, asOfYear } from './paths.js';
import { addMonths } from './purging.js';

export const EXAM_FIRST_YEAR = 2016;
export const EXAM_LAST_YEAR = TRAIN_END_YEAR;
export const RETRAIN_MONTH_DAY = '02-15';

/** Mniej obserwacji w pamięci = specjalista nie ma modelu dla tego horyzontu i wstrzymuje się od głosu. */
export const MIN_TRAIN_ROWS = 1000;
/** Tyle obserwacji musi mieć ostatni rok pamięci (walidacja do wcześniejszego zatrzymania). Ta sama reguła dla wszystkich metod. */
export const MIN_VALIDATION_ROWS = 300;

export type MemoryLength = 4 | 8 | 'all';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Dzień, w którym znany jest wynik decyzji z `asOf` po `h` latach. */
export const outcomeDate = (asOf: string, h: number) => iso(addMonths(asOf, 12 * h));

/** Dni treningów egzaminu: 15 lutego każdego roku egzaminu. */
export function trainingCutoffs(): string[] {
  const out: string[] = [];
  for (let y = EXAM_FIRST_YEAR; y <= EXAM_LAST_YEAR; y++) out.push(`${y}-${RETRAIN_MONTH_DAY}`);
  return out;
}

/** Trening, z którego korzysta decyzja z dnia `asOf` (ostatni luty nie później niż decyzja). Null przed pierwszym. */
export function cutoffFor(asOf: string): string | null {
  const day = asOf.slice(0, 10);
  const y = asOfYear(day);
  const sameYear = `${y}-${RETRAIN_MONTH_DAY}`;
  const cutoff = day >= sameYear ? sameYear : `${y - 1}-${RETRAIN_MONTH_DAY}`;
  return cutoff >= trainingCutoffs()[0] ? cutoff : null;
}

/** Decyzja należy do egzaminu: rok 2016–2021 i istnieje trening sprzed niej. */
export function isExamDecision(asOf: string): boolean {
  const y = asOfYear(asOf);
  return y >= EXAM_FIRST_YEAR && y <= EXAM_LAST_YEAR && cutoffFor(asOf) != null;
}

export interface MemorySplit<T> {
  /** Cała pamięć — na niej powstaje model końcowy i pas błędów. */
  all: T[];
  /** Pamięć bez ostatniego roku — do wyboru liczby drzew / epok. */
  train: T[];
  /** Ostatni rok pamięci: wynik zrealizowany w (dzień treningu − 1 rok, dzień treningu]. */
  validation: T[];
}

/**
 * Obserwacje z pamięci specjalisty w dniu treningu `cutoff` dla horyzontu `h`:
 * wynik znany najpóźniej w dniu treningu i zrealizowany w oknie (cutoff − M lat, cutoff].
 */
export function memoryRows<T extends { asOf: string }>(rows: T[], cutoff: string, h: Horizon, memory: MemoryLength): MemorySplit<T> {
  const lower = memory === 'all' ? null : iso(addMonths(cutoff, -12 * memory));
  const validationLower = iso(addMonths(cutoff, -12));
  const out: MemorySplit<T> = { all: [], train: [], validation: [] };
  for (const r of rows) {
    const outcome = outcomeDate(r.asOf, h);
    if (outcome > cutoff) continue;
    if (lower != null && outcome <= lower) continue;
    // Nie może się zdarzyć przy dniach treningu ≤ 2021 — sprawdzenie chroni sejf przed błędem w kalendarzu.
    if (asOfYear(r.asOf) >= EMBARGO_YEAR) throw new Error(`Obserwacja z ${r.asOf} w pamięci treningu ${cutoff} — naruszenie podziału danych.`);
    out.all.push(r);
    (outcome > validationLower ? out.validation : out.train).push(r);
  }
  return out;
}

/** Czy pamięć wystarcza do zbudowania modelu (ta sama reguła dla wszystkich metod). */
export function memoryIsSufficient(split: MemorySplit<unknown>): { ok: true } | { ok: false; reason: string } {
  if (split.all.length < MIN_TRAIN_ROWS) return { ok: false, reason: `za mało obserwacji w pamięci (${split.all.length} < ${MIN_TRAIN_ROWS})` };
  if (split.validation.length < MIN_VALIDATION_ROWS) {
    return { ok: false, reason: `za mało obserwacji w ostatnim roku pamięci (${split.validation.length} < ${MIN_VALIDATION_ROWS})` };
  }
  return { ok: true };
}
