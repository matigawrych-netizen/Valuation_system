import { DAY_MS, type CompanyFacts, type Split } from './data-loader.js';
import { computeDefaultFeatures, type DefaultFeatures } from './default-features.js';
import { loadDefaultModel, predictDefaultProbability } from './default-model.js';
import type { MarketStats } from './market-stats.js';
import { sectorFromSic } from './sectors.js';
import type { YahooFinanceSnapshot } from './valuation-engine.js';
import { C, XbrlView, preferConcept, type XbrlValue } from './xbrl.js';

/** Bilans starszy niż tyle dni od daty decyzji => spółka pomijana (nie wyceniamy na przeterminowanych danych). */
export const MAX_FUNDAMENTALS_STALENESS_DAYS = 400;
/** Składniki bilansu muszą pochodzić z tego samego dnia bilansowego (± tolerancja). */
const BALANCE_SHEET_TOLERANCE_DAYS = 5;
const YEAR_MS = 365 * DAY_MS;

export interface SecMappingInput {
  ticker: string;
  cik: string;
  asOf: string;
  price: number;
  facts: CompanyFacts;
  splits: Split[];
  market: MarketStats | null;
  sic: number | null;
}

export interface SecMappingResult {
  snapshot: YahooFinanceSnapshot | null;
  skipReason: string | null;
  warnings: string[];
  defaultFeatures: DefaultFeatures | null;
}

const skip = (reason: string): SecMappingResult => ({ snapshot: null, skipReason: reason, warnings: [], defaultFeatures: null });
const finite = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);
const ratio = (a: number | null, b: number | null) => (finite(a) && finite(b) && b !== 0 ? a / b : null);

/**
 * SEC companyfacts (point-in-time) -> YahooFinanceSnapshot.
 * Każde pole, którego nie da się policzyć z danych, jest null — nie ma wartości zastępczych
 * (dawniej: 1 000 000 akcji, beta = 1, SMA200 = cena, EBITDA = zysk + 5% długu).
 */
export function mapSecToYahooSnapshot(input: SecMappingInput): SecMappingResult {
  const { asOf, price, facts, splits, market, sic, cik } = input;
  if (!finite(price) || price <= 0) return skip('brak ceny');

  const asOfT = new Date(`${asOf.slice(0, 10)}T23:59:59Z`).getTime();
  const v = new XbrlView(facts);
  const warnings: string[] = [];
  const fresh = (x: XbrlValue | null) => (x && asOfT - x.endT <= MAX_FUNDAMENTALS_STALENESS_DAYS * DAY_MS ? x : null);

  // ── Kotwica bilansowa ──
  const anchor = fresh(v.latestInstant(C.assets)) ?? fresh(v.latestInstant(C.equity));
  if (!anchor) return skip(`brak bilansu nowszego niż ${MAX_FUNDAMENTALS_STALENESS_DAYS} dni`);
  const stalenessDays = (asOfT - anchor.endT) / DAY_MS;
  const bsT = anchor.endT;
  const atBs = (list: readonly string[]) => v.instantNear(list, bsT, BALANCE_SHEET_TOLERANCE_DAYS);
  const atPrevBs = (list: readonly string[], concept?: string) => v.instantNear(preferConcept(concept, list), bsT - YEAR_MS, 20);

  // ── Liczba akcji: dei (strona tytułowa) → us-gaap CommonStockSharesOutstanding → średnia rozwodniona ──
  const shareCandidates = [
    fresh(v.latestInstant(C.sharesDei, 'dei', 'shares')),
    fresh(v.latestInstant(C.sharesInstant, 'us-gaap', 'shares')),
    fresh(v.latestDuration(C.sharesWeighted, 75, 390, 'shares')),
  ].filter((x): x is XbrlValue => x != null && x.val > 0);
  if (!shareCandidates.length) return skip('brak liczby akcji (dei/us-gaap)');
  const sharesV = shareCandidates.reduce((best, c) => (c.endT > best.endT ? c : best));
  // Ceny Yahoo są skorygowane o splity do dziś, więc liczbę akcji trzeba przeliczyć o splity po dacie jej raportu.
  const splitFactor = (fromT: number) =>
    splits.reduce((m, s) => (s.t > fromT && s.numerator > 0 && s.denominator > 0 ? (m * s.numerator) / s.denominator : m), 1);
  const shares = sharesV.val * splitFactor(sharesV.endT);

  // ── Rachunek wyników i przepływy (TTM) ──
  const revenue = fresh(v.ttm(C.revenue));
  const netIncome = fresh(v.ttm(C.netIncome));
  const ocf = fresh(v.ttm(C.ocf));
  const capex = fresh(v.ttm(C.capex));
  const ebit = fresh(v.ttm(C.ebit));
  const da = fresh(v.ttm(C.da));
  const interest = fresh(v.ttm(C.interest));
  const dividends = fresh(v.ttm(C.dividends));
  const cogs = fresh(v.ttm(C.cogs));
  const sga = fresh(v.ttm(C.sga));
  const incomeTax = fresh(v.ttm(C.incomeTax));
  const pretax = fresh(v.ttm(C.pretax));
  const incomeContinuing = fresh(v.ttm(C.incomeContinuing));

  const fcf = ocf && capex ? ocf.val - Math.abs(capex.val) : null;
  const ebitda = ebit && da ? ebit.val + da.val : null;

  // ── Bilans (jedna data bilansowa) ──
  const assets = atBs(C.assets);
  const equity = atBs(C.equity);
  const assetsCurrent = atBs(C.assetsCurrent);
  const liabilitiesCurrent = atBs(C.liabilitiesCurrent);
  const liabilitiesAndEquity = atBs(C.liabilitiesAndEquity);
  const liabilitiesDirect = atBs(C.liabilities);
  const totalLiabilities =
    liabilitiesDirect?.val ?? (liabilitiesAndEquity && equity ? liabilitiesAndEquity.val - equity.val : null);
  const cash = atBs(C.cash);
  const receivables = atBs(C.receivables);
  const inventory = atBs(C.inventory);
  const ppe = atBs(C.ppe);
  const retained = atBs(C.retainedEarnings);
  const aoci = atBs(C.aoci);
  const htmCost = atBs(C.htmAmortizedCost);
  const htmFair = atBs(C.htmFairValue);

  // Dług: LongTermDebt zawiera część bieżącą, a DebtCurrent zawiera bieżące raty LTD — nie sumujemy ich podwójnie.
  const ltdTotal = atBs(['LongTermDebt']);
  const ltdNon = atBs(['LongTermDebtNoncurrent']);
  const ltdCur = atBs(['LongTermDebtCurrent']);
  const debtCur = atBs(['DebtCurrent']);
  const stb = atBs(['ShortTermBorrowings']);
  const cp = atBs(['CommercialPaper']);
  const longPart = ltdNon ? ltdNon.val : ltdTotal ? ltdTotal.val - (ltdCur?.val ?? 0) : null;
  const shortParts = [ltdCur, stb, cp].filter((x): x is XbrlValue => x != null);
  const shortPart = debtCur ? debtCur.val : shortParts.length ? shortParts.reduce((s, x) => s + x.val, 0) : null;
  const totalDebt = longPart == null && shortPart == null ? null : (longPart ?? 0) + (shortPart ?? 0);

  // ── Wartości sprzed roku (do wzrostu, F-Score, M-Score) ──
  const prevTtm = (cur: XbrlValue | null, list: readonly string[]) =>
    cur ? v.ttm(preferConcept(cur.concept, list), cur.endT - YEAR_MS) : null;
  const revenuePrev = prevTtm(revenue, C.revenue);
  const netIncomePrev = prevTtm(netIncome, C.netIncome);
  const ocfPrev = prevTtm(ocf, C.ocf);
  const cogsPrev = prevTtm(cogs, C.cogs);
  const sgaPrev = prevTtm(sga, C.sga);
  const daPrev = prevTtm(da, C.da);
  const assetsPrev = atPrevBs(C.assets, assets?.concept);
  const assetsCurrentPrev = atPrevBs(C.assetsCurrent);
  const liabilitiesCurrentPrev = atPrevBs(C.liabilitiesCurrent);
  const receivablesPrev = atPrevBs(C.receivables);
  const ppePrev = atPrevBs(C.ppe);
  const ltdNonPrev = atPrevBs(['LongTermDebtNoncurrent', 'LongTermDebt']);
  const ltdNonNow = ltdNon ?? ltdTotal;
  const sharesPrevV =
    v.instantNear(C.sharesDei, sharesV.endT - YEAR_MS, 45, 'dei', 'shares') ??
    v.instantNear(C.sharesInstant, sharesV.endT - YEAR_MS, 45, 'us-gaap', 'shares');
  const sharesPrev = sharesPrevV ? sharesPrevV.val * splitFactor(sharesPrevV.endT) : null;

  const revenueGrowth = revenue && revenuePrev && revenuePrev.val > 0 ? revenue.val / revenuePrev.val - 1 : null;
  const earningsGrowth =
    netIncome && netIncomePrev && netIncomePrev.val > 0 ? netIncome.val / netIncomePrev.val - 1 : null;

  // ── Piotroski F-Score: wszystkie 9 sygnałów albo null ──
  let fScore: number | null = null;
  {
    const A = assets?.val ?? null;
    const Ap = assetsPrev?.val ?? null;
    const gm = revenue && cogs && revenue.val > 0 ? (revenue.val - cogs.val) / revenue.val : null;
    const gmPrev = revenuePrev && cogsPrev && revenuePrev.val > 0 ? (revenuePrev.val - cogsPrev.val) / revenuePrev.val : null;
    const cr = ratio(assetsCurrent?.val ?? null, liabilitiesCurrent?.val ?? null);
    const crPrev = ratio(assetsCurrentPrev?.val ?? null, liabilitiesCurrentPrev?.val ?? null);
    const inputs = [netIncome, ocf, netIncomePrev, A, Ap, ltdNonNow, ltdNonPrev, cr, crPrev, sharesPrev, gm, gmPrev, revenue, revenuePrev];
    if (inputs.every((x) => x != null) && A! > 0 && Ap! > 0) {
      const roa = netIncome!.val / A!;
      const roaPrev = netIncomePrev!.val / Ap!;
      fScore =
        Number(roa > 0) +
        Number(ocf!.val > 0) +
        Number(roa > roaPrev) +
        Number(ocf!.val > netIncome!.val) +
        Number(ltdNonNow!.val / A! < ltdNonPrev!.val / Ap!) +
        Number(cr! > crPrev!) +
        Number(shares <= sharesPrev!) +
        Number(gm! > gmPrev!) +
        Number(revenue!.val / A! > revenuePrev!.val / Ap!);
    }
  }

  // ── Beneish M-Score: pełne 8 zmiennych albo null ──
  let mScore: number | null = null;
  {
    const req = [revenue, revenuePrev, cogs, cogsPrev, receivables, receivablesPrev, assetsCurrent, assetsCurrentPrev, ppe, ppePrev,
      assets, assetsPrev, da, daPrev, sga, sgaPrev, liabilitiesCurrent, liabilitiesCurrentPrev, ltdNonNow, ltdNonPrev, incomeContinuing, ocf];
    if (req.every((x) => x != null)) {
      const rev = revenue!.val, revP = revenuePrev!.val;
      const gm = (rev - cogs!.val) / rev;
      const gmP = (revP - cogsPrev!.val) / revP;
      const aq = 1 - (assetsCurrent!.val + ppe!.val) / assets!.val;
      const aqP = 1 - (assetsCurrentPrev!.val + ppePrev!.val) / assetsPrev!.val;
      const dep = da!.val / (da!.val + ppe!.val);
      const depP = daPrev!.val / (daPrev!.val + ppePrev!.val);
      const lev = (liabilitiesCurrent!.val + ltdNonNow!.val) / assets!.val;
      const levP = (liabilitiesCurrentPrev!.val + ltdNonPrev!.val) / assetsPrev!.val;
      const DSRI = (receivables!.val / rev) / (receivablesPrev!.val / revP);
      const GMI = gmP / gm;
      const AQI = aq / aqP;
      const SGI = rev / revP;
      const DEPI = depP / dep;
      const SGAI = (sga!.val / rev) / (sgaPrev!.val / revP);
      const LVGI = lev / levP;
      const TATA = (incomeContinuing!.val - ocf!.val) / assets!.val;
      const m = -4.84 + 0.92 * DSRI + 0.528 * GMI + 0.404 * AQI + 0.892 * SGI + 0.115 * DEPI - 0.172 * SGAI + 4.679 * TATA - 0.327 * LVGI;
      if (Number.isFinite(m) && rev > 0 && revP > 0 && gm > 0 && aqP > 0 && dep > 0 && levP > 0) mScore = m;
    }
  }

  // ── Cechy modelu bankructwa ──
  let negFcfQuarters: number | null = null;
  {
    const ends = v.periodEnds(C.ocf, 8);
    let count = 0;
    for (let k = 0; k < ends.length; k++) {
      const o = v.ttm(C.ocf, ends[k]);
      const c = v.ttm(C.capex, ends[k]);
      if (!o || !c) {
        if (k === 0) count = -1;
        break;
      }
      if (o.val - Math.abs(c.val) < 0) count++;
      else break;
    }
    negFcfQuarters = ends.length && count >= 0 ? count : null;
  }
  const defaultFeatures = computeDefaultFeatures({
    workingCapital: assetsCurrent && liabilitiesCurrent ? assetsCurrent.val - liabilitiesCurrent.val : null,
    totalAssets: assets?.val ?? null,
    totalLiabilities,
    retainedEarnings: retained?.val ?? null,
    ebitTTM: ebit?.val ?? null,
    salesTTM: revenue?.val ?? null,
    marketCap: price * shares,
    totalDebt,
    cash: cash?.val ?? null,
    ebitdaTTM: ebitda,
    interestExpenseTTM: interest?.val ?? null,
    negFcfQuarters,
    drawdown24m: market?.drawdown24m ?? null,
  });

  let pDefault: number | null = null;
  const model = loadDefaultModel();
  if (!model) {
    warnings.push('pDefault niedostępne — brak artefaktu default-model.json');
  } else {
    const missing = model.featureNames.filter((n) => (defaultFeatures.values as Record<string, number | null>)[n] == null);
    if (missing.length) warnings.push(`pDefault niedostępne — brak cechy ${missing.join(', ')}`);
    else pDefault = predictDefaultProbability(defaultFeatures.values, model);
  }

  // ── Wartości na akcję (w bazie akcji skorygowanej o splity do dziś) ──
  const eps = netIncome ? netIncome.val / shares : null;
  const dividendRate = dividends && Math.abs(dividends.val) > 0 ? Math.abs(dividends.val) / shares : null;
  const taxRate =
    incomeTax && pretax && pretax.val > 0 ? Math.min(Math.max(incomeTax.val / pretax.val, 0), 0.5) : null;
  const investedCapital = equity && totalDebt != null && cash ? equity.val + totalDebt - cash.val : null;

  if (!market) warnings.push('brak statystyk cenowych (beta, SMA200, 52W) — za krótka historia notowań');
  else if (market.beta == null) warnings.push('beta nieznana — za krótka wspólna historia z ^GSPC');

  const snapshot: YahooFinanceSnapshot = {
    summaryDetail: {
      previousClose: price,
      trailingPE: eps != null && eps > 0 ? price / eps : null,
      forwardPE: null,
      dividendRate,
      dividendYield: dividendRate != null ? dividendRate / price : null,
      payoutRatio: dividends && netIncome && netIncome.val > 0 ? Math.abs(dividends.val) / netIncome.val : null,
      beta: market?.beta ?? null,
      fiftyDayAverage: null,
      twoHundredDayAverage: market?.sma200 ?? null,
      fiftyTwoWeekLow: market?.fiftyTwoWeekLow ?? null,
      fiftyTwoWeekHigh: market?.fiftyTwoWeekHigh ?? null,
    },
    defaultKeyStatistics: {
      trailingEps: eps,
      bookValue: equity ? equity.val / shares : null,
      sharesOutstanding: shares,
      pegRatio: null,
    },
    financialData: {
      currentPrice: price,
      targetMeanPrice: null,
      totalRevenue: revenue?.val ?? null,
      revenuePerShare: revenue ? revenue.val / shares : null,
      revenueGrowth,
      earningsGrowth,
      freeCashflow: fcf,
      operatingCashflow: ocf?.val ?? null,
      totalDebt,
      totalCash: cash?.val ?? null,
      debtToEquity: totalDebt != null && equity && equity.val > 0 ? (totalDebt / equity.val) * 100 : null,
      returnOnEquity: netIncome && equity && equity.val > 0 ? netIncome.val / equity.val : null,
      profitMargins: netIncome && revenue && revenue.val > 0 ? netIncome.val / revenue.val : null,
      ebitda,
      mScore,
      fScore,
      pDefault,
    },
    balanceSheetHistory: { balanceSheetStatements: equity ? [{ totalStockholderEquity: equity.val }] : [] },
    cashflowStatementHistory: {
      cashflowStatements: [
        {
          netIncome: netIncome?.val ?? null,
          capitalExpenditures: capex ? -Math.abs(capex.val) : null,
          totalCashFromOperatingActivities: ocf?.val ?? null,
        },
      ],
    },
    assetProfile: { sector: sectorFromSic(sic), industry: sic != null ? `SIC ${sic}` : null },
    fundamentals: {
      ebit: ebit?.val ?? null,
      ebitda,
      netIncome: netIncome?.val ?? null,
      investedCapital,
      taxRate,
      workingCapital: assetsCurrent && liabilitiesCurrent ? assetsCurrent.val - liabilitiesCurrent.val : null,
      totalAssets: assets?.val ?? null,
      totalLiabilities,
      retainedEarnings: retained?.val ?? null,
      cash: cash?.val ?? null,
      receivables: receivables?.val ?? null,
      inventory: inventory?.val ?? null,
      fixedAssets: ppe?.val ?? null,
      aoci: aoci?.val ?? null,
      htmBookValue: htmCost?.val ?? null,
      htmFairValue: htmFair?.val ?? null,
    },
    metadata: { cik, asOf, stalenessDays, warnings },
  };

  return { snapshot, skipReason: null, warnings, defaultFeatures };
}
