// Έντυπο υπηρεσιών «ΦΡΟΥΡΑ»: ΣΒΕΝ (δείγμα 01) και ΣΠΕΝ (φωτογραφία του γραφέα, 10/10/2026).
// Κοινό για την εξαγωγή (main) και την προεπισκόπηση (UI), ώστε να γράφουν ακριβώς τα ίδια.
import { norm } from './text';
import type { ISODate } from './dates';
import { blocksOf, fullName, type AppState, type Person, type Phase } from './domain';
import { personMap, postsOf } from './rules';

export interface FrouraForm {
  file: string;
  pos: Record<string, string>;                              // θέση → κελί ονόματος (δύο θέσεις στο ίδιο κελί = ζεύγος σκοπών)
  extra: { after: number; label: string; name: string };   // γραμμή-πρότυπο για υπηρεσίες χωρίς δικό τους κελί (μπαίνουν από κάτω)
  list: number;                                             // πρώτη γραμμή τιμωρημένων/απόντων
}
const range4 = (k: string, col: string) => Object.fromEntries([0, 1, 2, 3].map(i => [k + (i + 1), col + (13 + 3 * i)]));
export const FROURA_FORMS: Record<Phase, FrouraForm> = {
  sven: {
    file: 'froura.xlsx',
    pos: { ...range4('th', 'C'), th5: 'J13', th6: 'J16', th7: 'J19', th8: 'J22', mg1: 'F27', mg2: 'F28', mg3: 'F29', mg4: 'F30', mg5: 'F31' },
    extra: { after: 31, label: 'E', name: 'F' }, list: 36
  },
  spen: {
    file: 'froura-spen.xlsx',
    pos: { ...range4('th', 'C'), ...range4('op', 'J'), mg1: 'C27', mg2: 'C28', mg3: 'C29', mg4: 'C30', mg5: 'C31', tae: 'C33', sk3a: 'J27', sk3b: 'J27', sk4a: 'J30', sk4b: 'J30' },
    extra: { after: 33, label: 'B', name: 'C' }, list: 38
  }
};
export const phaseOf = (s: AppState): Phase => s.settings.phase || 'sven';

export const rankName = (p: Person) => [p.rank, p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
// Στο έντυπο υπηρεσιών: μόνο επώνυμο και όνομα. Λ/Υ και Δ/Υ: βαθμός, όνομα, κινητό και όπλο (γραφέας, 10/10).
export const dutyName = (p: Person) => fullName(p);
export const lyLine = (p: Person) => rankName(p) + (p.phone ? ', ΤΗΛ: ' + p.phone : '') + (p.weapon ? ', ΟΠΛΟ: ' + p.weapon : '');

export interface FrouraLayout { cells: Map<string, string[]>; extra: { label: string; k: string; name: string }[]; foreign: string[] }
// Τι γράφεται πού: θέσεις με δικό τους κελί, και όσες δεν έχουν (π.χ. νέα υπηρεσία «Πύλη») σε γραμμές από κάτω
export function frouraLayout(s: AppState, date: ISODate, phase: Phase = phaseOf(s)): FrouraLayout {
  const form = FROURA_FORMS[phase]; const g = s.guards[date] || {}; const pm = personMap(s.people);
  const cells = new Map<string, string[]>(); const extra: FrouraLayout['extra'] = [];
  const posts = postsOf(s.settings);
  for (const x of posts) {
    if (x.k === 'ly' || x.k === 'dy') continue;
    const person = g[x.k] ? pm.get(g[x.k]) : undefined; const at = form.pos[x.k];
    if (at) { if (!cells.has(at)) cells.set(at, []); if (person) cells.get(at)!.push(dutyName(person)); continue; }
    const same = posts.filter(y => y.block === x.block); const b = blocksOf(s.settings, phase).find(y => y.id === x.block);
    const label = norm(b ? b.name : x.label) + (same.length > 1 ? ' ' + (same.indexOf(x) + 1) + 'ο' : '');
    extra.push({ label, k: x.k, name: person ? dutyName(person) : '' });
  }
  const foreign = Object.keys(g).filter(k => k !== 'ly' && k !== 'dy' && !posts.some(x => x.k === k) && pm.get(g[k]));
  return { cells, extra, foreign };
}

// «ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ», όχι «ΚΑΝΟΝΙΚΗ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ»
export const absenceText = (kind: string | undefined, long: string) => norm(kind && !norm(long).includes(norm(kind)) ? kind + ' ' + long : long);
