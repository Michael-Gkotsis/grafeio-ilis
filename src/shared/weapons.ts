// Οπλισμός (Michael, 17/10: ο αριθμός όπλου βγήκε από την καρτέλα του οπλίτη και πήγε σε δική του καρτέλα).
// Ένας αριθμός ανά άτομο (Person.weapon). Γράφεται στο έντυπο υπηρεσιών δίπλα στον Λ/Υ και τον Δ/Υ (froura.ts).
// Και τύπος όπλου (λίστα «Τύποι όπλων»), θέση στον οπλοβαστό (π.χ. Ε6) και εντός/εκτός οπλοβαστού τη μέρα: εκτός όποιος
// έχει ένοπλη υπηρεσία (σκοπός, οπλοφύλακας, ΤΑΕ, δική σου ένοπλη), με τη θέση ως λόγο.
// Τίποτα δεν μπλοκάρεται: ίδιος αριθμός σε δύο, όπλο σε άοπλο ή σε εκτός δύναμης φαίνονται ως φίλτρα και προειδοποιήσεις.
import { dmy, type ISODate } from './dates';
import { blocksOf, type AppState, type Person } from './domain';
import { postBy, postsOf } from './rules';
import { siIsUnarmed, siOf } from './si';
import { byRoomName } from './rosterLists';
import { normGreek, upper } from './text';

// Όπως γράφεται στα Excel: κεφαλαία, ένα κενό το πολύ
export const normWeapon = (v: unknown) => upper(String(v ?? '').replace(/\s+/g, ' ').trim());
// Για σύγκριση: χωρίς κενά, παύλες, τελείες και κάθετους («12 345», «12-345» και «12345» είναι το ίδιο όπλο)
export const weaponKey = (v: unknown) => normWeapon(v).replace(/[\s.\-/]/g, '');

// Θέση οπλοβαστού: κεφαλαία χωρίς κενά («ε 6» → «Ε6»)· για σύγκριση και λατινικά που μοιάζουν («E6» = «Ε6»)
export const normRack = (v: unknown) => upper(String(v ?? '').replace(/\s+/g, '').trim());
export const rackKey = (v: unknown) => normGreek(normRack(v)).replace(/[.\-/]/g, '');

export type WeaponFilter = 'all' | 'with' | 'out' | 'without' | 'unarmed' | 'dup' | 'return';
export const WEAPON_FILTERS: [WeaponFilter, string, string, string][] = [
  ['all', 'Όλοι', 'ΟΠΛΙΣΜΟΣ', 'Όλοι σε δύναμη'],
  ['with', 'Με όπλο', 'ΜΕ ΟΠΛΟ', 'Σε δύναμη, με αριθμό όπλου'],
  ['out', 'Εκτός οπλοβαστού', 'ΕΚΤΟΣ ΟΠΛΟΒΑΣΤΟΥ', 'Με ένοπλη υπηρεσία τη μέρα: το όπλο τους είναι εκτός οπλοβαστού'],
  ['without', 'Χωρίς όπλο', 'ΧΩΡΙΣ ΟΠΛΟ', 'Σε δύναμη, ένοπλοι κατά τη Σ.Ι., χωρίς αριθμό όπλου'],
  ['unarmed', 'Άοπλοι με όπλο', 'ΑΟΠΛΟΙ ΜΕ ΟΠΛΟ', 'Άοπλοι κατά τη Σ.Ι. (Ι3 ΧΩΡΙΣ ΟΠΛΟ, Ι4 ή ό,τι όρισες στις Ρυθμίσεις › Σ.Ι.) που έχουν όπλο'],
  ['dup', 'Ίδιος αριθμός', 'ΙΔΙΟΣ ΑΡΙΘΜΟΣ', 'Ο ίδιος αριθμός όπλου ή η ίδια θέση οπλοβαστού σε δύο ή περισσότερους'],
  ['return', 'Να παραδώσουν', 'ΝΑ ΠΑΡΑΔΩΣΟΥΝ', 'Εκτός δύναμης που έχουν ακόμα όπλο']
];

export interface WeaponInfo {
  unarmed: Set<number>;               // άοπλοι κατά τη Σ.Ι. (μόνιμα, όχι ΕΑ/ΕΟ της μέρας)
  holders: Map<string, Person[]>;     // weaponKey → όσοι έχουν αυτό το όπλο (και εκτός δύναμης, αφού δεν το παρέδωσαν)
  racks: Map<string, Person[]>;       // rackKey → όσοι έχουν αυτή τη θέση οπλοβαστού (μόνο σε δύναμη)
  out: Map<number, string>;           // εκτός οπλοβαστού τη μέρα d: pid → η ένοπλη υπηρεσία (π.χ. «Σκοπός 3ης (α)»)
}
// Ένοπλη υπηρεσία τη μέρα: θέση με όνομα, ή υπηρεσία χωρίς θέση από Excel (σκέτο «Σ») σε ένοπλο είδος
export function armedDuties(s: Pick<AppState, 'guards' | 'dutyLog' | 'settings'>, d: ISODate): Map<number, string> {
  const out = new Map<number, string>(); const add = (pid: number, t: string) => out.set(pid, out.has(pid) ? out.get(pid) + ', ' + t : t);
  const g = s.guards?.[d] || {};
  for (const k in g) { const x = postBy(s as AppState, k); if (x?.armed && g[k] != null) add(g[k], x.label); }
  const kinds = new Map(postsOf(s.settings).filter(x => x.armed).map(x => [x.kind, (blocksOf(s.settings) || s.settings.blocks).find(b => b.id === x.block)?.name || x.kind] as [string, string]));
  for (const e of s.dutyLog?.[d] || []) if (kinds.has(e.kind)) add(e.pid, kinds.get(e.kind)! + ' (χωρίς θέση)');
  return out;
}
export function weaponInfo(s: Pick<AppState, 'people' | 'settings'> & Partial<Pick<AppState, 'guards' | 'dutyLog'>>, d?: ISODate): WeaponInfo {
  const blocks = (blocksOf(s.settings) || s.settings.blocks).filter(b => !b.hidden && b.kind !== 'ly');
  const unarmed = new Set<number>(); const holders = new Map<string, Person[]>(); const racks = new Map<string, Person[]>();
  const push = (m: Map<string, Person[]>, k: string, p: Person) => { const l = m.get(k); if (l) l.push(p); else m.set(k, [p]); };
  for (const p of s.people) {
    if (p.si && siIsUnarmed(p, blocks, s.settings.lists)) unarmed.add(p.id);
    const r = rackKey(p.rack); if (r && p.active) push(racks, r, p);
    const k = weaponKey(p.weapon); if (k) push(holders, k, p);
  }
  const out = d ? armedDuties({ guards: s.guards || {}, dutyLog: s.dutyLog || {}, settings: s.settings }, d) : new Map<number, string>();
  return { unarmed, holders, racks, out };
}
// Οι άλλοι (σε δύναμη) με την ίδια θέση οπλοβαστού
export const sameRack = (info: WeaponInfo, p: Pick<Person, 'id' | 'rack'>, rack = p.rack) =>
  (info.racks.get(rackKey(rack)) || []).filter(x => x.id !== p.id);
// «ΕΝΤΟΣ» ή «ΕΚΤΟΣ: ΣΚΟΠΟΣ …»· κενό για όποιον δεν έχει όπλο ούτε ένοπλη υπηρεσία
export const inOutText = (p: Person, info: WeaponInfo) => (info.out.has(p.id) ? 'ΕΚΤΟΣ: ' + info.out.get(p.id) : weaponKey(p.weapon) && p.active ? 'ΕΝΤΟΣ' : '');
// Οι άλλοι που έχουν τον ίδιο αριθμό
export const sameWeapon = (info: WeaponInfo, p: Pick<Person, 'id' | 'weapon'>, weapon = p.weapon) =>
  (info.holders.get(weaponKey(weapon)) || []).filter(x => x.id !== p.id);

export function weaponMatch(f: WeaponFilter, p: Person, info: WeaponInfo): boolean {
  const has = !!weaponKey(p.weapon);
  if (f === 'return') return !p.active && has;
  if (!p.active) return false;
  if (f === 'all') return true;
  if (f === 'with') return has;
  if (f === 'out') return info.out.has(p.id);
  if (f === 'without') return !has && !info.unarmed.has(p.id);
  if (f === 'unarmed') return has && info.unarmed.has(p.id);
  return (has && sameWeapon(info, p).length > 0) || (!!rackKey(p.rack) && sameRack(info, p).length > 0);
}

// Excel «Οπλισμός»: ένα φύλλο ανά φίλτρο. Το πρώτο (όλοι) έχει και στήλη υπογραφής, για τη χρέωση των όπλων.
export const WEAPON_COLS = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι.', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΟΠΛΟΒΑΣΤΟΣ', 'ΕΝΤΟΣ / ΕΚΤΟΣ'];
export const W_NUM = WEAPON_COLS.indexOf('ΑΡΙΘΜΟΣ ΟΠΛΟΥ');
export interface WeaponSheet { name: string; title: string; head: string[]; rows: (string | number)[][]; note: string }
export function weaponSheets(s: AppState, d: ISODate): WeaponSheet[] {
  const info = weaponInfo(s, d); const lists = s.settings.lists; const people = [...s.people].sort(byRoomName);
  return WEAPON_FILTERS.map(([f, , name, note], i) => {
    const rows = people.filter(p => weaponMatch(f, p, info)).map((p, j) => [j + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.room ?? '', p.si ? siOf(p, lists).text : '', p.wtype || '', normWeapon(p.weapon), normRack(p.rack), inOutText(p, info)]);
    if (f === 'dup') rows.sort((a, b) => weaponKey(a[W_NUM]).localeCompare(weaponKey(b[W_NUM])) || 0).forEach((r, j) => { r[0] = j + 1; });
    return { name, title: name + ' ' + dmy(d), head: i === 0 ? [...WEAPON_COLS, 'ΥΠΟΓΡΑΦΗ'] : WEAPON_COLS, rows: i === 0 ? rows.map(r => [...r, '']) : rows, note };
  });
}
