/** NARZĘDZIE RĘCZNE (debug, sieć) — nie jest częścią pipeline'u. */
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

const candidates = [
  "Peabody Energy",
  "SandRidge Energy",
  "Linn Energy",
  "Ultra Petroleum",
  "Chesapeake Energy",
  "Whiting Petroleum",
  "Diamond Offshore Drilling",
  "California Resources",
  "Hertz Global",
  "Frontier Communications",
  "J.C. Penney",
  "Toys \"R\" Us",
  "Sears Holdings"
];

function simplifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    exec('curl.exe -s -H "User-Agent: ValuationSystemBot/1.0 (contact@example.com)" "' + url + '"', (err, stdout, stderr) => {
      if (err) return reject(err);
      if (stdout.includes('404 Not Found') || stdout.includes('<title>404</title>')) return resolve(null);
      try {
        resolve(JSON.parse(stdout));
      } catch(e) {
        reject(new Error('Failed to parse JSON. Output starts with: ' + stdout.substring(0, 50)));
      }
    });
  });
}

async function main() {
  console.log('Loading cik-lookup-data.txt from SEC...');
  let lookupText: string;
  lookupText = fs.readFileSync('data/meta/cik-lookup-data.latest.txt', 'utf-8');
  
  const titleToCik = new Map<string, string>();
  const lines = lookupText.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(':');
    if (parts.length >= 2) {
       const title = parts[0];
       const cik = parts[1];
       const sim = simplifyName(title);
       if (sim) titleToCik.set(sim, cik);
    }
  }

  const results: any[] = [];
  
  for (const candidate of candidates) {
    console.log('Processing: ' + candidate);
    
    const simCand = simplifyName(candidate);
    let foundCik: string | null = null;
    
    // Some companies have very long legal names. 
    // We will do a substring search among keys.
    for (const [title, cik] of titleToCik.entries()) {
      if (title.startsWith(simCand)) {
         foundCik = cik;
         break;
      }
    }
    
    if (!foundCik) {
      results.push({
        candidate,
        cik: 'not_found',
        found_in_map: false,
        filings_count: 0,
        first_filing: '-',
        last_filing: '-',
        exists_locally: false
      });
      continue;
    }
    
    const paddedCik = foundCik.padStart(10, '0');
    let submissions: any = null;
    
    try {
      submissions = await fetchJson('https://data.sec.gov/submissions/CIK' + paddedCik + '.json');
    } catch (e: any) {
      console.error('Error fetching submissions for ' + candidate + ' (CIK ' + paddedCik + '): ' + e.message);
    }
    
    let filingsCount = 0;
    let firstFiling = '-';
    let lastFiling = '-';
    
    if (submissions && submissions.filings && submissions.filings.recent) {
      const recent = submissions.filings.recent;
      const validDates: string[] = [];
      
      for (let i = 0; i < recent.form.length; i++) {
        const form = recent.form[i];
        const fDate = recent.filingDate[i];
        const year = parseInt(fDate.substring(0, 4), 10);
        
        if ((form === '10-K' || form === '10-Q') && year >= 2009 && year <= 2021) {
          validDates.push(fDate);
        }
      }
      
      if (validDates.length > 0) {
        filingsCount = validDates.length;
        validDates.sort();
        firstFiling = validDates[0];
        lastFiling = validDates[validDates.length - 1];
      }
    }
    
    const localPath = path.join('data', 'fundamentals', 'CIK' + paddedCik + '.json');
    const existsLocally = fs.existsSync(localPath);
    
    results.push({
      candidate,
      cik: paddedCik,
      found_in_map: true,
      filings_count: filingsCount,
      first_filing: firstFiling,
      last_filing: lastFiling,
      exists_locally: existsLocally
    });
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('\n--- WYNIKI (TABELA) ---');
  console.table(results);
  
  const locallyAvailable = results.filter(r => r.exists_locally);
  console.log('\nIlo�� kandydat�w znalezionych i obecnych w lokalnym cache: ' + locallyAvailable.length);
}

main().catch(console.error);