// Οπλισμός (Michael, 17/10: ο αριθμός όπλου βγήκε από την καρτέλα του οπλίτη και πήγε σε δική του καρτέλα).
// Ένας αριθμός ανά άτομο (Person.weapon). Γράφεται στο έντυπο υπηρεσιών δίπλα στον Λ/Υ και τον Δ/Υ (froura.ts).
// Τίποτα δεν μπλοκάρεται: ίδιος αριθμός σε δύο, όπλο σε άοπλο ή σε εκτός δύναμης φαίνονται ως φίλτρα και προειδοποιήσεις.
import { dmy, type ISODate } from './dates';
import { blocksOf, type AppState, type Person } from './domain';
import { siIsUnarmed, siOf } from './si';
import { byRoomName } from './rosterLists';
import { upper } from './text';

// Όπως γράφεται στα Excel: κεφαλαία, ένα κενό το πολύ
export const normWeapon = (v: unknown) => upper(String(v ?? '').replace(/\s+/g, ' ').trim());
// Για σύγκριση: χωρίς κενά, παύλες, τελείες και κάθετους («12 345», «12-345» και «12345» είναι το ίδιο όπλο)
export const weaponKey = (v: unknown) => normWeapon(v).replace(/[\s.\-/]/g, '');

export type WeaponFilter = 'all' | 'with' | 'without' | 'unarmed' | 'dup' | 'return';
export const WEAPON_FILTERS: [WeaponFilter, string, string, string][] = [
  ['all', 'Όλοι', 'ΟΠΛΙΣΜΟΣ', 'Όλοι σε δύναμη'],
  ['with', 'Με όπλο', 'ΜΕ ΟΠΛΟ', 'Σε δύναμη, με αριθμό όπλου'],
  ['without', 'Χωρίς όπλο', 'ΧΩΡΙΣ ΟΠΛΟ', 'Σε δύναμη, ένοπλοι κατά τη Σ.Ι., χωρίς αριθμό όπλου'],
  ['unarmed', 'Άοπλοι με όπλο', 'ΑΟΠΛΟΙ ΜΕ ΟΠΛΟ', 'Άοπλοι κατά τη Σ.Ι. (Ι3 ΧΩΡΙΣ ΟΠΛΟ, Ι4 ή ό,τι όρισες στις Ρυθμίσεις › Σ.Ι.) που έχουν όπλο'],
  ['dup', 'Ίδιος αριθμός', 'ΙΔΙΟΣ ΑΡΙΘΜΟΣ', 'Ο ίδιος αριθμός όπλου σε δύο ή περισσότερους'],
  ['return', 'Να παραδώσουν', 'ΝΑ ΠΑΡΑΔΩΣΟΥΝ', 'Εκτός δύναμης που έχουν ακόμα όπλο']
];

export interface WeaponInfo {
  unarmed: Set<number>;               // άοπλοι κατά τη Σ.Ι. (μόνιμα, όχι ΕΑ/ΕΟ της μέρας)
  holders: Map<string, Person[]>;     // weaponKey → όσοι έχουν αυτό το όπλο (και εκτός δύναμης, αφού δεν το παρέδωσαν)
}
export function weaponInfo(s: Pick<AppState, 'people' | 'settings'>): WeaponInfo {
  const blocks = (blocksOf(s.settings) || s.settings.blocks).filter(b => !b.hidden && b.kind !== 'ly');
  const unarmed = new Set<number>(); const holders = new Map<string, Person[]>();
  for (const p of s.people) {
    if (p.si && siIsUnarmed(p, blocks, s.settings.lists)) unarmed.add(p.id);
    const k = weaponKey(p.weapon); if (!k) continue;
    const l = holders.get(k); if (l) l.push(p); else holders.set(k, [p]);
  }
  return { unarmed, holders };
}
// Οι άλλοι που έχουν τον ίδιο αριθμό
export const sameWeapon = (info: WeaponInfo, p: Pick<Person, 'id' | 'weapon'>, weapon = p.weapon) =>
  (info.holders.get(weaponKey(weapon)) || []).filter(x => x.id !== p.id);

export function weaponMatch(f: WeaponFilter, p: Person, info: WeaponInfo): boolean {
  const has = !!weaponKey(p.weapon);
  if (f === 'return') return !p.active && has;
  if (!p.active) return false;
  if (f === 'all') return true;
  if (f === 'with') return has;
  if (f === 'without') return !has && !info.unarmed.has(p.id);
  if (f === 'unarmed') return has && info.unarmed.has(p.id);
  return has && sameWeapon(info, p).length > 0;
}

// Excel «Οπλισμός»: ένα φύλλο ανά φίλτρο. Το πρώτο (όλοι) έχει και στήλη υπογραφής, για τη χρέωση των όπλων.
export const WEAPON_COLS = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι.', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ'];
export interface WeaponSheet { name: string; title: string; head: string[]; rows: (string | number)[][]; note: string }
export function weaponSheets(s: AppState, d: ISODate): WeaponSheet[] {
  const info = weaponInfo(s); const lists = s.settings.lists; const people = [...s.people].sort(byRoomName);
  return WEAPON_FILTERS.map(([f, , name, note], i) => {
    const rows = people.filter(p => weaponMatch(f, p, info)).map((p, j) => [j + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.room ?? '', p.si ? siOf(p, lists).text : '', normWeapon(p.weapon)]);
    if (f === 'dup') rows.sort((a, b) => weaponKey(a[9]).localeCompare(weaponKey(b[9])) || 0).forEach((r, j) => { r[0] = j + 1; });
    return { name, title: name + ' ' + dmy(d), head: i === 0 ? [...WEAPON_COLS, 'ΥΠΟΓΡΑΦΗ'] : WEAPON_COLS, rows: i === 0 ? rows.map(r => [...r, '']) : rows, note };
  });
}
