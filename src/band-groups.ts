/**
 * U1 (docs/ulepszenia.md): trafność pasa 80% w grupach spółek — zmienność, wielkość, sektor.
 */
import type { Horizon } from './facts-panel.js';
import { K1_RANGE, coverage, isScored, type CoverageResult, type ExamRecord } from './specialist-exam.js';
import { quantileSorted } from './stats.js';

export const GROUP_COUNT = 5;
/** Sektor z mniejszą liczbą ocenionych prognoz na horyzoncie trafia do „inne”. */
export const MIN_SECTOR_ROWS = 300;

/**
 * Numer grupy 1..5 (kwintyl) wartości wśród elementów z tego samego dnia decyzji.
 * Null, gdy wartości brak albo w danym dniu jest mniej obserwacji niż grup.
 */
export function quintilesByDay<T>(items: T[], asOf: (t: T) => string, value: (t: T) => number | null): Map<T, number | null> {
  const byDay = new Map<string, number[]>();
  for (const it of items) {
    const v = value(it);
    if (v == null || !Number.isFinite(v)) continue;
    const list = byDay.get(asOf(it)) ?? [];
    list.push(v);
    byDay.set(asOf(it), list);
  }
  const bounds = new Map<string, number[]>();
  for (const [day, vals] of byDay) {
    if (vals.length < GROUP_COUNT) continue;
    vals.sort((a, b) => a - b);
    bounds.set(day, Array.from({ length: GROUP_COUNT - 1 }, (_, k) => quantileSorted(vals, (k + 1) / GROUP_COUNT)));
  }
  const out = new Map<T, number | null>();
  for (const it of items) {
    const v = value(it);
    const b = bounds.get(asOf(it));
    out.set(it, v == null || !Number.isFinite(v) || !b ? null : groupOf(v, b));
  }
  return out;
}

/** Grupa 1..n dla wartości przy granicach (rosnąco): wartość ≤ granica[k] → grupa k+1. */
export function groupOf(value: number, bounds: number[]): number {
  let g = 0;
  while (g < bounds.length && value > bounds[g]) g++;
  return g + 1;
}

export interface GroupBand extends CoverageResult {
  group: string;
  below: number;
  above: number;
}

/** Pokrycie pasa oraz udział wyników poniżej i powyżej pasa w każdej grupie (grupy bez przypisania pomijane). */
export function coverageByGroup(records: ExamRecord[], h: Horizon, group: (r: ExamRecord) => string | null): GroupBand[] {
  const byGroup = new Map<string, ExamRecord[]>();
  for (const r of records) {
    if (r.h !== h || !isScored(r)) continue;
    const g = group(r);
    if (g == null) continue;
    const list = byGroup.get(g) ?? [];
    list.push(r);
    byGroup.set(g, list);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pl', { numeric: true }))
    .map(([g, list]) => ({
      group: g,
      ...coverage(list, h),
      below: list.filter((r) => r.actual! < r.q10!).length / list.length,
      above: list.filter((r) => r.actual! > r.q90!).length / list.length,
    }));
}

/** Sektory z małą liczbą ocenionych prognoz na horyzoncie łączone w „inne”. */
export function mergeSmallSectors(records: ExamRecord[], h: Horizon, sectorOf: (r: ExamRecord) => string | null): (r: ExamRecord) => string | null {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.h !== h || !isScored(r)) continue;
    const s = sectorOf(r) ?? 'brak sektora';
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return (r) => {
    const s = sectorOf(r) ?? 'brak sektora';
    return (counts.get(s) ?? 0) >= MIN_SECTOR_ROWS ? s : 'inne';
  };
}

const outside = (b: GroupBand | undefined) =>
  b != null && b.status !== 'BRAK POMIARU' && (b.coverage < K1_RANGE[0] || b.coverage > K1_RANGE[1]);

/**
 * Reguła U1: pas wymaga zależności od zmienności, gdy na co najmniej 2 horyzontach skrajna grupa zmienności
 * (1 albo 5) ma pokrycie poza progiem K1.
 */
export function volatilityRuleTriggered(byHorizon: GroupBand[][]): { triggered: boolean; horizons: number } {
  let horizons = 0;
  for (const groups of byHorizon) {
    const first = groups.find((g) => g.group === '1');
    const last = groups.find((g) => g.group === String(GROUP_COUNT));
    if (outside(first) || outside(last)) horizons++;
  }
  return { triggered: horizons >= 2, horizons };
}

/** Warunek utrzymania U1b: wszystkie zmierzone grupy zmienności w progu K1. */
export function allGroupsWithinK1(byHorizon: GroupBand[][]): boolean {
  return byHorizon.every((groups) => groups.every((g) => !outside(g)));
}
