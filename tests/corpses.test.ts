import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFundamentalsAsOf, getQuoteAtDate, loadCacheToMemory, type Membership } from '../src/data-loader.js';
import { getMacroAsOf } from '../src/macro-provider.js';
import { computeMarketStats } from '../src/market-stats.js';
import { MEMBERSHIP_JSON } from '../src/paths.js';
import { mapSecToYahooSnapshot } from '../src/sec-edgar-provider.js';
import { median } from '../src/stats.js';
import { calculateFairValue, type FairValueResult } from '../src/valuation-engine.js';

/**
 * T-13 — „trupy” wyceniane WYŁĄCZNIE z danych point-in-time w cache (SEC XBRL + ceny + makro ALFRED).
 * Brak danych => test pominięty z komunikatem (pominięcie to uczciwy wynik; wpisywanie liczb z pamięci nie).
 * Grupa kontrolna: spółki, które w tych samych datach przetrwały — bez niej test „nie dawaj BUY bankrutom”
 * zaliczyłby też model, który nigdy nie daje BUY.
 */

interface Case {
  name: string;
  cik: string;
  eventDate: string;
}

const FAMOUS: Case[] = [
  { name: 'Enron', cik: '0001024401', eventDate: '2001-12-02' },
  { name: 'Lehman Brothers', cik: '0000806085', eventDate: '2008-09-15' },
  { name: 'Washington Mutual', cik: '0000933136', eventDate: '2008-09-26' },
  { name: 'Bear Stearns', cik: '0000777001', eventDate: '2008-03-16' },
  { name: 'General Motors (stara spółka)', cik: '0000040730', eventDate: '2009-06-01' },
  { name: 'SVB Financial', cik: '0000719739', eventDate: '2023-03-10' },
  { name: 'First Republic Bank', cik: '0001132979', eventDate: '2023-05-01' },
  { name: 'Signature Bank', cik: '0001288784', eventDate: '2023-03-12' },
];

const CONTROL: { name: string; cik: string }[] = [
  { name: 'Apple', cik: '0000320193' },
  { name: 'Microsoft', cik: '0000789019' },
  { name: 'Johnson & Johnson', cik: '0000200406' },
  { name: 'Procter & Gamble', cik: '0000080424' },
  { name: 'Coca-Cola', cik: '0000021344' },
];

const MIN_CORPSES_FOR_COMPARISON = 3;

/** Ostatnia kwartalna data decyzji co najmniej miesiąc przed zdarzeniem. */
function decisionDateBefore(eventDate: string): string {
  const limit = new Date(`${eventDate}T00:00:00Z`);
  limit.setUTCMonth(limit.getUTCMonth() - 1);
  const y = limit.getUTCFullYear();
  const candidates = [`${y - 1}-11-15`, `${y}-02-15`, `${y}-05-15`, `${y}-08-15`, `${y}-11-15`];
  return candidates.filter((d) => d <= limit.toISOString().slice(0, 10)).pop()!;
}

const membership = JSON.parse(fs.readFileSync(MEMBERSHIP_JSON, 'utf-8')) as Membership[];
const fromMembership: Case[] = membership
  .filter((m) => m.removal_reason === 'bankruptcy' && m.date_removed)
  .map((m) => ({ name: `${m.ticker} (bankruptcy w składzie indeksu)`, cik: String(m.cik), eventDate: m.date_removed! }));
const corpses = [...FAMOUS, ...fromMembership.filter((m) => !FAMOUS.some((f) => f.cik === m.cik))];

const cache = loadCacheToMemory({ ciks: [...new Set([...corpses.map((c) => c.cik), ...CONTROL.map((c) => c.cik)])], quiet: true });

function valuate(cik: string, asOf: string): { result: FairValueResult } | { skip: string } {
  if (!cache.fundamentals[cik]) return { skip: `Brak danych XBRL dla ${cik} na ${asOf}` };
  const quote = getQuoteAtDate(cache.prices[cik], asOf);
  if (!quote) return { skip: `Brak notowania ${cik} na ${asOf}` };
  let macro;
  try {
    macro = getMacroAsOf(cache, asOf);
  } catch (err) {
    return { skip: `Brak makro point-in-time na ${asOf} (${(err as Error).message})` };
  }
  const mapped = mapSecToYahooSnapshot({
    ticker: cik,
    cik,
    asOf,
    price: quote.close,
    facts: getFundamentalsAsOf(cache, cik, asOf)!,
    splits: cache.prices[cik].splits,
    market: computeMarketStats(cache, cik, asOf),
    sic: cache.sic[cik] ?? null,
  });
  if (!mapped.snapshot) return { skip: `Brak danych XBRL dla ${cik} na ${asOf} (${mapped.skipReason})` };
  return { result: calculateFairValue(mapped.snapshot, { macro }) };
}

describe('T-13: spółki, które upadły — dane point-in-time', () => {
  const evaluated: { c: Case; asOf: string; r: FairValueResult }[] = [];

  for (const c of corpses) {
    const asOf = decisionDateBefore(c.eventDate);
    const v = valuate(c.cik, asOf);
    if ('skip' in v) {
      it.skip(`${c.name}: ${v.skip} — test pominięty, nie zaliczony`, () => {});
      continue;
    }
    evaluated.push({ c, asOf, r: v.result });
    it(`${c.name} (${asOf}) nie dostaje werdyktu BUY`, () => {
      expect(v.result.verdict).not.toBe('BUY');
    });
  }

  if (evaluated.length < MIN_CORPSES_FOR_COMPARISON) {
    it.skip(
      `Porównanie z grupą kontrolną: dane dostępne dla ${evaluated.length} upadłych spółek (minimum ${MIN_CORPSES_FOR_COMPARISON}) — test pominięty, nie zaliczony`,
      () => {}
    );
  } else {
    it('system odróżnia upadłe spółki od grupy kontrolnej w tych samych datach', () => {
      const control = evaluated.flatMap(({ asOf }) =>
        CONTROL.map((k) => valuate(k.cik, asOf)).flatMap((v) => ('result' in v ? [v.result] : []))
      );
      expect(control.length).toBeGreaterThan(0);
      expect(median(evaluated.map((e) => e.r.confidenceScore))).toBeLessThan(median(control.map((r) => r.confidenceScore)));
      expect(median(evaluated.map((e) => e.r.upside))).toBeLessThan(median(control.map((r) => r.upside)));
    });
  }
});
