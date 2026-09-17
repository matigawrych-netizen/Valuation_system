import { describe, expect, it } from 'vitest';
import {
  allGroupsWithinK1,
  coverageByGroup,
  groupOf,
  mergeSmallSectors,
  quintilesByDay,
  volatilityRuleTriggered,
  type GroupBand,
} from '../src/band-groups.js';
import type { ExamRecord } from '../src/specialist-exam.js';

const rec = (asOf: string, cik: string, actual: number): ExamRecord => ({
  cik,
  asOf,
  cutoff: '2018-02-15',
  h: 1,
  status: 'ok',
  median: 0,
  q10: -0.5,
  q90: 0.5,
  actual,
});

describe('grupy spółek', () => {
  it('kwintyle liczone osobno w każdym dniu decyzji', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => ({ asOf: '2018-02-15', v: i })),
      ...Array.from({ length: 10 }, (_, i) => ({ asOf: '2018-05-15', v: 100 + i })),
      { asOf: '2018-05-15', v: null as number | null },
    ];
    const g = quintilesByDay(items, (x) => x.asOf, (x) => x.v);
    expect(items.slice(0, 10).map((x) => g.get(x))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(items.slice(10, 20).map((x) => g.get(x))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(g.get(items[20])).toBeNull();
  });

  it('granice grup: wartość równa granicy należy do niższej grupy', () => {
    expect(groupOf(1, [1, 2, 3, 4])).toBe(1);
    expect(groupOf(1.01, [1, 2, 3, 4])).toBe(2);
    expect(groupOf(9, [1, 2, 3, 4])).toBe(5);
  });

  it('pokrycie oraz udział poniżej i powyżej pasa w grupach', () => {
    const records: ExamRecord[] = [];
    const quarters = ['2018-02-15', '2018-05-15', '2018-08-15', '2018-11-15'];
    for (const q of quarters) {
      for (let i = 0; i < 50; i++) records.push(rec(q, `a${i}`, i < 5 ? -1 : i < 10 ? 1 : 0)); // spokojne: 80% w pasie
      for (let i = 0; i < 50; i++) records.push(rec(q, `b${i}`, i < 20 ? -1 : 0)); // zmienne: 60% w pasie, reszta poniżej
    }
    const bands = coverageByGroup(records, 1, (r) => (r.cik.startsWith('a') ? '1' : '5'));
    expect(bands.map((b) => [b.group, b.coverage, b.below, b.above])).toEqual([
      ['1', 0.8, 0.1, 0.1],
      ['5', 0.6, 0.4, 0],
    ]);
    expect(bands[1].status).toBe('FAIL');
  });

  it('małe sektory łączone w „inne”', () => {
    const records = [
      ...Array.from({ length: 300 }, (_, i) => rec('2018-02-15', `x${i}`, 0)),
      ...Array.from({ length: 10 }, (_, i) => rec('2018-02-15', `y${i}`, 0)),
    ];
    const f = mergeSmallSectors(records, 1, (r) => (r.cik.startsWith('x') ? 'Services' : 'Utilities'));
    expect(f(records[0])).toBe('Services');
    expect(f(records[305])).toBe('inne');
  });
});

describe('reguły U1', () => {
  const band = (group: string, coverage: number, status: GroupBand['status'] = coverage >= 0.72 && coverage <= 0.88 ? 'PASS' : 'FAIL'): GroupBand => ({
    group,
    coverage,
    n: 1000,
    quarters: 20,
    lo: null,
    hi: null,
    status,
    below: 0,
    above: 0,
  });

  it('próg przekroczony, gdy skrajna grupa zmienności jest poza 72–88% na co najmniej 2 horyzontach', () => {
    const ok = [band('1', 0.8), band('3', 0.6), band('5', 0.75)];
    const bad = [band('1', 0.93), band('3', 0.8), band('5', 0.6)];
    expect(volatilityRuleTriggered([bad, ok, ok, ok, ok])).toEqual({ triggered: false, horizons: 1 });
    expect(volatilityRuleTriggered([bad, bad, ok, ok, ok])).toEqual({ triggered: true, horizons: 2 });
    // środkowa grupa poza progiem nie liczy się do reguły, ale liczy się do warunku utrzymania U1b
    expect(allGroupsWithinK1([ok])).toBe(false);
    expect(allGroupsWithinK1([[band('1', 0.8), band('5', 0.74)]])).toBe(true);
  });

  it('brak pomiaru nie przekracza progu', () => {
    const missing = [band('1', 0.5, 'BRAK POMIARU'), band('5', 0.5, 'BRAK POMIARU')];
    expect(volatilityRuleTriggered([missing, missing]).triggered).toBe(false);
  });
});
