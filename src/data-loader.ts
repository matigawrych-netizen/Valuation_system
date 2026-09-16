import fs from 'node:fs';
import path from 'node:path';
import { ACCN_MAP_JSON, DATA_DIR, MEMBERSHIP_JSON } from './paths.js';

export const DAY_MS = 86_400_000;
/** Notowanie starsze niż tyle dni od daty zapytania traktujemy jako brak ceny (delisting / luka w danych). */
export const MAX_QUOTE_STALENESS_DAYS = 10;

export interface Quote {
  date: string;
  t: number;
  close: number;
  adj: number;
}

export interface Split {
  date: string;
  t: number;
  numerator: number;
  denominator: number;
}

export interface PriceSeries {
  quotes: Quote[];
  splits: Split[];
}

export interface Fact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
  filedT: number;
}

export type Taxonomy = 'us-gaap' | 'dei';
export type ConceptMap = Record<string, { units: Record<string, Fact[]> }>;
export interface CompanyFacts {
  facts: Record<Taxonomy, ConceptMap>;
}

export interface Membership {
  cik: string;
  ticker: string;
  date_added: string | null;
  date_removed: string | null;
  removal_reason: string | null;
}

export interface ParsedCache {
  ciks: string[];
  cikToTicker: Record<string, string>;
  membership: Membership[];
  membershipByCik: Record<string, Membership[]>;
  prices: Record<string, PriceSeries>;
  fundamentals: Record<string, CompanyFacts>;
  sic: Record<string, number | null>;
  macro: Record<string, PriceSeries>;
  globalAccnMap: Record<string, number>;
  stats: { droppedMissingAccn: number; keptWithAccn: number; ciksWithoutFundamentals: number; ciksWithoutPrices: number };
}

/** Koncepty US-GAAP ładowane do pamięci. Warianty nazw są obsługiwane w src/xbrl.ts przez listy fallbacków. */
export const US_GAAP_CONCEPTS = [
  // Rachunek wyników
  'Revenues',
  'SalesRevenueNet',
  'SalesRevenueGoodsNet',
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'CostOfGoodsAndServicesSold',
  'CostOfRevenue',
  'CostOfGoodsSold',
  'SellingGeneralAndAdministrativeExpense',
  'OperatingIncomeLoss',
  'NetIncomeLoss',
  'ProfitLoss',
  'IncomeLossFromContinuingOperations',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  'IncomeTaxExpenseBenefit',
  'InterestExpense',
  'DepreciationDepletionAndAmortization',
  'DepreciationAndAmortization',
  'DepreciationAmortizationAndAccretionNet',
  'Depreciation',
  // Bilans
  'Assets',
  'AssetsCurrent',
  'Liabilities',
  'LiabilitiesCurrent',
  'LiabilitiesAndStockholdersEquity',
  'StockholdersEquity',
  'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  'RetainedEarningsAccumulatedDeficit',
  'CashAndCashEquivalentsAtCarryingValue',
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
  'AccountsReceivableNetCurrent',
  'InventoryNet',
  'PropertyPlantAndEquipmentNet',
  'LongTermDebt',
  'LongTermDebtNoncurrent',
  'LongTermDebtCurrent',
  'DebtCurrent',
  'ShortTermBorrowings',
  'CommercialPaper',
  'AccumulatedOtherComprehensiveIncomeLossNetOfTax',
  'HeldToMaturitySecurities',
  'HeldToMaturitySecuritiesFairValue',
  'CommonStockSharesOutstanding',
  'WeightedAverageNumberOfDilutedSharesOutstanding',
  // Przepływy
  'NetCashProvidedByUsedInOperatingActivities',
  'NetCashProvidedByOperatingActivities',
  'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'PaymentsToAcquireProductiveAssets',
  'PaymentsOfDividendsCommonStock',
  'PaymentsOfDividends',
  'DividendsCommonStockCash',
  'DividendsCommonStock',
  'FreeCashFlow',
] as const;

/** Koncepty z taksonomii `dei` (strona tytułowa raportu). Liczba akcji jest TYLKO tutaj, nie w us-gaap. */
export const DEI_CONCEPTS = ['EntityCommonStockSharesOutstanding'] as const;

export function slimQuotes(raw: any[]): Quote[] {
  const out: Quote[] = [];
  for (const q of raw ?? []) {
    if (q?.close == null || !Number.isFinite(q.close)) continue;
    const adj = q.adjclose != null && Number.isFinite(q.adjclose) ? q.adjclose : q.close;
    out.push({ date: q.date, t: new Date(q.date).getTime(), close: q.close, adj });
  }
  return out.sort((a, b) => a.t - b.t);
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export function slimTaxonomy(
  source: ConceptMap | undefined,
  concepts: readonly string[],
  accnMap: Record<string, number>,
  stats: ParsedCache['stats']
): ConceptMap {
  const out: ConceptMap = {};
  if (!source) return out;
  for (const key of concepts) {
    const item = source[key];
    if (!item?.units) continue;
    const unitsObj: Record<string, Fact[]> = {};
    for (const unitKey of Object.keys(item.units)) {
      const kept: Fact[] = [];
      for (const u of item.units[unitKey] as any[]) {
        const acceptedT = accnMap[u.accn];
        if (!acceptedT) {
          stats.droppedMissingAccn++;
          continue;
        }
        stats.keptWithAccn++;
        kept.push({ ...u, filedT: acceptedT });
      }
      if (kept.length > 0) unitsObj[unitKey] = kept;
    }
    if (Object.keys(unitsObj).length > 0) out[key] = { units: unitsObj };
  }
  return out;
}

/**
 * Wczytuje cache do pamięci (~40 s, kilka GB RAM dla pełnego uniwersum).
 * `options.ciks` ogranicza ładowanie do podanych spółek (np. w testach).
 */
export function loadCacheToMemory(options: { ciks?: string[]; quiet?: boolean } = {}): ParsedCache {
  const cache: ParsedCache = {
    ciks: [],
    cikToTicker: {},
    membership: [],
    membershipByCik: {},
    prices: {},
    fundamentals: {},
    sic: {},
    macro: {},
    globalAccnMap: {},
    stats: { droppedMissingAccn: 0, keptWithAccn: 0, ciksWithoutFundamentals: 0, ciksWithoutPrices: 0 },
  };

  if (!fs.existsSync(MEMBERSHIP_JSON)) {
    throw new Error(`Brak ${MEMBERSHIP_JSON} — bez składu indeksu point-in-time nie da się zbudować uniwersum.`);
  }
  cache.membership = (readJson(MEMBERSHIP_JSON) as Membership[]).map((m) => ({ ...m, cik: String(m.cik) }));
  for (const m of cache.membership) {
    (cache.membershipByCik[m.cik] ??= []).push(m);
    if (!cache.cikToTicker[m.cik]) cache.cikToTicker[m.cik] = m.ticker;
  }

  const wanted = options.ciks ?? [...new Set(cache.membership.map((m) => m.cik))];
  cache.ciks = [...new Set(wanted)];

  if (!fs.existsSync(ACCN_MAP_JSON)) {
    throw new Error(`Brak ${ACCN_MAP_JSON} — bez dat akceptacji raportów filtr point-in-time nie działa (look-ahead bias).`);
  }
  cache.globalAccnMap = readJson(ACCN_MAP_JSON);

  for (const cik of cache.ciks) {
    const pPath = path.join(DATA_DIR, 'prices', `CIK${cik}.json`);
    if (fs.existsSync(pPath)) {
      const p = readJson(pPath);
      if (!p.error) {
        cache.prices[cik] = {
          quotes: slimQuotes(p.quotes),
          splits: (p.events?.splits ?? []).map((s: any) => ({
            date: s.date,
            t: new Date(s.date).getTime(),
            numerator: s.numerator,
            denominator: s.denominator,
          })),
        };
      }
    }
    if (!cache.prices[cik]) cache.stats.ciksWithoutPrices++;

    const fPath = path.join(DATA_DIR, 'fundamentals', `CIK${cik}.json`);
    if (fs.existsSync(fPath)) {
      const f = readJson(fPath);
      if (!f.error && f.facts?.['us-gaap']) {
        cache.fundamentals[cik] = {
          facts: {
            'us-gaap': slimTaxonomy(f.facts['us-gaap'], US_GAAP_CONCEPTS, cache.globalAccnMap, cache.stats),
            dei: slimTaxonomy(f.facts.dei, DEI_CONCEPTS, cache.globalAccnMap, cache.stats),
          },
        };
      }
    }
    if (!cache.fundamentals[cik]) cache.stats.ciksWithoutFundamentals++;

    const sPath = path.join(DATA_DIR, 'submissions', `CIK${cik}.json`);
    if (fs.existsSync(sPath)) {
      const s = readJson(sPath);
      const sic = Number(s.sic);
      cache.sic[cik] = Number.isFinite(sic) && sic > 0 ? sic : null;
    } else {
      cache.sic[cik] = null;
    }
  }

  for (const m of ['VIX', 'CL', 'GC', 'GSPC', 'TNX']) {
    const mPath = path.join(DATA_DIR, 'macro', `${m}.json`);
    if (fs.existsSync(mPath)) {
      cache.macro[m] = { quotes: slimQuotes(readJson(mPath).quotes), splits: [] };
    }
  }

  if (!options.quiet) {
    const { keptWithAccn: kept, droppedMissingAccn: dropped } = cache.stats;
    const total = kept + dropped;
    const pct = total > 0 ? (dropped / total) * 100 : 0;
    console.error(`accnMap: ${kept} faktów zachowanych, ${dropped} odrzuconych (${pct.toFixed(1)}%)`);
    console.error(
      `cache: ${cache.ciks.length} CIK, bez fundamentów: ${cache.stats.ciksWithoutFundamentals}, bez cen: ${cache.stats.ciksWithoutPrices}`
    );
  }
  return cache;
}

/** Oś czasu: `year`/`quarter` = kwartał fiskalny, `dateStr` = data decyzji (koniec kwartału + ~45 dni). */
export function buildQuarterlyTimeline(startYear: number, endYear: number) {
  const quarters: { year: number; quarter: number; dateStr: string }[] = [];
  for (let year = startYear; year <= endYear; year++) {
    quarters.push({ year, quarter: 1, dateStr: `${year}-05-15` });
    quarters.push({ year, quarter: 2, dateStr: `${year}-08-15` });
    quarters.push({ year, quarter: 3, dateStr: `${year}-11-15` });
    quarters.push({ year, quarter: 4, dateStr: `${year + 1}-02-15` });
  }
  return quarters;
}

/** Indeks ostatniego notowania z t <= targetT (albo -1). */
export function lastQuoteIndexAtOrBefore(quotes: Quote[], targetT: number): number {
  let lo = 0;
  let hi = quotes.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (quotes[mid].t <= targetT) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Notowanie z dnia `dateStr` lub ostatniej sesji przed nim; null gdy ostatnie notowanie jest starsze niż `maxStaleDays`. */
export function getQuoteAtDate(
  series: PriceSeries | undefined,
  dateStr: string,
  maxStaleDays = MAX_QUOTE_STALENESS_DAYS
): Quote | null {
  if (!series?.quotes?.length) return null;
  // Koniec dnia UTC — notowanie z tej samej daty jest dostępne na zamknięciu sesji.
  const targetT = new Date(`${dateStr.slice(0, 10)}T23:59:59Z`).getTime();
  const idx = lastQuoteIndexAtOrBefore(series.quotes, targetT);
  if (idx < 0) return null;
  const q = series.quotes[idx];
  if (targetT - q.t > maxStaleDays * DAY_MS) return null;
  return q;
}

export function getPriceAtDate(series: PriceSeries | undefined, dateStr: string, maxStaleDays = MAX_QUOTE_STALENESS_DAYS) {
  return getQuoteAtDate(series, dateStr, maxStaleDays)?.close ?? null;
}

export function getAdjCloseAtDate(series: PriceSeries | undefined, dateStr: string, maxStaleDays = MAX_QUOTE_STALENESS_DAYS) {
  return getQuoteAtDate(series, dateStr, maxStaleDays)?.adj ?? null;
}

/**
 * Fakty XBRL znane publicznie w dniu `dateStr`: zostają tylko te, których raport został
 * przyjęty przez EDGAR przed zamknięciem sesji z dnia decyzji.
 */
export function getFundamentalsAsOf(cache: ParsedCache, cik: string, dateStr: string): CompanyFacts | null {
  const all = cache.fundamentals[cik];
  if (!all) return null;
  return factsKnownAt(all, cache.prices[cik], dateStr);
}

/** Jak `getFundamentalsAsOf`, ale dla jednej spółki wczytanej osobno (bez całego cache w pamięci). */
export function factsKnownAt(all: CompanyFacts, prices: PriceSeries | undefined, dateStr: string): CompanyFacts {
  const quote = getQuoteAtDate(prices, dateStr);
  const cutoffT = quote ? quote.t : new Date(`${dateStr.slice(0, 10)}T00:00:00Z`).getTime();

  const filterTaxonomy = (tax: ConceptMap): ConceptMap => {
    const out: ConceptMap = {};
    for (const concept of Object.keys(tax)) {
      const units: Record<string, Fact[]> = {};
      for (const unitKey of Object.keys(tax[concept].units)) {
        const available = tax[concept].units[unitKey].filter((f) => f.filedT < cutoffT);
        if (available.length) units[unitKey] = available;
      }
      if (Object.keys(units).length) out[concept] = { units };
    }
    return out;
  };

  return { facts: { 'us-gaap': filterTaxonomy(all.facts['us-gaap']), dei: filterTaxonomy(all.facts.dei ?? {}) } };
}

/** Skład indeksu point-in-time na dzień `dateStr`. */
export function getUniverseAsOf(cache: ParsedCache, dateStr: string): string[] {
  const t = new Date(dateStr).getTime();
  const active = new Set<string>();
  for (const m of cache.membership) {
    const added = m.date_added ? new Date(m.date_added).getTime() : -Infinity;
    const removed = m.date_removed ? new Date(m.date_removed).getTime() : Infinity;
    if (added <= t && t < removed) active.add(m.cik);
  }
  return [...active];
}
