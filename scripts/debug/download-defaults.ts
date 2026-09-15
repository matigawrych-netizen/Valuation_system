/** NARZĘDZIE RĘCZNE (debug, sieć) — nie jest częścią pipeline'u. */
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

const TARGET_CIKS = [
  { cik: '0001064728', name: 'Peabody Energy', petition: '2016-04-13' },
  { cik: '0001349436', name: 'SandRidge Energy', petition: '2016-05-16' },
  { cik: '0001609253', name: 'California Resources', petition: '2020-07-15' },
  { cik: '0001657853', name: 'Hertz Global', petition: '2020-05-22' }
];

const FUNDAMENTALS_DIR = path.join(process.cwd(), 'data', 'fundamentals');
const MEMBERSHIP_FILE = path.join(process.cwd(), 'data', 'meta', 'index_membership.json');

function downloadSECFile(cik: string): Promise<string> {
  const paddedCik = cik.padStart(10, '0');
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`;
  return new Promise((resolve, reject) => {
    // using curl to bypass node fetch issues
    exec(`curl.exe -s -H "User-Agent: ValuationSystemBot/1.0 (contact@example.com)" "${url}"`, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      if (stdout.includes('404 Not Found') || stdout.includes('<title>404</title>')) return reject(new Error('404 Not Found'));
      resolve(stdout);
    });
  });
}

async function main() {
  if (!fs.existsSync(FUNDAMENTALS_DIR)) {
    fs.mkdirSync(FUNDAMENTALS_DIR, { recursive: true });
  }

  let indexMembers: any[] = [];
  if (fs.existsSync(MEMBERSHIP_FILE)) {
    indexMembers = JSON.parse(fs.readFileSync(MEMBERSHIP_FILE, 'utf-8'));
  }

  const results: any[] = [];

  for (const target of TARGET_CIKS) {
    const cik = target.cik.padStart(10, '0');
    const filepath = path.join(FUNDAMENTALS_DIR, `CIK${cik}.json`);
    
    let isDownloaded = false;
    let data: any = null;
    
    if (fs.existsSync(filepath)) {
      data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      isDownloaded = true;
    } else {
      console.log(`Downloading SEC data for CIK ${cik} (${target.name})...`);
      try {
        const rawJson = await downloadSECFile(cik);
        data = JSON.parse(rawJson);
        fs.writeFileSync(filepath, rawJson);
        isDownloaded = true;
        // rate limit
        await new Promise(r => setTimeout(r, 250));
      } catch (err: any) {
        console.error(`Failed to download CIK ${cik}:`, err.message);
      }
    }

    let hasPrePetition = 'NIE';
    let minDate = '9999-99-99';
    let maxDate = '0000-00-00';
    let totalFacts = 0;

    if (data && data.facts && data.facts['us-gaap']) {
      const gaap = data.facts['us-gaap'];
      
      for (const concept in gaap) {
        const units = gaap[concept].units;
        if (!units) continue;
        for (const unit in units) {
          for (const fact of units[unit]) {
             if (fact.end) {
                if (fact.end < minDate) minDate = fact.end;
                if (fact.end > maxDate) maxDate = fact.end;
                totalFacts++;
             }
          }
        }
      }
      
      if (minDate < target.petition) {
         hasPrePetition = 'TAK';
      }
    }

    // Check index_membership.json
    // Szukamy po CIK, ale CIK w index_membership może być liczbą lub stringiem, padded lub nie
    const memberMatches = indexMembers.filter(m => String(m.cik).padStart(10, '0') === cik);
    let inIndex = 'NIE';
    let datesInIndex = '-';
    if (memberMatches.length > 0) {
      inIndex = 'TAK';
      datesInIndex = memberMatches.map(m => `${m.date_added || 'INF'} - ${m.date_removed || 'INF'}`).join(', ');
    }

    results.push({
      candidate: target.name,
      cik: cik,
      downloaded: isDownloaded,
      pre_petition: hasPrePetition,
      first_fact_end: minDate === '9999-99-99' ? '-' : minDate,
      in_index: inIndex,
      index_dates: datesInIndex
    });
  }

  console.log('\n--- RAPORT POBIERANIA (T-05f) ---');
  console.table(results);
}

main().catch(console.error);
