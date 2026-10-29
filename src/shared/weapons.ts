// Οπλισμός (Michael, 17/10: ο αριθμός όπλου βγήκε από την καρτέλα του οπλίτη και πήγε σε δική του καρτέλα).
// Ένας αριθμός ανά άτομο (Person.weapon). Γράφεται στο έντυπο υπηρεσιών δίπλα στον Λ/Υ και τον Δ/Υ (froura.ts).
// Και τύπος όπλου (λίστα «Τύποι όπλων»), θέση στον οπλοβαστό (π.χ. Ε6) και εντός/εκτός οπλοβαστού τη μέρα: εκτός όποιος
// έχει ένοπλη υπηρεσία (σκοπός, οπλοφύλακας, ΤΑΕ, δική σου ένοπλη), με τη θέση ως λόγο.
// Τίποτα δεν μπλοκάρεται: ίδιος αριθμός σε δύο, όπλο σε άοπλο ή σε εκτός δύναμης φαίνονται ως φίλτρα και προειδοποιήσεις.
import { dm, dmy, type ISODate } from './dates';
import { blocksOf, type AppState, type Cadre, type Person, type WeaponMove } from './domain';
import { ARM_BACK, armedLive, armedRows, armWhen, calDay, hmOf, rowById, type ArmRow, type ArmState } from './armed';
import { weaponBack } from './ranks';
import { postBy, postsOf, seatMap } from './rules';
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
// Θέση του ζεύγους (Michael, 24/10): Οπλοβ. + Θέση μαζί, «Ε 23» όπως «Ε23» (ίδια κανονικοποίηση και για τα δύο μέρη).
// Ε+22 και Ε+23 είναι άλλες θέσεις· ίδια θέση μόνο όταν και τα δύο ίδια. Κενό όταν λείπει ο οπλοβαστός ή η Θέση:
// οπλοβαστός χωρίς Θέση παίρνει μόνο το «Χωρίς θέση», ποτέ το «Ίδια θέση» (Michael, 24/10, και για παλιά δεδομένα όπως «Ε6» σε δύο).
export const posKey = (v: unknown) => rackKey(v);
export const seatKey = (rack: unknown, wpos: unknown) => { const r = rackKey(rack), p = posKey(wpos); return r && p ? r + '|' + p : ''; };
// «Ε 23» (ή «Ε» όταν λείπει η Θέση), για μηνύματα
export const seatTxt = (rack: unknown, wpos: unknown) => [normRack(rack), normPos(wpos)].filter(Boolean).join(' ');
const seatCollator = new Intl.Collator('el', { sensitivity: 'base', numeric: true });
// Ταξινόμηση «Οπλοβ.»: οπλοβαστός, μετά θέση αριθμητικά (Ε 2 πριν από Ε 10)· χωρίς οπλοβαστό στο τέλος
export const bySeat = (a: Pick<Person, 'rack' | 'wpos'>, b: Pick<Person, 'rack' | 'wpos'>) =>
  (rackKey(a.rack) ? 0 : 1) - (rackKey(b.rack) ? 0 : 1) || seatCollator.compare(rackKey(a.rack), rackKey(b.rack)) || seatCollator.compare(posKey(a.wpos), posKey(b.wpos));
// Οπλοβαστός χωρίς Θέση, σε δύναμη και με όπλο: προειδοποίηση «Χωρίς θέση»
export const noSeat = (p: Pick<Person, 'active' | 'weapon' | 'rack' | 'wpos'>) => !!p.active && !!weaponKey(p.weapon) && !!rackKey(p.rack) && !posKey(p.wpos);

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
  racks: Map<string, Person[]>;       // seatKey (οπλοβαστός + θέση) → όσοι έχουν αυτή τη θέση (μόνο σε δύναμη)
  out: Map<number, string>;           // εκτός οπλοβαστού λόγω ένοπλης υπηρεσίας: pid → «Σκοπός 3ης (α) 15:45–18:15» (τώρα, ή όλα τα νούμερα της μέρας)
  moves: Map<number, WeaponMove>;     // βγήκε από τον οπλοβαστό (Έξοδος όπλων) και δεν μπήκε ακόμα: pid → η κίνηση
  arm: ArmInfo;                       // οι ένοπλες υπηρεσίες ανά νούμερο (armed.ts)
}
// Ένοπλες υπηρεσίες (Michael, 24/10): live = κρίνονται με την ώρα (σήμερα)· αλλιώς όλα τα νούμερα της μέρας με τις ώρες τους.
// cur: ο ιδιοκτήτης του όπλου → η γραμμή που τρέχει (στη μέρα: η πρώτη)· next/prev: η επόμενη/προηγούμενη (μόνο live)·
// holding: «της θέσης», ποιος κρατά τώρα το όπλο κάποιου άλλου
export interface ArmInfo { live: boolean; rows: ArmRow[]; cur: Map<number, ArmRow>; next: Map<number, ArmRow>; prev: Map<number, ArmRow>; holding: Map<number, ArmRow> }
const NO_ARM: ArmInfo = { live: false, rows: [], cur: new Map(), next: new Map(), prev: new Map(), holding: new Map() };
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
// Όσοι είναι εκτός (σε δύναμη): κίνηση ή ένοπλη υπηρεσία, μία φορά ο καθένας. Από εδώ μετράνε και η κεφαλίδα, και το chip, και η καρτέλα Κινήσεις
export const outPeople = (people: Person[], info: WeaponInfo) => people.filter(p => p.active && isOut(info, p.id));
// Ο λόγος που φαίνεται για κάθε εκτός: ο χειροκίνητος (όπως γράφτηκε) ή AUTO_KEY για ένοπλη υπηρεσία χωρίς κίνηση (η κίνηση νικά, μετράει μία φορά)
export const AUTO_KEY = '@auto';
export const outReasonOf = (info: WeaponInfo, pid: number) => info.moves.get(pid)?.reason ?? (info.out.has(pid) ? AUTO_KEY : '');
export function outReasons(people: Person[], info: WeaponInfo): [string, number][] {
  const n = new Map<string, number>();
  for (const p of outPeople(people, info)) { const r = outReasonOf(info, p.id); n.set(r, (n.get(r) || 0) + 1); }
  return [...n].sort((a, b) => Number(a[0] === AUTO_KEY) - Number(b[0] === AUTO_KEY) || b[1] - a[1] || a[0].localeCompare(b[0]));
}
// «Σκοπός 3ης (α) 15:45–18:15»: το νούμερο που τρέχει· στη μέρα όλα τα νούμερα του ιδιοκτήτη (στο «της θέσης» από την πρώτη έξοδο ως την τελευταία είσοδο)
export function armTxt(rows: ArmRow[]): string {
  const r = rows[0];
  return r.label + ' ' + (r.mode === 'post' ? armWhen({ out: r.out, in: rows[rows.length - 1].in }) : rows.map(armWhen).join(', '));
}
// Ένοπλες υπηρεσίες: με now («ΩΩ:ΛΛ», η d είναι σήμερα) όσοι είναι εκτός αυτή τη στιγμή· χωρίς, όσοι έχουν νούμερο τη μέρα d
function armInfo(st: ArmState, d: ISODate, now?: string): ArmInfo {
  if (now) return { live: true, ...armedLive(st, d, now) };
  const rows = armedRows(st, d); const cur = new Map<number, ArmRow>();
  for (const r of rows) if (!cur.has(r.owner)) cur.set(r.owner, r);
  return { ...NO_ARM, rows, cur };
}
// Χωρίς d οι ένοπλες υπηρεσίες δεν μετράνε· με d όλα τα νούμερα της μέρας κύκλου· με d και now (σήμερα) μόνο όσα τρέχουν τώρα
export function weaponInfo(s: Pick<AppState, 'people' | 'settings'> & Partial<Pick<AppState, 'guards' | 'dutyLog' | 'weaponLog' | 'rules' | 'dutyFix'>>, d?: ISODate, now?: string): WeaponInfo {
  const blocks = (blocksOf(s.settings) || s.settings.blocks).filter(b => !b.hidden && b.kind !== 'ly');
  const unarmed = new Set<number>(); const holders = new Map<string, Person[]>(); const racks = new Map<string, Person[]>();
  const push = (m: Map<string, Person[]>, k: string, p: Person) => { const l = m.get(k); if (l) l.push(p); else m.set(k, [p]); };
  for (const p of s.people) {
    if (p.si && siIsUnarmed(p, blocks, s.settings.lists)) unarmed.add(p.id);
    const r = seatKey(p.rack, p.wpos); if (r && p.active) push(racks, r, p);
    const k = weaponKey(p.weapon); if (k) push(holders, k, p);
  }
  const arm = d ? armInfo({ guards: s.guards || {}, dutyLog: s.dutyLog || {}, settings: s.settings, rules: s.rules, dutyFix: s.dutyFix }, d, now) : NO_ARM;
  const out = new Map<number, string>();
  if (arm.live) arm.cur.forEach((r, pid) => out.set(pid, armTxt([r])));
  else { const by = new Map<number, ArmRow[]>(); for (const r of arm.rows) { const l = by.get(r.owner); if (l) l.push(r); else by.set(r.owner, [r]); } by.forEach((l, pid) => out.set(pid, armTxt(l))); }
  return { unarmed, holders, racks, out, moves: openMoves(s.weaponLog), arm };
}
// Οι άλλοι (σε δύναμη) με την ίδια θέση (οπλοβαστός + θέση)
export const sameRack = (info: WeaponInfo, p: Pick<Person, 'id' | 'rack' | 'wpos'>, rack = p.rack, wpos = p.wpos) =>
  (info.racks.get(seatKey(rack, wpos)) || []).filter(x => x.id !== p.id);
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
// Οι ένοπλες υπηρεσίες ως κινήσεις (Michael, 24/10): μία γραμμή ανά νούμερο της μέρας κύκλου, με τις ώρες. Δεν γράφονται στο weaponLog:
// βγαίνουν από τις υπηρεσίες. id «auto:ΜΕΡΑ|θέση|n»· στο «της θέσης» pid = όποιος κρατά το όπλο, weapon = του ιδιοκτήτη.
export interface DutyMove extends WeaponMove { auto: true; row: ArmRow }
export const isAuto = (m: WeaponMove): m is DutyMove => (m as DutyMove).auto === true;
// τα άτομα που μπορεί να έχουν όπλο σε ένοπλη υπηρεσία: στρατιώτες και στελέχη σε θέση (Michael, 26/10)
export const armMap = (s: { people: Person[]; cadreList?: Cadre[] }) => seatMap({ people: s.people, cadreList: s.cadreList || [] });
export function dutyMove(s: Pick<AppState, 'people' | 'settings'> & { cadreList?: Cadre[] }, r: ArmRow): DutyMove {
  const pm = armMap(s); const o = r.out, i = r.in;
  const back = r.mode === 'post' && r.give ? 'ΠΑΡΑΔΟΣΗ' + (r.next != null ? ' ΣΕ ' + upper(pm.get(r.next)?.last || '') : '') : weaponBack('ΥΠΗΡΕΣΙΑ', s.settings.lists) || ARM_BACK;
  return { id: 'auto:' + r.id, pid: r.who, weapon: normWeapon(pm.get(r.owner)?.weapon), reason: r.reason, outDay: calDay(r.day, o), outTime: hmOf(o), inDay: calDay(r.day, i), inTime: hmOf(i), inReason: back.trim(),
    note: r.fix ? 'ΔΙΟΡΘΩΣΗ: ' + r.fix.why : '', auto: true, row: r };
}
export const dutyMoves = (s: Pick<AppState, 'people' | 'settings' | 'guards' | 'dutyLog' | 'rules' | 'dutyFix'> & { cadreList?: Cadre[] }, d: ISODate): DutyMove[] => armedRows(s, d).map(r => dutyMove(s, r));
// Κίνηση από το id της: από το weaponLog ή αυτόματη (έντυπο «Κινήσεις όπλων»)
export function moveById(s: AppState, id: string): WeaponMove | undefined {
  if (id.startsWith('auto:')) { const r = rowById(s, id.slice(5)); return r ? dutyMove(s, r) : undefined; }
  return (s.weaponLog || []).find(m => m.id === id);
}
// Όπως στο Excel και στο έντυπο: οι κινήσεις και οι ένοπλες υπηρεσίες της μέρας με τη σειρά που βγαίνουν. Στο «της θέσης»: «ΠΑΡΑΛΑΒΗ ΩΩ:ΛΛ» / «ΠΑΡΑΔΟΣΗ ΩΩ:ΛΛ»
export const movesAll = (s: AppState, d: ISODate): WeaponMove[] => [...movesOn(s.weaponLog, d), ...dutyMoves(s, d)].sort(byOut);
const dayTxt = (day: ISODate | undefined, t: string | undefined, d: ISODate) => (day === d ? '' : dm(day!) + ' ') + t;
export const moveOutCell = (m: WeaponMove) => (isAuto(m) && m.row.mode === 'post' ? 'ΠΑΡΑΛΑΒΗ ' + dayTxt(m.outDay, m.outTime, m.row.day) : dmy(m.outDay) + ' ' + m.outTime);
export const moveInCell = (m: WeaponMove) => (isAuto(m) && m.row.mode === 'post' ? 'ΠΑΡΑΔΟΣΗ ' + dayTxt(m.inDay, m.inTime, m.row.day) : m.inDay ? dmy(m.inDay) + ' ' + (m.inTime || '') : 'ΕΚΤΟΣ');
function moveSheet(s: AppState, d: ISODate): WeaponSheet {
  const pm = armMap(s);
  const rows = movesAll(s, d).map((m, j) => {
    const p = pm.get(m.pid);
    return [j + 1, rankTxt(p), p?.last || '', p?.first || '', normWeapon(m.weapon), m.reason, moveOutCell(m), m.inReason || '', moveInCell(m), (p?.cid ? 'ΣΤΕΛΕΧΟΣ' + (isAuto(m) || m.note ? ' · ' : '') : '') + (isAuto(m) ? 'ΑΥΤΟΜΑΤΑ' + (m.note ? ' · ' + m.note : '') : m.note || '')];
  });
  return { name: 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ', title: 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ ' + dmy(d), head: MOVE_COLS, rows, note: 'Έξοδοι και είσοδοι όπλων από τον οπλοβαστό τη μέρα, και όσα είναι ακόμα εκτός· οι ένοπλες υπηρεσίες ανά νούμερο, με τις ώρες' };
}

// ---------- Επιλογή για ομαδική έξοδο (Michael, 24/10) ----------
// Μπορεί να βγει το όπλο: σε δύναμη, έχει αριθμό και δεν είναι ήδη εκτός (κίνηση ή ένοπλη υπηρεσία)
export const canOut = (p: Person, info: WeaponInfo) => !!p.active && !!weaponKey(p.weapon) && !isOut(info, p.id);
// Από όσους διάλεξες: ποιοι βγαίνουν και γιατί δεν βγαίνουν οι άλλοι
export function outSplit(ps: Person[], info: WeaponInfo) {
  const go: Person[] = []; const noW: Person[] = []; const already: Person[] = []; const gone: Person[] = [];
  for (const p of ps) (!p.active ? gone : !weaponKey(p.weapon) ? noW : isOut(info, p.id) ? already : go).push(p);
  return { go, noW, already, gone };
}
// «2 χωρίς αριθμό, 1 ήδη εκτός»: για το μήνυμα όσων παραλείφθηκαν· κενό αν δεν παραλείφθηκε κανείς
export function skipTxt(x: ReturnType<typeof outSplit>) {
  const t = [x.noW.length && x.noW.length + ' χωρίς αριθμό', x.already.length && x.already.length + ' ήδη εκτός', x.gone.length && x.gone.length + ' εκτός δύναμης'].filter(Boolean).join(', ');
  const n = x.noW.length + x.already.length + x.gone.length;
  return n ? n + (n === 1 ? ' παραλείφθηκε' : ' παραλείφθηκαν') + ' (' + t + ')' : '';
}
// Shift-click: τα id ανάμεσα στα δύο (και τα δύο μέσα), με τη σειρά που φαίνονται· κενό αν το ένα δεν φαίνεται
export function idRange<T extends string | number>(ids: T[], a: T, b: T): T[] {
  const i = ids.indexOf(a), j = ids.indexOf(b); if (i < 0 || j < 0) return [];
  return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
}
// Κουτί σάρωσης: ΑΣΜ, ή αριθμός όπλου, ή θέση («Ε 23» = «Ε23»). Από όλους σε δύναμη, με αυτή τη σειρά προτεραιότητας.
// Η θέση ταιριάζει μόνο ολόκληρη (οπλοβαστός + θέση)· σκέτο «Ε» βρίσκει όσους έχουν Ε χωρίς θέση.
export type ScanBy = 'asm' | 'weapon' | 'seat' | '';
export function scanFind(q: string, people: Person[]): { by: ScanBy; hits: Person[] } {
  const t = q.trim().toUpperCase(); if (!t) return { by: '', hits: [] };
  const act = people.filter(p => p.active);
  const asm = act.filter(p => String(p.asm ?? '').trim().toUpperCase() === t); if (asm.length) return { by: 'asm', hits: asm };
  const wk = weaponKey(q); const w = wk ? act.filter(p => weaponKey(p.weapon) === wk) : []; if (w.length) return { by: 'weapon', hits: w };
  const sk = rackKey(q); const seat = sk ? act.filter(p => rackKey(p.rack) && rackKey(p.rack) + posKey(p.wpos) === sk) : [];
  return seat.length ? { by: 'seat', hits: seat } : { by: '', hits: [] };
}
// «Ξανά οι ίδιοι»: οι τελευταίες ομαδικές έξοδοι από το ημερολόγιο (ίδιος λόγος, μέρα και ώρα, 2 ή περισσότεροι), νεότερη πρώτη
export interface RedoGroup { reason: string; day: ISODate; time: string; pids: number[] }
export function redoGroups(log: WeaponMove[] | undefined, n = 5): RedoGroup[] {
  const by = new Map<string, RedoGroup>();
  for (const m of log || []) {
    const k = m.reason + '|' + m.outDay + '|' + m.outTime; let g = by.get(k);
    if (!g) by.set(k, g = { reason: m.reason, day: m.outDay, time: m.outTime, pids: [] });
    if (!g.pids.includes(m.pid)) g.pids.push(m.pid);
  }
  return [...by.values()].filter(g => g.pids.length >= 2).sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time)).slice(0, n);
}
// «Από υπηρεσία»: οι άνθρωποι κάθε μπλοκ υπηρεσιών της μέρας (θέσεις και υπηρεσίες χωρίς θέση), ένοπλα μπλοκ πρώτα
export interface DutyPick { block: string; name: string; armed: boolean; pids: number[] }
export function dutyPicks(s: Pick<AppState, 'guards' | 'dutyLog' | 'settings'>, d: ISODate): DutyPick[] {
  const blocks = blocksOf(s.settings) || s.settings.blocks; const by = new Map<string, DutyPick>();
  const add = (block: string, armed: boolean, pid: number) => {
    let x = by.get(block); if (!x) by.set(block, x = { block, name: blocks.find(b => b.id === block)?.name || block, armed, pids: [] });
    if (!x.pids.includes(pid)) x.pids.push(pid);
  };
  const g = s.guards?.[d] || {};
  for (const k in g) { const x = postBy(s as AppState, k); if (x && g[k] != null) add(x.block, x.armed, g[k]); }
  const posts = postsOf(s.settings);
  for (const e of s.dutyLog?.[d] || []) { const x = posts.find(y => y.kind === e.kind); if (x) add(x.block, x.armed, e.pid); }
  return [...by.values()].sort((a, b) => Number(b.armed) - Number(a.armed));
}
