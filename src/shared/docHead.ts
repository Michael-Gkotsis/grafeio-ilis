// Επικεφαλίδες εγγράφων (Michael, 13/11): πολλές επικεφαλίδες με όνομα, σχεδιασμένες στις Ρυθμίσεις (τρία κουτιά: Αριστερά, Μέση,
// Δεξιά, με γραμμές κειμένου, εικόνες, τόπο και ημερομηνία). Κάθε έγγραφο έχει όσες θέλεις διαθέσιμες και μία αρχική.
// Η «Όπως σήμερα» (TODAY) δεν αποθηκεύεται: είναι ο σημερινός κώδικας των εγγράφων και δεν αλλάζει ούτε σβήνεται.
// Εδώ μόνο τα δεδομένα και οι καθαρές συναρτήσεις· πώς βγαίνουν στο Excel, στο Word και στην εκτύπωση το κάνουν τα επόμενα βήματα.
import type { Settings } from './domain';
import { SIG_FORMS, type SigForm } from './sigs';

export type HeadAl = 'l' | 'c' | 'r';
export type HeadItem =
  | { k: 'text'; t: string; sz?: number; b?: boolean; u?: boolean; i?: boolean; al?: HeadAl }   // sz σε στιγμές (pt)· κενό = το μέγεθος των Γραμμάτων Excel
  | { k: 'img'; id: string; h: number; al?: HeadAl; side?: boolean; gray?: boolean }              // id = sha1 του αρχείου στο eikones/ (κενό = δεν διάλεξε ακόμα)· h σε εκατοστά· side = δίπλα στα γράμματα
  | { k: 'date' }                                                                                  // ο τόπος και η ημερομηνία του κάθε εγγράφου
  | { k: 'gap' };
export type HeadZones = [HeadItem[], HeadItem[], HeadItem[]];   // Αριστερά, Μέση, Δεξιά
export interface DocHead { id: string; name: string; z: HeadZones }
export type HeadUse = { on: string[]; def: string };            // διαθέσιμες επικεφαλίδες και η αρχική του εγγράφου

export const TODAY = 'today';
export const TODAY_NAME = 'Όπως σήμερα';
export const ZONE_NAMES = ['Αριστερά', 'Μέση', 'Δεξιά'] as const;
export const IMG_H = { min: 0.5, max: 6, def: 2 };   // εκατοστά
export const TEXT_SZ = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];
export const HEAD_MAX = 30;                          // επικεφαλίδες το πολύ
const NAME_MAX = 60, TEXT_MAX = 200, ITEMS_MAX = 12;

type Heads = Pick<Settings, 'heads'>;
type Unit = Pick<Settings, 'unit' | 'hdLeft'>;

// ——— έτοιμες μορφές για νέα επικεφαλίδα ———
export type PresetId = 'today' | 'imgLeft' | 'imgMid' | 'empty';
export const PRESETS: { id: PresetId; name: string; help: string }[] = [
  { id: 'today', name: 'Όπως σήμερα', help: 'Οι 3 γραμμές της μονάδας δεξιά, η ημερομηνία αριστερά.' },
  { id: 'imgLeft', name: 'Εικόνα αριστερά', help: 'Εικόνα και οι 3 γραμμές της μονάδας αριστερά, η ημερομηνία δεξιά.' },
  { id: 'imgMid', name: 'Εικόνα στη μέση', help: 'Εικόνα στη μέση, οι 3 γραμμές δεξιά, η ημερομηνία αριστερά.' },
  { id: 'empty', name: 'Άδεια', help: 'Τίποτα, να τη φτιάξεις εσύ.' }
];
const lines = (st: Pick<Settings, 'unit'>, al: HeadAl): HeadItem[] => st.unit.map(t => ({ k: 'text', t, al }));
const IMG = (al: HeadAl): HeadItem => ({ k: 'img', id: '', h: IMG_H.def, al });
// Τα 3 πεδία της «Κεφαλίδας εντύπων» (settings.unit) γίνονται οι 3 γραμμές· το hdLeft (παλιά διάταξη) φέρνει την κεφαλίδα αριστερά
export function presetZones(id: PresetId, st: Unit): HeadZones {
  const date: HeadItem = { k: 'date' };
  if (id === 'empty') return [[], [], []];
  if (id === 'today') return st.hdLeft ? [lines(st, 'c'), [], [date]] : [[date], [], lines(st, 'c')];
  if (id === 'imgLeft') return [[IMG('c'), ...lines(st, 'c')], [], [date]];
  return [[date], [IMG('c')], lines(st, 'c')];
}
// Σύρσιμο: το κομμάτι from = [κουτί, θέση] πάει στο κουτί to[0], πριν από τη θέση to[1] (όπως τη βλέπεις πριν φύγει από εκεί). Γεμάτο κουτί: τίποτα
export function moveItem(z: HeadZones, from: [number, number], to: [number, number]): HeadZones {
  const item = z[from[0]]?.[from[1]]; if (!item || !z[to[0]]) return z;
  if (from[0] !== to[0] && z[to[0]].length >= ITEMS_MAX) return z;
  const out = z.map(a => [...a]) as HeadZones; out[from[0]].splice(from[1], 1);
  const at = Math.max(0, Math.min(out[to[0]].length, from[0] === to[0] && to[1] > from[1] ? to[1] - 1 : to[1]));
  out[to[0]].splice(at, 0, item); return out;
}
export const canAddItem = (z: HeadZones, zone: number) => z[zone].length < ITEMS_MAX;
export const cloneZones = (z: HeadZones): HeadZones => z.map(a => a.map(x => ({ ...x }))) as HeadZones;

// ——— λίστα και χρήση ———
export const todayHead = (st: Unit): DocHead => ({ id: TODAY, name: TODAY_NAME, z: presetZones('today', st) });
// Η «Όπως σήμερα» πρώτη, μετά οι δικές του
export const headsOf = (st: Heads & Unit): DocHead[] => [todayHead(st), ...(st.heads || [])];
export const headById = (st: Heads & Unit, id: string): DocHead | undefined => (id === TODAY ? todayHead(st) : st.heads?.find(h => h.id === id));
export const headName = (st: Heads, id: string): string => (id === TODAY ? TODAY_NAME : st.heads?.find(h => h.id === id)?.name ?? TODAY_NAME);

// Ανά έγγραφο: διαθέσιμες + αρχική. Λείπει = μόνο η «Όπως σήμερα». Ό,τι δεν υπάρχει πια φεύγει· πάντα τουλάχιστον μία, και η αρχική είναι μέσα στις διαθέσιμες
export function headUseOf(st: Heads & Pick<Settings, 'headUse'>, form: SigForm): HeadUse {
  const u = st.headUse?.[form]; const known = new Set([TODAY, ...(st.heads || []).map(h => h.id)]);
  const on = (u?.on || []).filter((id, i, a) => known.has(id) && a.indexOf(id) === i);
  if (!on.length) return { on: [TODAY], def: TODAY };
  return { on, def: on.includes(u!.def) ? u!.def : on[0] };
}
const isDefaultUse = (u: HeadUse) => u.on.length === 1 && u.on[0] === TODAY && u.def === TODAY;
// Τα έγγραφα που μπορούν να πάρουν την επικεφαλίδα, και όσα την έχουν αρχική
export const formsUsing = (st: Heads & Pick<Settings, 'headUse'>, id: string): SigForm[] => SIG_FORMS.filter(f => headUseOf(st, f).on.includes(id));
export const formsDefaulting = (st: Heads & Pick<Settings, 'headUse'>, id: string): SigForm[] => SIG_FORMS.filter(f => headUseOf(st, f).def === id);

// Βάζει τη χρήση ενός εγγράφου· η προεπιλογή δεν αποθηκεύεται
function withUse(st: Pick<Settings, 'headUse'>, form: SigForm, u: HeadUse): Settings['headUse'] {
  const all = { ...(st.headUse || {}) }; if (isDefaultUse(u)) delete all[form]; else all[form] = u;
  return Object.keys(all).length ? all : undefined;
}
// Τσεκ: διαθέσιμη ή όχι. Το τελευταίο τσεκ δεν βγαίνει· αν βγει η αρχική, το αστέρι πάει στην πρώτη που μένει
export function toggleUse(st: Heads & Pick<Settings, 'headUse'>, form: SigForm, id: string): Settings['headUse'] {
  const u = headUseOf(st, form); const order = [TODAY, ...(st.heads || []).map(h => h.id)];
  const on = u.on.includes(id) ? u.on.filter(x => x !== id) : order.filter(x => x === id || u.on.includes(x));
  if (!on.length) return st.headUse;
  return withUse(st, form, { on, def: on.includes(u.def) ? u.def : on[0] });
}
// Αστέρι: αρχική (μόνο ανάμεσα στις διαθέσιμες)
export function setDefault(st: Heads & Pick<Settings, 'headUse'>, form: SigForm, id: string): Settings['headUse'] {
  const u = headUseOf(st, form); if (!u.on.includes(id)) return st.headUse;
  return withUse(st, form, { on: u.on, def: id });
}

// ——— νέα, αντίγραφο, όνομα, σβήσιμο ———
export function newHeadId(heads: DocHead[] | undefined, rnd: () => number = Math.random): string {
  const have = new Set((heads || []).map(h => h.id));
  for (;;) { const id = 'h' + Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0'); if (!have.has(id) && id !== TODAY) return id; }
}
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
// Όνομα που δεν υπάρχει ήδη: «Όνομα», «Όνομα (2)»…
export function freeHeadName(st: Heads, name: string, except?: string): string {
  const base = cleanName(name) || 'Επικεφαλίδα'; const used = new Set([TODAY_NAME, ...(st.heads || []).filter(h => h.id !== except).map(h => h.name)].map(x => x.toLowerCase()));
  let n = base, i = 1; while (used.has(n.toLowerCase())) n = base + ' (' + ++i + ')';
  return n;
}
export function addHead(st: Heads & Unit, name: string, z: HeadZones, rnd?: () => number): { heads: DocHead[]; id: string } {
  const id = newHeadId(st.heads, rnd);
  return { id, heads: [...(st.heads || []), { id, name: freeHeadName(st, name), z: cloneZones(z) }] };
}
export const copyHead = (st: Heads & Unit, id: string, rnd?: () => number) => { const h = headById(st, id)!; return addHead(st, h.name + ' (αντίγραφο)', h.z, rnd); };
export const renameHead = (st: Heads, id: string, name: string): DocHead[] => (st.heads || []).map(h => (h.id === id ? { ...h, name: freeHeadName(st, name, id) } : h));
export const setZones = (st: Heads, id: string, z: HeadZones): DocHead[] => (st.heads || []).map(h => (h.id === id ? { ...h, z } : h));
// Σβήσιμο: φεύγει από κάθε έγγραφο· όποιο την είχε αρχική γυρνά στην «Όπως σήμερα»
export function removeHead(st: Heads & Pick<Settings, 'headUse'>, id: string): Pick<Settings, 'heads' | 'headUse'> {
  const heads = (st.heads || []).filter(h => h.id !== id);
  let headUse = st.headUse;
  for (const f of SIG_FORMS) {
    const u = st.headUse?.[f]; if (!u?.on.includes(id)) continue;
    const on = u.on.filter(x => x !== id), def = u.def === id ? TODAY : u.def;
    headUse = withUse({ headUse }, f, { on: !on.length ? [TODAY] : on.includes(def) ? on : [TODAY, ...on], def: !on.length ? TODAY : def });
  }
  return { heads: heads.length ? heads : undefined, headUse };
}

// ——— έλεγχος και καθάρισμα (ό,τι έρχεται από τη βάση ή από την οθόνη) ———
const num = (v: unknown, lo: number, hi: number, d?: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const al = (v: unknown): HeadAl | undefined => (v === 'l' || v === 'c' || v === 'r' ? v : undefined);
const IMG_ID = /^(?:[0-9a-f]{40})?$/;
export function cleanItem(x: any): HeadItem | null {
  if (!x || typeof x !== 'object') return null;
  if (x.k === 'date') return { k: 'date' };
  if (x.k === 'gap') return { k: 'gap' };
  if (x.k === 'text') {
    const o: HeadItem = { k: 'text', t: typeof x.t === 'string' ? x.t.replace(/[\r\n]+/g, ' ').slice(0, TEXT_MAX) : '' };
    const sz = num(x.sz, 6, 48); if (sz !== undefined) o.sz = Math.round(sz * 2) / 2;
    if (x.b === true) o.b = true; if (x.u === true) o.u = true; if (x.i === true) o.i = true;
    const a = al(x.al); if (a) o.al = a; return o;
  }
  if (x.k === 'img') {
    if (typeof x.id !== 'string' || !IMG_ID.test(x.id)) return null;
    const o: HeadItem = { k: 'img', id: x.id, h: Math.round(num(x.h, IMG_H.min, IMG_H.max, IMG_H.def)! * 10) / 10 };
    const a = al(x.al); if (a) o.al = a; if (x.side === true) o.side = true; if (x.gray === true) o.gray = true; return o;
  }
  return null;
}
export function cleanHeads(raw: unknown): DocHead[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DocHead[] = []; const ids = new Set<string>([TODAY]); const names = new Set<string>([TODAY_NAME.toLowerCase()]);
  for (const h of raw.slice(0, HEAD_MAX)) {
    if (!h || typeof h !== 'object' || typeof h.id !== 'string' || !h.id || h.id.length > 20 || ids.has(h.id)) continue;
    let name = cleanName(String(h.name ?? '')) || 'Επικεφαλίδα'; const base = name; let i = 1;
    while (names.has(name.toLowerCase())) name = base + ' (' + ++i + ')';
    const z = (Array.isArray(h.z) ? [0, 1, 2].map(k => (Array.isArray(h.z[k]) ? h.z[k].slice(0, ITEMS_MAX).map(cleanItem).filter(Boolean) : [])) : [[], [], []]) as HeadZones;
    ids.add(h.id); names.add(name.toLowerCase()); out.push({ id: h.id, name, z });
  }
  return out.length ? out : undefined;
}
export function cleanHeadUse(raw: unknown, heads: DocHead[] | undefined): Settings['headUse'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<Settings['headUse']> = {};
  for (const f of SIG_FORMS) {
    const u = (raw as any)[f]; if (!u || typeof u !== 'object') continue;
    const v = headUseOf({ heads, headUse: { [f]: { on: Array.isArray(u.on) ? u.on.filter((x: unknown) => typeof x === 'string') : [], def: String(u.def ?? '') } } }, f);
    if (!isDefaultUse(v)) out[f] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
