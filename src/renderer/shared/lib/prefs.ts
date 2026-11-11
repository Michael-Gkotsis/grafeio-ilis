// The PC's display preferences and the small localStorage helpers behind them.
// Purpose: theme, density, menu, Excel zoom, rank names, the recent people for Ctrl+K; `load`/`save` for the other
//   per-PC keys (`grafeio.people`, `grafeio.quickAdd`).
// Does NOT: touch the database; if localStorage cannot be read (e.g. a locked disk) the app runs on the defaults.
// Owner layer: renderer/shared/lib. Why: every layer reads these, and the keys are a frozen contract.
// Covering test: test/prefs.test.ts.
// FROZEN: the keys `grafeio.prefs`, `grafeio.nav` (old menu key, migrated once) and `grafeio.recent`, and the JSON
//   format they are written in (CLAUDE.md hard rule 3).
import { createContext, useContext } from 'react';

export interface Prefs {
  theme: 'auto' | 'light' | 'dark';
  density: 'normal' | 'compact';
  nav: 'auto' | 'full' | 'rail';
  xlZoom: 'fit' | '100';
  rankNames: boolean;
}
export const DEFAULT_PREFS: Prefs = { theme: 'auto', density: 'normal', nav: 'auto', xlZoom: 'fit', rankNames: true };
const KEY = 'grafeio.prefs';

/**
 * Reads a JSON object from localStorage on top of `fallback`.
 * @returns always a new object (the defaults are never changed by whoever changes the result); `fallback` copy when
 *   the key is missing, not JSON, or localStorage cannot be read
 */
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}
/** Writes `v` as JSON; a failing localStorage is ignored (the setting simply is not remembered). */
export function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* no storage */
  }
}
/** The saved preferences; migrates the old `grafeio.nav` key once into `nav` and deletes it. */
export function loadPrefs(): Prefs {
  const p = load(KEY, DEFAULT_PREFS);
  // Old menu key (before the display settings existed): moves into the preferences once and is removed.
  try {
    const old = localStorage.getItem('grafeio.nav');
    if (old) {
      if (p.nav === 'auto') p.nav = old === 'rail' ? 'rail' : 'full';
      save(KEY, p);
      localStorage.removeItem('grafeio.nav');
    }
  } catch {
    /* nothing */
  }
  return p;
}
export const savePrefs = (p: Prefs) => save(KEY, p);

/** Theme and density go to attributes on <html>, so only the CSS reacts (no re-render). */
export function applyPrefs(p: Prefs) {
  const r = document.documentElement;
  if (p.theme === 'auto') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', p.theme);
  r.setAttribute('data-density', p.density);
}

export interface PrefsValue {
  prefs: Prefs;
  set<K extends keyof Prefs>(k: K, v: Prefs[K]): void;
  rail: boolean;
}
export const PrefsCtx = createContext<PrefsValue>({ prefs: DEFAULT_PREFS, set: () => {}, rail: false });
export const usePrefs = () => useContext(PrefsCtx);
/** Row height in the lists (VirtualList): smaller in the compact density. */
export const useRowH = (normal: number, compact: number) => (usePrefs().prefs.density === 'compact' ? compact : normal);

// Recent people for Ctrl+K (person numbers only)
const RECENT = 'grafeio.recent';
/** Person ids opened recently, newest first (at most 5); `[]` when the key is missing or damaged. */
export function recentPeople(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT) || '[]');
    return Array.isArray(v) ? v.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}
/** Puts `pid` first in the recent list (no duplicates, at most 5). */
export function pushRecent(pid: number) {
  save(RECENT, [pid, ...recentPeople().filter((x) => x !== pid)].slice(0, 5));
}
