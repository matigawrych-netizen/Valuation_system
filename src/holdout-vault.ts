import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { HOLDOUT_END_YEAR, HOLDOUT_LOG, HOLDOUT_START_YEAR } from './paths.js';

export const MAX_TOUCHES = 3;
export const BASE_P_VALUE = 0.05;

export interface HoldoutTouch {
  type: 'TOUCH';
  date: string;
  commitHash: string;
  description: string;
  results: unknown;
}

export interface HoldoutReset {
  type: 'RESET';
  date: string;
  commitHash: string;
  invalidatedTouches: number;
  reason: string;
  archivedLog?: string;
}

export type HoldoutEntry = HoldoutTouch | HoldoutReset;

export class HoldoutVaultException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldoutVaultException';
  }
}

export function readHoldoutLog(file = HOLDOUT_LOG): HoldoutEntry[] {
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as any[];
  // Wpisy sprzed wprowadzenia pola `type` były dotknięciami.
  return raw.map((e) => (e.type ? e : { type: 'TOUCH', ...e }));
}

/** Dotknięcia liczone od ostatniego wpisu RESET (RESET nie liczy się do limitu, ale zostaje w logu na zawsze). */
export function vaultStatus(file = HOLDOUT_LOG) {
  const log = readHoldoutLog(file);
  const lastReset = log.map((e) => e.type).lastIndexOf('RESET');
  const activeTouches = log.slice(lastReset + 1).filter((e) => e.type === 'TOUCH').length;
  return {
    range: { startYear: HOLDOUT_START_YEAR, endYear: HOLDOUT_END_YEAR },
    activeTouches,
    maxTouches: MAX_TOUCHES,
    locked: activeTouches >= MAX_TOUCHES,
    nextPValueThreshold: BASE_P_VALUE / (activeTouches + 1),
  };
}

export function gitState(): { hash: string | null; clean: boolean; problem: string | null } {
  try {
    const hash = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { hash, clean: dirty.length === 0, problem: dirty.length ? 'drzewo gita ma niezatwierdzone zmiany' : null };
  } catch {
    return { hash: null, clean: false, problem: 'katalog nie jest repozytorium gita (NO_GIT_TRACKING niedopuszczalne)' };
  }
}

/** Dopisuje dotknięcie — wołać WYŁĄCZNIE po pomyślnym policzeniu wyników. */
export function recordTouch(description: string, results: unknown, file = HOLDOUT_LOG): HoldoutTouch {
  if (!description || description.trim().length < 10) {
    throw new HoldoutVaultException('Wymagany szczegółowy opis zmian (min. 10 znaków).');
  }
  const status = vaultStatus(file);
  if (status.locked) {
    throw new HoldoutVaultException(`SEJF ZABLOKOWANY: wykorzystano ${status.activeTouches}/${MAX_TOUCHES} dotknięć.`);
  }
  const git = gitState();
  if (!git.hash || !git.clean) throw new HoldoutVaultException(`Nie można zarejestrować dotknięcia: ${git.problem}`);
  const entry: HoldoutTouch = { type: 'TOUCH', date: new Date().toISOString(), commitHash: git.hash, description, results };
  const log = readHoldoutLog(file);
  log.push(entry);
  fs.writeFileSync(file, JSON.stringify(log, null, 2));
  return entry;
}
