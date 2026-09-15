/** NARZĘDZIE RĘCZNE (debug, sieć) — nie jest częścią pipeline'u. */
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

const candidates = [
  { name: "Peabody Energy", petition: "2016-04-01" },
  { name: "SandRidge Energy", petition: "2016-06-01" },
  { name: "Linn Energy", petition: "2016-05-01" },
  { name: "Ultra Petroleum", petition: "2016-04-01" },
  { name: "Chesapeake Energy", petition: "2020-06-01" },
  { name: "Whiting Petroleum", petition: "2020-04-01" },
  { name: "Diamond Offshore Drilling", petition: "2020-04-01" },
  { name: "California Resources", petition: "2020-07-01" },
  { name: "Hertz Global", petition: "2020-05-01" },
  { name: "Frontier Communications", petition: "2020-04-01" },
  { name: "J.C. Penney", petition: "2020-05-01" },
  { name: "Toys \"R\" Us", petition: "2017-09-01" },
  { name: "Sears Holdings", petition: "2018-10-01" }
];

function normalizeName(name: string): string {
  let s = name.toUpperCase();
  s = s.replace(/[^A-Z0-9 ]/g, ' ');
  const stopWords = new Set(['INC', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'THE', 'LLC', 'LP', 'L L C', 'PLC', 'LTD']);
  const words = s.split(/\s+/).filter(w => w && !stopWords.has(w));
  return words.join(' ');
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    exec('curl.exe -s -H "User-Agent: ValuationSystemBot/1.0 (contact@example.com)" "' + url + '"', { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      if (stdout.includes('404 Not Found') || stdout.includes('<title>404</title>')) return resolve(null);
      try {
        resolve(JSON.parse(stdout));
      } catch(e) {
        reject(new Error('Failed to parse JSON.'));
      }
    });
  });
}

async function main() {
  console.log('Loading cik-lookup-data.txt from SEC...');
  let lookupText: string = fs.readFileSync('data/meta/cik-lookup-data.latest.txt', 'utf-8');
  
  const secRecords: { title: string; norm: string; cik: string }[] = [];
  const lines = lookupText.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(':');
    if (parts.length >= 2) {
       const title = parts[0];
       const cik = parts[1];
       const norm = normalizeName(title);
       if (norm) {
         secRecords.push({ title, norm, cik });
       }
    }
  }

  const results: any[] = [];
  
  for (const cand of candidates) {
    const candidateName = cand.name;
    const candNorm = normalizeName(candidateName);
    
    const matches = new Map<string, string>();
    
    for (const rec of secRecords) {
      if (rec.norm.includes(candNorm) || candNorm.includes(rec.norm)) {
        if (rec.norm.length >= candNorm.length * 0.5) {
           matches.set(rec.cik, rec.title);
        }
      }
    }
    
    if (matches.size === 0) {
      results.push({
        candidate: candidateName,
        cik: 'not_found',
        fuzzy_reason: '-',
        filings: 0,
        pre_petition: 'NIE',
        first: '-', last: '-', exists: false
      });
      continue;
    }
    
    console.log(`\n--- Znaleziono dopasowania dla "${candidateName}" (szukano: "${candNorm}") ---`);
    for (const [cik, title] of matches.entries()) {
       console.log(`  CIK: ${cik} -> ${title}`);
    }
    
    for (const [cik, title] of matches.entries()) {
      const paddedCik = cik.padStart(10, '0');
      let submissions: any = null;
      
      try {
        submissions = await fetchJson('https://data.sec.gov/submissions/CIK' + paddedCik + '.json');
      } catch (e: any) {
        // console.error('Error fetching submissions for CIK ' + paddedCik + ': ' + e.message);
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
      
      let prePetition = 'NIE';
      if (filingsCount > 0) {
        if (firstFiling < cand.petition) {
           prePetition = 'TAK';
        }
      }
      
      const localPath = path.join('data', 'fundamentals', 'CIK' + paddedCik + '.json');
      const existsLocally = fs.existsSync(localPath);
      
      results.push({
        candidate: candidateName,
        cik: paddedCik,
        fuzzy_reason: `${title}`,
        filings: filingsCount,
        pre_petition: prePetition,
        first: firstFiling,
        last: lastFiling,
        exists: existsLocally
      });
      
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  console.log('\n--- WYNIKI (TABELA) ---');
  console.table(results);
}

main().catch(console.error);
