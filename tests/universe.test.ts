import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exclusionReason, listingOf, yahooSymbol } from '../src/universe.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function submissions(cik: string, body: { sic?: string; forms?: string[]; tickers?: string[]; exchanges?: (string | null)[] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'universe-'));
  dirs.push(dir);
  const forms = body.forms ?? ['10-K'];
  fs.writeFileSync(
    path.join(dir, `CIK${cik}.json`),
    JSON.stringify({
      name: 'Test Co',
      sic: body.sic ?? '3571',
      tickers: body.tickers ?? [],
      exchanges: body.exchanges ?? [],
      filings: {
        recent: {
          form: forms,
          filingDate: forms.map(() => '2020-02-01'),
          acceptanceDateTime: forms.map(() => '2020-02-01T12:00:00.000Z'),
          items: forms.map(() => ''),
          accessionNumber: forms.map((_, i) => `acc-${i}`),
          reportDate: forms.map(() => null),
        },
        files: [],
      },
    })
  );
  return dir;
}

describe('yahooSymbol', () => {
  it('zamienia kropkę klasy akcji na myślnik, jak w Yahoo', () => {
    expect(yahooSymbol('BRK.B')).toBe('BRK-B');
    expect(yahooSymbol(' aapl ')).toBe('AAPL');
  });
});

describe('exclusionReason', () => {
  it('spółka składająca 10-K przechodzi', () => {
    expect(exclusionReason('0000000001', submissions('0000000001', { forms: ['8-K', '10-K'] }))).toBeNull();
  });

  it('spółka zagraniczna raportująca tylko na 20-F odpada', () => {
    expect(exclusionReason('0000000002', submissions('0000000002', { forms: ['20-F', '6-K'] }))).toMatch(/10-K/);
  });

  it('SPAC odpada, nawet jeśli składa 10-K', () => {
    expect(exclusionReason('0000000003', submissions('0000000003', { sic: '6770' }))).toMatch(/SPAC/);
  });

  it('brak listy formularzy to powód odrzucenia, a nie cicha akceptacja', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'universe-empty-'));
    dirs.push(dir);
    expect(exclusionReason('0000000004', dir)).toBe('brak listy formularzy');
  });

  it('aneks do raportu rocznego też się liczy', () => {
    expect(exclusionReason('0000000005', submissions('0000000005', { forms: ['10-K/A'] }))).toBeNull();
  });
});

describe('listingOf', () => {
  it('wybiera ticker z NYSE albo Nasdaq, pomijając inne giełdy', () => {
    const dir = submissions('0000000006', { tickers: ['ABCDF', 'ABC'], exchanges: ['OTC', 'NYSE'] });
    const l = listingOf('0000000006', dir);
    expect(l.ticker).toBe('ABC');
    expect(l.exchange).toBe('NYSE');
  });

  it('spółka notowana tylko poza NYSE/Nasdaq nie dostaje tickera', () => {
    const dir = submissions('0000000007', { tickers: ['XYZF'], exchanges: ['OTC'] });
    const l = listingOf('0000000007', dir);
    expect(l.ticker).toBeNull();
    expect(l.all).toHaveLength(1);
  });

  it('spółka, której już nie ma, nie ma tickera', () => {
    const l = listingOf('0000000008', submissions('0000000008', {}));
    expect(l.ticker).toBeNull();
    expect(l.all).toHaveLength(0);
  });
});
