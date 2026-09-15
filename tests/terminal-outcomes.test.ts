import { describe, expect, it } from 'vitest';
import type { CompanyFacts } from '../src/data-loader.js';
import type { TerminalEvent } from '../src/sec-events.js';
import { floatImpliedPrices, terminalOutcome } from '../src/terminal-outcomes.js';

const deiFacts = (floats: [string, number][], shares: [string, number][]): CompanyFacts =>
  ({
    facts: {
      'us-gaap': {},
      dei: {
        EntityPublicFloat: { units: { USD: floats.map(([end, val]) => ({ end, val, accn: end, filedT: new Date(end).getTime() })) } },
        EntityCommonStockSharesOutstanding: {
          units: { shares: shares.map(([end, val]) => ({ end, val, accn: end, filedT: new Date(end).getTime() })) },
        },
      },
    },
  }) as unknown as CompanyFacts;

const event = (kind: TerminalEvent['kind'], date: string): TerminalEvent => ({
  kind,
  form: kind === 'bankruptcy' ? '8-K' : '25',
  filingDate: date,
  knownAt: `${date}T12:00:00.000Z`,
  knownAtT: new Date(`${date}T12:00:00.000Z`).getTime(),
  accessionNumber: `acc-${date}`,
  items: kind === 'bankruptcy' ? '1.03' : null,
});

describe('floatImpliedPrices', () => {
  it('dzieli wartość wolnego obrotu przez liczbę akcji z najbliższej daty', () => {
    const p = floatImpliedPrices(deiFacts([['2020-06-30', 1000]], [['2020-07-31', 100]]));
    expect(p).toHaveLength(1);
    expect(p[0].price).toBe(10);
  });

  it('odrzuca liczbę akcji zbyt odległą w czasie zamiast zgadywać', () => {
    expect(floatImpliedPrices(deiFacts([['2020-06-30', 1000]], [['2022-07-31', 100]]))).toHaveLength(0);
  });

  it('bez wartości wolnego obrotu nie zwraca nic', () => {
    expect(floatImpliedPrices(deiFacts([], [['2020-07-31', 100]]))).toHaveLength(0);
  });

  it('zwraca wyniki w kolejności chronologicznej', () => {
    const p = floatImpliedPrices(
      deiFacts(
        [
          ['2021-06-30', 500],
          ['2019-06-30', 2000],
          ['2020-06-30', 1000],
        ],
        [
          ['2019-06-30', 100],
          ['2020-06-30', 100],
          ['2021-06-30', 100],
        ]
      )
    );
    expect(p.map((x) => x.date)).toEqual(['2019-06-30', '2020-06-30', '2021-06-30']);
    expect(p.map((x) => x.price)).toEqual([20, 10, 5]);
  });
});

describe('terminalOutcome', () => {
  const asOfEnd = '2026-01-01';

  it('bez zdarzenia spółka jest uznana za notowaną', () => {
    const o = terminalOutcome({ events: [], floatPrices: [], lastFilingDate: '2025-12-01', asOfEnd });
    expect(o.kind).toBe('listed');
    expect(o.shareholderWipedOut).toBe(false);
  });

  it('upadłość i trwałe zaprzestanie raportowania: akcje przepadły', () => {
    const o = terminalOutcome({
      events: [event('bankruptcy', '2020-05-01')],
      floatPrices: [],
      lastFilingDate: '2020-11-01',
      asOfEnd,
    });
    expect(o.kind).toBe('bankruptcy_stopped_filing');
    expect(o.shareholderWipedOut).toBe(true);
    expect(o.basis).toBe('stopped_filing');
  });

  it('upadłość przy dalszym raportowaniu zostaje nierozstrzygnięta, a nie zgadnięta', () => {
    const o = terminalOutcome({
      events: [event('bankruptcy', '2020-05-01')],
      floatPrices: [],
      lastFilingDate: '2025-12-15',
      asOfEnd,
    });
    expect(o.kind).toBe('bankruptcy_still_filing');
    expect(o.shareholderWipedOut).toBeNull();
  });

  it('ogromny wzrost kursu po reorganizacji nie zmienia rozstrzygnięcia — liczba akcji się zmieniła', () => {
    const fp = floatImpliedPrices(
      deiFacts(
        [
          ['2019-06-30', 1000],
          ['2021-06-30', 5000],
        ],
        [
          ['2019-06-30', 1000],
          ['2021-06-30', 50],
        ]
      )
    );
    const o = terminalOutcome({ events: [event('bankruptcy', '2020-05-01')], floatPrices: fp, lastFilingDate: '2025-12-01', asOfEnd });
    expect(o.priceBefore).toBe(1);
    expect(o.priceAfter).toBe(100);
    expect(o.perShareComparable).toBe(false);
    expect(o.shareholderWipedOut).toBeNull();
  });

  it('gdy liczba akcji się nie zmieniła, porównanie kursu jest oznaczone jako sensowne', () => {
    const fp = floatImpliedPrices(
      deiFacts(
        [
          ['2019-06-30', 1000],
          ['2021-06-30', 700],
        ],
        [
          ['2019-06-30', 100],
          ['2021-06-30', 100],
        ]
      )
    );
    const o = terminalOutcome({ events: [event('bankruptcy', '2020-05-01')], floatPrices: fp, lastFilingDate: '2025-12-01', asOfEnd });
    expect(o.perShareComparable).toBe(true);
    expect(o.sharesChange).toBe(0);
  });

  it('samo wycofanie z giełdy bez upadłości nie jest traktowane jak upadłość', () => {
    const o = terminalOutcome({
      events: [event('exchange_delisting', '2020-05-01')],
      floatPrices: [],
      lastFilingDate: '2020-06-01',
      asOfEnd,
    });
    expect(o.kind).toBe('delisted_no_bankruptcy');
    expect(o.shareholderWipedOut).toBeNull();
  });

  it('upadłość ma pierwszeństwo przed późniejszym wycofaniem z giełdy jako zdarzenie wyjściowe', () => {
    const o = terminalOutcome({
      events: [event('exchange_delisting', '2020-09-01'), event('bankruptcy', '2020-05-01')],
      floatPrices: [],
      lastFilingDate: '2020-10-01',
      asOfEnd,
    });
    expect(o.eventKind).toBe('bankruptcy');
    expect(o.eventDate).toBe('2020-05-01');
  });
});
