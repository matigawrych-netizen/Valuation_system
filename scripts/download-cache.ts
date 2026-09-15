import fs from 'node:fs';
import path from 'node:path';
import { yahooFinance } from '../src/yahoo-mapper.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const META_DIR = path.join(DATA_DIR, 'meta');
const FUNDAMENTALS_DIR = path.join(DATA_DIR, 'fundamentals');
const PRICES_DIR = path.join(DATA_DIR, 'prices');
const MACRO_DIR = path.join(DATA_DIR, 'macro');

for (const dir of [META_DIR, FUNDAMENTALS_DIR, PRICES_DIR, MACRO_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getSP500Tickers(): Promise<string[]> {
  const metaPath = path.join(META_DIR, 'sp500.json');
  if (fs.existsSync(metaPath)) {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  }

  console.log('Fetching S&P 500 list from Wikipedia...');
  const res = await fetch('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
  const html = await res.text();
  
  const tickers: string[] = [];
  const tableMatch = html.match(/<table class="wikitable[^>]*>([\s\S]*?)<\/table>/);
  if (tableMatch) {
    const rows = tableMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
    if (rows) {
      for (const row of rows) {
        const colMatch = row.match(/<td[^>]*><a[^>]*>([A-Z]{1,5})<\/a><\/td>/);
        if (colMatch) {
          tickers.push(colMatch[1]);
        }
      }
    }
  }

  fs.writeFileSync(metaPath, JSON.stringify(tickers, null, 2));
  return tickers;
}

async function getCIKMapping(): Promise<Record<string, string>> {
  const metaPath = path.join(META_DIR, 'ciks.json');
  if (fs.existsSync(metaPath)) {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  }

  console.log('Fetching SEC CIK mapping...');
  const res = await fetch('https://www.sec.gov/files/company_tickers.json');
  const data = await res.json() as any;
  
  const mapping: Record<string, string> = {};
  for (const key of Object.keys(data)) {
    const item = data[key];
    const cik = String(item.cik_str).padStart(10, '0');
    mapping[item.ticker] = cik;
  }

  fs.writeFileSync(metaPath, JSON.stringify(mapping, null, 2));
  return mapping;
}

async function downloadSECData(ticker: string, cik: string) {
  const filepath = path.join(FUNDAMENTALS_DIR, `${ticker}.json`);
  if (fs.existsSync(filepath)) return;

  console.log(`Downloading SEC data for ${ticker}...`);
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers: { 'User-Agent': 'ValuationSystem/1.0 (test@example.com)' }
  });

  if (res.status === 403 || res.status === 429) {
    throw new Error(`SEC API blocked/rate limited: ${res.status}`);
  }

  if (res.status === 404) {
    console.warn(`No SEC data for ${ticker}`);
    fs.writeFileSync(filepath, JSON.stringify({ error: 'not_found' }));
    return;
  }

  const data = await res.json();
  fs.writeFileSync(filepath, JSON.stringify(data));
  await sleep(200); // 10 requests per second limit, so 200ms is super safe
}

async function downloadPrices(ticker: string) {
  const filepath = path.join(PRICES_DIR, `${ticker}.json`);
  if (fs.existsSync(filepath)) return;

  console.log(`Downloading Yahoo prices for ${ticker}...`);
  try {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 22);
    
    const res = await yahooFinance.chart(ticker, {
      period1,
      interval: '1d'
    });
    fs.writeFileSync(filepath, JSON.stringify(res));
  } catch (err) {
    console.warn(`Failed to fetch prices for ${ticker}:`, err);
    fs.writeFileSync(filepath, JSON.stringify({ error: String(err) }));
  }
}

async function downloadMacro() {
  console.log('Downloading macro data (^VIX, CL=F, GC=F, ^GSPC, ^TNX)...');
  const macros = ['^VIX', 'CL=F', 'GC=F', '^GSPC', '^TNX'];
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 22);

  for (const m of macros) {
    const filepath = path.join(MACRO_DIR, `${m.replace('^', '').replace('=F', '')}.json`);
    if (fs.existsSync(filepath)) continue;

    const res = await yahooFinance.chart(m, { period1, interval: '1d' });
    fs.writeFileSync(filepath, JSON.stringify(res));
  }
}

async function main() {
  const tickers = await getSP500Tickers();
  const ciks = await getCIKMapping();

  console.log(`Found ${tickers.length} S&P 500 tickers.`);

  await downloadMacro();

  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    const cik = ciks[t];
    if (!cik) {
      console.warn(`No CIK found for ${t}`);
      continue;
    }

    try {
      await downloadSECData(t, cik);
      await downloadPrices(t);
    } catch (err) {
      console.error(`Error processing ${t}:`, err);
      if (err instanceof Error && err.message.includes('rate limited')) {
        break; // Stop completely on rate limits
      }
    }
  }

  console.log('Finished downloading all data!');
}

main().catch(console.error);
