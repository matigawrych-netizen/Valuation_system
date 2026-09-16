/**
 * Zapytania do SEC EDGAR z jednym wspólnym ogranicznikiem tempa i ponawianiem przy przeciążeniu.
 * SEC dopuszcza 10 zapytań na sekundę; trzymamy się bezpiecznie poniżej.
 */

const USER_AGENT = process.env.SEC_USER_AGENT || 'ValuationSystem/0.2 (open-source research project)';
const MIN_INTERVAL_MS = 150;
const MAX_ATTEMPTS = 5;

let lastRequestT = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SecResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function throttle() {
  const wait = lastRequestT + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestT = Date.now();
}

/** Pobiera JSON. 404 zwraca jako wynik (brak danych w SEC), 429 i błędy 5xx ponawia z rosnącą przerwą. */
export async function secGetText(url: string): Promise<SecResult<string>> {
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await throttle();
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' } });
    } catch (err) {
      lastError = `sieć: ${String(err)}`;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 404) return { ok: false, status: 404, error: 'not_found' };
    if (res.status === 429 || res.status >= 500) {
      lastError = `HTTP ${res.status}`;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status} ${res.statusText}` };
    return { ok: true, data: await res.text() };
  }
  return { ok: false, status: 0, error: `po ${MAX_ATTEMPTS} próbach: ${lastError}` };
}

export async function secGetJson<T = any>(url: string): Promise<SecResult<T>> {
  const r = await secGetText(url);
  if (!r.ok) return r;
  try {
    return { ok: true, data: JSON.parse(r.data) as T };
  } catch (err) {
    return { ok: false, status: 200, error: `nieczytelny JSON: ${String(err).slice(0, 100)}` };
  }
}

export const secUserAgent = () => USER_AGENT;
