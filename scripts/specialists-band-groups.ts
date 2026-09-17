/**
 * U1 (docs/ulepszenia.md): trafność pasów 80% w grupach spółek na wynikach egzaminu.
 *   npm run specialists:band-groups                 (pierwszy egzamin)
 *   npm run specialists:band-groups -- --variant u1  (wariant)
 * Wynik: artifacts/universe[/wariant]/band-groups.md i .json.
 */
import fs from 'node:fs';
import os from 'node:os';
import {
  GROUP_COUNT,
  allGroupsWithinK1,
  coverageByGroup,
  mergeSmallSectors,
  quintilesByDay,
  volatilityRuleTriggered,
  type GroupBand,
} from '../src/band-groups.js';
import { HORIZONS } from '../src/facts-panel.js';
import { universeDir } from '../src/paths.js';
import { isComplete, readExamFile, specialistFiles, type ExamRecord } from '../src/specialist-exam.js';
import { loadSpecialistRows, type SpecialistRow } from '../src/specialist-features.js';
import { isExamDecision } from '../src/specialist-memory.js';
import { TEAM } from '../src/specialists.js';

const pct = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(1)}%`);

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const GROUP_LABEL = {
  volatility: ['najspokojniejsze', 'spokojne', 'średnie', 'zmienne', 'najbardziej zmienne'],
  size: ['najmniejsze', 'małe', 'średnie', 'duże', 'największe'],
};

async function main() {
  try {
    os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // priorytet nie zmienia wyników
  }
  const variant = arg('--variant');
  const dir = variant ? universeDir('specialists', variant) : universeDir('specialists');
  const outDir = variant ? `artifacts/universe/${variant}` : 'artifacts/universe';
  const ids = ['weteran', 'reporter', 'archiwista', 'kompas'].filter((id) => isComplete(dir, id));
  if (!ids.includes('weteran')) {
    console.error(`Brak wyników Weterana w ${dir}. Najpierw egzamin modelu prostego.`);
    process.exit(1);
  }

  const rows = loadSpecialistRows(universeDir('panel', 'facts-panel.csv'), universeDir('panel', 'specialist-extras.csv'));
  const exam = rows.filter((r) => isExamDecision(r.asOf));
  const volGroup = quintilesByDay(exam, (r) => r.asOf, (r) => r.volatility1y);
  const sizeGroup = quintilesByDay(exam, (r) => r.asOf, (r) => r.marketCap);
  const byKey = new Map<string, SpecialistRow>(exam.map((r) => [`${r.cik}|${r.asOf}`, r]));
  const rowOf = (r: ExamRecord) => byKey.get(`${r.cik}|${r.asOf}`);
  const g = (m: Map<SpecialistRow, number | null>) => (r: ExamRecord) => {
    const row = rowOf(r);
    const v = row ? m.get(row) : null;
    return v == null ? null : String(v);
  };

  const result: Record<string, Record<string, GroupBand[][]>> = {};
  for (const id of ids) {
    const records = readExamFile(specialistFiles(dir, id).exam);
    result[id] = {
      volatility: HORIZONS.map((h) => coverageByGroup(records, h, g(volGroup))),
      size: HORIZONS.map((h) => coverageByGroup(records, h, g(sizeGroup))),
      sector: HORIZONS.map((h) => coverageByGroup(records, h, mergeSmallSectors(records, h, (r) => rowOf(r)?.sector ?? null))),
    };
  }

  const rule = volatilityRuleTriggered(result.weteran.volatility);
  const keep = allGroupsWithinK1(result.weteran.volatility);

  const L: string[] = [];
  L.push(`# U1: pas 80% w grupach spółek${variant ? ` — wariant ${variant}` : ''}`, '');
  L.push(`Wygenerowano: ${new Date().toISOString()}. Reguły zapisane przed pomiarem: \`docs/ulepszenia.md\`.`, '');
  L.push('Grupy liczone wśród decyzji egzaminu z tego samego dnia (kwintyle). Komórka: pokrycie pasa · poniżej pasa · powyżej pasa (n). Próg K1: 72–88%.', '');
  L.push(
    `**Reguła U1 (Weteran):** skrajna grupa zmienności poza 72–88% na ${rule.horizons} z 5 horyzontów → ` +
      (rule.triggered ? '**próg przekroczony — pas wymaga zależności od zmienności (U1b).**' : '**próg nieprzekroczony.**'),
    ''
  );
  if (variant) L.push(`**Warunek utrzymania U1b (Weteran):** wszystkie grupy zmienności w progu na każdym horyzoncie → ${keep ? '**spełniony**' : '**niespełniony**'}.`, '');

  const names: Record<string, string> = Object.fromEntries(TEAM.map((d) => [d.id, d.name]));
  const block = (title: string, kind: 'volatility' | 'size' | 'sector') => {
    L.push(`## ${title}`, '');
    for (const id of ids) {
      L.push(`### ${names[id]}`, '');
      const groups = [...new Set(result[id][kind].flatMap((hs) => hs.map((x) => x.group)))].sort((a, b) => a.localeCompare(b, 'pl', { numeric: true }));
      const label = (grp: string) => (kind === 'sector' ? grp : `${grp} — ${GROUP_LABEL[kind][Number(grp) - 1]}`);
      L.push(`| grupa | ${HORIZONS.map((h) => `${h} r.`).join(' | ')} |`);
      L.push(`|---|${HORIZONS.map(() => '---').join('|')}|`);
      for (const grp of groups) {
        const cells = HORIZONS.map((h) => {
          const x = result[id][kind][h - 1].find((y) => y.group === grp);
          if (!x) return '—';
          const flag = x.status === 'BRAK POMIARU' ? ' (brak pomiaru)' : x.status === 'FAIL' ? ' ✗' : '';
          return `${pct(x.coverage)}${flag} · ${pct(x.below)} · ${pct(x.above)} (${x.n})`;
        });
        L.push(`| ${label(grp)} | ${cells.join(' | ')} |`);
      }
      L.push('');
    }
  };
  block('Zmienność kursu z ostatniego roku', 'volatility');
  block('Wielkość spółki', 'size');
  block('Sektor', 'sector');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(`${outDir}/band-groups.md`, L.join('\n'));
  fs.writeFileSync(`${outDir}/band-groups.json`, JSON.stringify({ generatedAt: new Date().toISOString(), variant, groupCount: GROUP_COUNT, rule, keepU1b: keep, result }, null, 1));
  console.error(`Zapisano ${outDir}/band-groups.md. Reguła U1: ${rule.triggered ? 'przekroczona' : 'nieprzekroczona'} (${rule.horizons}/5).`);
  for (const [h, groups] of result.weteran.volatility.entries()) {
    console.error(`  Weteran ${h + 1} r.: ${groups.map((x) => `${x.group}:${pct(x.coverage)}`).join('  ')}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
