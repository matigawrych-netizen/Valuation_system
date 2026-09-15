import fs from 'node:fs';
import { DAY_MS, getQuoteAtDate, lastQuoteIndexAtOrBefore, type ParsedCache } from './data-loader.js';
import { FRED_PIT_JSON } from './paths.js';
import { yahooFinance } from './yahoo-mapper.js';

export interface MacroEnvironment {
  fedFundsRate: number;
  fedFundsRatePrior: number;
  rateRegime: 'HIKING' | 'HOLDING' | 'CUTTING';

  cpiYoY: number;
  cpiTrend: 'RISING' | 'STABLE' | 'FALLING';

  treasury10Y: number;
  treasury2Y: number | null;
  treasury3M: number;
  yieldSpread: number;
  /** ICE BofA HY OAS — FRED udostępnia tylko ostatnie ~3 lata, więc historycznie zwykle null. */
  creditSpread: number | null;
  unemploymentRate?: number | null;

  marketRegime: 'BULL' | 'NEUTRAL' | 'BEAR';

  vix?: number;
  /** Brak serii miedzi w cache (CL = ropa, nie miedź) — pole zawsze null w backteście. */
  copperYoY?: number | null;
  goldYoY?: number | null;
  oilYoY?: number | null;

  asOf: Date;
}

// ── FRED / ALFRED ──

export const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

export interface FredQuery {
  seriesId: string;
  limit: number;
  units?: string;
  /** Data widoku ALFRED (realtime_start = realtime_end). Bez niej: najnowszy vintage. */
  realtimeDate?: string;
  observationEnd?: string;
}

export interface FredObservation {
  date: string;
  value: number;
}

export function requireFredApiKey(): string {
  const key = process.env.FRED_API_KEY;
  if (!key) {
    throw new Error('Brak zmiennej środowiskowej FRED_API_KEY (patrz .env.example).');
  }
  return key;
}

export function fredObservationsUrl(q: FredQuery, apiKey: string): string {
  const p = new URLSearchParams({
    series_id: q.seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: String(q.limit),
    units: q.units ?? 'lin',
  });
  if (q.realtimeDate) {
    p.set('realtime_start', q.realtimeDate);
    p.set('realtime_end', q.realtimeDate);
  }
  if (q.observationEnd) p.set('observation_end', q.observationEnd);
  return `${FRED_BASE_URL}?${p.toString()}`;
}

/** Rzuca wyjątek przy błędzie HTTP — brak danych nie jest cicho zamieniany na wartości domyślne. */
export async function fetchFredObservations(q: FredQuery, apiKey = requireFredApiKey()): Promise<FredObservation[]> {
  const response = await fetch(fredObservationsUrl(q, apiKey));
  if (!response.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      /* treść błędu opcjonalna */
    }
    throw new Error(`FRED ${q.seriesId}: HTTP ${response.status} ${detail}`);
  }
  const data = (await response.json()) as { observations?: { date: string; value: string }[] };
  return (data.observations ?? [])
    .filter((o) => o.value !== '.')
    .map((o) => ({ date: o.date, value: Number.parseFloat(o.value) }));
}

function classifyRate(now: number, prior: number): MacroEnvironment['rateRegime'] {
  const diff = now - prior;
  if (diff >= 0.0025) return 'HIKING';
  if (diff <= -0.0025) return 'CUTTING';
  return 'HOLDING';
}

function classifyCpiTrend(nowPct: number, twoMonthsAgoPct: number): MacroEnvironment['cpiTrend'] {
  const diff = nowPct - twoMonthsAgoPct;
  if (diff >= 0.3) return 'RISING';
  if (diff <= -0.3) return 'FALLING';
  return 'STABLE';
}

/**
 * Makro na dziś (serwer API). Każda brakująca seria => wyjątek.
 * Dawna wersja po cichu zwracała stałe (Fed 5.25%, CPI 3%) przy każdym błędzie sieci.
 */
export async function fetchMacroEnvironment(asOfDate?: Date): Promise<MacroEnvironment> {
  const apiKey = requireFredApiKey();
  const realtimeDate = asOfDate ? asOfDate.toISOString().slice(0, 10) : undefined;
  const q = (seriesId: string, limit: number, units = 'lin') => fetchFredObservations({ seriesId, limit, units, realtimeDate }, apiKey);

  const [fed, cpi, t10, t2, t3m, credit] = await Promise.all([
    q('FEDFUNDS', 5),
    q('CPIAUCSL', 4, 'pc1'),
    q('DGS10', 5),
    q('DGS2', 5),
    q('DGS3MO', 5),
    q('BAMLH0A0HYM2', 5),
  ]);
  const need = (obs: FredObservation[], n: number, id: string) => {
    if (obs.length < n) throw new Error(`FRED ${id}: za mało obserwacji (${obs.length} < ${n})`);
  };
  need(fed, 4, 'FEDFUNDS');
  need(cpi, 3, 'CPIAUCSL');
  need(t10, 1, 'DGS10');
  need(t3m, 1, 'DGS3MO');

  const gspc: any = await yahooFinance.quoteSummary('^GSPC', { modules: ['summaryDetail', 'financialData'] });
  const current = gspc?.financialData?.currentPrice ?? gspc?.summaryDetail?.previousClose;
  const sma200 = gspc?.summaryDetail?.twoHundredDayAverage;
  if (!current || !sma200) throw new Error('Brak ceny lub SMA200 dla ^GSPC — nie można ustalić marketRegime');

  const treasury10Y = t10[0].value / 100;
  const treasury3M = t3m[0].value / 100;
  return {
    fedFundsRate: fed[0].value / 100,
    fedFundsRatePrior: fed[3].value / 100,
    rateRegime: classifyRate(fed[0].value / 100, fed[3].value / 100),
    cpiYoY: cpi[0].value / 100,
    cpiTrend: classifyCpiTrend(cpi[0].value, cpi[2].value),
    treasury10Y,
    treasury2Y: t2.length ? t2[0].value / 100 : null,
    treasury3M,
    yieldSpread: treasury10Y - treasury3M,
    creditSpread: credit.length ? credit[0].value / 100 : null,
    marketRegime: current > sma200 * 1.05 ? 'BULL' : current < sma200 * 0.95 ? 'BEAR' : 'NEUTRAL',
    asOf: asOfDate ?? new Date(),
  };
}

// ── Makro point-in-time z cache (backtest) ──

export interface FredPitEntry {
  /** seriesKey -> obserwacje malejąco po dacie, tak jak widział je ALFRED w dniu decyzji */
  series: Record<string, FredObservation[]>;
  /** seriesKey -> 'alfred' | 'latest-vintage' (tylko dla nierewidowanych serii rynkowych) */
  vintage: Record<string, 'alfred' | 'latest-vintage'>;
  errors?: Record<string, string>;
}

export interface FredPitFile {
  generatedAt: string;
  dates: Record<string, FredPitEntry>;
}

let fredPitCache: { file: string; mtimeMs: number; data: FredPitFile } | null = null;

export function loadFredPit(file = FRED_PIT_JSON): FredPitFile {
  if (!fs.existsSync(file)) {
    throw new Error(`Brak ${file}. Uruchom: npx tsx scripts/download-macro-fred.ts (wymaga FRED_API_KEY)`);
  }
  const mtimeMs = fs.statSync(file).mtimeMs;
  if (fredPitCache?.file === file && fredPitCache.mtimeMs === mtimeMs) return fredPitCache.data;
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as FredPitFile;
  fredPitCache = { file, mtimeMs, data };
  return data;
}

function firstObs(entry: FredPitEntry, key: string, dateStr: string, maxAgeDays: number): FredObservation | null {
  const obs = entry.series[key]?.[0];
  if (!obs) return null;
  const age = (new Date(dateStr).getTime() - new Date(obs.date).getTime()) / DAY_MS;
  return age <= maxAgeDays && age >= 0 ? obs : null;
}

function yoyFromCache(cache: ParsedCache, symbol: string, dateStr: string): number | null {
  const now = getQuoteAtDate(cache.macro[symbol], dateStr);
  const d = new Date(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  const prev = getQuoteAtDate(cache.macro[symbol], d.toISOString().slice(0, 10));
  return now && prev && prev.close > 0 ? now.close / prev.close - 1 : null;
}

/**
 * MacroEnvironment na dzień decyzji, wyłącznie z danych offline:
 * FRED/ALFRED (data/macro/fred-pit.json) + VIX/^GSPC/złoto/ropa z cache Yahoo.
 * Brak wymaganej serii => wyjątek.
 */
export function getMacroAsOf(cache: ParsedCache, dateStr: string, fredFile = FRED_PIT_JSON): MacroEnvironment {
  const entry = loadFredPit(fredFile).dates[dateStr];
  if (!entry) throw new Error(`Brak wpisu makro PIT dla ${dateStr} w ${fredFile}`);

  const fed = entry.series.FEDFUNDS ?? [];
  const cpi = entry.series.CPIAUCSL_PC1 ?? [];
  if (fed.length < 4) throw new Error(`${dateStr}: FEDFUNDS ma ${fed.length} obserwacji (potrzeba 4) ${entry.errors?.FEDFUNDS ?? ''}`);
  if (cpi.length < 3) throw new Error(`${dateStr}: CPIAUCSL ma ${cpi.length} obserwacji (potrzeba 3) ${entry.errors?.CPIAUCSL_PC1 ?? ''}`);
  const t10 = firstObs(entry, 'DGS10', dateStr, 10);
  const t3m = firstObs(entry, 'DGS3MO', dateStr, 10);
  if (!t10 || !t3m) throw new Error(`${dateStr}: brak aktualnej rentowności DGS10/DGS3MO`);
  const t2 = firstObs(entry, 'DGS2', dateStr, 10);
  const credit = firstObs(entry, 'BAMLH0A0HYM2', dateStr, 10);
  const unrate = entry.series.UNRATE?.[0] ?? null;

  const vixQ = getQuoteAtDate(cache.macro['VIX'], dateStr);
  if (!vixQ) throw new Error(`${dateStr}: brak notowania VIX w cache`);

  const gspc = cache.macro['GSPC'];
  const targetT = new Date(`${dateStr}T23:59:59Z`).getTime();
  const gi = gspc ? lastQuoteIndexAtOrBefore(gspc.quotes, targetT) : -1;
  if (gi < 199) throw new Error(`${dateStr}: za krótka historia ^GSPC do SMA200`);
  let sma = 0;
  for (let k = gi - 199; k <= gi; k++) sma += gspc.quotes[k].close;
  sma /= 200;
  const spx = gspc.quotes[gi].close;

  const treasury10Y = t10.value / 100;
  const treasury3M = t3m.value / 100;
  return {
    fedFundsRate: fed[0].value / 100,
    fedFundsRatePrior: fed[3].value / 100,
    rateRegime: classifyRate(fed[0].value / 100, fed[3].value / 100),
    cpiYoY: cpi[0].value / 100,
    cpiTrend: classifyCpiTrend(cpi[0].value, cpi[2].value),
    treasury10Y,
    treasury2Y: t2 ? t2.value / 100 : null,
    treasury3M,
    yieldSpread: treasury10Y - treasury3M,
    creditSpread: credit ? credit.value / 100 : null,
    unemploymentRate: unrate ? unrate.value / 100 : null,
    marketRegime: spx > sma * 1.05 ? 'BULL' : spx < sma * 0.95 ? 'BEAR' : 'NEUTRAL',
    vix: vixQ.close,
    copperYoY: null,
    goldYoY: yoyFromCache(cache, 'GC', dateStr),
    oilYoY: yoyFromCache(cache, 'CL', dateStr),
    asOf: new Date(`${dateStr}T00:00:00Z`),
  };
}
