// Έντυπο υπηρεσιών «ΦΡΟΥΡΑ»: ΣΒΕΝ (δείγμα 01) και ΣΠΕΝ (φωτογραφία του γραφέα, 10/10/2026).
// Κοινό για την εξαγωγή (main) και την προεπισκόπηση (UI), ώστε να γράφουν ακριβώς τα ίδια.
import { norm } from './text';
import type { ISODate } from './dates';
import { TYPES, blocksOf, buildPosts, dutyStartOf, fullName, phaseBase, type AppState, type BasePhase, type Person, type Phase, type Status } from './domain';
import { leaveName } from './hkaiText';
import { seatMap, postsOf } from './rules';
import { rankTxt } from './ranks';

export interface FrouraForm {
  file: string;
  pos: Record<string, string>;                              // θέση → κελί ονόματος (δύο θέσεις στο ίδιο κελί = ζεύγος σκοπών)
  extra: { after: number };                                 // τελευταία γραμμή των πινάκων του εντύπου: από κάτω μπαίνουν οι πίνακες των υπηρεσιών χωρίς δικό τους κελί
  list: number;                                             // πρώτη γραμμή τιμωρημένων/απόντων
  tables: { look: TableCols; left: TableCols; right: TableCols };   // πίνακες των δικών σου υπηρεσιών, ανά δύο· look: κελιά με το στυλ τους
}
// Στήλες ενός πίνακα υπηρεσίας: Α/Α, όνομα (από name ως πριν τις ώρες), ΩΡΕΣ, ΠΑΡ/ΣΕΙΣ. Χωρίς ώρες το όνομα πιάνει και τη στήλη τους.
export interface TableCols { aa: string; name: string; hours: string; note: string }
// Δύο δίπλα δίπλα (Michael, 20/10): αριστερά στις στήλες του α΄ πίνακα θαλαμοφυλάκων, δεξιά στις στήλες του β΄ (ή των οπλοφυλάκων)
const TABLES: FrouraForm['tables'] = { look: { aa: 'B13', name: 'C13', hours: 'D13', note: 'E13' }, left: { aa: 'B', name: 'C', hours: 'D', note: 'E' }, right: { aa: 'I', name: 'J', hours: 'K', note: 'L' } };
const range4 = (k: string, col: string) => Object.fromEntries([0, 1, 2, 3].map(i => [k + (i + 1), col + (13 + 3 * i)]));
export const FROURA_FORMS: Record<BasePhase, FrouraForm> = {
  sven: {
    file: 'froura.xlsx',
    pos: { ...range4('th', 'C'), th5: 'J13', th6: 'J16', th7: 'J19', th8: 'J22', mg1: 'F27', mg2: 'F28', mg3: 'F29', mg4: 'F30', mg5: 'F31' },
    extra: { after: 31 }, list: 36, tables: TABLES
  },
  spen: {
    file: 'froura-spen.xlsx',
    pos: { ...range4('th', 'C'), ...range4('op', 'J'), mg1: 'C27', mg2: 'C28', mg3: 'C29', mg4: 'C30', mg5: 'C31', tae: 'C33', sk3a: 'J27', sk3b: 'J27', sk4a: 'J30', sk4b: 'J30' },
    extra: { after: 33 }, list: 38, tables: TABLES
  }
};
export const phaseOf = (s: AppState): Phase => s.settings.phase || 'sven';
// Τα κελιά του εντύπου: της ΣΒΕΝ ή της ΣΠΕΝ (και για τα δικά σου έντυπα, με όποιο από τα δύο βγαίνουν)
export const frouraForm = (s: AppState, phase: Phase = phaseOf(s)): FrouraForm => FROURA_FORMS[phaseBase(s.settings, phase)];

export const rankName = (p: Person) => [rankTxt(p), p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
// Στο έντυπο υπηρεσιών: μόνο επώνυμο και όνομα. Λ/Υ και Δ/Υ: βαθμός, όνομα, κινητό και όπλο (γραφέας, 10/10).
export const dutyName = (p: Person) => fullName(p);
export const lyLine = (p: Person) => rankName(p) + (p.phone ? ', ΤΗΛ: ' + p.phone : '') + (p.weapon ? ', ΟΠΛΟ: ' + p.weapon : '');

export interface FrouraLayout { cells: Map<string, string[]>; extra: { label: string; k: string; block: string; name: string; hours: string; slots: string[] | null }[]; foreign: string[] }
// Τι γράφεται πού: θέσεις με δικό τους κελί, και όσες δεν έχουν (π.χ. νέα υπηρεσία «Πύλη») σε γραμμές από κάτω
export function frouraLayout(s: AppState, date: ISODate, phase: Phase = phaseOf(s)): FrouraLayout {
  const form = frouraForm(s, phase); const g = s.guards[date] || {}; const pm = seatMap(s);
  const cells = new Map<string, string[]>(); const extra: FrouraLayout['extra'] = [];
  const posts = postsOf(s.settings);
  for (const x of posts) {
    if (x.k === 'ly' || x.k === 'dy') continue;
    const person = g[x.k] ? pm.get(g[x.k]) : undefined; const at = form.pos[x.k];
    if (at) { if (!cells.has(at)) cells.set(at, []); if (person) cells.get(at)!.push(dutyName(person)); continue; }
    const same = posts.filter(y => y.block === x.block); const b = blocksOf(s.settings, phase).find(y => y.id === x.block);
    const label = norm(b ? b.name : x.label) + (same.length > 1 ? ' ' + (same.indexOf(x) + 1) + 'ο' : '');
    extra.push({ label, k: x.k, block: x.block, name: person ? dutyName(person) : '', hours: x.hours, slots: x.slots });
  }
  const foreign = Object.keys(g).filter(k => k !== 'ly' && k !== 'dy' && !posts.some(x => x.k === k) && pm.get(g[k]));
  return { cells, extra, foreign };
}

// Οι υπηρεσίες χωρίς δικό τους κελί (π.χ. νέα υπηρεσία «Πύλη») σε δικό τους πίνακα η καθεμία (Michael, 20/10):
// τίτλος το όνομά της, 1ο, 2ο… αριστερά, ώρες δεξιά μόνο αν έχει (όχι «ημέρα»)
// shifts: οι βάρδιες του νούμερου, μία γραμμή η καθεμία (Α/Α και όνομα ενωμένα από πάνω ως κάτω)
export interface FrouraTable { title: string; hours: boolean; rows: { n: string; name: string; hours: string; shifts?: string[] }[] }
const realHours = (h: string) => !!h.trim() && norm(h) !== 'ΗΜΕΡΑ';
export function frouraTables(s: AppState, lay: FrouraLayout, phase: Phase = phaseOf(s)): FrouraTable[] {
  const out = new Map<string, FrouraTable>();
  for (const x of lay.extra) {
    let t = out.get(x.block);
    if (!t) { const b = blocksOf(s.settings, phase).find(y => y.id === x.block); t = { title: norm(b ? b.name : x.label), hours: false, rows: [] }; out.set(x.block, t); }
    if (x.slots && x.slots.length) { t.rows.push({ n: (t.rows.length + 1) + 'ο', name: x.name, hours: x.slots[0], shifts: x.slots }); t.hours = true; continue; }
    t.rows.push({ n: (t.rows.length + 1) + 'ο', name: x.name, hours: realHours(x.hours) ? norm(x.hours) : '' });
    if (realHours(x.hours)) t.hours = true;
  }
  return [...out.values()];
}

// «ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ», όχι «ΚΑΝΟΝΙΚΗ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ»
export const absenceText = (kind: string | undefined, long: string) => norm(kind && !norm(long).includes(norm(kind)) ? kind + ' ' + long : long);
// Είδος απουσίας στο έντυπο: η άδεια με το είδος της («ΑΔΕΙΑ ΑΙΜΟΔΟΣΙΑΣ», «ΕΙΔΙΚΗ ΑΔΕΙΑ»), όχι «ΑΙΜΟΔΟΣΙΑΣ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ»
export const absenceOf = (x: Pick<Status, 'type' | 'kind'>) => (x.type === 'LEAVE' ? norm(leaveName(x)) : absenceText(x.kind, TYPES[x.type].long));

// Πίνακες θαλαμοφυλάκων/οπλοφυλάκων (γραμμές 13–24): κάθε νούμερο έχει στο template 3 γραμμές, μία ανά βάρδια. Με άλλες
// βάρδιες (Michael, 20/10: «όλες οι ώρες η μια κάτω από την άλλη και να γίνεται adjust το block») το νούμερο πιάνει
// όσες γραμμές έχει βάρδιες το πιο γεμάτο από τα δύο δίπλα δίπλα: περισσότερες μπαίνουν, όσες περισσεύουν κρύβονται.
export const NUM_ROWS = [13, 16, 19, 22];
export function frouraPer(s: AppState, phase: Phase = phaseOf(s)): number[] {
  const ps = buildPosts(blocksOf(s.settings, phase).filter(b => !b.hidden), dutyStartOf(s.settings));
  const spen = phaseBase(s.settings, phase) === 'spen'; const right = spen ? 'op' : 'th', off = spen ? 1 : 5;
  return [0, 1, 2, 3].map(i => {
    const ns = [ps.find(x => x.k === 'th' + (i + 1)), ps.find(x => x.k === right + (i + off))].filter(x => x && !x.hidden && x.slots).map(x => x!.slots!.length);
    return ns.length ? Math.max(1, ...ns) : 3;
  });
}
// Στα κελιά του εντύπου κάθε νούμερο έχει 3 γραμμές ωρών: λιγότερες βάρδιες αφήνουν κενό, περισσότερες μπαίνουν δύο-δύο
export function rows3(slots: string[] | null | undefined): string[] {
  const sl = slots || []; if (sl.length <= 3) return [0, 1, 2].map(i => sl[i] || '');
  const k = Math.ceil(sl.length / 3); return [0, 1, 2].map(i => sl.slice(i * k, i * k + k).join(' · '));
}
// Πόσες γραμμές πιάνει ένα νούμερο σε πίνακα δικής σου υπηρεσίας
export const tableRowSpan = (x: FrouraTable['rows'][number]) => (x.shifts && x.shifts.length > 1 ? x.shifts.length : 1);
