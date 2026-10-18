// ΕΣΣΟ (σειρά στρατεύσιμων): ποια τρέχει τώρα, ποια ακολουθεί, και τι μένει όταν ξεκινά νέα (Michael, 17/10).
// Η τωρινή ΕΣΣΟ κρατιέται στις Ρυθμίσεις (settings.essos)· αν δεν έχει οριστεί, βγαίνει από την πιο συχνή ΕΣΣΟ όσων
// είναι σε δύναμη (το «2026 Γ΄» που γράφει το Δυναμολόγιο). Το essoLabel() είναι ό,τι δείχνει η εφαρμογή (πάνω δεξιά κ.λπ.).
import { emptyState, type AppState, type Person, type Settings } from './domain';
import type { ISODate } from './dates';
import { norm } from './text';

export type EssoSeries = 'Α' | 'Β' | 'Γ' | 'Δ';
export const ESSO_SERIES: EssoSeries[] = ['Α', 'Β', 'Γ', 'Δ'];
// from: πότε ξεκίνησε στην εφαρμογή («Νέα ΕΣΣΟ»)
export interface Esso { s: EssoSeries; y: number; from?: ISODate }

export const essoName = (e: Esso) => e.s + '΄ ΕΣΣΟ ' + e.y;   // «Γ΄ ΕΣΣΟ 2026»
export const essoPersonTxt = (e: Esso) => e.y + ' ' + e.s + '΄';   // όπως στο Person.essos και στο Δυναμολόγιο: «2026 Γ΄»
export const sameEsso = (a: Esso | null | undefined, b: Esso | null | undefined) => !!a && !!b && a.s === b.s && a.y === b.y;

// «2026 Γ΄», «Γ' ΕΣΣΟ 2026», «Γ 2026», «ΔΥΝΑΜΟΛΟΓΙΟ Β ΕΣΣΟ 2026» → { s, y }
export function parseEsso(raw: unknown): Esso | null {
  const t = norm(raw).replace(/[A-D]/g, c => 'ΑΒΓΔ'['ABCD'.indexOf(c)]);
  const m = /(?:^|[^Α-Ω])([Α-Δ])\s*['΄’`]?\s*(?:ΕΣΣΟ)?\s*(20\d\d)\b/.exec(t) || /\b(20\d\d)\s*([Α-Δ])(?![Α-Ω])/.exec(t);
  if (!m) return null;
  const [s, y] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
  return { s: s as EssoSeries, y: +y };
}

// Η πιο συχνή ΕΣΣΟ όσων είναι σε δύναμη
export function essoOfPeople(people: Person[]): Esso | null {
  const n = new Map<string, number>();
  for (const p of people) if (p.active && p.essos) n.set(p.essos, (n.get(p.essos) || 0) + 1);
  const top = [...n].sort((a, b) => b[1] - a[1])[0];
  return top ? parseEsso(top[0]) : null;
}
export const currentEsso = (s: { settings: Settings; people: Person[] }): Esso | null => s.settings.essos || essoOfPeople(s.people);
export const essoLabel = (s: { settings: Settings; people: Person[] }): string => { const e = currentEsso(s); return e ? essoName(e) : ''; };

// Η επόμενη: μετά τη Δ΄ η Α΄ της επόμενης χρονιάς. Χωρίς τωρινή: από τον μήνα (Ιαν-Μαρ Α΄, Απρ-Ιουν Β΄, Ιουλ-Σεπ Γ΄, Οκτ-Δεκ Δ΄).
export function nextEsso(cur: Esso | null, today: ISODate): Esso {
  if (!cur) return { s: ESSO_SERIES[Math.floor((+today.slice(5, 7) - 1) / 3)], y: +today.slice(0, 4) };
  const i = ESSO_SERIES.indexOf(cur.s);
  return i === 3 ? { s: 'Α', y: cur.y + 1 } : { s: ESSO_SERIES[i + 1], y: cur.y };
}

// Η κατάσταση της νέας ΕΣΣΟ: ό,τι αφορά τους στρατιώτες της προηγούμενης φεύγει (άτομα, καταστάσεις, υπηρεσίες,
// δυνατότητες, αιτήσεις, ΗΚΑΙ, έλεγχος υπηρεσιών)· μένουν οι κανόνες, οι ρυθμίσεις της μονάδας, οι υπηρεσίες, οι λίστες,
// οι αργίες, τα templates των εντύπων και τα στελέχη. Τα Excel της παλιάς δεν είναι πια πηγές· ο φάκελος των αρχείων
// γίνεται ο φάκελος της νέας (outputDir) και τα έντυπα πηγαίνουν εκεί (χωρίς δικό τους φάκελο). Το έντυπο υπηρεσιών
// ξεκινά από τη ΣΒΕΝ, όπως κάθε νέα σειρά.
// unit: τύπος μονάδας, κεφαλίδα και μονάδα του τίτλου, όπως ορίστηκαν στο πρώτο βήμα (κενό = όπως ήταν)
export function freshState(s: AppState, e: Esso, today: ISODate, outputDir: string, unit?: Pick<Settings, 'unitKind' | 'unit' | 'unitName'>): AppState {
  const st = s.settings;
  const forms = Object.fromEntries(Object.entries(st.forms || {}).map(([k, b]) => { const c = { ...b }; delete c.dir; return [k, c]; }).filter(([, b]) => Object.values(b as object).some(v => v !== undefined && v !== '')));
  const settings: Settings = { ...st, essos: { s: e.s, y: e.y, from: today }, sources: {}, newDirs: {}, forms, outputDir, fixed: {}, phase: 'sven', baselineReviewed: true, ...(unit || {}) };
  return { ...emptyState(), rules: s.rules, settings, cadreList: s.cadreList, cadreAbs: s.cadreAbs };
}

// ------------------------------------------------------------------ αρχείο ΕΣΣΟ (φάκελος με βάση, Excel και ΕΣΣΟ.json)
export const MANIFEST = 'ΕΣΣΟ.json';
export interface ArchivedFile { orig: string; copy: string; kind?: string; form?: string }   // copy: σχετικά με τον φάκελο του αρχείου
export interface EssoManifest {
  app: 'grafeio-ilis'; v: 1;
  name: string;          // «Β΄ ΕΣΣΟ 2026» (ή «ΕΣΣΟ» αν δεν ήταν γνωστή)
  esso?: Esso;
  at: string;            // πότε μπήκε στο αρχείο (ΕΕΕΕ-ΜΜ-ΗΗ ΩΩ:ΛΛ)
  version: string;       // έκδοση της εφαρμογής
  people: number;        // σε δύναμη εκείνη τη στιγμή
  files: ArchivedFile[];
  outDirs: string[];     // πού έμειναν τα έντυπα που βγήκαν (δεν αντιγράφονται)
}
export function isManifest(x: unknown): x is EssoManifest {
  const m = x as EssoManifest;
  return !!m && m.app === 'grafeio-ilis' && m.v === 1 && typeof m.name === 'string' && Array.isArray(m.files);
}
// Όνομα φακέλου στο αρχείο: «Β΄ ΕΣΣΟ 2026 (έως 17-10-2026)»
export const archiveDirName = (name: string, day: ISODate) => (name + ' (έως ' + day.slice(8, 10) + '-' + day.slice(5, 7) + '-' + day.slice(0, 4) + ')').replace(/[\\/:*?"<>|]/g, '-');
// Στην επαναφορά: το αρχείο μένει εκεί που ήταν αν υπάρχει ακόμα· αλλιώς (π.χ. άλλο PC) το αντίγραφο του αρχείου ΕΣΣΟ
export function restoredPath(orig: string, m: EssoManifest, copyPath: (rel: string) => string, exists: (f: string) => boolean): string {
  if (exists(orig)) return orig;
  const f = m.files.find(x => x.orig === orig);
  return f && exists(copyPath(f.copy)) ? copyPath(f.copy) : orig;
}
