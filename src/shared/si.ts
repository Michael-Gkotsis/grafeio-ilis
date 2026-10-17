// Σ.Ι. (σωματική ικανότητα), Michael 13/10: βασική (Ι1–Ι4 και όσες προσθέσεις), για το Ι3 «ΜΕ ΟΠΛΟ» ή «ΧΩΡΙΣ ΟΠΛΟ»
// (Michael 17/10: έτσι λέγεται, όχι «ΑΟΠΛΟ»· άοπλοι μόνο ο Ι3 ΧΩΡΙΣ ΟΠΛΟ και ο Ι4, που είναι πάντα άοπλος),
// και για Ι3/Ι4 κατηγορία πάθησης (ΟΡΘΟΠΑΙΔΙΚΟ, ΠΑΘΟΛΟΓΙΚΟ…, όπως οι ενότητες του Γενικού
// Πίνακα Νοσημάτων του π.δ. 11/2014). Για κάθε Σ.Ι. ορίζεις σε ποιες υπηρεσίες μπαίνει (Ρυθμίσεις › Σ.Ι.), ανά υπηρεσία.
// Στις ρυθμίσεις μένουν μόνο οι αλλαγές σου (lists.si). Προεπιλογή: ο άοπλος (περιέχει «ΑΟΠΛ»/«ΧΩΡΙΣ ΟΠΛ» ή αρχίζει από «Ι4», όπως
// πριν, ranks.ts siUnarmed) δεν μπαίνει σε ένοπλη υπηρεσία· όλοι οι άλλοι παντού.
import { normGreek } from './text';
import type { BlockDef } from './domain';
import { siUnarmed, type UserLists } from './ranks';

// add: δικές σου βασικές (π.χ. Ι5) · cats: δικές σου ή κρυμμένες κατηγορίες πάθησης
// cells: γραμμή του πίνακα («Ι3 ΧΩΡΙΣ ΟΠΛΟ» ή «Ι3 ΧΩΡΙΣ ΟΠΛΟ · ΟΡΘΟΠΑΙΔΙΚΟ») → υπηρεσία (id μπλοκ) → μπαίνει ή όχι
export interface SiConfig { add?: string[]; cats?: { add?: string[]; hide?: string[] }; cells?: Record<string, Record<string, boolean>> }
export const SI_BASES = ['Ι1', 'Ι2', 'Ι3', 'Ι4'];
export const SI_SUBS: Record<string, string[]> = { 'Ι3': ['ΜΕ ΟΠΛΟ', 'ΧΩΡΙΣ ΟΠΛΟ'] };
// Σ.Ι. που παίρνουν κατηγορία πάθησης
export const SI_CAT_BASES = ['Ι3', 'Ι4'];
export const SI_CATS = ['ΠΑΘΟΛΟΓΙΚΟ', 'ΟΡΘΟΠΑΙΔΙΚΟ', 'ΧΕΙΡΟΥΡΓΙΚΟ', 'ΚΑΡΔΙΟΛΟΓΙΚΟ', 'ΠΝΕΥΜΟΝΟΛΟΓΙΚΟ', 'ΝΕΥΡΟΛΟΓΙΚΟ', 'ΨΥΧΙΑΤΡΙΚΟ',
  'ΟΦΘΑΛΜΟΛΟΓΙΚΟ', 'ΩΡΛ', 'ΔΕΡΜΑΤΟΛΟΓΙΚΟ', 'ΟΥΡΟΛΟΓΙΚΟ', 'ΑΛΛΕΡΓΙΟΛΟΓΙΚΟ', 'ΑΙΜΑΤΟΛΟΓΙΚΟ', 'ΕΝΔΟΚΡΙΝΟΛΟΓΙΚΟ'];
// ό,τι γράφεται αλλιώς στο Δυναμολόγιο: «ΑΟΠΛΟ», «ΑΟΠΛΟΣ», «ΕΝΟΠΛΟΣ» (χωρίς κενά και σημεία)
const SYN: [RegExp, string][] = [[/^(ΑΟΠΛ|ΧΩΡΙΣΟΠΛ)/, 'ΧΩΡΙΣ ΟΠΛΟ'], [/^(ΜΕΟΠΛ|ΕΝΟΠΛ)/, 'ΜΕ ΟΠΛΟ']];
// χωρίς κενά, τελείες, κάθετους: «Ι/3», «Ι 3», «I3» (λατινικό) είναι το ίδιο
const key = (v: string) => normGreek(v).replace(/[^Α-ΩA-Z0-9]/g, '');
export const siName = (v: string) => normGreek(v).replace(/\s+/g, ' ').trim();
export const siLabel = (base: string, sub: string) => base + (sub ? ' ' + sub : '');
export const siRowKey = (label: string, cat?: string) => (cat ? label + ' · ' + cat : label);

export const siBases = (cfg?: SiConfig): string[] => {
  const out = [...SI_BASES]; const have = new Set(out.map(key));
  for (const b of cfg?.add || []) { const k = key(b); if (k && !have.has(k)) { have.add(k); out.push(siName(b)); } }
  return out;
};
export const siSubs = (base: string): string[] => SI_SUBS[base] || [];
// Κατηγορίες πάθησης: οι βασικές που δεν έκρυψες και οι δικές σου (all: και οι κρυμμένες)
export function siCats(cfg?: SiConfig, all = false): string[] {
  const hide = new Set((cfg?.cats?.hide || []).map(key)); const have = new Set(SI_CATS.map(key));
  const out = SI_CATS.filter(c => all || !hide.has(key(c)));
  for (const c of cfg?.cats?.add || []) { const k = key(c); if (k && !have.has(k)) { have.add(k); if (all || !hide.has(k)) out.push(siName(c)); } }
  return out;
}

// Τιμή του Excel ή της φόρμας → βασική και κατηγορία. ok = false: η κατηγορία δεν είναι γνωστή για αυτή τη βασική
// (π.χ. «Ι2 ΑΟΠΛΟ»): ισχύει ο παλιός κανόνας. null: δεν αναγνωρίζεται καν η βασική.
export interface SiParts { base: string; sub: string; ok: boolean }
export function parseSi(raw: string | undefined, cfg?: SiConfig): SiParts | null {
  const k = key(raw || ''); if (!k) return null;
  const bases = siBases(cfg).sort((a, b) => key(b).length - key(a).length);
  let base = bases.find(b => k.startsWith(key(b)));
  if (!base) { const m = /^Ι(\d)/.exec(k); if (!m) return null; base = 'Ι' + m[1]; }
  const rest = k.slice(key(base).length);
  if (!rest) return { base, sub: '', ok: true };
  const syn = SYN.find(([re]) => re.test(rest))?.[1];
  // το Ι4 είναι πάντα άοπλο: «Ι4 ΧΩΡΙΣ ΟΠΛΟ» (και «Ι4 ΜΕ ΟΠΛΟ», που μετρούσε πάντα άοπλο) είναι απλώς Ι4
  if (base === 'Ι4' && syn) return { base, sub: '', ok: true };
  const sub = siSubs(base).find(s => rest.startsWith(key(s))) || (syn && siSubs(base).includes(syn) ? syn : undefined);
  return sub ? { base, sub, ok: true } : { base, sub: '', ok: false };
}

// Οι Σ.Ι. του πίνακα και του dropdown του Excel: κάθε βασική και από κάτω οι κατηγορίες της (ΜΕ ΟΠΛΟ/ΧΩΡΙΣ ΟΠΛΟ)
export const siCombos = (cfg?: SiConfig): string[] => siBases(cfg).flatMap(b => [b, ...siSubs(b).map(s => siLabel(b, s))]);

// Η Σ.Ι. ενός ατόμου: γραμμή του πίνακα και κατηγορία πάθησης. known = false: ισχύει ο παλιός κανόνας
export interface SiOf { label: string; cat: string; known: boolean; text: string }
// ρωτιέται για κάθε υποψήφιο σε κάθε θέση της αυτόματης συμπλήρωσης: κρατιέται ανά ρυθμίσεις Λιστών, Σ.Ι. και κατηγορία
const ofIdx = new WeakMap<object, Map<string, SiOf>>();
const NO_LISTS = {};
export function siOf(p: { si?: string; siCat?: string }, lists?: UserLists): SiOf {
  let m = ofIdx.get(lists || NO_LISTS); if (!m) { m = new Map(); ofIdx.set(lists || NO_LISTS, m); }
  const k = (p.si || '') + '\u0001' + (p.siCat || ''); let r = m.get(k);
  if (!r) { r = siOfRaw(p, lists); m.set(k, r); }
  return r;
}
function siOfRaw(p: { si?: string; siCat?: string }, lists?: UserLists): SiOf {
  const x = parseSi(p.si, lists?.si);
  if (!x || !x.ok) return { label: p.si || '', cat: '', known: false, text: p.si || '' };
  const label = siLabel(x.base, x.sub);
  const cat = SI_CAT_BASES.includes(x.base) && p.siCat ? siName(p.siCat) : '';
  return { label, cat, known: true, text: label + (cat ? ' ' + cat : '') };
}
type Blk = Pick<BlockDef, 'id' | 'armed'>;
// Μπαίνει σε αυτή την υπηρεσία; Πρώτα η κατηγορία πάθησης (αν την άλλαξες), μετά η Σ.Ι., μετά η προεπιλογή
// (άοπλος όπως πριν: ΑΟΠΛ ή Ι4, και όσα όρισες στη λίστα «Σ.Ι. άοπλων»· όχι σε ένοπλη υπηρεσία)
export function siCellOf(lists: UserLists | undefined, label: string, cat: string, b: Blk): { ok: boolean; from: 'cat' | 'row' | 'def' } {
  const c = lists?.si?.cells;
  const vc = cat ? c?.[siRowKey(label, cat)]?.[b.id] : undefined; if (vc != null) return { ok: vc, from: 'cat' };
  const vr = c?.[label]?.[b.id]; if (vr != null) return { ok: vr, from: 'row' };
  return { ok: !(b.armed && siUnarmed(label, lists)), from: 'def' };
}
export function siAllows(p: { si?: string; siCat?: string }, b: Blk, lists?: UserLists): boolean {
  const s = siOf(p, lists);
  if (!s.known) return !(b.armed && siUnarmed(p.si, lists));
  return siCellOf(lists, s.label, s.cat, b).ok;
}
// Άοπλος λόγω Σ.Ι. (για τα «Αυστηρά Άοπλοι»): δεν μπαίνει σε καμία ένοπλη υπηρεσία του εντύπου.
// Έντυπο χωρίς ένοπλες υπηρεσίες (ΣΒΕΝ): όπως πριν, από τη Σ.Ι.
export function siIsUnarmed(p: { si?: string; siCat?: string }, blocks: Blk[], lists?: UserLists): boolean {
  const armed = blocks.filter(b => b.armed);
  if (!armed.length) { const s = siOf(p, lists); return siUnarmed(s.known ? s.label : p.si, lists); }
  return armed.every(b => !siAllows(p, b, lists));
}
