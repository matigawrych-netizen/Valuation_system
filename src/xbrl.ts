import { DAY_MS, type CompanyFacts, type Fact, type Taxonomy } from './data-loader.js';

/**
 * Odczyt faktów XBRL (companyfacts) przefiltrowanych point-in-time.
 *
 * Ważne różnice względem dawnego mappera:
 *  - `fy`/`fp` w companyfacts opisują RAPORT, w którym fakt się pojawił, a nie okres faktu
 *    (10-K za 2023 zawiera też liczby za 2022 z fy=2023). Dlatego okresy liczymy z dat start/end.
 *  - TTM = roczny + YTD bieżący − YTD rok wcześniej (albo suma 4 kolejnych kwartałów).
 *    Nigdy „pojedynczy kwartał × 4” i nigdy wartość FY doliczana jako Q4.
 */

export interface XbrlValue {
  val: number;
  end: string;
  endT: number;
  filedT: number;
  concept: string;
}

interface Duration {
  startT: number;
  endT: number;
  end: string;
  days: number;
  val: number;
  filedT: number;
}

/** Listy konceptów z wariantami nazw (kolejność = priorytet przy remisie dat). */
export const C = {
  revenue: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'SalesRevenueNet',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'SalesRevenueGoodsNet',
  ],
  cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'],
  sga: ['SellingGeneralAndAdministrativeExpense'],
  ebit: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  incomeContinuing: ['IncomeLossFromContinuingOperations', 'NetIncomeLoss', 'ProfitLoss'],
  pretax: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'],
  incomeTax: ['IncomeTaxExpenseBenefit'],
  interest: ['InterestExpense'],
  da: [
    'DepreciationDepletionAndAmortization',
    'DepreciationAndAmortization',
    'DepreciationAmortizationAndAccretionNet',
    'Depreciation',
  ],
  ocf: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  dividends: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'DividendsCommonStockCash', 'DividendsCommonStock'],
  assets: ['Assets'],
  assetsCurrent: ['AssetsCurrent'],
  liabilities: ['Liabilities'],
  liabilitiesCurrent: ['LiabilitiesCurrent'],
  liabilitiesAndEquity: ['LiabilitiesAndStockholdersEquity'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  retainedEarnings: ['RetainedEarningsAccumulatedDeficit'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  receivables: ['AccountsReceivableNetCurrent'],
  inventory: ['InventoryNet'],
  ppe: ['PropertyPlantAndEquipmentNet'],
  aoci: ['AccumulatedOtherComprehensiveIncomeLossNetOfTax'],
  htmAmortizedCost: ['HeldToMaturitySecurities'],
  htmFairValue: ['HeldToMaturitySecuritiesFairValue'],
  sharesDei: ['EntityCommonStockSharesOutstanding'],
  sharesInstant: ['CommonStockSharesOutstanding'],
  sharesWeighted: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
} as const;

const parseT = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const near = (a: number, b: number, tolDays: number) => Math.abs(a - b) <= tolDays * DAY_MS;

export class XbrlView {
  private readonly durationCache = new Map<string, Duration[]>();

  constructor(private readonly companyFacts: CompanyFacts) {}

  private unitFacts(concept: string, taxonomy: Taxonomy, unit: string): Fact[] {
    return this.companyFacts.facts[taxonomy]?.[concept]?.units?.[unit] ?? [];
  }

  /** Najpóźniejszy (po dacie `end`) fakt chwilowy; przy remisie — wcześniejszy koncept z listy, potem nowszy raport. */
  latestInstant(concepts: readonly string[], taxonomy: Taxonomy = 'us-gaap', unit = 'USD'): XbrlValue | null {
    let best: XbrlValue | null = null;
    for (const concept of concepts) {
      for (const f of this.unitFacts(concept, taxonomy, unit)) {
        if (f.start) continue;
        const endT = parseT(f.end);
        if (!best || endT > best.endT || (endT === best.endT && best.concept === concept && f.filedT > best.filedT)) {
          best = { val: f.val, end: f.end, endT, filedT: f.filedT, concept };
        }
      }
    }
    return best;
  }

  /** Fakt chwilowy najbliższy `targetT` (w tolerancji); pierwszy koncept z listy, który ma trafienie, wygrywa. */
  instantNear(
    concepts: readonly string[],
    targetT: number,
    tolDays: number,
    taxonomy: Taxonomy = 'us-gaap',
    unit = 'USD'
  ): XbrlValue | null {
    for (const concept of concepts) {
      let best: XbrlValue | null = null;
      for (const f of this.unitFacts(concept, taxonomy, unit)) {
        if (f.start) continue;
        const endT = parseT(f.end);
        if (!near(endT, targetT, tolDays)) continue;
        const better =
          !best ||
          Math.abs(endT - targetT) < Math.abs(best.endT - targetT) ||
          (endT === best.endT && f.filedT > best.filedT);
        if (better) best = { val: f.val, end: f.end, endT, filedT: f.filedT, concept };
      }
      if (best) return best;
    }
    return null;
  }

  private durations(concept: string, taxonomy: Taxonomy, unit: string): Duration[] {
    const key = `${taxonomy}|${concept}|${unit}`;
    const cached = this.durationCache.get(key);
    if (cached) return cached;
    const byPeriod = new Map<string, Duration>();
    for (const f of this.unitFacts(concept, taxonomy, unit)) {
      if (!f.start) continue;
      const startT = parseT(f.start);
      const endT = parseT(f.end);
      const d: Duration = { startT, endT, end: f.end, days: (endT - startT) / DAY_MS, val: f.val, filedT: f.filedT };
      const k = `${f.start}|${f.end}`;
      const prev = byPeriod.get(k);
      if (!prev || d.filedT > prev.filedT) byPeriod.set(k, d);
    }
    const out = [...byPeriod.values()];
    this.durationCache.set(key, out);
    return out;
  }

  /** Najpóźniejszy fakt okresowy o długości w [minDays, maxDays]. */
  latestDuration(concepts: readonly string[], minDays: number, maxDays: number, unit = 'USD'): XbrlValue | null {
    let best: XbrlValue | null = null;
    for (const concept of concepts) {
      for (const d of this.durations(concept, 'us-gaap', unit)) {
        if (d.days < minDays || d.days > maxDays) continue;
        if (!best || d.endT > best.endT) best = { val: d.val, end: d.end, endT: d.endT, filedT: d.filedT, concept };
      }
    }
    return best;
  }

  /** Daty końca okresów (malejąco, rozstaw >= 60 dni) — do iterowania po kolejnych kwartałach. */
  periodEnds(concepts: readonly string[], limit: number): number[] {
    const ends = new Set<number>();
    for (const concept of concepts) {
      for (const d of this.durations(concept, 'us-gaap', 'USD')) if (d.days >= 75 && d.days <= 390) ends.add(d.endT);
    }
    const sorted = [...ends].sort((a, b) => b - a);
    const picked: number[] = [];
    for (const e of sorted) {
      if (picked.length && picked[picked.length - 1] - e < 60 * DAY_MS) continue;
      picked.push(e);
      if (picked.length >= limit) break;
    }
    return picked;
  }

  private ttmSingle(concept: string, endT: number | undefined): XbrlValue | null {
    const ds = this.durations(concept, 'us-gaap', 'USD');
    if (!ds.length) return null;
    let E = endT;
    if (E == null) {
      for (const d of ds) if (d.days >= 75 && d.days <= 390 && (E == null || d.endT > E)) E = d.endT;
      if (E == null) return null;
    }
    const target = E;
    const make = (val: number, ref: Duration, filedT: number): XbrlValue => ({
      val,
      end: ref.end,
      endT: ref.endT,
      filedT,
      concept,
    });

    // 1) Okres roczny kończący się w E
    const annual = ds
      .filter((d) => d.days >= 340 && d.days <= 390 && near(d.endT, target, 10))
      .sort((a, b) => Math.abs(a.endT - target) - Math.abs(b.endT - target) || b.filedT - a.filedT)[0];
    if (annual) return make(annual.val, annual, annual.filedT);

    // 2) YTD bieżący + poprzedni rok obrotowy − YTD sprzed roku
    const ytds = ds.filter((d) => d.days >= 75 && d.days < 340 && near(d.endT, target, 10)).sort((a, b) => b.days - a.days);
    for (const y of ytds) {
      const fy = ds.find((d) => d.days >= 340 && d.days <= 390 && near(d.endT, y.startT - DAY_MS, 10));
      const yPrev = ds.find((d) => near(d.endT, y.endT - 365 * DAY_MS, 10) && Math.abs(d.days - y.days) <= 15);
      if (fy && yPrev) return make(fy.val + y.val - yPrev.val, y, Math.max(fy.filedT, y.filedT, yPrev.filedT));
    }

    // 3) Cztery następujące po sobie kwartały
    let cursor = target;
    let sum = 0;
    let filedT = 0;
    let first: Duration | null = null;
    for (let k = 0; k < 4; k++) {
      const q = ds
        .filter((d) => d.days >= 75 && d.days <= 105 && near(d.endT, cursor, 10))
        .sort((a, b) => b.filedT - a.filedT)[0];
      if (!q) return null;
      if (!first) first = q;
      sum += q.val;
      filedT = Math.max(filedT, q.filedT);
      cursor = q.startT - DAY_MS;
    }
    return first ? make(sum, first, filedT) : null;
  }

  /**
   * Wartość za ostatnie 12 miesięcy.
   * Bez `endT`: dla każdego konceptu liczy najświeższe TTM i bierze to z najpóźniejszym końcem okresu
   * (spółki zmieniają tagi, np. SalesRevenueNet → RevenueFromContract... w 2018).
   * Z `endT`: pierwszy koncept z listy, który daje wynik dla tego końca okresu.
   */
  ttm(concepts: readonly string[], endT?: number): XbrlValue | null {
    if (endT != null) {
      for (const c of concepts) {
        const v = this.ttmSingle(c, endT);
        if (v) return v;
      }
      return null;
    }
    let best: XbrlValue | null = null;
    for (const c of concepts) {
      const v = this.ttmSingle(c, undefined);
      if (v && (!best || v.endT > best.endT)) best = v;
    }
    return best;
  }
}

/** Kolejność: najpierw koncept użyty w okresie bieżącym, potem reszta listy. */
export const preferConcept = (concept: string | undefined, list: readonly string[]) =>
  concept ? [concept, ...list.filter((c) => c !== concept)] : [...list];
