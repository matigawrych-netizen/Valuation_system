import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  baseForm,
  classifyFiling,
  companyEvents,
  extractTerminalEvents,
  loadFilings,
  parseItems,
  type Filing,
} from '../src/sec-events.js';

const filing = (over: Partial<Filing> = {}): Filing => ({
  form: '8-K',
  filingDate: '2020-05-15',
  acceptanceDateTime: '2020-05-15T16:30:00.000Z',
  items: '',
  accessionNumber: `acc-${Math.random().toString(36).slice(2)}`,
  reportDate: null,
  ...over,
});

describe('baseForm', () => {
  it('ucina aneks, żeby 8-K/A liczyło się jak 8-K', () => {
    expect(baseForm('8-K/A')).toBe('8-K');
    expect(baseForm(' 25-nse ')).toBe('25-NSE');
  });
});

describe('parseItems', () => {
  it('dzieli po przecinku i przycina spacje', () => {
    expect(parseItems('1.03, 9.01')).toEqual(['1.03', '9.01']);
  });

  it('pusty lub brakujący ciąg daje pustą listę', () => {
    expect(parseItems('')).toEqual([]);
    expect(parseItems(null)).toEqual([]);
  });

  it('porównuje całe tokeny — 1.031 to nie jest punkt 1.03', () => {
    expect(parseItems('1.031')).not.toContain('1.03');
  });
});

describe('classifyFiling', () => {
  it('8-K z punktem 1.03 to upadłość', () => {
    expect(classifyFiling(filing({ items: '1.03,9.01' }))).toBe('bankruptcy');
  });

  it('8-K z punktem 3.01 to zawiadomienie o wycofaniu', () => {
    expect(classifyFiling(filing({ items: '3.01' }))).toBe('delisting_notice');
  });

  it('gdy są oba punkty, upadłość ma pierwszeństwo', () => {
    expect(classifyFiling(filing({ items: '3.01,1.03' }))).toBe('bankruptcy');
  });

  it('8-K bez punktów końcowych nie jest zdarzeniem', () => {
    expect(classifyFiling(filing({ items: '2.02,9.01' }))).toBeNull();
  });

  it('formularz 25 i 25-NSE to wycofanie z giełdy', () => {
    expect(classifyFiling(filing({ form: '25', items: '' }))).toBe('exchange_delisting');
    expect(classifyFiling(filing({ form: '25-NSE', items: '' }))).toBe('exchange_delisting');
  });

  it('formularz 15 to koniec obowiązku raportowania', () => {
    for (const f of ['15-12B', '15-12G', '15-15D', '15F-12B']) {
      expect(classifyFiling(filing({ form: f, items: '' }))).toBe('deregistration');
    }
  });

  it('zwykły raport okresowy nie jest zdarzeniem końcowym', () => {
    expect(classifyFiling(filing({ form: '10-K', items: '' }))).toBeNull();
    expect(classifyFiling(filing({ form: '4', items: '' }))).toBeNull();
  });
});

describe('extractTerminalEvents', () => {
  it('sortuje po dacie, od której informacja była publiczna', () => {
    const events = extractTerminalEvents([
      filing({ form: '25', items: '', acceptanceDateTime: '2021-01-10T12:00:00.000Z', filingDate: '2021-01-10' }),
      filing({ items: '1.03', acceptanceDateTime: '2020-06-01T12:00:00.000Z', filingDate: '2020-06-01' }),
    ]);
    expect(events.map((e) => e.kind)).toEqual(['bankruptcy', 'exchange_delisting']);
  });

  it('gdy brak znacznika akceptacji, używa daty złożenia', () => {
    const [e] = extractTerminalEvents([filing({ items: '1.03', acceptanceDateTime: null, filingDate: '2019-03-04' })]);
    expect(e.knownAt.slice(0, 10)).toBe('2019-03-04');
  });

  it('nie zgaduje daty — nieczytalny znacznik jest błędem, nie cichą wartością', () => {
    expect(() => extractTerminalEvents([filing({ items: '1.03', acceptanceDateTime: 'brak-daty' })])).toThrow();
  });

  it('godzina akceptacji jest zachowana (formularz przyjęty po sesji nie cofa się na rano)', () => {
    const [e] = extractTerminalEvents([filing({ items: '1.03', acceptanceDateTime: '2020-06-01T21:45:00.000Z' })]);
    expect(e.knownAtT).toBe(new Date('2020-06-01T21:45:00.000Z').getTime());
  });
});

describe('loadFilings / companyEvents', () => {
  const dirs: string[] = [];
  const makeDir = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-events-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  const table = (rows: Filing[]) => ({
    form: rows.map((r) => r.form),
    filingDate: rows.map((r) => r.filingDate),
    acceptanceDateTime: rows.map((r) => r.acceptanceDateTime),
    items: rows.map((r) => r.items),
    accessionNumber: rows.map((r) => r.accessionNumber),
    reportDate: rows.map((r) => r.reportDate),
  });

  it('brak pliku to błąd, a nie pusta lista zdarzeń', () => {
    expect(() => loadFilings('0000000001', makeDir())).toThrow(/Brak listy formularzy/);
  });

  it('łączy stronę główną ze stronami archiwalnymi', () => {
    const dir = makeDir();
    const recent = [filing({ form: '25', items: '', filingDate: '2021-02-01', acceptanceDateTime: '2021-02-01T12:00:00.000Z' })];
    const older = [filing({ items: '1.03', filingDate: '2020-06-01', acceptanceDateTime: '2020-06-01T12:00:00.000Z' })];
    fs.writeFileSync(
      path.join(dir, 'CIK0000000123.json'),
      JSON.stringify({ filings: { recent: table(recent), files: [{ name: 'CIK0000000123-submissions-001.json' }] } })
    );
    fs.writeFileSync(path.join(dir, 'CIK0000000123-submissions-001.json'), JSON.stringify(table(older)));

    const ev = companyEvents('0000000123', dir);
    expect(ev.filingCount).toBe(2);
    expect(ev.events.map((e) => e.kind)).toEqual(['bankruptcy', 'exchange_delisting']);
    expect(ev.lastFilingDate).toBe('2021-02-01');
  });

  it('pomija strony archiwalne wymienione w indeksie, ale nieobecne na dysku', () => {
    const dir = makeDir();
    fs.writeFileSync(
      path.join(dir, 'CIK0000000124.json'),
      JSON.stringify({ filings: { recent: table([filing({ form: '10-K', items: '' })]), files: [{ name: 'brakujaca.json' }] } })
    );
    expect(companyEvents('0000000124', dir).filingCount).toBe(1);
  });
});
