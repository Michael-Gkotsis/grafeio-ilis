// Ρυθμίσεις εμφάνισης του PC (όχι της βάσης): θέμα, πυκνότητα, μενού, ζουμ Excel, πρόσφατα πρόσωπα.
// Ζουν στο localStorage· αν δεν διαβάζεται (π.χ. κλειδωμένος δίσκος), η εφαρμογή δουλεύει με τις προεπιλογές.
import { createContext, useContext } from 'react';

export interface Prefs { theme: 'auto' | 'light' | 'dark'; density: 'normal' | 'compact'; nav: 'auto' | 'full' | 'rail'; xlZoom: 'fit' | '100' }
export const DEFAULT_PREFS: Prefs = { theme: 'auto', density: 'normal', nav: 'auto', xlZoom: 'fit' };
const KEY = 'grafeio.prefs';

export function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
}
export function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* χωρίς αποθήκευση */ }
}
export function loadPrefs(): Prefs {
  const p = load(KEY, DEFAULT_PREFS);
  // παλιό κλειδί του μενού (πριν από τις ρυθμίσεις εμφάνισης)
  try { const old = localStorage.getItem('grafeio.nav'); if (old && p.nav === 'auto') p.nav = old === 'rail' ? 'rail' : 'full'; } catch { /* τίποτα */ }
  return p;
}
export const savePrefs = (p: Prefs) => save(KEY, p);

// Θέμα και πυκνότητα ως attributes στο <html>, ώστε να τα πιάνει μόνο το CSS (χωρίς re-render)
export function applyPrefs(p: Prefs) {
  const r = document.documentElement;
  if (p.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', p.theme);
  r.setAttribute('data-density', p.density);
}

export interface PrefsValue { prefs: Prefs; set<K extends keyof Prefs>(k: K, v: Prefs[K]): void; rail: boolean }
export const PrefsCtx = createContext<PrefsValue>({ prefs: DEFAULT_PREFS, set: () => {}, rail: false });
export const usePrefs = () => useContext(PrefsCtx);
// Ύψος γραμμής στις λίστες (VirtualList): μικρότερο στη συμπαγή προβολή
export const useRowH = (normal: number, compact: number) => (usePrefs().prefs.density === 'compact' ? compact : normal);

// Πρόσφατα πρόσωπα για το Ctrl+K (μόνο αριθμοί ατόμων)
const RECENT = 'grafeio.recent';
export function recentPeople(): number[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT) || '[]'); return Array.isArray(v) ? v.filter(n => typeof n === 'number') : []; } catch { return []; }
}
export function pushRecent(pid: number) {
  save(RECENT, [pid, ...recentPeople().filter(x => x !== pid)].slice(0, 5));
}
