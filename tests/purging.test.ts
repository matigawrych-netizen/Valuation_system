import { describe, expect, it } from 'vitest';
import { MASK_PERIODS, TRAIN_END_YEAR } from '../src/paths.js';
import { addMonths, blockBounds, isPurged, leaksIntoBlock, splitFold } from '../src/purging.js';

/** Kwartalne daty decyzji 2006–2021 (jak w datasecie). */
const rows = (() => {
  const out: { asOf: string; id: number }[] = [];
  let id = 0;
  for (let y = 2006; y <= TRAIN_END_YEAR; y++) {
    for (const md of ['05-15', '08-15', '11-15']) out.push({ asOf: `${y}-${md}`, id: id++ });
    out.push({ asOf: `${y + 1}-02-15`, id: id++ });
  }
  return out.filter((r) => Number(r.asOf.slice(0, 4)) <= TRAIN_END_YEAR);
})();

const leakedTrainRows = (train: { asOf: string }[], block: (typeof MASK_PERIODS)[number]) =>
  train.filter((r) => leaksIntoBlock(r.asOf, block));

describe('purging walk-forward', () => {
  it('8 bloków w okresie treningowym', () => {
    expect(MASK_PERIODS).toHaveLength(8);
    expect(MASK_PERIODS[MASK_PERIODS.length - 1].endYear).toBe(TRAIN_END_YEAR);
  });

  it('żadna obserwacja treningowa nie przecieka do bloku testowego (sprawdzenie niezależne od isPurged)', () => {
    for (const block of MASK_PERIODS) {
      const { train, test } = splitFold(rows, block);
      expect(test.length).toBeGreaterThan(0);
      expect(leakedTrainRows(train, block)).toEqual([]);
    }
  });

  it('TEST NEGATYWNY: wiersz z datą testStart - 6M zostaje wykryty i usunięty', () => {
    const block = MASK_PERIODS[3];
    const { start } = blockBounds(block);
    const injected = { asOf: addMonths(start, -6).toISOString().slice(0, 10), id: -1 };

    // Niezależny detektor musi go uznać za wyciek — inaczej cały test jest bezwartościowy.
    expect(leaksIntoBlock(injected.asOf, block)).toBe(true);

    const { train, purged } = splitFold([...rows, injected], block);
    expect(train.find((r) => r.id === -1)).toBeUndefined();
    expect(purged.find((r) => r.id === -1)).toBeDefined();
  });

  it('TEST NEGATYWNY: podział bez purgingu jest wykrywany jako wyciek', () => {
    const block = MASK_PERIODS[3];
    const naiveTrain = rows.filter((r) => {
      const y = Number(r.asOf.slice(0, 4));
      return y < block.startYear || y > block.endYear;
    });
    expect(leakedTrainRows(naiveTrain, block).length).toBeGreaterThan(0);
  });

  it('embargo 3M po bloku', () => {
    const block = { startYear: 2010, endYear: 2011 };
    expect(isPurged('2012-02-15', block)).toBe(true);
    expect(isPurged('2012-05-15', block)).toBe(false);
    expect(isPurged('2008-12-31', block)).toBe(false);
    expect(isPurged('2009-02-15', block)).toBe(true);
  });
});
