// Οπλισμός (Michael, 17/10: ο αριθμός όπλου βγήκε από την καρτέλα του οπλίτη και πήγε σε δική του καρτέλα).
// Ένας αριθμός ανά άτομο (Person.weapon). Γράφεται στο έντυπο υπηρεσιών δίπλα στον Λ/Υ και τον Δ/Υ (froura.ts).
// Και τύπος όπλου (λίστα «Τύποι όπλων»), θέση στον οπλοβαστό (π.χ. Ε6) και εντός/εκτός οπλοβαστού τη μέρα: εκτός όποιος
// έχει ένοπλη υπηρεσία (σκοπός, οπλοφύλακας, ΤΑΕ, δική σου ένοπλη), με τη θέση ως λόγο.
// Τίποτα δεν μπλοκάρεται: ίδιος αριθμός σε δύο, όπλο σε άοπλο ή σε εκτός δύναμης φαίνονται ως φίλτρα και προειδοποιήσεις.
import { dm, dmy, type ISODate } from './dates';
import { blocksOf, type AppState, type Person, type WeaponMove } from './domain';
import { postBy, postsOf } from './rules';
import { siIsUnarmed, siOf } from './si';
import { byRoomName } from './rosterLists';
import { normGreek, upper } from './text';
import { rankTxt } from './ranks';

// Όπως γράφεται στα Excel: κεφαλαία, ένα κενό το πολύ
export const normWeapon = (v: unknown) => upper(String(v ?? '').replace(/\s+/g, ' ').trim());
// Για σύγκριση: χωρίς κενά, παύλες, τελείες και κάθετους («12 345», «12-345» και «12345» είναι το ίδιο όπλο)
export const weaponKey = (v: unknown) => normWeapon(v).replace(/[\s.\-/]/g, '');

// Θέση οπλοβαστού: κεφαλαία χωρίς κενά («ε 6» → «Ε6»)· για σύγκριση και λατινικά που μοιάζουν («E6» = «Ε6»)
export const normRack = (v: unknown) => upper(String(v ?? '').replace(/\s+/g, '').trim());
// «Θέση» όπλου: ελεύθερο κείμενο, με κεφαλαία
export const normPos = (v: unknown) => upper(String(v ?? '').replace(/\s+/g, ' ').trim());
export const rackKey = (v: unknown) => normGreek(normRack(v)).replace(/[.\-/]/g, '');

export type WeaponFilter = 'all' | 'with' | 'out' | 'without' | 'unarmed' | 'dup' | 'return';
export const WEAPON_FILTERS: [WeaponFilter, string, string, string][] = [
  ['all', 'Όλοι', 'ΟΠΛΙΣΜΟΣ', 'Όλοι σε δύναμη'],
  ['with', 'Με όπλο', 'ΜΕ ΟΠΛΟ', 'Σε δύναμη, με αριθμό όπλου'],
  ['out', 'Εκτός οπλοβαστού', 'ΕΚΤΟΣ ΟΠΛΟΒΑΣΤΟΥ', 'Το όπλο τους βγήκε με λόγο (ΕΚΠ, βολή…) και δεν μπήκε ακόμα, ή έχουν ένοπλη υπηρεσία τη μέρα'],
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
  moves: Map<number, WeaponMove>;     // βγήκε από τον οπλοβαστό (Έξοδος όπλων) και δεν μπήκε ακόμα: pid → η κίνηση
}
// Οι έξοδοι χωρίς είσοδο, ανά άτομο (η πιο πρόσφατη)
const openIdx = new WeakMap<WeaponMove[], Map<number, WeaponMove>>();
export function openMoves(log: WeaponMove[] | undefined): Map<number, WeaponMove> {
  if (!log) return new Map();
  let m = openIdx.get(log);
  if (!m) { m = new Map(); for (const x of log) if (!x.inDay) { const o = m.get(x.pid); if (!o || o.outDay + o.outTime < x.outDay + x.outTime) m.set(x.pid, x); } openIdx.set(log, m); }
  return m;
}
// «ΕΚΠ από 18/10 08:15»
export const moveOutTxt = (m: WeaponMove) => m.reason + ' από ' + dm(m.outDay) + ' ' + m.outTime;
export const isOut = (info: WeaponInfo, pid: number) => info.moves.has(pid) || info.out.has(pid);
// Ένοπλη υπηρεσία τη μέρα: θέση με όνομα, ή υπηρεσία χωρίς θέση από Excel (σκέτο «Σ») σε ένοπλο είδος
export function armedDuties(s: Pick<AppState, 'guards' | 'dutyLog' | 'settings'>, d: ISODate): Map<number, string> {
  const out = new Map<number, string>(); const add = (pid: number, t: string) => out.set(pid, out.has(pid) ? out.get(pid) + ', ' + t : t);
  const g = s.guards?.[d] || {};
  for (const k in g) { const x = postBy(s as AppState, k); if (x?.armed && g[k] != null) add(g[k], x.label); }
  const kinds = new Map(postsOf(s.settings).filter(x => x.armed).map(x => [x.kind, (blocksOf(s.settings) || s.settings.blocks).find(b => b.id === x.block)?.name || x.kind] as [string, string]));
  for (const e of s.dutyLog?.[d] || []) if (kinds.has(e.kind)) add(e.pid, kinds.get(e.kind)! + ' (χωρίς θέση)');
  return out;
}
export function weaponInfo(s: Pick<AppState, 'people' | 'settings'> & Partial<Pick<AppState, 'guards' | 'dutyLog' | 'weaponLog'>>, d?: ISODate): WeaponInfo {
  const blocks = (blocksOf(s.settings) || s.settings.blocks).filter(b => !b.hidden && b.kind !== 'ly');
  const unarmed = new Set<number>(); const holders = new Map<string, Person[]>(); const racks = new Map<string, Person[]>();
  const push = (m: Map<string, Person[]>, k: string, p: Person) => { const l = m.get(k); if (l) l.push(p); else m.set(k, [p]); };
  for (const p of s.people) {
    if (p.si && siIsUnarmed(p, blocks, s.settings.lists)) unarmed.add(p.id);
    const r = rackKey(p.rack); if (r && p.active) push(racks, r, p);
    const k = weaponKey(p.weapon); if (k) push(holders, k, p);
  }
  const out = d ? armedDuties({ guards: s.guards || {}, dutyLog: s.dutyLog || {}, settings: s.settings }, d) : new Map<number, string>();
  return { unarmed, holders, racks, out, moves: openMoves(s.weaponLog) };
}
// Οι άλλοι (σε δύναμη) με την ίδια θέση οπλοβαστού
export const sameRack = (info: WeaponInfo, p: Pick<Person, 'id' | 'rack'>, rack = p.rack) =>
  (info.racks.get(rackKey(rack)) || []).filter(x => x.id !== p.id);
// «ΕΝΤΟΣ» ή «ΕΚΤΟΣ: ΣΚΟΠΟΣ …»· κενό για όποιον δεν έχει όπλο ούτε ένοπλη υπηρεσία
// Πρώτα η έξοδος με λόγο (ΕΚΠ…), μετά η ένοπλη υπηρεσία
export const inOutText = (p: Person, info: WeaponInfo) => (info.moves.has(p.id) ? 'ΕΚΤΟΣ: ' + moveOutTxt(info.moves.get(p.id)!) : info.out.has(p.id) ? 'ΕΚΤΟΣ: ' + info.out.get(p.id) : weaponKey(p.weapon) && p.active ? 'ΕΝΤΟΣ' : '');
// Οι άλλοι που έχουν τον ίδιο αριθμό
export const sameWeapon = (info: WeaponInfo, p: Pick<Person, 'id' | 'weapon'>, weapon = p.weapon) =>
  (info.holders.get(weaponKey(weapon)) || []).filter(x => x.id !== p.id);

export function weaponMatch(f: WeaponFilter, p: Person, info: WeaponInfo): boolean {
  const has = !!weaponKey(p.weapon);
  if (f === 'return') return !p.active && has;
  if (!p.active) return false;
  if (f === 'all') return true;
  if (f === 'with') return has;
  if (f === 'out') return isOut(info, p.id);
  if (f === 'without') return !has && !info.unarmed.has(p.id);
  if (f === 'unarmed') return has && info.unarmed.has(p.id);
  return (has && sameWeapon(info, p).length > 0) || (!!rackKey(p.rack) && sameRack(info, p).length > 0);
}

// Excel «Οπλισμός»: ένα φύλλο ανά φίλτρο. Το πρώτο (όλοι) έχει και στήλη υπογραφής, για τη χρέωση των όπλων.
export const WEAPON_COLS = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι.', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΟΠΛΟΒΑΣΤΟΣ', 'ΘΕΣΗ', 'ΕΝΤΟΣ / ΕΚΤΟΣ'];
export const W_NUM = WEAPON_COLS.indexOf('ΑΡΙΘΜΟΣ ΟΠΛΟΥ');
export interface WeaponSheet { name: string; title: string; head: string[]; rows: (string | number)[][]; note: string }
export function weaponSheets(s: AppState, d: ISODate): WeaponSheet[] {
  const info = weaponInfo(s, d); const lists = s.settings.lists; const people = [...s.people].sort(byRoomName);
  return WEAPON_FILTERS.map(([f, , name, note], i) => {
    const rows = people.filter(p => weaponMatch(f, p, info)).map((p, j) => [j + 1, rankTxt(p), p.spec, p.last, p.first, p.father, p.asm, p.room ?? '', p.si ? siOf(p, lists).text : '', p.wtype || '', normWeapon(p.weapon), normRack(p.rack), normPos(p.wpos), inOutText(p, info)]);
    if (f === 'dup') rows.sort((a, b) => weaponKey(a[W_NUM]).localeCompare(weaponKey(b[W_NUM])) || 0).forEach((r, j) => { r[0] = j + 1; });
    return { name, title: name + ' ' + dmy(d), head: i === 0 ? [...WEAPON_COLS, 'ΥΠΟΓΡΑΦΗ'] : WEAPON_COLS, rows: i === 0 ? rows.map(r => [...r, '']) : rows, note };
  }).concat([moveSheet(s, d)]);
}
// Κινήσεις όπλων της μέρας: όσα βγήκαν ή μπήκαν τη μέρα, και όσα βγήκαν πριν και είναι ακόμα εκτός
export const MOVE_COLS = ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΛΟΓΟΣ ΕΞΟΔΟΥ', 'ΕΞΟΔΟΣ', 'ΛΟΓΟΣ ΕΙΣΟΔΟΥ', 'ΕΙΣΟΔΟΣ', 'ΠΑΡΑΤΗΡΗΣΗ'];
export const movesOn = (log: WeaponMove[] | undefined, d: ISODate) => (log || []).filter(m => m.outDay === d || m.inDay === d || (!m.inDay && m.outDay <= d) || (m.outDay < d && !!m.inDay && m.inDay > d));
export const byOut = (a: WeaponMove, b: WeaponMove) => (a.outDay + a.outTime).localeCompare(b.outDay + b.outTime);
function moveSheet(s: AppState, d: ISODate): WeaponSheet {
  const pm = new Map(s.people.map(p => [p.id, p]));
  const rows = movesOn(s.weaponLog, d).sort(byOut).map((m, j) => {
    const p = pm.get(m.pid);
    return [j + 1, rankTxt(p), p?.last || '', p?.first || '', normWeapon(m.weapon), m.reason, dmy(m.outDay) + ' ' + m.outTime, m.inReason || '', m.inDay ? dmy(m.inDay) + ' ' + (m.inTime || '') : 'ΕΚΤΟΣ', m.note || ''];
  });
  return { name: 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ', title: 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ ' + dmy(d), head: MOVE_COLS, rows, note: 'Έξοδοι και είσοδοι όπλων από τον οπλοβαστό τη μέρα, και όσα είναι ακόμα εκτός' };
}
