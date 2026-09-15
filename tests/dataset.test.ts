import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DATASET_COLUMNS, parseCSV } from '../src/dataset.js';

const TEST_FILE = path.join(os.tmpdir(), `dataset-test-${process.pid}.csv`);

function csvRow(values: Record<string, string>): string {
  return DATASET_COLUMNS.map((c) => values[c] ?? '').join(',');
}

describe('parseCSV', () => {
  afterEach(() => {
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
  });

  it('zwraca poprawne, różne daty i CIK', () => {
    const common = { sector: 'Manufacturing', price: '100', fwdReturn12m: '0.1', dominantArchetype: 'VALUE_COMPOUNDER', GRAHAM_NUMBER: '90' };
    fs.writeFileSync(
      TEST_FILE,
      [
        DATASET_COLUMNS.join(','),
        csvRow({ ...common, ticker: 'AAPL', cik: '0000320193', asOf: '2023-05-15' }),
        csvRow({ ...common, ticker: 'MSFT', cik: '0000789019', asOf: '2023-08-15' }),
        csvRow({ ...common, ticker: 'KO', cik: '0000021344', asOf: '2023-11-15' }),
      ].join('\n')
    );
    const rows = parseCSV(TEST_FILE);
    expect(rows.map((r) => r.asOf)).toEqual(['2023-05-15', '2023-08-15', '2023-11-15']);
    expect(rows.map((r) => r.cik)).toEqual(['0000320193', '0000789019', '0000021344']);
    expect(rows[0].blocks.BLOK_ASSETS).toBe(90);
    expect(rows[0].models.DCF).toBeUndefined();
  });

  it('brak wymaganej kolumny => wyjątek z nazwą kolumny', () => {
    const header = DATASET_COLUMNS.filter((c) => c !== 'fwdReturn12m' && c !== 'DCF');
    fs.writeFileSync(TEST_FILE, `${header.join(',')}\n`);
    expect(() => parseCSV(TEST_FILE)).toThrowError(/Brakujące kolumny w pliku CSV: fwdReturn12m, DCF/);
  });

  it('"NaN" w kolumnie liczbowej => wyjątek (dawniej trafiało do datasetu)', () => {
    fs.writeFileSync(
      TEST_FILE,
      [DATASET_COLUMNS.join(','), csvRow({ ticker: 'X', cik: '1', asOf: '2020-05-15', price: '1', fwdReturn12m: '0.1', dominantArchetype: 'A', DDM: 'NaN' })].join('\n')
    );
    expect(() => parseCSV(TEST_FILE)).toThrowError(/DDM = "NaN"/);
  });

  it('pusta etykieta => wyjątek, nie zero', () => {
    fs.writeFileSync(
      TEST_FILE,
      [DATASET_COLUMNS.join(','), csvRow({ ticker: 'X', cik: '1', asOf: '2020-05-15', price: '1', dominantArchetype: 'A' })].join('\n')
    );
    expect(() => parseCSV(TEST_FILE)).toThrowError(/fwdReturn12m/);
  });
});
