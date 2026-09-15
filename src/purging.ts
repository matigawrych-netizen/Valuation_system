import { EMBARGO_MONTHS, LABEL_HORIZON_MONTHS, type YearBlock } from './paths.js';

export function addMonths(date: string | Date, months: number): Date {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function blockBounds(block: YearBlock): { start: Date; end: Date } {
  return {
    start: new Date(`${block.startYear}-01-01T00:00:00Z`),
    end: new Date(`${block.endYear}-12-31T23:59:59.999Z`),
  };
}

const toDate = (asOf: string) => new Date(`${asOf.slice(0, 10)}T00:00:00Z`);

/**
 * true => obserwację trzeba wyrzucić ze zbioru treningowego dla bloku testowego `block`:
 *  - okno etykiety [asOf, asOf + 12M] przecina się z blokiem, albo
 *  - asOf leży w embargo (koniec bloku, koniec bloku + 3M).
 */
export function isPurged(asOf: string, block: YearBlock): boolean {
  const { start, end } = blockBounds(block);
  const t0 = toDate(asOf).getTime();
  const t1 = addMonths(asOf, LABEL_HORIZON_MONTHS).getTime();
  const overlap = Math.max(t0, start.getTime()) <= Math.min(t1, end.getTime());
  if (overlap) return true;
  const embargoEnd = addMonths(end, EMBARGO_MONTHS).getTime();
  return t0 > end.getTime() && t0 < embargoEnd;
}

/**
 * Niezależne sformułowanie warunku wycieku (wprost z definicji), używane przez testy
 * do sprawdzania wyniku `splitFold` bez polegania na `isPurged`.
 */
export function leaksIntoBlock(asOf: string, block: YearBlock): boolean {
  const { start: testStart, end: testEnd } = blockBounds(block);
  const rowAsOf = toDate(asOf);
  const labelEnd = addMonths(asOf, LABEL_HORIZON_MONTHS);
  return (
    (labelEnd >= testStart && rowAsOf <= testEnd) ||
    (rowAsOf > testEnd && rowAsOf < addMonths(testEnd, EMBARGO_MONTHS))
  );
}

export const inBlock = (asOf: string, block: YearBlock) => {
  const y = Number(asOf.slice(0, 4));
  return y >= block.startYear && y <= block.endYear;
};

/** Podział na fold walk-forward: test = wiersze w bloku, train = reszta po purgingu i embargo. */
export function splitFold<T extends { asOf: string }>(rows: T[], block: YearBlock): { train: T[]; test: T[]; purged: T[] } {
  const test: T[] = [];
  const train: T[] = [];
  const purged: T[] = [];
  for (const r of rows) {
    if (inBlock(r.asOf, block)) test.push(r);
    else if (isPurged(r.asOf, block)) purged.push(r);
    else train.push(r);
  }
  return { train, test, purged };
}
