/**
 * Co naprawdę stało się z akcjonariuszami spółki, która zniknęła z giełdy.
 *
 * Problem 1: Yahoo nie przechowuje notowań spółek wycofanych z obrotu (sprawdzone: LEH, RSH, EK, FTR,
 * DF, RAD, SIVB, DNR, ESV, BIG, MNK, ENDP — wszystkie bez danych), a część tickerów przypisano później
 * innym firmom (SHLD, BTU zwracają notowania nowych spółek).
 *
 * Problem 2: samo zgłoszenie 8-K punkt 1.03 nie wystarcza. EDGAR oznacza tak również upadłości spółek
 * zależnych i zatwierdzenia układu przy wychodzeniu z upadłości — dlatego wśród zgłoszeń są Duke Energy,
 * AT&T czy Gannett, które nie upadły.
 *
 * Problem 3: po reorganizacji stare akcje są zwykle umarzane, a wierzyciele dostają nowe. Kurs jednej
 * akcji przed i po jest więc nieporównywalny (zmierzone: DNR „+27875%”, ESV „+4724%” — to nie zysk
 * dawnego akcjonariusza, tylko inna spółka pod tym samym numerem CIK).
 *
 * Dlatego rozstrzygamy tylko to, co wynika z danych, i nazywamy wprost, czego nie da się rozstrzygnąć:
 *  • upadłość + trwałe zaprzestanie raportowania  → akcje przepadły (wysoka pewność),
 *  • upadłość + dalsze raportowanie               → losu dawnych akcjonariuszy nie da się ustalić
 *                                                   z darmowych danych ustrukturyzowanych.
 *
 * Przybliżony kurs (`dei:EntityPublicFloat` / liczba akcji) zostaje jako informacja pomocnicza.
 * Zmierzony na spółkach, dla których mamy jedno i drugie: mediana błędu −0,2%, 83% w granicach ±15%.
 */
import type { CompanyFacts } from './data-loader.js';
import type { TerminalEvent } from './sec-events.js';

export interface FloatPrice {
  /** Dzień, na który wyceniono akcje w rękach inwestorów niezwiązanych ze spółką. */
  date: string;
  t: number;
  /** Dzień, w którym informacja stała się publiczna. */
  filedT: number;
  price: number;
  float: number;
  shares: number;
}

/** Maksymalny odstęp między datą wyceny float a datą raportu liczby akcji. */
const MAX_SHARES_GAP_DAYS = 200;
const DAY = 86_400_000;

function factsOf(companyFacts: CompanyFacts, concept: string): { end: string; val: number; filed?: string; filedT?: number }[] {
  const item = (companyFacts.facts as any)?.dei?.[concept];
  if (!item?.units) return [];
  const out: { end: string; val: number; filed?: string; filedT?: number }[] = [];
  for (const unit of Object.keys(item.units)) for (const f of item.units[unit]) out.push(f);
  return out;
}

/** Przybliżenie kursu z raportów rocznych: wartość akcji w wolnym obrocie / liczba akcji. */
export function floatImpliedPrices(companyFacts: CompanyFacts): FloatPrice[] {
  const floats = factsOf(companyFacts, 'EntityPublicFloat');
  const shares = factsOf(companyFacts, 'EntityCommonStockSharesOutstanding');
  if (!floats.length || !shares.length) return [];

  const out: FloatPrice[] = [];
  const seen = new Set<string>();
  for (const f of floats) {
    if (!Number.isFinite(f.val) || f.val <= 0 || seen.has(f.end)) continue;
    const t = new Date(f.end).getTime();
    if (!Number.isFinite(t)) continue;

    let best: { gap: number; val: number } | null = null;
    for (const s of shares) {
      if (!Number.isFinite(s.val) || s.val <= 0) continue;
      const gap = Math.abs(new Date(s.end).getTime() - t);
      if (!Number.isFinite(gap)) continue;
      if (!best || gap < best.gap) best = { gap, val: s.val };
    }
    if (!best || best.gap > MAX_SHARES_GAP_DAYS * DAY) continue;

    seen.add(f.end);
    const filedT = f.filedT ?? (f.filed ? new Date(f.filed).getTime() : t);
    out.push({ date: f.end, t, filedT, price: f.val / best.val, float: f.val, shares: best.val });
  }
  return out.sort((a, b) => a.t - b.t);
}

export type OutcomeKind =
  /** Brak zdarzenia końcowego. */
  | 'listed'
  /** Upadłość i trwałe zaprzestanie raportowania — akcje dawnych właścicieli przepadły. */
  | 'bankruptcy_stopped_filing'
  /** Upadłość, ale spółka dalej raportuje — losu dawnych akcji nie da się tu ustalić. */
  | 'bankruptcy_still_filing'
  /** Zniknięcie z giełdy bez upadłości — najczęściej przejęcie. */
  | 'delisted_no_bankruptcy'
  /** Zdarzenie jest, ale za mało danych, by cokolwiek powiedzieć. */
  | 'unknown';

export interface TerminalOutcome {
  kind: OutcomeKind;
  /** Czy akcjonariusz stracił praktycznie wszystko. `null` = nie da się ustalić z tych danych. */
  shareholderWipedOut: boolean | null;
  eventDate: string | null;
  eventKind: TerminalEvent['kind'] | null;
  /** Przybliżony kurs przed zdarzeniem i po nim — informacyjnie, NIE podstawa klasyfikacji. */
  priceBefore: number | null;
  priceAfter: number | null;
  /** Zmiana liczby akcji między tymi pomiarami. Duża zmiana = emisja nowych akcji po reorganizacji. */
  sharesChange: number | null;
  /** Czy porównanie kursu jednej akcji ma w ogóle sens (liczba akcji się nie zmieniła istotnie). */
  perShareComparable: boolean;
  basis: 'stopped_filing' | 'still_filing' | 'no_event' | 'no_measurement';
  lastFilingDate: string | null;
  /**
   * Ile dni po upadłości spółka zdjęła papiery z giełdy (formularz 25) i wyrejestrowała je (formularz 15).
   * Wyłącznie kontekst do oceny ręcznej: te formularze dotyczą także obligacji i akcji uprzywilejowanych,
   * więc sama ich obecność nie dowodzi, że umorzono akcje zwykłe.
   */
  daysToExchangeDelisting: number | null;
  daysToDeregistration: number | null;
}

/** Powyżej tej zmiany liczby akcji uznajemy, że to już inna struktura właścicielska. */
export const MAX_COMPARABLE_SHARES_CHANGE = 0.5;
/** Ile lat bez raportu uznajemy za trwałe zaprzestanie raportowania. */
export const STOPPED_FILING_YEARS = 2;

export interface OutcomeInput {
  events: TerminalEvent[];
  floatPrices: FloatPrice[];
  lastFilingDate: string | null;
  /** Data, na którą oceniamy (koniec dostępnych danych). */
  asOfEnd: string;
}

export function terminalOutcome(input: OutcomeInput): TerminalOutcome {
  const { events, floatPrices, lastFilingDate, asOfEnd } = input;
  const bankruptcy = events.find((e) => e.kind === 'bankruptcy') ?? null;
  const delisting = events.find((e) => e.kind === 'exchange_delisting') ?? null;
  const trigger = bankruptcy ?? delisting;

  const before = trigger ? (floatPrices.filter((p) => p.t <= trigger.knownAtT).pop() ?? null) : null;
  const after = trigger ? (floatPrices.find((p) => p.t > trigger.knownAtT) ?? null) : null;
  const sharesChange = before && after && before.shares > 0 ? after.shares / before.shares - 1 : null;

  const daysAfter = (kind: TerminalEvent['kind']) => {
    if (!trigger) return null;
    const next = events.find((e) => e.kind === kind && e.knownAtT > trigger.knownAtT);
    return next ? Math.round((next.knownAtT - trigger.knownAtT) / DAY) : null;
  };

  const common = {
    daysToExchangeDelisting: daysAfter('exchange_delisting'),
    daysToDeregistration: daysAfter('deregistration'),
    eventDate: trigger ? trigger.knownAt.slice(0, 10) : null,
    eventKind: trigger ? trigger.kind : null,
    priceBefore: before?.price ?? null,
    priceAfter: after?.price ?? null,
    sharesChange,
    perShareComparable: sharesChange != null && Math.abs(sharesChange) <= MAX_COMPARABLE_SHARES_CHANGE,
    lastFilingDate,
  };

  if (!trigger) {
    return { ...common, kind: 'listed', shareholderWipedOut: false, basis: 'no_event' };
  }

  const stoppedFiling =
    lastFilingDate != null &&
    new Date(asOfEnd).getTime() - new Date(lastFilingDate).getTime() > STOPPED_FILING_YEARS * 365 * DAY;

  if (bankruptcy) {
    return stoppedFiling
      ? { ...common, kind: 'bankruptcy_stopped_filing', shareholderWipedOut: true, basis: 'stopped_filing' }
      : { ...common, kind: 'bankruptcy_still_filing', shareholderWipedOut: null, basis: 'still_filing' };
  }

  return { ...common, kind: 'delisted_no_bankruptcy', shareholderWipedOut: null, basis: 'no_measurement' };
}
