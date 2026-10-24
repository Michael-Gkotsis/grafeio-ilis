// Καθαρές συναρτήσεις κανόνων: ίδιες στο main process και στο UI (09 §2, shared/rules)
import { HK } from './unit';
import { addDays, daysBetween, dm, greekHolidays, isWeekend, parseD, weekday, DOW_FULL, type ISODate } from './dates';
import { cadreAbsOf, guessHk, hkClaimOf, hkOfRank, hkRowList, hkRowsOf, isEpopOrigin, leaveCol, medWarns, originRow, statusLbl, type UserLists } from './ranks';
import { siAllows, siIsUnarmed, siOf } from './si';
import { STAT_ROWS, statDefault, statIsUnarmed, statNoOut, statOn, type StatCell } from './stat';
import { backBy, hasTimes, mins } from './hours';
import {
  TYPES, TYPE_KEYS, RECORD_CATS, coversDay, CAP_KINDS, CAP_ACC, buildPosts, blocksOf, everyBlock, phaseBlocks, dutyStartOf, DEFAULT_BLOCKS, DEFAULT_BLOCKS_SPEN, postTxt, shortName, noteNamesakes,
  KIND_NAME, type AppState, type CapKey, type Caps, type Phase, type Baseline, type Cadre, type CadreAbs, type DutyLog, type Person, type Post, type Skip, type Status, type TypeKey, type DutyKind, type Guards, type Settings, type Rules, type BlockDef
} from './domain';

// --------------------------- ευρετήρια (cache ανά αντικείμενο) ---------------------------
const peopleIdx = new WeakMap<Person[], Map<number, Person>>();
export function personMap(people: Person[]): Map<number, Person> {
  noteNamesakes(people);   // συνονόματοι για fullName/shortName (domain.ts)
  let m = peopleIdx.get(people);
  if (!m) { m = new Map(people.map(p => [p.id, p])); peopleIdx.set(people, m); }
  return m;
}
export const activePeople = (s: AppState) => s.people.filter(p => p.active);
// ΕΠΟΠ και ΟΒΑ στρατιώτες (Michael, 21/10): μετρούν σαν στελέχη (καταστάσεις, απαλλαγή με το χέρι) αλλά κάνουν
// ορισμένες υπηρεσίες τον μήνα (όριο monthMax), μόνο με το χέρι, ποτέ από την αυτόματη συμπλήρωση. Συνήθως είναι στα
// Στελέχη: όποιο στέλεχος έχει όριο παίρνει αριθμό θέσης (Cadre.pid, αρνητικός) και μπαίνει στις θέσεις σαν άτομο (cadreSeat).
// Αν κάποιος ΕΠΟΠ είναι στο Δυναμολόγιο (από το Excel): όποιος έχει προέλευση ΕΠΟΠ ή ΟΒΑ (ή, από παλιά, ΕΠΟΠ/ΟΒΑ μέσα
// στον βαθμό), ή δικό σου βαθμό που στην ΗΚΑΙ μπαίνει στη γραμμή «ΕΠΟΠ/ΟΒΑ Στρατιώτης», ισχύουν τα ίδια.
export const EPOP_ROWS = ['ΕΠΟΠ Στρατιώτης', 'ΟΒΑ Στρατιώτης'];
export const isEpop = (p: Pick<Person, 'rank' | 'origin'>, lists?: UserLists) => isEpopOrigin(p.origin) || /(^|[^Α-Ω])(ΕΠΟΠ|ΟΒΑ)([^Α-Ω]|$)/.test((p.rank || '').toUpperCase().replace(/\./g, '')) || EPOP_ROWS.includes(hkRankOf(p.rank || '', lists, p.origin));
// Όσοι μπαίνουν στην αυτόματη συμπλήρωση και στη σειρά δικαιοσύνης: όλοι σε δύναμη εκτός από ΕΠΟΠ/ΟΒΑ
const poolIdx = new WeakMap<Person[], { lists?: UserLists; out: Person[] }>();
export function dutyPool(s: AppState): Person[] {
  const c = poolIdx.get(s.people); if (c && c.lists === s.settings.lists) return c.out;
  const out = s.people.filter(p => p.active && !isEpop(p, s.settings.lists)); poolIdx.set(s.people, { lists: s.settings.lists, out });
  return out;
}
export const cadreSeat = (c: Cadre): Person => ({
  id: c.pid!, cid: c.id, rank: c.rank, ...(c.origin ? { origin: c.origin } : {}), spec: c.spec || '', last: c.last, first: c.first, father: '', asm: c.am || '', phone: c.phone || '',
  room: null, si: '', post: null, role: c.role || null, essos: '', attached: false, active: c.active, notes: '', ...(c.monthMax ? { monthMax: c.monthMax } : {})
});
const seatsIdx = new WeakMap<Cadre[], Person[]>();
// τα στελέχη που έχουν (ή είχαν) θέσεις, σαν άτομα: και όσα είναι εκτός δύναμης, για το ιστορικό
export function cadreSeats(s: Pick<AppState, 'cadreList'>): Person[] {
  const cl = s.cadreList || []; let v = seatsIdx.get(cl);
  if (!v) { v = cl.filter(c => c.pid != null).map(cadreSeat); seatsIdx.set(cl, v); }
  return v;
}
// όσοι διαλέγονται για θέση: οι στρατιώτες και τα στελέχη με υπηρεσίες (σε δύναμη, με όριο)· και στον Έλεγχο υπηρεσιών
const seatPplIdx = new WeakMap<Person[], { cl: Cadre[]; v: Person[] }>();
export function seatPeople(s: Pick<AppState, 'people' | 'cadreList'>): Person[] {
  const cl = s.cadreList || []; const c = seatPplIdx.get(s.people); if (c && c.cl === cl) return c.v;
  const extra = cadreSeats(s).filter(p => p.active && p.monthMax); const v = extra.length ? [...s.people, ...extra] : s.people;
  seatPplIdx.set(s.people, { cl, v });
  return v;
}
// ποιος είναι σε μια θέση: στρατιώτης ή στέλεχος (αρνητικός αριθμός)
const seatMapIdx = new WeakMap<Person[], { cl: Cadre[]; m: Map<number, Person> }>();
export function seatMap(s: Pick<AppState, 'people' | 'cadreList'>): Map<number, Person> {
  const pm = personMap(s.people); const cl = s.cadreList || [];
  if (!cl.some(c => c.pid != null)) return pm;
  const c = seatMapIdx.get(s.people); if (c && c.cl === cl) return c.m;
  const m = new Map(pm); for (const p of cadreSeats(s)) m.set(p.id, p);
  seatMapIdx.set(s.people, { cl, m });
  return m;
}
const limited = (p: Person, lists?: UserLists) => !!p.cid || isEpop(p, lists);
// Υπηρεσίες του μήνα της μέρας (χωρίς την ίδια τη μέρα): όσες μέρες έχει υπηρεσία, από το ημερολόγιο και από το Excel
export function monthDuties(s: AppState, date: ISODate, pid: number, idx?: Map<number, Set<ISODate>>): number {
  const ds = (idx || dutyIndexOf(s)).get(pid); if (!ds) return 0;
  const ym = date.slice(0, 7); let n = 0;
  for (const d of ds) if (d !== date && d.slice(0, 7) === ym) n++;
  return n;
}
// Το όριο του μήνα: «έφτασε το όριο» αν με αυτή τη μέρα το ξεπερνά (ζητά επιβεβαίωση, όπως όλοι οι κανόνες)
export function monthBlock(s: AppState, date: ISODate, pid: number, idx?: Map<number, Set<ISODate>>): string | null {
  const p = pid < 0 ? seatMap(s).get(pid) : personMap(s.people).get(pid);
  if (p?.cid) {
    if (!p.active) return 'Στέλεχος εκτός δύναμης';
    // στέλεχος με κατάσταση εκείνη τη μέρα (άδεια, απαλλαγή, ΕΥ…): μόνο η «Υπηρεσία εντός στρατοπέδου» τον αφήνει
    const a = cadreAbsOn(s, p.cid, date); const k = a && cadreAbsOf(a.kind, s.settings.lists);
    if (k && k[2] && k[2] !== 'yp') return 'Στέλεχος: ' + k[1] + ' ' + dm(a!.from) + (a!.to !== a!.from ? '–' + dm(a!.to) : '');
  }
  const max = p?.monthMax;
  if (!p || !max || !limited(p, s.settings.lists)) return null;
  const n = monthDuties(s, date, pid, idx);
  return n >= max ? 'Έφτασε το όριο του μήνα: ' + n + ' από ' + max + ' υπηρεσίες' : null;
}
// «2 από 4 τον μήνα» για την επιλογή ατόμου και την καρτέλα
export function monthTxt(s: AppState, date: ISODate, p: Person): string {
  if (!limited(p, s.settings.lists)) return '';
  const n = monthDuties(s, date, p.id);
  return p.monthMax ? n + ' από ' + p.monthMax + ' τον μήνα' : n + ' τον μήνα';
}

// Θέσεις του εντύπου που ισχύει τώρα (ΣΒΕΝ, ΣΠΕΝ ή δικό σου), χωρίς όσες έχουν αφαιρεθεί
const postsIdx = new WeakMap<Settings['blocks'], { start: string; p: Post[] }>();
export function postsOf(settings: Settings): Post[] {
  const blocks = blocksOf(settings) || settings.blocks; const start = dutyStartOf(settings);
  let c = postsIdx.get(blocks);
  if (!c || c.start !== start) { c = { start, p: buildPosts(blocks.filter(b => !b.hidden), start).filter(x => !x.hidden) }; postsIdx.set(blocks, c); }
  return c.p;
}
// Όλες οι θέσεις που έχουν υπάρξει (όλων των εντύπων, και όσες αφαιρέθηκαν): για το ιστορικό και τον έλεγχο υπηρεσιών
const allIdx = new WeakMap<Settings, Post[]>();
export function allPosts(settings: Settings): Post[] {
  let p = allIdx.get(settings);
  if (!p) {
    const seen = new Set<string>(); p = [];
    for (const x of [...postsOf(settings), ...buildPosts(everyBlock(settings), dutyStartOf(settings))]) if (!seen.has(x.k)) { seen.add(x.k); p.push(x); }
    allIdx.set(settings, p);
  }
  return p;
}
// θέση από το κλειδί της: με ευρετήριο, γιατί καλείται για κάθε υπηρεσία του ημερολογίου (σύνολα, «Γιατί αυτός;»)
const postKeyIdx = new WeakMap<Settings, Map<string, Post>>();
export const postBy = (s: AppState, k: string): Post | undefined => {
  let m = postKeyIdx.get(s.settings);
  if (!m) { m = new Map(allPosts(s.settings).map(p => [p.k, p])); postKeyIdx.set(s.settings, m); }
  return m.get(k);
};

// --------------------------- αργίες ---------------------------
// Οι επίσημες αργίες βγαίνουν για κάθε χρονιά (σταθερές και από το Πάσχα, dates.ts), μαζί με όσες πρόσθεσες
// (settings.holidays) και χωρίς όσες αφαίρεσες (settings.holidaysOff). Κρατιούνται ανά λίστες και έτος.
const holIdx = new WeakMap<object, WeakMap<object, Map<number, Map<ISODate, string>>>>();
const NO_OFF: ISODate[] = [];
export function holidaysOf(settings: Settings, year: number): Map<ISODate, string> {
  const add = settings.holidays || {}, off = settings.holidaysOff || NO_OFF;
  let a = holIdx.get(add); if (!a) { a = new WeakMap(); holIdx.set(add, a); }
  let b = a.get(off); if (!b) { b = new Map(); a.set(off, b); }
  let m = b.get(year);
  if (!m) {
    const no = new Set(off); m = new Map();
    for (const [d, n] of Object.entries(greekHolidays(year))) if (!no.has(d)) m.set(d, n);
    for (const [d, n] of Object.entries(add)) if (+d.slice(0, 4) === year) m.set(d, n);
    b.set(year, m);
  }
  return m;
}
const holOf = (settings: Settings, d: ISODate) => holidaysOf(settings, +d.slice(0, 4)).get(d);
export const isHol = (settings: Settings, d: ISODate) => isWeekend(d) || holOf(settings, d) != null;
export const holName = (settings: Settings, d: ISODate) => holOf(settings, d) || (isWeekend(d) ? 'ΣΚ' : '');

// --------------------------- καταστάσεις ---------------------------
const ORDER = (k: TypeKey) => TYPE_KEYS.indexOf(k);
// Όλες οι ενεργές καταστάσεις ενός ατόμου μια μέρα. Πρώτα οι απουσίες. Οι ποινές που αιτούνται δεν μετράνε (Κ-19).
// Ευρετήριο καταστάσεων ανά άτομο: κάθε έξοδος/ΔΝ είναι κατάσταση, οπότε σε έναν χρόνο είναι δεκάδες χιλιάδες.
// Φτιάχνεται μία φορά για κάθε πίνακα καταστάσεων (οι εντολές φτιάχνουν πάντα νέο πίνακα, δεν τον αλλάζουν).
const byPidIdx = new WeakMap<Status[], Map<number, Status[]>>();
const NONE: Status[] = [];
export function statusesOf(statuses: Status[], pid: number): Status[] {
  let m = byPidIdx.get(statuses);
  if (!m) {
    m = new Map();
    for (const x of statuses) { const l = m.get(x.pid); if (l) l.push(x); else m.set(x.pid, [x]); }
    byPidIdx.set(statuses, m);
  }
  return m.get(pid) || NONE;
}
// Ίδια ερώτηση ξανά και ξανά (κάθε υποψήφιος σε κάθε θέση της αυτόματης συμπλήρωσης): κρατιέται ανά πίνακα, μέρα και άτομο.
// Το αποτέλεσμα είναι μόνο για ανάγνωση.
const onIdx = new WeakMap<Status[], Map<ISODate, Map<number, Status[]>>>();
export function statusesOn(statuses: Status[], pid: number, date: ISODate): Status[] {
  let byDay = onIdx.get(statuses); if (!byDay) { byDay = new Map(); onIdx.set(statuses, byDay); }
  let byPid = byDay.get(date); if (!byPid) { byPid = new Map(); byDay.set(date, byPid); }
  let r = byPid.get(pid);
  if (!r) {
    r = statusesOf(statuses, pid).filter(s => !s.pending && coversDay(s, date));
    r = r.length ? r.sort((a, b) => (Number(!!TYPES[b.type].away) - Number(!!TYPES[a.type].away)) || ORDER(a.type) - ORDER(b.type)) : NONE;
    byPid.set(pid, r);
  }
  return r;
}
// Ώρες επιστροφής (Michael, 18/10): η τελευταία μέρα μιας άδειας (ή νοσοκομείου, ΣΤΕΠ) με ώρα επιστροφής μετρά μόνο ως
// εκείνη την ώρα. Κάθε έλεγχος έχει τη δική του στιγμή: η έξοδος ξεκινά στις rules.outTime, η ΗΚΑΙ μετρά στις
// rules.hkTime, οι υπηρεσίες στην αρχή του κύκλου, settings.dutyStart (ανά θέση το backBefore πιο κάτω). Η πρώτη μέρα μετρά πάντα ολόκληρη, όπως
// και κάθε μέρα χωρίς ώρα.
export const DEFAULT_OUT_TIME = '16:00', DEFAULT_HK_TIME = '08:00';
// Αρχή του κύκλου των υπηρεσιών σε λεπτά (Ρυθμίσεις › Υπηρεσίες, προεπιλογή 14:00)
export const dutyMin = (st?: Pick<Settings, 'dutyStart'> | null) => mins(dutyStartOf(st));
const timeOr = (t: string | undefined, def: string) => (t && /^\d\d:\d\d$/.test(t) ? t : def);
export const outMin = (r?: Pick<Rules, 'outTime'> | null) => mins(timeOr(r?.outTime, DEFAULT_OUT_TIME));
export const hkMin = (r?: Pick<Rules, 'hkTime'> | null) => mins(timeOr(r?.hkTime, DEFAULT_HK_TIME));
// Οι καταστάσεις που ισχύουν τη μέρα date από τις m και μετά (λεπτά από τα μεσάνυχτα): χωρίς όσες τελείωσαν ως τότε
export function statusesFrom(statuses: Status[], pid: number, date: ISODate, m: number): Status[] {
  const ss = statusesOn(statuses, pid, date);
  return ss.some(x => backBy(x, date, m)) ? ss.filter(x => !backBy(x, date, m)) : ss;
}
// Τώρα (Michael, 20/10: «όταν κάποιος γυρνά, να γυρνά το state του στο κανονικό»): όποιος γύρισε σήμερα ως την ώρα
// που είναι τώρα (now, λεπτά) δεν λείπει πια στο Δυναμολόγιο, στις Άδειες και στο «Σήμερα». Άλλες μέρες: ολόκληρη η μέρα.
export const statusesNow = (statuses: Status[], pid: number, date: ISODate, today: ISODate, now: number) =>
  (date === today ? statusesFrom(statuses, pid, date, now) : statusesOn(statuses, pid, date));
// Άδεια που δεν έχει τελειώσει ακόμα τώρα (σήμερα, now λεπτά)
export const awayNow = (s: Status, today: ISODate, now: number) => s.to > today || (s.to === today && !backBy(s, today, now));
const untilTxt = (s: Status, date: ISODate) => (s.open ? ' (χωρίς λήξη)' : s.to === date ? '' : ' έως ' + dm(s.to));
export const isRecordExpiredOn = (s: Status, date: ISODate) => !s.open && RECORD_CATS.includes(TYPES[s.type].cat) && s.to === addDays(date, -1);

// Κάθε άτομο μετριέται μία φορά (Michael, 22/10: «δεν βγαίνουν τα μαθηματικά»): counts/lists ανά είδος, ένας άνθρωπος
// μία φορά ανά είδος· away/awayLists μόνο οι απόντες, ο καθένας στον πρώτο λόγο που λείπει (νοσοκομείο, άδεια, μετά
// έξοδος/ΔΝ), ώστε τα νούμερά τους να κάνουν ακριβώς absent = total − present.
export interface Strength { total: number; present: number; absent: number; counts: Record<TypeKey, number>; lists: Record<TypeKey | 'present', Person[]>; away: Record<TypeKey, number>; awayLists: Record<TypeKey, Person[]> }
// at: η στιγμή της μέρας που μετρά (λεπτά)· προεπιλογή η ώρα της ΗΚΑΙ (οι Εξοδούχοι μετρούν από την ώρα εξόδου)
export function strengthOf(s: AppState, date: ISODate, at = hkMin(s.rules)): Strength {
  const people = activePeople(s);
  const counts = {} as Record<TypeKey, number>, away = {} as Record<TypeKey, number>;
  const lists = { present: [] } as unknown as Strength['lists'], awayLists = {} as Strength['awayLists'];
  TYPE_KEYS.forEach(k => { counts[k] = 0; lists[k] = []; away[k] = 0; awayLists[k] = []; });
  let present = 0;
  for (const p of people) {
    const ss = statusesFrom(s.statuses, p.id, date, at);
    // διπλή εγγραφή του ίδιου είδους (π.χ. δύο έξοδοι την ίδια μέρα): μία φορά
    new Set(ss.map(x => x.type)).forEach(k => { counts[k]++; lists[k].push(p); });
    // οι καταστάσεις είναι ταξινομημένες: πρώτα οι απουσίες, με τη σειρά των ειδών
    const a = ss.find(x => TYPES[x.type].away);
    if (a) { away[a.type]++; awayLists[a.type].push(p); } else { present++; lists.present.push(p); }
  }
  return { total: people.length, present, absent: people.length - present, counts, lists, away, awayLists };
}
// Η στιγμή που μετρά η Δύναμη μιας μέρας: σήμερα όπως η ΗΚΑΙ ως τις 08:00 και μετά όποιος γύρισε ως τώρα (το «Σήμερα»,
// η Δύναμη και το Δυναμολόγιο το ίδιο)· άλλες μέρες η ώρα της ΗΚΑΙ.
export const strengthAt = (r: Rules | null | undefined, date: ISODate, today: ISODate, now: number) => (date === today ? Math.max(hkMin(r), now) : hkMin(r));
// Σύνοψη των απόντων: «24 έξοδος · 29 ΔΝ · 4 ΚΑ», με τη σειρά των ειδών· αθροίζει στους Απόντες
export const awayText = (c: Strength) => TYPE_KEYS.filter(k => c.away[k] > 0).map(k => c.away[k] + ' ' + (k === 'OUT' ? 'έξοδος' : TYPES[k].label)).join(' · ');

// --------------------------- Δυνατότητα υπηρεσιών (Κ-15) ---------------------------
// Για την κάρτα του ατόμου (ανά είδος): πόστο, ή Σ.Ι. που δεν μπαίνει σε καμία υπηρεσία αυτού του είδους (blocks: και των
// δύο εντύπων). Ο έλεγχος ανά θέση γίνεται στο capBlock, ανά υπηρεσία.
export function defaultCaps(p: Person, lists?: UserLists, blocks: BlockDef[] = [...DEFAULT_BLOCKS, ...DEFAULT_BLOCKS_SPEN]): Partial<Record<DutyKind, string>> {
  // όποιος έχει πόστο εξαιρείται από όλες τις υπηρεσίες εκτός από Λ/Υ και Δ/Υ
  if (p.post) return Object.fromEntries(CAP_KINDS.map(([k]) => [k, 'Πόστο: ' + p.post]));
  const out: Partial<Record<DutyKind, string>> = {};
  for (const [k] of CAP_KINDS) {
    const bs = blocks.filter(b => b.kind === k && !b.hidden);
    if (bs.length && bs.every(b => !siAllows(p, b, lists))) out[k] = 'Σ.Ι. ' + siOf(p, lists).text;
  }
  return out;
}
const blocksIdx = new WeakMap<Settings, BlockDef[]>();
const allBlocks = (st: Settings): BlockDef[] => {
  let b = blocksIdx.get(st);
  if (!b) { const seen = new Set<string>(); b = [...(blocksOf(st) || []), ...everyBlock(st)].filter(x => !seen.has(x.id) && !!seen.add(x.id)); blocksIdx.set(st, b); }
  return b;
};
export function capsOf(s: AppState, pid: number): Partial<Record<DutyKind, string>> {
  const p = personMap(s.people).get(pid);
  const c: Partial<Record<CapKey, string | null>> = { ...(p ? defaultCaps(p, s.settings.lists, allBlocks(s.settings)) : {}), ...(s.caps[pid] || {}) };
  const out: Partial<Record<DutyKind, string>> = {};
  CAP_KINDS.forEach(([k]) => { if (c[k]) out[k] = c[k] as string; });
  return out;
}
// Η ρύθμιση του λοχία για μια θέση: της δικής σου υπηρεσίας («b:» + id) μόνο, αλλιώς του είδους της. Η δική σου
// υπηρεσία (π.χ. Πύλη) έχει δική της στήλη και δεν ακολουθεί το είδος της (Michael, 22/10: «Πύλη σκέτο, όχι σαν Μαγειρεία»).
// string = δεν κάνει (αιτία), null = ρητά κάνει (παρά Σ.Ι./πόστο), undefined = ό,τι λένε Σ.Ι. και πόστο
const manOf = (own: Partial<Record<CapKey, string | null>>, block: string | undefined, kind: DutyKind, custom: boolean): string | null | undefined =>
  (custom && block ? own[('b:' + block) as CapKey] : own[kind]);
// Μία φορά (settings.rev 6): ό,τι ίσχυε για μια δική σου υπηρεσία μέσω του είδους της (π.χ. «δεν κάνει μαγειρεία» και
// για την Πύλη που είχε είδος μαγειρεία) γράφεται στη δική της στήλη, ώστε να μην αλλάξει τίποτα. null = καμία αλλαγή.
export function capsPerService(st: Settings, caps: Caps): Caps | null {
  const own = allBlocks(st).filter(b => b.custom && b.kind !== 'ly');
  if (!own.length) return null;
  let out: Caps | null = null;
  for (const [id, c] of Object.entries(caps)) {
    let next: Partial<Record<CapKey, string | null>> | null = null;
    for (const b of own) {
      const key = ('b:' + b.id) as CapKey;
      if (c[b.kind] === undefined || c[key] !== undefined) continue;
      next = next || { ...c }; next[key] = c[b.kind];
    }
    if (next) { out = out || { ...caps }; out[Number(id)] = next; }
  }
  return out;
}

// Μία φορά (settings.rev 7, Michael 22/10: «κάθε υπηρεσία να μετρά ως δική της»): οι δικές σου υπηρεσίες που είχαν
// είδος του εντύπου (π.χ. Πύλη ως μαγειρεία) γίνονται «άλλη»: δική τους στήλη στον έλεγχο και στη σειρά, όχι πια
// στα σύνολα των μαγειρείων. Οι κωδικοί τους μένουν (διαβάζονται τα παλιά Excel). Όπου ο πίνακας Καταστάσεων έλεγε
// κάτι άλλο λόγω του είδους (ΕΑ/ΕΟ όχι σε μαγειρεία, σε σκοπιά μόνο αν δεν υπάρχει άλλος) γράφεται ρητά, ώστε να μην
// αλλάξει ποιος μπαίνει. Πρώτα το capsPerService (θέλει το παλιό είδος). null = καμία αλλαγή.
export function ownKinds(st: Settings): Settings | null {
  const conv = everyBlock(st).filter(b => b.custom && b.kind !== 'other' && b.kind !== 'ly');
  if (!conv.length) return null;
  const old = st.lists?.stat?.cells || {}; const cells: Record<string, Record<string, StatCell>> = { ...old };
  for (const b of conv) for (const t of STAT_ROWS) {
    const was = statDefault(TYPES[t], b), now = statDefault(TYPES[t], { kind: 'other', armed: b.armed });
    if (was !== now && !cells[t]?.[b.id]) cells[t] = { ...(cells[t] || {}), [b.id]: was };
  }
  const ids = new Set(conv.map(b => b.id));
  const fix = (list: BlockDef[] | undefined) => list && list.map(b => (ids.has(b.id) && b.custom ? { ...b, kind: 'other' as DutyKind } : b));
  const out: Settings = { ...st, blocks: fix(st.blocks)!, blocksSpen: fix(st.blocksSpen)!, ...(st.phases ? { phases: st.phases.map(x => ({ ...x, blocks: fix(x.blocks)! })) } : {}) };
  if (JSON.stringify(cells) !== JSON.stringify(old)) out.lists = { ...(st.lists || {}), stat: { ...(st.lists?.stat || {}), cells } };
  return out;
}

// --------------------------- «Ποιος κάνει τι» (Υπηρεσίες, Michael 18/10) ---------------------------
// Στήλες: τα είδη των υπηρεσιών του εντύπου (θαλαμοφύλακας, οπλοφύλακας, σκοπιά, μαγειρεία, ΤΑΕ) και κάθε δική σου
// υπηρεσία χωριστά (πύλη…), από όλα τα έντυπα μαζί (ΣΒΕΝ, ΣΠΕΝ, δικά σου). Όχι οι κρυμμένες, όχι Λ/Υ-Δ/Υ (ορίζονται με το χέρι). Νέα υπηρεσία
// μπαίνει μόνη της ως στήλη. Τα δεδομένα είναι τα ίδια με το αρχείο «Δυνατότητα υπηρεσιών» (s.caps).
export interface CapCol { key: CapKey; kind: DutyKind; label: string; short: string; armed: boolean; phases: Phase[]; block?: BlockDef }
const colsIdx = new WeakMap<Settings, CapCol[]>();
const CAP_SHORT: Partial<Record<DutyKind, string>> = { th: 'Θαλαμοφ.', op: 'Οπλοφ.', other: 'Άλλες' };
export function capCols(st: Settings): CapCol[] {
  let out = colsIdx.get(st);
  if (out) return out;
  const kinds = new Map<DutyKind, CapCol>(); const own = new Map<string, CapCol>();
  for (const [ph, bs] of phaseBlocks(st)) for (const b of bs) {
    if (b.hidden || b.kind === 'ly') continue;
    const m = b.custom ? own : kinds; const id = b.custom ? b.id : b.kind;
    let c = (m as Map<string, CapCol>).get(id);
    if (!c) { c = b.custom ? { key: ('b:' + b.id) as CapKey, kind: b.kind, label: b.name, short: b.name, armed: b.armed, phases: [], block: b } : { key: b.kind, kind: b.kind, label: capLabel(b.kind), short: CAP_SHORT[b.kind] || capLabel(b.kind), armed: false, phases: [] }; (m as Map<string, CapCol>).set(id, c); }
    if (!b.custom && b.armed) c.armed = true;
    if (!c.phases.includes(ph)) c.phases.push(ph);
  }
  out = [...CAP_KINDS.filter(([k]) => kinds.has(k)).map(([k]) => kinds.get(k)!), ...own.values()];
  colsIdx.set(st, out);
  return out;
}
// Ένα κελί: κάνει ή όχι, και από πού. auto = από Σ.Ι./πόστο (ή τίποτα), man = ο λοχίας, force = κάνει παρά τη
// Σ.Ι./το πόστο (why = τι παρακάμπτει)
export interface CapCell { on: boolean; src: 'auto' | 'man' | 'force'; why: string }
export function capDefault(s: AppState, p: Person, col: CapCol): string | null {
  if (col.block) return p.post ? 'Πόστο: ' + p.post : siAllows(p, col.block, s.settings.lists) ? null : 'Σ.Ι. ' + siOf(p, s.settings.lists).text;
  return defaultCaps(p, s.settings.lists, allBlocks(s.settings).filter(b => !b.custom))[col.kind] || null;
}
export function capCell(s: AppState, p: Person, col: CapCol): CapCell {
  const v = manOf(s.caps[p.id] || {}, col.block?.id, col.kind, !!col.block);
  if (typeof v === 'string') return { on: false, src: 'man', why: v };
  const def = capDefault(s, p, col);
  if (def) return v === null ? { on: true, src: 'force', why: def } : { on: false, src: 'auto', why: def };
  return { on: true, src: 'auto', why: '' };
}
// Μέρες της εβδομάδας χωρίς υπηρεσία (λοχίας, 12/10) και εφάπαξ εξαιρέσεις από–έως (Michael, 24/10): μετρά η μέρα της
// υπηρεσίας (κύκλος π.χ. 14:00 → 14:00). Εδώ περνούν και η αυτόματη συμπλήρωση, ο «Επόμενος», η εναλλαγή και το ΣΚ που «χρωστά»
export const skipTxt = (k: Skip) => 'Εξαίρεση ' + dm(k.from) + (k.to > k.from ? '-' + dm(k.to) : '') + (k.why ? ': ' + k.why : '');
export function skipOn(p: Person | undefined, date: ISODate): Skip | undefined { return p?.skips?.find(k => k.from <= date && date <= k.to); }
export function offDayBlock(s: AppState, date: ISODate, pid: number): string | null {
  const p = personMap(s.people).get(pid); if (!p) return null;
  const k = skipOn(p, date); if (k) return skipTxt(k);
  const w = p.offDays;
  if (!w || !w.length) return null;
  const d = weekday(date);
  return w.includes(d) ? 'Δεν κάνει υπηρεσία ' + DOW_FULL[d] : null;
}
// Όπως η δυνατότητα υπηρεσιών: η αυτόματη συμπλήρωση δεν τον βάζει, με το χέρι μπαίνει μόνο με αιτία
export function capBlock(s: AppState, date: ISODate, pid: number, post?: Post | null): string | null {
  const off = offDayBlock(s, date, pid); if (off) return off;
  if (!post || post.kind === 'ly') return null;   // Λ/Υ-Δ/Υ: ορίζονται με το χέρι, όπως πριν
  const b = post.block ? allBlocks(s.settings).find(x => x.id === post.block) : undefined; const custom = !!b?.custom;
  const no = (why: string) => 'Δεν κάνει ' + (custom ? b!.name : CAP_ACC[post.kind] || post.kind) + ' (' + why + ')';
  // «Δυνατότητα υπηρεσιών» του ατόμου: «δεν κάνει» με αιτία, ή ρητά «κάνει» (null) που περνά πάνω από πόστο και Σ.Ι.
  const man = manOf(s.caps[pid] || {}, post.block, post.kind, custom);
  if (man) return no(man);
  if (man === null) return null;
  const p = personMap(s.people).get(pid); if (!p) return null;
  if (p.post) return no('Πόστο: ' + p.post);
  // Σ.Ι.: ανά υπηρεσία (Ρυθμίσεις › Σ.Ι.)
  return siAllows(p, { id: post.block, armed: post.armed }, s.settings.lists) ? null : no('Σ.Ι. ' + siOf(p, s.settings.lists).text);
}
export const capLabel = (k: DutyKind) => CAP_KINDS.find(x => x[0] === k)?.[1] || k;

// Κ-01, Κ-02, Κ-05: γιατί κάποιος ΔΕΝ μπαίνει σε μια θέση (null = μπαίνει). Χωρίς θέση: ελέγχει σαν ένοπλη.
// lists: ό,τι άλλαξες στον πίνακα καταστάσεων (stat.ts)· χωρίς αυτό ισχύουν οι κανόνες του λοχία όπως πριν
type DutyPost = { armed: boolean; kind?: DutyKind; block?: string; slots?: string[] | null; hrs?: string; cyc?: number };
export function dutyBlock(statuses: Status[], date: ISODate, pid: number, post?: DutyPost | null, lists?: UserLists): string | null {
  for (const s of statusesOn(statuses, pid, date)) {
    if (backBefore(s, date, post)) continue;
    const c = statOn(s, post, lists); if (c.v !== 'no') continue;
    const t = TYPES[s.type];
    if (c.from !== 'def') return statusLbl(s, lists) + ': όχι ' + ((post?.kind && CAP_ACC[post.kind]) || 'σε αυτή την υπηρεσία') + untilTxt(s, date);
    if (t.noDuty) return t.label + untilTxt(s, date);
    if (t.noArmed && (!post || post.armed)) return 'Άοπλος: ' + t.label + untilTxt(s, date);
    return 'Όχι μαγειρεία: ' + t.label + untilTxt(s, date);
  }
  return leavesBefore(statuses, date, pid, post);
}
// --------------------------- ώρες στις άδειες (Michael, 13/10) ---------------------------
// Η μέρα της υπηρεσίας είναι από την αρχή του κύκλου (settings.dutyStart, π.χ. 14:00) ως την ίδια ώρα την επόμενη. Πότε ξεκινά και πότε τελειώνει μια θέση, σε λεπτά από τα μεσάνυχτα της μέρας
// της υπηρεσίας: από τις βάρδιες (14:00-16:00, 22:00-00:00, 06:00-08:00 → 14:00 ως 08:00 της επόμενης) ή από τις ώρες
// της θέσης («14:00 → 14:00»). null = δεν ξέρουμε (μαγειρεία «ημέρα», ΤΑΕ χωρίς ώρες).
const spanIdx = new WeakMap<object, { start: number | null; end: number | null }>();
const timesIn = (txt: string) => [...txt.matchAll(/(\d{1,2}):(\d{2})/g)].map(m => +m[1] * 60 + +m[2]);
// Η ώρα κάθε βάρδιας της θέσης (post.slots), στα ίδια λεπτά με το postSpan: από τα μεσάνυχτα της μέρας υπηρεσίας, +1440 μετά τα
// μεσάνυχτα (ένοπλες υπηρεσίες ανά νούμερο, armed.ts). Θέση χωρίς βάρδιες: [].
const slotIdx = new WeakMap<object, { start: number; end: number }[]>();
export function slotSpans(post: DutyPost): { start: number; end: number }[] {
  let r = slotIdx.get(post);
  if (r) return r;
  r = [];
  if (post.slots && post.slots.length) {
    // βάρδια που ξεκινά πριν την αρχή του κύκλου είναι της επόμενης μέρας (π.χ. κύκλος 14:00, βάρδιες από 06:00)
    let day = post.cyc != null && (timesIn(post.slots[0])[0] ?? 1440) < post.cyc ? 1440 : 0, prev = -1;
    for (const sl of post.slots) {
      const [a, b] = timesIn(sl); if (a == null || b == null) continue;
      if (a < prev) day += 1440;
      prev = a;
      r.push({ start: a + day, end: b + day + (b <= a ? 1440 : 0) });
    }
  }
  slotIdx.set(post, r);
  return r;
}
export function postSpan(post: DutyPost): { start: number | null; end: number | null } {
  let r = spanIdx.get(post);
  if (r) return r;
  r = { start: null, end: null };
  const sp = slotSpans(post);
  if (sp.length) { r.start = sp[0].start; r.end = sp[sp.length - 1].end; }
  else if (post.hrs) {
    const [a, b] = timesIn(post.hrs);
    if (a != null) { r.start = a; if (b != null) r.end = b + (b <= a ? 1440 : 0); }
  }
  spanIdx.set(post, r);
  return r;
}
// Γύρισε από την άδεια την τελευταία μέρα πριν ξεκινήσει η θέση (π.χ. επιστροφή 12:00, υπηρεσία από 14:00): μπαίνει.
// Χωρίς θέση ή με θέση χωρίς γνωστή ώρα έναρξης μετρά όλη η μέρα, όπως πριν.
function backBefore(s: Status, date: ISODate, post?: DutyPost | null): boolean {
  if (!s.toTime || s.open || s.to !== date || !hasTimes(s.type) || !post) return false;
  const st = postSpan(post).start;
  return st != null && mins(s.toTime) <= st;
}
// Φεύγει για άδεια την επόμενη μέρα πριν τελειώσει η υπηρεσία που ξεκινά σήμερα (π.χ. αναχώρηση 10:00, η υπηρεσία
// τελειώνει 14:00): δεν μπαίνει. Θέση χωρίς γνωστό τέλος τελειώνει στην αρχή του κύκλου της επόμενης· η μαγειρεία είναι της ημέρας.
function leavesBefore(statuses: Status[], date: ISODate, pid: number, post?: DutyPost | null): string | null {
  if (!post) return null;
  const next = addDays(date, 1);
  const s = statusesOf(statuses, pid).find(x => x.from === next && x.fromTime && !x.pending && hasTimes(x.type));
  if (!s) return null;
  const end = postSpan(post).end ?? (post.kind === 'mg' ? null : 1440 + (post.cyc ?? 14 * 60));
  if (end == null || 1440 + mins(s.fromTime!) >= end) return null;
  return 'Φεύγει ' + TYPES[s.type].label + ' ' + dm(next) + ' στις ' + s.fromTime;
}
// ΕΟ/ΕΑ σε (άοπλη) σκοπιά: επιτρέπεται, αλλά μόνο αν δεν υπάρχει άλλος (λοχίας, 10/10)· και ό,τι άλλο όρισες έτσι
// στον πίνακα καταστάσεων
export function lastResort(statuses: Status[], date: ISODate, pid: number, post?: { kind?: DutyKind; armed?: boolean; block?: string } | null, lists?: UserLists): string | null {
  if (!post?.kind) return null;
  for (const st of statusesOn(statuses, pid, date)) {
    const c = statOn(st, { ...post, armed: !!post.armed }, lists); if (c.v !== 'last') continue;
    return (c.from === 'def' ? TYPES[st.type].label : statusLbl(st, lists)) + ': ' + (CAP_ACC[post.kind] || 'υπηρεσία') + ' μόνο αν δεν υπάρχει άλλος';
  }
  return null;
}
// Ιατρικό «μόνο προειδοποίηση» (π.χ. παραπεμπτικό για 401): μπαίνει σε υπηρεσία, με προειδοποίηση· η αυτόματη
// συμπλήρωση τον βάζει μόνο αν δεν υπάρχει άλλος
export function statusWarn(s: AppState, date: ISODate, pid: number): string | null {
  const st = statusesOn(s.statuses, pid, date).find(x => medWarns(x, s.settings.lists));
  return st ? statusLbl(st, s.settings.lists) + untilTxt(st, date) + ': έλεγξε αν μπορεί να κάνει υπηρεσία' : null;
}
// Μόνιμος Λ/Υ ή Δ/Υ: μπαίνει μόνος του κάθε μέρα, χωρίς κανόνες ανάπαυσης και σειρά δικαιοσύνης
export const isFixed = (s: AppState, pid: number, k?: string | null) => !!k && (k === 'ly' || k === 'dy') && s.settings.fixed?.[k] === pid;
export const fixedIds = (s: AppState) => new Set(Object.values(s.settings.fixed || {}).filter((x): x is number => !!x));
// Η θέση κάποιου μια μέρα: ευρετήριο άτομο → θέσεις ανά αντικείμενο μέρας (καλείται για κάθε υποψήφιο σε κάθε θέση)
const dayIdx = new WeakMap<object, Map<number, string[]>>();
export const postOf = (s: AppState, date: ISODate, pid: number, exceptKey?: string): Post | undefined => {
  const g = s.guards[date]; if (!g) return undefined;
  let m = dayIdx.get(g); if (!m) { m = new Map(); for (const k in g) { const l = m.get(g[k]); if (l) l.push(k); else m.set(g[k], [k]); } dayIdx.set(g, m); }
  const ks = m.get(pid); if (!ks) return undefined;
  return allPosts(s.settings).find(x => x.k !== exceptKey && ks.includes(x.k));
};

// Ημερομηνίες υπηρεσίας ανά άτομο, ώστε οι κανόνες να μη σαρώνουν όλο το ιστορικό. Μαζί και οι υπηρεσίες χωρίς θέση
// (από Excel), για την ανάπαυση και τις αργίες.
const idxCache = new WeakMap<Guards, WeakMap<DutyLog, Map<number, Set<ISODate>>>>();
const NO_LOG: DutyLog = {};
export function dutyIndex(guards: Guards, log: DutyLog = NO_LOG): Map<number, Set<ISODate>> {
  let byLog = idxCache.get(guards); if (!byLog) { byLog = new WeakMap(); idxCache.set(guards, byLog); }
  let m = byLog.get(log);
  if (m) return m;
  m = new Map();
  const add = (id: number, d: ISODate) => { if (!m!.has(id)) m!.set(id, new Set()); m!.get(id)!.add(d); };
  for (const d in guards) for (const k in guards[d]) add(guards[d][k], d);
  for (const d in log) for (const e of log[d]) add(e.pid, d);
  byLog.set(log, m);
  return m;
}
export const dutyIndexOf = (s: AppState) => dutyIndex(s.guards, s.dutyLog || NO_LOG);
export const seatlessOn = (s: AppState, date: ISODate, pid: number) => (s.dutyLog?.[date] || []).find(e => e.pid === pid);
// Κ-13, Κ-14: ανάπαυση μετά από υπηρεσία, όχι αργία/ΣΚ δύο συνεχόμενες εβδομάδες
export function ruleBlock(s: AppState, date: ISODate, pid: number, idx?: Map<number, Set<ISODate>>, k?: string | null): string | null {
  const r = s.rules;
  const lim = monthBlock(s, date, pid, idx); if (lim) return lim;
  if (isFixed(s, pid, k)) return null;
  const ds = (idx || dutyIndexOf(s)).get(pid);
  if (!ds) return null;
  for (let i = 1; i <= r.restDays; i++) for (const d of [addDays(date, -i), addDays(date, i)]) if (ds.has(d)) return 'Υπηρεσία ' + dm(d) + ' (ανάπαυση)';
  // από 2 μέρες: Παρασκευή αργία και Κυριακή είναι δύο αργίες στη σειρά (η 1 μέρα είναι ήδη ανάπαυση)
  if (r.noConsecHol && isHol(s.settings, date))
    for (let i = 2; i <= 9; i++) for (const d of [addDays(date, -i), addDays(date, i)]) if (ds.has(d) && isHol(s.settings, d)) return 'Έκανε αργία ' + holName(s.settings, d) + ' ' + dm(d);
  return k ? numBlock(s, date, pid, k, ds) : null;
}
// 3ο και 4ο νούμερο (οι βάρδιες 18:00/20:00): ξανά στο ίδιο νούμερο μόνο μετά από rules.numRest μέρες (λοχίας, 10/10)
function numBlock(s: AppState, date: ISODate, pid: number, k: string, ds: Set<ISODate>): string | null {
  const n = s.rules.numRest || 0; const post = postBy(s, k);
  if (n < 2 || !post || post.rot == null || post.rot < 2) return null;
  for (let i = 1; i < n; i++) for (const d of [addDays(date, -i), addDays(date, i)]) {
    if (!ds.has(d)) continue;
    const g = s.guards[d] || {};
    for (const kk in g) if (g[kk] === pid && postBy(s, kk)?.rot === post.rot) return (post.rot + 1) + 'ο νούμερο στις ' + dm(d) + ' (ξανά μετά από ' + n + ' μέρες)';
  }
  return null;
}
export function guardUnavailable(s: AppState, date: ISODate, pid: number, k: string | null, idx?: Map<number, Set<ISODate>>): string | null {
  const post = k ? postBy(s, k) : null;
  const r = dutyBlock(s.statuses, date, pid, post, s.settings.lists) || capBlock(s, date, pid, post);
  if (r) return r;
  const o = postOf(s, date, pid, k || undefined);
  if (o) return 'Ήδη ' + postTxt(o);
  const sl = seatlessOn(s, date, pid);
  if (sl) return 'Ήδη ' + KIND_NAME[sl.kind].toLowerCase() + ' χωρίς θέση (από Excel)';
  return ruleBlock(s, date, pid, idx, k);
}
// Κ-06, Κ-07, Κ-08: γιατί κάποιος ΔΕΝ βγαίνει έξοδο (null = βγαίνει)
export function outBlock(s: AppState, date: ISODate, pid: number): string | null {
  const o = postOf(s, date, pid);
  if (o) return 'Έχει υπηρεσία: ' + o.label;
  // γύρισε από άδεια (νοσοκομείο, ΣΤΕΠ) πριν από την ώρα εξόδου: βγαίνει κανονικά (Michael, 18/10)
  const st = statusesFrom(s.statuses, pid, date, outMin(s.rules)).find(x => statNoOut(x, s.settings.lists));
  if (st) return statusLbl(st, s.settings.lists) + untilTxt(st, date) + (st.toTime && !st.open && st.to === date && hasTimes(st.type) ? ' (γυρίζει ' + st.toTime + ')' : '');
  // ποινή που ακόμα αιτείται: δεν μετρά στην ΗΚΑΙ (Κ-19), αλλά ο τιμωρημένος μένει μέσα
  const pend = statusesOf(s.statuses, pid).find(x => x.type === 'PUN' && x.pending && coversDay(x, date));
  return pend ? (pend.kind || 'Ποινή') + ' (αιτείται)' + untilTxt(pend, date) : null;
}
export const outRoomsOn = (rules: Rules, d: ISODate): number[] | null => rules.outRooms[parseD(d).getDay()] || null;

// --------------------------- Έλεγχος υπηρεσιών (από το ημερολόγιο υπηρεσιών) ---------------------------
// log: k = θέση, κενό για υπηρεσία χωρίς θέση (από Excel)· kind = είδος
// byKind: ανά είδος, και ανά δική σου υπηρεσία («b:» + id, μετρά ως δική της) · log.t: η δική σου υπηρεσία της θέσης
export interface DutyStat { byKind: Record<string, number>; total: number; hol: number; last: ISODate | null; lastHol: ISODate | null; log: { d: ISODate; k: string; kind: DutyKind; h: boolean; t?: string }[] }
// ανά ημερολόγιο υπηρεσιών, υπηρεσίες χωρίς θέση και λίστα αργιών: αν αλλάξουν οι αργίες, ξαναμετριούνται οι αργίες του καθενός
const statsCache = new WeakMap<Guards, { hol: Settings['holidays']; off: Settings['holidaysOff']; log: DutyLog; st: Map<number, DutyStat> }>();
export const emptyStat = (): DutyStat => ({ byKind: {}, total: 0, hol: 0, last: null, lastHol: null, log: [] });
export function dutyStats(s: AppState): Map<number, DutyStat> {
  const c = statsCache.get(s.guards); const log = s.dutyLog || NO_LOG;
  if (c && c.hol === s.settings.holidays && c.off === s.settings.holidaysOff && c.log === log) return withBaseline(s, c.st);
  const st = new Map<number, DutyStat>();
  const one = (pid: number, d: ISODate, k: string, kind: DutyKind, h: boolean) => {
    let x = st.get(pid); if (!x) { x = emptyStat(); st.set(pid, x); }
    x.byKind[kind] = (x.byKind[kind] || 0) + 1; x.total++;
    const t = k ? dutyType(s, k, kind) : kind; if (t !== kind) x.byKind[t] = (x.byKind[t] || 0) + 1;
    if (h) { x.hol++; x.lastHol = d; }
    x.last = d; x.log.push(t !== kind ? { d, k, kind, h, t } : { d, k, kind, h });
  };
  for (const d of [...new Set([...Object.keys(s.guards), ...Object.keys(log)])].sort()) {
    const g = s.guards[d] || {}; const h = isHol(s.settings, d);
    for (const k in g) { const post = postBy(s, k); if (post) one(g[k], d, k, post.kind, h); }
    for (const e of log[d] || []) one(e.pid, d, '', e.kind, h);
  }
  statsCache.set(s.guards, { hol: s.settings.holidays, off: s.settings.holidaysOff, log, st });
  return withBaseline(s, st);
}
// Προηγούμενες υπηρεσίες (χωρίς ημερομηνία) προστίθενται στα σύνολα, όχι στο ημερολόγιο
const baseCache = new WeakMap<object, { from: Map<number, DutyStat>; out: Map<number, DutyStat> }>();
export const baseTotal = (b: Baseline | undefined) => (b ? Object.entries(b).reduce((a, [k, n]) => a + (k === 'hol' ? 0 : n || 0), 0) : 0);
function withBaseline(s: AppState, st: Map<number, DutyStat>): Map<number, DutyStat> {
  const base = s.baseline; if (!base || !Object.keys(base).length) return st;
  const c = baseCache.get(base); if (c && c.from === st) return c.out;
  const out = new Map(st);
  for (const [id, b] of Object.entries(base)) {
    const pid = Number(id); const x0 = st.get(pid) || emptyStat();
    const x: DutyStat = { ...x0, byKind: { ...x0.byKind } };
    for (const [k, n] of Object.entries(b)) if (k !== 'hol' && n) x.byKind[k] = (x.byKind[k] || 0) + n;
    x.total += baseTotal(b); x.hol += b.hol || 0;
    out.set(pid, x);
  }
  baseCache.set(base, { from: st, out });
  return out;
}
export const statOf = (s: AppState, pid: number) => dutyStats(s).get(pid) || emptyStat();
// Έλεγχος υπηρεσιών ανά μήνα (ym = 'YYYY-MM'): μόνο οι υπηρεσίες με ημερομηνία μέσα στον μήνα, χωρίς τις προηγούμενες (baseline)
export function monthStats(st: Map<number, DutyStat>, ym: string): Map<number, DutyStat> {
  const out = new Map<number, DutyStat>();
  for (const [pid, x] of st) {
    let m: DutyStat | null = null;
    for (const e of x.log) {
      if (e.d.slice(0, 7) !== ym) continue;
      if (!m) { m = emptyStat(); out.set(pid, m); }
      m.byKind[e.kind] = (m.byKind[e.kind] || 0) + 1; m.total++; if (e.t) m.byKind[e.t] = (m.byKind[e.t] || 0) + 1;
      if (e.h) { m.hol++; m.lastHol = e.d; }
      m.last = e.d; m.log.push(e);
    }
  }
  return out;
}
// Μήνες με υπηρεσίες (νεότερος πρώτος)
export const dutyMonths = (s: AppState): string[] => [...new Set([...Object.keys(s.guards).filter(d => Object.keys(s.guards[d] || {}).length), ...Object.keys(s.dutyLog || {}).filter(d => (s.dutyLog![d] || []).length)].map(d => d.slice(0, 7)))].sort().reverse();

// --------------------------- Αυτόματη συμπλήρωση (σειρά δικαιοσύνης, έρευνα §3.2) ---------------------------
// 1. Φίλτρο: όλοι οι κανόνες (καταστάσεις, δυνατότητα, ανάπαυση, ΣΚ μετά από ΣΚ).
// 2. Στις άοπλες θέσεις πηγαίνουν τελευταίοι όσοι χρειάζονται για να γεμίσουν οι κενές ένοπλες θέσεις της μέρας
//    (χωρίς αυτούς κάποια ένοπλη θα έμενε κενή). Όταν οι ένοπλοι περισσεύουν, ισχύει για όλους η σειρά δικαιοσύνης,
//    και ο ΕΑ/ΕΟ δεν μπαίνει πρώτος σε κάθε άοπλη θέση (ΣΒΕΝ, σχέδιο 11/10).
// 3. Αργία/ΣΚ: λιγότερες αργίες → παλιότερη τελευταία αργία. Καθημερινή: παλιότερη τελευταία υπηρεσία → λιγότερες υπηρεσίες.
// 4. Εναλλαγή υπηρεσιών (rotate): από όσους είναι η σειρά τους σήμερα, όποιος χρωστά αυτή την υπηρεσία. Μετά: λιγότερες
//    φορές στο ίδιο είδος θέσης.
// 5. Ισοπαλία: κλήρωση με σταθερό σπόρο την ημερομηνία (ίδια μέρα → ίδια πρόταση, όχι αλφαβητικά).
export function seedRank(date: ISODate, pid: number): number {
  let h = 2166136261;
  const str = date + ':' + pid;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export interface Fair { total: number; hol: number; byKind: Record<string, number>; byType: Record<string, number>; lastBefore: ISODate; lastHolBefore: ISODate }
// Τύπος υπηρεσίας για την εναλλαγή: το είδος (θαλαμοφύλακας α΄ και β΄ πίνακα μαζί, σκοπιά, μαγειρεία…), κάθε δική σου
// υπηρεσία χωριστά («b:» + id, όπως στο «Ποιος κάνει τι»). Υπηρεσία χωρίς θέση (από Excel): το είδος της.
const typeIdx = new WeakMap<Settings, Map<string, string>>();
export function dutyType(s: AppState, k: string, kind: DutyKind): string {
  let m = typeIdx.get(s.settings);
  if (!m) { const own = new Set(allBlocks(s.settings).filter(b => b.custom).map(b => b.id)); m = new Map(allPosts(s.settings).map(p => [p.k, own.has(p.block) ? 'b:' + p.block : p.kind])); typeIdx.set(s.settings, m); }
  return (k && m.get(k)) || kind;
}
// Στοιχεία δικαιοσύνης ενός ατόμου για μια ημέρα: μετρά όλες τις υπηρεσίες εκτός από την ίδια την ημέρα
export function fairOf(s: AppState, pid: number, date: ISODate): Fair {
  const st = statOf(s, pid);
  const f: Fair = { total: 0, hol: 0, byKind: {}, byType: {}, lastBefore: '', lastHolBefore: '' };
  for (const e of st.log) {
    if (e.d === date) continue;
    const kind = e.kind; const ty = dutyType(s, e.k, kind);
    f.total++; f.byKind[kind] = (f.byKind[kind] || 0) + 1; f.byType[ty] = (f.byType[ty] || 0) + 1; if (ty !== kind && ty.startsWith('b:')) f.byKind[ty] = (f.byKind[ty] || 0) + 1;
    if (e.h) { f.hol++; if (e.d < date && e.d > f.lastHolBefore) f.lastHolBefore = e.d; }
    if (e.d < date && e.d > f.lastBefore) f.lastBefore = e.d;
  }
  const b = s.baseline?.[pid];
  if (b) { for (const [k, n] of Object.entries(b)) if (k !== 'hol' && n) { f.byKind[k] = (f.byKind[k] || 0) + n; f.byType[k] = (f.byType[k] || 0) + n; } f.total += baseTotal(b); f.hol += b.hol || 0; }
  return f;
}
// Με ποιο σύνολο συγκρίνονται στη σειρά: το είδος της θέσης, ή η ίδια η δική σου υπηρεσία («b:» + id)
export const fairKey = (s: AppState, x: Pick<Post, 'k' | 'kind'>): string => { const t = dutyType(s, x.k, x.kind); return t.startsWith('b:') ? t : x.kind; };
export function fairCompare(h: boolean, kind: string, date: ISODate) {
  const seed = new Map<number, number>(); const sr = (pid: number) => { let v = seed.get(pid); if (v === undefined) { v = seedRank(date, pid); seed.set(pid, v); } return v; };
  return (a: Fair & { pid: number }, b: Fair & { pid: number }) =>
    // καθημερινή (Michael, 17/10): πρώτα οι μέρες χωρίς υπηρεσία, μετά το σύνολο, μετά οι αργίες· ΣΚ/αργία: οι αργίες
    (h ? a.hol - b.hol || a.lastHolBefore.localeCompare(b.lastHolBefore) : a.lastBefore.localeCompare(b.lastBefore) || a.total - b.total || a.hol - b.hol) ||
    (a.byKind[kind] || 0) - (b.byKind[kind] || 0) || sr(a.pid) - sr(b.pid);
}
export function fillDay(s: AppState, date: ISODate): { guards: Guards; n: number; empty: string[]; warn: string[] } {
  const g: Record<string, number> = { ...(s.guards[date] || {}) };
  // ένα δικό της αντίγραφο του ημερολογίου, όπου αλλάζει μόνο η μέρα (όχι νέο αντίγραφο όλου του έτους σε κάθε θέση)
  const wg: Guards = { ...s.guards, [date]: { ...g } };
  let work: AppState = { ...s, guards: wg };
  const setDay = () => { wg[date] = { ...g }; work = { ...work, guards: wg }; };
  // ΕΠΟΠ/ΟΒΑ: μόνο με το χέρι (εκτός αν είναι ο μόνιμος Λ/Υ ή Δ/Υ)
  const people = dutyPool(s); const all = activePeople(s);
  const fair = new Map(people.map(p => [p.id, { ...fairOf(s, p.id, date), pid: p.id }]));
  // το ευρετήριο της βάσης κοινό (όχι αντίγραφο κάθε συνόλου)· αντίγραφο μόνο για όσους μπαίνουν σήμερα
  const idx = new Map(dutyIndexOf(s)); const own = new Set<number>();
  const mark = (id: number) => { if (!own.has(id)) { own.add(id); idx.set(id, new Set(idx.get(id) || [])); } idx.get(id)!.add(date); };
  let n = 0; const skNone = new Set<string>();
  const posts = postsOf(s.settings);
  // 1. οι μόνιμοι Λ/Υ και Δ/Υ μπαίνουν πάντα στην κενή θέση (Michael, 18/10), και παρά τους κανόνες (ανάπαυση, ΣΚ, μέρες
  // χωρίς υπηρεσία, «Τι κάνει»), με προειδοποίηση. Όχι μόνο όταν τον κρατά κατάσταση (άδεια, ΕΥ…) ή είναι ήδη σε άλλη θέση:
  // τότε η θέση γεμίζει με τη σειρά, όπως όλες, και η προειδοποίηση λέει γιατί.
  const fixedWarn: string[] = []; const pm0 = personMap(s.people);
  for (const x of posts) {
    const f = (x.k === 'ly' || x.k === 'dy') ? s.settings.fixed?.[x.k] : undefined;
    if (g[x.k] || !f || !all.some(p => p.id === f)) continue;
    const who = 'Μόνιμος ' + x.label + ' ' + shortName(pm0.get(f)!);
    const st = dutyBlock(work.statuses, date, f, x, s.settings.lists) || monthBlock(work, date, f, idx); const r = st || guardUnavailable(work, date, f, x.k, idx);
    if (st || (r && r.startsWith('Ήδη '))) { fixedWarn.push(who + ': δεν μπήκε (' + r + ')'); continue; }
    g[x.k] = f; n++; setDay(); mark(f);
    if (r) fixedWarn.push(who + ': μπήκε παρά τον κανόνα (' + r + ')');
  }
  const fixed = fixedIds(s); const memo = new Map<string, number[]>();
  const mine = new Set<string>();   // οι θέσεις που γέμισε αυτή η συμπλήρωση (μόνο αυτές μετακινούνται στην επιδιόρθωση)
  // «Αυστηρά Άοπλοι»: πρώτα οι θέσεις όπου μπαίνουν οι άοπλοι (μαγειρεία, 2ο-3ο, 1ο-4ο νούμερο), μετά όλες οι άλλες
  const strict = !!s.rules.strictUnarmed;
  const order = strict ? [...posts].sort((a, b) => strictTier(a) - strictTier(b)) : posts;
  for (const x of order) {
    if (g[x.k]) continue;
    const list = candidates(work, date, x, people, fair, idx, fixed, memo);
    const cand = strict ? strictPick(work, date, x, list, people, idx, fixed, memo) : list[0];
    if (!cand) { if (strict && x.kind === 'sk' && list.length) skNone.add(x.k); continue; }
    g[x.k] = cand.id; n++; mine.add(x.k); setDay(); mark(cand.id);
  }
  n += repair(s, date, g, mine, order, people, fair, idx, fixed);
  // κενές θέσεις και «χωρίς άλλη επιλογή» όπως έμειναν μετά την επιδιόρθωση
  const pm = pm0; const empty: string[] = []; const warn: string[] = [...fixedWarn];
  for (const x of order) {
    const pid = g[x.k];
    if (!pid) { empty.push(x.k); if (skNone.has(x.k)) warn.push(x.label + ': ' + STRICT_SK); continue; }
    if (!mine.has(x.k)) continue;
    const lr = lastResort(s.statuses, date, pid, x, s.settings.lists) || statusWarn(s, date, pid); if (lr) warn.push(shortName(pm.get(pid)!) + ' (' + x.label + '): ' + lr);
  }
  return { guards: { ...s.guards, [date]: g }, n, empty, warn };
}
// Επιδιόρθωση μετά την πρώτη σειρά (που κρατά τη σειρά δικαιοσύνης και τα «Αυστηρά Άοπλοι»). Η πρώτη σειρά διαλέγει μία
// θέση τη φορά και μπορεί να αφήσει θέση κενή, ή να βάλει κάποιον «μόνο αν δεν υπάρχει άλλος», ενώ υπάρχει πλήρης έγκυρη
// ανάθεση (π.χ. ο Ι1 στη σκοπιά και η ΤΑΕ κενή, ενώ ο Ι3 ΜΕ ΟΠΛΟ που δεν κάνει ΤΑΕ μπορούσε να πάει σκοπιά). Για κάθε
// τέτοια θέση ψάχνει μια μικρή αλυσίδα (ως 3 άτομα) ανάμεσα σε όσους έβαλε αυτή η συμπλήρωση: κάποιος πάει στη θέση, τη
// δική του την παίρνει άλλος, και στο τέλος μπαίνει κάποιος χωρίς θέση σήμερα, πάντα με τη σειρά δικαιοσύνης. Κανόνας δεν
// παραβαίνεται· οι θέσεις που έβαλες με το χέρι και οι μόνιμοι Λ/Υ-Δ/Υ δεν μετακινούνται. Πόσες θέσεις γέμισαν επιπλέον.
function repair(s: AppState, date: ISODate, g: Record<string, number>, mine: Set<string>, posts: Post[], people: Person[], fair: Map<number, Fair & { pid: number }>, idx: Map<number, Set<ISODate>>, fixed: Set<number>): number {
  const lists = s.settings.lists; const strict = !!s.rules.strictUnarmed; const h = isHol(s.settings, date);
  const lr = (pid: number, x: Post) => !!(lastResort(s.statuses, date, pid, x, lists) || statusWarn(s, date, pid));
  const okMemo = new Map<string, boolean>();
  // μπαίνει στη θέση (χωρίς να μετράμε πού είναι σήμερα: αυτό το ξέρει η αλυσίδα)
  const ok = (pid: number, x: Post) => {
    const key = pid + '|' + x.k; let v = okMemo.get(key);
    if (v == null) { v = !fixed.has(pid) && !dutyBlock(s.statuses, date, pid, x, lists) && !capBlock(s, date, pid, x) && !seatlessOn(s, date, pid) && !ruleBlock(s, date, pid, idx, x.k) && !(strict && x.kind === 'sk' && isUnarmed(s, date, pid)); okMemo.set(key, v); }
    return v;
  };
  const byFair = (x: Post) => { const cmp = fairCompare(h, fairKey(s, x), date); return (a: number, b: number) => cmp(fair.get(a)!, fair.get(b)!); };
  let free = new Map<string, number[]>();   // ανά θέση: όσοι δεν έχουν θέση σήμερα και μπαίνουν, με τη σειρά δικαιοσύνης
  const freeFor = (x: Post) => {
    let l = free.get(x.k);
    if (!l) { const busy = new Set(Object.values(g)); l = people.filter(p => !busy.has(p.id) && ok(p.id, x)).map(p => p.id).sort(byFair(x)); free.set(x.k, l); }
    return l;
  };
  let added = 0;
  const tryFill = (x: Post, better: boolean): boolean => {
    const cur = better ? g[x.k] : undefined;
    // στο τέλος της αλυσίδας: κάποιος χωρίς θέση σήμερα (ή αυτός που φεύγει από τη x, όταν τη θέλουμε για άλλον)
    const refill = (y: Post, not: number[]) => {
      const l = [...freeFor(y), ...(cur != null && ok(cur, y) ? [cur] : [])].filter(p => !not.includes(p) && (!better || !lr(p, y)));
      return l.sort(byFair(y))[0];
    };
    const moves = (pid: number, y: Post) => ok(pid, y) && !lr(pid, y);
    const done = (a: [string, number][]) => { if (!better) added++; for (const [k, p] of a) g[k] = p; mine.add(x.k); free = new Map(); return true; };
    if (better) { const u = refill(x, cur != null ? [cur] : []); if (u != null) return done([[x.k, u]]); }
    const mov = posts.filter(y => y.k !== x.k && mine.has(y.k) && g[y.k] != null);
    const first = mov.filter(y => moves(g[y.k], x)).sort((a, b) => byFair(x)(g[a.k], g[b.k]));
    for (const y1 of first) {
      const p1 = g[y1.k];
      const u = refill(y1, [p1]); if (u != null) return done([[x.k, p1], [y1.k, u]]);
      for (const y2 of mov) {
        if (y2.k === y1.k) continue; const p2 = g[y2.k]; if (!moves(p2, y1)) continue;
        const u2 = refill(y2, [p1, p2]); if (u2 != null) return done([[x.k, p1], [y1.k, p2], [y2.k, u2]]);
      }
    }
    return false;
  };
  for (const x of posts) if (!g[x.k]) tryFill(x, false);
  for (const x of posts) if (mine.has(x.k) && g[x.k] && lr(g[x.k], x)) tryFill(x, true);
  return added;
}
// --------------------------- «Αυστηρά Άοπλοι» (λοχίας, 11/10· κλείνει/ανοίγει στους Κανόνες) ---------------------------
// Άοπλος για μια μέρα: ΕΑ/ΕΟ/ΣΤΕΠ (όχι ένοπλη θέση), Σ.Ι. χωρίς οπλοφύλακα και σκοπιά (Ι3 ΑΟΠΛΟ, Ι4, ή ό,τι όρισες στον πίνακα Σ.Ι.), ή «δεν κάνει» με το χέρι σε όλα τα ένοπλα είδη
export function isUnarmed(s: AppState, date: ISODate, pid: number): boolean {
  const blocks = (blocksOf(s.settings) || s.settings.blocks).filter(b => !b.hidden && b.kind !== 'ly');
  if (statusesFrom(s.statuses, pid, date, dutyMin(s.settings)).some(x => statIsUnarmed(x, blocks, s.settings.lists))) return true;
  const p = personMap(s.people).get(pid); if (!p) return false;
  if (siIsUnarmed(p, blocks, s.settings.lists)) return true;
  const armed = postsOf(s.settings).filter(x => x.armed && x.kind !== 'ly');
  const c = s.caps[pid] || {};
  const own = new Set(allBlocks(s.settings).filter(b => b.custom).map(b => b.id));
  return armed.length > 0 && armed.every(x => !!manOf(c, x.block, x.kind, !!x.block && own.has(x.block)));
}
// 1 μαγειρεία · 2 θαλαμοφύλακας (και άοπλος οπλοφύλακας) 2ο-3ο νούμερο · 3 το ίδιο 1ο-4ο · 4 όλες οι άλλες
export function strictTier(x: Post): number {
  if (x.kind === 'mg') return 1;
  if ((x.kind === 'th' || (x.kind === 'op' && !x.armed)) && x.rot != null) return x.rot === 1 || x.rot === 2 ? 2 : 3;
  return 4;
}
export const STRICT_SK = 'Αυστηρά Άοπλοι: σκοπιά μόνο ένοπλοι';
const TIER_TXT: Record<number, string> = { 1: 'μαγειρεία', 2: '2ο-3ο νούμερο', 3: '1ο-4ο νούμερο' };
// Η σειρά με «Αυστηρά Άοπλοι»: σε θέση 1-3 πρώτα οι άοπλοι (με τη σειρά δικαιοσύνης μεταξύ τους), αλλιώς η κανονική σειρά.
// Άοπλος που χρειάζεται για να γεμίσει ένοπλη θέση της μέρας (π.χ. ΤΑΕ) δεν παίρνει προτεραιότητα, ώστε να μη μείνει κενή.
// Σε σκοπιά κανένας άοπλος, ούτε ως τελευταία λύση.
function strictOrder(s: AppState, date: ISODate, x: Post, list: Person[], people: Person[], idx: Map<number, Set<ISODate>>, fixed: Set<number>, memo?: Map<string, number[]>): Person[] {
  if (x.kind === 'sk') return list.filter(p => !isUnarmed(s, date, p.id));
  if (strictTier(x) > 3) return list;
  const need = armedLeft(s, date, x.k);
  const keep = need.length ? armedNeeded(s, date, need, people.filter(p => !fixed.has(p.id)), idx, memo) : null;
  const first = list.filter(p => isUnarmed(s, date, p.id) && !keep?.has(p.id));
  return [...first, ...list.filter(p => !first.includes(p))];
}
const strictPick = (s: AppState, date: ISODate, x: Post, list: Person[], people: Person[], idx: Map<number, Set<ISODate>>, fixed: Set<number>, memo?: Map<string, number[]>): Person | undefined =>
  strictOrder(s, date, x, list, people, idx, fixed, memo)[0];
// Όσοι επιτρέπονται σε μια θέση, με τη σειρά που θα τους διάλεγε η αυτόματη συμπλήρωση
function candidates(s: AppState, date: ISODate, x: Post, people: Person[], fair: Map<number, Fair & { pid: number }>, idx: Map<number, Set<ISODate>>, fixed: Set<number>, memo?: Map<string, number[]>): Person[] {
  const h = isHol(s.settings, date);
  const need = x.armed ? [] : armedLeft(s, date, x.k);
  const keep = need.length ? armedNeeded(s, date, need, people.filter(p => !fixed.has(p.id)), idx, memo) : null;
  const reserve = (p: Person) => (keep?.has(p.id) ? 1 : 0);
  const last = (p: Person) => (lastResort(s.statuses, date, p.id, x, s.settings.lists) || statusWarn(s, date, p.id) ? 1 : 0);
  // ΣΚ/αργία: πρώτα οι λιγότερες αργίες, χωρίς να μετρά ΔΝ, έξοδος ή θάλαμος (Michael, 17/10: «όλοι έχουν δικαίωμα
  // εξόδου»)· η σειρά δικαιοσύνης (fairCompare) το κάνει ήδη. Πριν από ΣΚ/αργία: όσοι χρωστάνε ΣΚ μπαίνουν τελευταίοι.
  // Και όποιος έχει ήδη υπηρεσία τις επόμενες 1-2 μέρες (π.χ. τον έβαλες με το χέρι Παρασκευή ή ΣΚ): τελευταίος.
  const due = heldBack(s, date, h, people, fair, fixed, idx);
  const owes = (p: Person) => (due?.has(p.id) ? 1 : 0);
  const cmp = fairCompare(h, fairKey(s, x), date);
  // ποιοι περνούν τους κανόνες της θέσης: μία φορά ανά μέρα (memo), μετά μόνο όσοι δεν μπήκαν ήδη σήμερα
  memo = memo || new Map(); const busy = new Set(Object.values(s.guards[date] || {}));
  const ok = new Set(allowedOn(s, date, x, people, fixed, idx, memo));
  // τα κλειδιά υπολογίζονται μία φορά ανά άτομο, όχι σε κάθε σύγκριση της ταξινόμησης (ίδια σειρά με πριν)
  const list = people.filter(p => ok.has(p.id) && !busy.has(p.id))
    .map(p => ({ p, key: last(p) * 100 + reserve(p) * 10 + owes(p), f: fair.get(p.id)! }))
    .sort((a, b) => a.key - b.key || cmp(a.f, b.f));
  return rotate(s, date, x, list, people, fair, idx, fixed, due, memo).map(c => c.p);
}
// --------------------------- Εναλλαγή υπηρεσιών (Michael, 18/10) ---------------------------
// «να μην κάνει κάποιος τον ίδιο τύπο υπηρεσίας εάν υπάρχει κάποιος διαθέσιμος άλλος που δεν έχει κάνει, ώστε να
// περνάνε όλοι οι διαθέσιμοι από όλες τις υπηρεσίες και μετά να ξανακάνουν την ίδια όταν έρθει η ώρα τους».
// Ποιοι μπαίνουν σήμερα το κρίνει η σειρά δικαιοσύνης όπως πριν (αργίες, ΣΚ που χρωστάνε, μέρες χωρίς υπηρεσία, σύνολο):
// «η σειρά τους» = οι πρώτοι στη σειρά ανάμεσα σε όσους μπορούν να μπουν κάπου σήμερα, όσες οι κενές θέσεις της μέρας.
// Από αυτούς, τη θέση την παίρνει όποιος έχει κάνει τις λιγότερες φορές αυτόν τον τύπο υπηρεσίας. Μετρά μόνο ανάμεσα σε
// όσους μπαίνουν στη θέση (Ποιος κάνει τι, Σ.Ι., καταστάσεις, κανόνες): όποιος δεν την κάνει δεν τη «χρωστά». Πρώτοι
// μένουν όσοι είναι η σειρά τους και δεν χωρούν σε καμία άλλη κενή θέση, για να μη μείνουν σήμερα χωρίς υπηρεσία.
// Οι προτεραιότητες της λίστας (τελευταία λύση, κράτηση ενόπλων, ΣΚ που χρωστάνε) δεν αλλάζουν.
type Cand = { p: Person; key: number; f: Fair & { pid: number } };
function allowedOn(s: AppState, date: ISODate, y: Post, people: Person[], fixed: Set<number>, idx: Map<number, Set<ISODate>>, memo: Map<string, number[]>): number[] {
  let l = memo.get(y.k);
  if (!l) { l = people.filter(p => !fixed.has(p.id) && !guardUnavailable(s, date, p.id, y.k, idx)).map(p => p.id); memo.set(y.k, l); }
  return l;
}
// Όλοι με τη σειρά δικαιοσύνης χωρίς το είδος της θέσης (όσοι χρωστάνε ΣΚ τελευταίοι): μία φορά ανά συμπλήρωση
const turnCache = new WeakMap<object, number[]>();
function turnOrder(s: AppState, date: ISODate, fair: Map<number, Fair & { pid: number }>, due: Set<number> | null): number[] {
  let o = turnCache.get(fair);
  if (!o) {
    const cmp = fairCompare(isHol(s.settings, date), '', date); const owes = (pid: number) => (due?.has(pid) ? 1 : 0);
    o = [...fair.values()].sort((a, b) => owes(a.pid) - owes(b.pid) || cmp(a, b)).map(f => f.pid); turnCache.set(fair, o);
  }
  return o;
}
function rotate(s: AppState, date: ISODate, x: Post, list: Cand[], people: Person[], fair: Map<number, Fair & { pid: number }>, idx: Map<number, Set<ISODate>>, fixed: Set<number>, due: Set<number> | null, memo = new Map<string, number[]>()): Cand[] {
  if (s.rules.rotate === false || x.kind === 'ly' || list.length < 2) return list;
  const g = s.guards[date] || {}; const busy = new Set(Object.values(g));
  const open = postsOf(s.settings).filter(y => !g[y.k] && y.k !== x.k);
  // Λ/Υ-Δ/Υ: ορίζονται με το χέρι και δεν μετρούν στην εναλλαγή (μετρούν μόνο ως κενές θέσεις της μέρας)
  const ty = dutyType(s, x.k, x.kind);
  const byTy = new Map<string, Set<number>>();   // οι άλλοι τύποι υπηρεσίας με κενή θέση σήμερα → ποιοι μπαίνουν
  for (const y of open) {
    if (y.kind === 'ly') continue;
    const t = dutyType(s, y.k, y.kind); let o = byTy.get(t); if (!o) byTy.set(t, (o = new Set()));
    for (const pid of allowedOn(s, date, y, people, fixed, idx, memo)) if (!busy.has(pid)) o.add(pid);
  }
  // όσοι μπαίνουν κάπου σήμερα, με τη σειρά δικαιοσύνης (χωρίς το είδος της θέσης)· οι πρώτοι, όσες οι κενές θέσεις
  const inList = new Set(list.map(c => c.p.id)); const turn = new Set<number>();
  for (const pid of turnOrder(s, date, fair, due)) {
    if (turn.size > open.length) break;
    if (inList.has(pid) || [...byTy.values()].some(o => o.has(pid))) turn.add(pid);
  }
  const top = list[0].key;
  const win = list.filter(c => c.key === top && turn.has(c.p.id));
  if (win.length < 2) return list;
  // Πόσο «χρωστά» κάθε τύπο: φορές / μέσος όρος όσων τον κάνουν (οι υπηρεσίες με πολλές θέσεις γίνονται πιο συχνά). Στη
  // θέση πάει πρώτα όποιος χρωστά αυτόν τον τύπο περισσότερο από κάθε άλλο που μπορεί να κάνει σήμερα (αλλιώς όποιος έχει
  // λίγες φορές και από τα δύο θα έπαιρνε πάντα την υπηρεσία που γεμίζει πρώτη), μετά οι λιγότερες φορές σε αυτόν.
  const mean = (t: string, ids: Iterable<number>) => { let n = 0, sum = 0; for (const pid of ids) { const f = fair.get(pid); if (f) { n++; sum += f.byType[t] || 0; } } return n ? sum / n : 0; };
  const rel = (f: Fair, t: string, m: number) => ((f.byType[t] || 0) + 1) / (m + 1);
  const mT = mean(ty, list.map(c => c.p.id)); const mU = new Map([...byTy].map(([t, o]) => [t, mean(t, o)]));
  const pos = new Map(list.map((c, i) => [c, i]));
  const v = new Map(win.map(c => {
    const pid = c.p.id; const r = rel(c.f, ty, mT); let best = Infinity, only = 0;
    for (const [t, o] of byTy) if (t !== ty && o.has(pid)) best = Math.min(best, rel(c.f, t, mU.get(t)!));
    for (const o of byTy.values()) if (o.has(pid)) only = 1;
    return [c, [only, Math.max(0, r - best), c.f.byType[ty] || 0, pos.get(c)!]];
  }));
  win.sort((a, b) => { const A = v.get(a)!, B = v.get(b)!; return A[0] - B[0] || A[1] - B[1] || A[2] - B[2] || A[3] - B[3]; });
  const inWin = new Set(win);
  return [...win, ...list.filter(c => !inWin.has(c))];
}
// Όσοι «χρωστάνε» το επόμενο ΣΚ/αργία (Michael, 17/10: «να κρατάει όσους δεν έχουν κάνει ΣΚ για το επόμενο και να μην
// τους βάζει Πέμπτη-Παρασκευή, ώστε να τηρείται η ανάπαυση»): τις μέρες πριν από ΣΚ/αργία (ως 2 μέρες, ή όσες η ανάπαυση
// αν είναι περισσότερες) κρατιούνται στην άκρη όσοι θα έπαιρναν τις θέσεις της αργίας με τη σειρά δικαιοσύνης, δηλαδή
// οι λιγότερες αργίες, όσοι χωρούν στις θέσεις όλων των συνεχόμενων ημερών της. Μπαίνουν μόνο αν δεν φτάνουν οι άλλοι.
// Χωρίς ανάπαυση δεν χρειάζεται. Μία φορά ανά συμπλήρωση (κρατιέται με το fair της).
// Όσοι έχουν ήδη υπηρεσία μέσα στις επόμενες μέρες (όσες η ανάπαυση, τουλάχιστον 2· π.χ. Τετάρτη τον έβαλες με το χέρι
// Παρασκευή ή ΣΚ, Michael 21/10): μέσα στην ανάπαυση δεν μπαίνει καθόλου (ruleBlock), πιο πριν μπαίνει τελευταίος, όπως
// όσοι χρωστάνε ΣΚ. Χωρίς ανάπαυση δεν χρειάζεται. Η πρώτη τέτοια μέρα, ή null.
export const aheadDays = (r: Rules) => (r.restDays > 0 ? Math.max(2, r.restDays) : 0);
export function dutyAhead(s: AppState, date: ISODate, pid: number, idx?: Map<number, Set<ISODate>>): ISODate | null {
  const n = aheadDays(s.rules); const ds = n ? (idx || dutyIndexOf(s)).get(pid) : undefined;
  if (ds) for (let i = 1; i <= n; i++) { const d = addDays(date, i); if (ds.has(d)) return d; }
  return null;
}
// Όσοι μπαίνουν τελευταίοι μια μέρα: όσοι χρωστάνε το ΣΚ που έρχεται και όσοι έχουν ήδη υπηρεσία τις επόμενες μέρες
const heldCache = new WeakMap<object, Set<number> | null>();
function heldBack(s: AppState, date: ISODate, h: boolean, people: Person[], fair: Map<number, Fair & { pid: number }>, fixed: Set<number>, idx: Map<number, Set<ISODate>>): Set<number> | null {
  if (heldCache.has(fair)) return heldCache.get(fair)!;
  const due = h ? null : weekendDue(s, date, people, fair, fixed, idx);
  const soon = people.filter(p => !fixed.has(p.id) && dutyAhead(s, date, p.id, idx)).map(p => p.id);
  const out = soon.length ? new Set([...(due || []), ...soon]) : due;
  heldCache.set(fair, out);
  return out;
}
const dueCache = new WeakMap<object, Set<number> | null>();
function weekendDue(s: AppState, date: ISODate, people: Person[], fair: Map<number, Fair & { pid: number }>, fixed: Set<number>, idx: Map<number, Set<ISODate>>): Set<number> | null {
  if (dueCache.has(fair)) return dueCache.get(fair)!;
  let out: Set<number> | null = null;
  const rest = s.rules.restDays || 0;
  const ahead = rest > 0 ? [1, 2, 3, 4, 5, 6, 7].slice(0, Math.max(2, rest)).map(i => addDays(date, i)).find(d => isHol(s.settings, d)) : undefined;
  if (ahead) {
    const days: ISODate[] = []; for (let d = ahead; isHol(s.settings, d) && days.length < 5; d = addDays(d, 1)) days.push(d);
    // μόνο οι κενές θέσεις: όσους έβαλες ήδη στο ΣΚ (με το χέρι) δεν τους «χρωστά» κανείς άλλος
    const posts = postsOf(s.settings).filter(x => x.kind !== 'ly');
    const seats = days.reduce((a, d) => a + posts.filter(x => !(s.guards[d] || {})[x.k]).length, 0);
    const cmp = fairCompare(true, '', ahead);
    const placed = (pid: number) => days.some(d => idx.get(pid)?.has(d));
    // όσοι μπορούν να μπουν την αργία (καταστάσεις, μέρες χωρίς υπηρεσία, κανόνες), χωρίς τη σημερινή μέρα που κρίνεται τώρα
    const can = people.filter(p => !fixed.has(p.id) && !p.post && !placed(p.id) && days.some(d => !dutyBlock(s.statuses, d, p.id, null, s.settings.lists) && !offDayBlock(s, d, p.id) && !ruleBlock(s, d, p.id, idx)));
    out = new Set(can.map(p => fair.get(p.id)!).filter(Boolean).sort(cmp).slice(0, seats).map(f => f.pid));
  }
  dueCache.set(fair, out);
  return out;
}
// Οι κενές ένοπλες θέσεις της μέρας (εκτός από την except)
const armedLeft = (s: AppState, date: ISODate, except: string) => { const g = s.guards[date] || {}; return postsOf(s.settings).filter(y => y.armed && y.k !== except && !g[y.k]); };
// Ποιοι χρειάζονται για τις ένοπλες θέσεις: όσοι, αν πάνε αλλού, γεμίζουν λιγότερες ένοπλες (μέγιστη αντιστοίχιση
// ατόμων σε θέσεις· για καθέναν από την αντιστοίχιση δοκιμάζεται αν τη θέση του την παίρνει άλλος)
// memo: ποιοι περνούν τους κανόνες κάθε θέσης, μία φορά ανά μέρα (αλλάζει μόνο για όποιον μπήκε ήδη σε θέση εκείνη τη μέρα)
function armedNeeded(s: AppState, date: ISODate, seats: Post[], people: Person[], idx: Map<number, Set<ISODate>>, memo?: Map<string, number[]>): Set<number> {
  const busy = new Set(Object.values(s.guards[date] || {}));
  const ok = (y: Post) => {
    let l = memo?.get(y.k);
    if (!l) { l = people.filter(p => !guardUnavailable(s, date, p.id, y.k, idx)).map(p => p.id); memo?.set(y.k, l); }
    return l.filter(pid => !busy.has(pid));
  };
  const adj = seats.map(ok);
  const bySeat: (number | undefined)[] = []; const byPid = new Map<number, number>();
  const aug = (si: number, seen: Set<number>, ban: number, bs: (number | undefined)[], bp: Map<number, number>): boolean => {
    for (const pid of adj[si]) {
      if (pid === ban || seen.has(pid)) continue;
      seen.add(pid);
      const o = bp.get(pid);
      if (o === undefined || aug(o, seen, ban, bs, bp)) { bp.set(pid, si); bs[si] = pid; return true; }
    }
    return false;
  };
  seats.forEach((_, si) => aug(si, new Set(), -1, bySeat, byPid));
  const out = new Set<number>();
  for (const [pid, si] of byPid) {
    const bs = [...bySeat]; const bp = new Map(byPid); bs[si] = undefined; bp.delete(pid);
    if (!aug(si, new Set(), pid, bs, bp)) out.add(pid);
  }
  return out;
}
// «Επόμενος στη σειρά» για μια θέση: ο πρώτος που επιτρέπεται, εκτός από όσους ήδη προτάθηκαν (skip)
export function nextFor(s: AppState, date: ISODate, k: string, skip: number[]): number | null {
  const x = postsOf(s.settings).find(p => p.k === k) || postBy(s, k); if (!x) return null;
  const g = { ...(s.guards[date] || {}) }; delete g[k];
  const work: AppState = { ...s, guards: { ...s.guards, [date]: g } };
  const people = dutyPool(s);
  const fair = new Map(people.map(p => [p.id, { ...fairOf(s, p.id, date), pid: p.id }]));
  const idx = new Map<number, Set<ISODate>>(); dutyIndexOf(work).forEach((v, id) => idx.set(id, v));
  const list = candidates(work, date, x, people, fair, idx, fixedIds(s));
  return (s.rules.strictUnarmed ? strictOrder(work, date, x, list, people, idx, fixedIds(s)) : list).find(p => !skip.includes(p.id))?.id ?? null;
}
// Ανταλλαγή δύο ατόμων που έχουν ήδη υπηρεσία την ίδια μέρα: τι εμποδίζει τον καθένα στη θέση του άλλου
export function swapCheck(s: AppState, date: ISODate, a: string, b: string): { hard: string | null; soft: string | null } {
  const g = s.guards[date] || {}; const pa = g[a], pb = g[b]; const A = postBy(s, a), B = postBy(s, b);
  if (!pa || !pb || !A || !B) return { hard: 'Η ανταλλαγή θέλει δύο κατειλημμένες θέσεις', soft: null };
  const work: AppState = { ...s, guards: { ...s.guards, [date]: { ...g, [a]: pb, [b]: pa } } };
  const pm = seatMap(s); const nm = (id: number) => (pm.get(id) ? shortName(pm.get(id)!) : '?');
  // καμία κατάσταση δεν απαγορεύει πλήρως (Michael, 17/10): ΕΥ, άδεια κ.λπ. περνούν με αιτιολογία, όπως ο κανόνας
  const st = (dutyBlock(s.statuses, date, pb, A, s.settings.lists) && nm(pb) + ': ' + dutyBlock(s.statuses, date, pb, A, s.settings.lists)) || (dutyBlock(s.statuses, date, pa, B, s.settings.lists) && nm(pa) + ': ' + dutyBlock(s.statuses, date, pa, B, s.settings.lists)) || null;
  const sa = capBlock(s, date, pb, A) || ruleBlock(work, date, pb, undefined, a), sb = capBlock(s, date, pa, B) || ruleBlock(work, date, pa, undefined, b);
  return { hard: null, soft: st || (sa && nm(pb) + ': ' + sa) || (sb && nm(pa) + ': ' + sb) || null };
}
// «Γιατί αυτός;»: μία γραμμή αιτιολόγησης για όποιον είναι σε μια θέση (έρευνα §3.1)
// Μέσοι όροι αργιών και υπηρεσιών όλων για μια μέρα: μία φορά για όλες τις θέσεις της μέρας, όχι μία ανά θέση
export function fairAvg(s: AppState, date: ISODate): { hol: number; total: number } {
  const v = dutyPool(s).map(p => fairOf(s, p.id, date)); const n = v.length || 1;
  return { hol: v.reduce((a, x) => a + x.hol, 0) / n, total: v.reduce((a, x) => a + x.total, 0) / n };
}
// «Γιατί αυτός;» για κάθε κατειλημμένη θέση μιας μέρας
export function whyAll(s: AppState, date: ISODate): Record<string, string> {
  const g = s.guards[date] || {}; const keys = Object.keys(g); if (!keys.length) return {};
  const a = fairAvg(s, date); const out: Record<string, string> = {};
  for (const k of keys) out[k] = whyText(s, date, k, a);
  return out;
}
// Τον διάλεξε η κράτηση των ενόπλων (candidates: armedNeeded); Ναι, αν δεν κάνει καμία ένοπλη θέση και κάποιος πριν από
// αυτόν στη σειρά, που μπορούσε να πάει εδώ, είναι σε ένοπλη θέση που δεν την έπαιρνε κανείς από όσους δεν έχουν θέση σήμερα
function reservedFor(s: AppState, date: ISODate, post: Post, pid: number): boolean {
  const g = s.guards[date] || {}; const lists = s.settings.lists; const all = postsOf(s.settings).filter(y => y.armed && y.kind !== 'ly');
  const no = (q: number, y: Post) => !!(dutyBlock(s.statuses, date, q, y, lists) || capBlock(s, date, q, y));
  if (!all.length || !all.every(y => no(pid, y))) return false;
  const can = (q: number, y: Post) => !no(q, y) && !ruleBlock(s, date, q, undefined, y.k);
  const cmp = fairCompare(isHol(s.settings, date), fairKey(s, post), date); const me = { ...fairOf(s, pid, date), pid };
  const busy = new Set(Object.values(g)); const fixed = fixedIds(s);
  const free = dutyPool(s).filter(p => !busy.has(p.id) && !fixed.has(p.id) && !seatlessOn(s, date, p.id));
  return all.some(y => { const q = g[y.k]; return q != null && !fixed.has(q) && cmp({ ...fairOf(s, q, date), pid: q }, me) < 0 && can(q, post) && !free.some(f => can(f.id, y)); });
}
const TYPE_NAME: Partial<Record<DutyKind, string>> = { th: 'θαλαμοφύλακας', op: 'οπλοφύλακας', sk: 'σκοπιά', mg: 'μαγειρεία', tae: 'ΤΑΕ', other: 'άλλη υπηρεσία' };
const typeName = (s: AppState, post: Post) => { const t = dutyType(s, post.k, post.kind); return t.startsWith('b:') ? allBlocks(s.settings).find(b => 'b:' + b.id === t)?.name || post.label : TYPE_NAME[post.kind] || post.kind; };
export function whyText(s: AppState, date: ISODate, k: string, avgs?: { hol: number; total: number }): string {
  const pid = (s.guards[date] || {})[k]; const post = postBy(s, k);
  if (!pid || !post) return '';
  const p = seatMap(s).get(pid);
  if (p && limited(p, s.settings.lists)) return 'ΕΠΟΠ/ΟΒΑ, μόνο με το χέρι · ' + (monthDuties(s, date, pid) + 1) + 'η υπηρεσία του μήνα' + (p.monthMax ? ' (όριο ' + p.monthMax + ')' : '');
  const f = fairOf(s, pid, date);
  const av = avgs || fairAvg(s, date); const avg = (fn: (x: { hol: number; total: number }) => number) => fn(av);
  const r1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  const parts: string[] = [];
  if (isHol(s.settings, date)) {
    parts.push(f.hol + (f.hol === 1 ? ' αργία' : ' αργίες') + ' (μ.ό. ' + r1(avg(x => x.hol)) + ')');
    parts.push(f.lastHolBefore ? 'τελευταία αργία ' + dm(f.lastHolBefore) : 'καμία αργία ως τώρα');
  } else {
    parts.push(f.lastBefore ?  (daysBetween(f.lastBefore, date) - 2) + ' μέρες χωρίς υπηρεσία' : 'καμία υπηρεσία ως τώρα');
    parts.push(f.total + (f.total === 1 ? ' υπηρεσία' : ' υπηρεσίες') + ' (μ.ό. ' + r1(avg(x => x.total)) + ')');
  }
  const ah = isFixed(s, pid, k) ? null : dutyAhead(s, date, pid); if (ah) parts.push('έχει ήδη υπηρεσία ' + dm(ah));
  if (s.rules.rotate !== false && post.kind !== 'ly') { const n = f.byType[dutyType(s, k, post.kind)] || 0; const nm = typeName(s, post); parts.push(n ? nm + ' ' + n + (n === 1 ? ' φορά' : ' φορές') + ' πριν' : 'πρώτη φορά ' + nm); }
  if (post.armed) parts.push('ένοπλος');
  else if (!s.rules.strictUnarmed && reservedFor(s, date, post, pid)) parts.push('προτιμήθηκε γιατί δεν κάνει ένοπλη και οι ένοπλες θέσεις δεν έφταναν');
  if (s.rules.strictUnarmed && strictTier(post) <= 3 && isUnarmed(s, date, pid)) parts.push('Αυστηρά Άοπλοι: άοπλος, προτεραιότητα σε ' + TIER_TXT[strictTier(post)]);
  return parts.join(' · ');
}

// --------------------------- «Τι θα αλλάξει» για μια δήλωση (dry-run) ---------------------------
// unlockPast: ο χρήστης ξεκλείδωσε τις περασμένες μέρες· υπηρεσίες που έγιναν και δεν επιτρέπονται πια φεύγουν κι αυτές
// force: ο χρήστης είδε ότι κάποιος δεν βγαίνει έξοδο (ποινή, υπηρεσία…) και το δήλωσε παρ' όλα αυτά (Michael, 17/10)
export interface StatusCmd { type: TypeKey; pids: number[]; from: ISODate; to: ISODate; kind?: string; note?: string; by?: string; reason?: string; on?: ISODate; fromTime?: string; toTime?: string; unlockPast?: boolean; force?: boolean; open?: boolean }
// «Χωρίς λήξη» στη δήλωση (Michael, 19/10: «στα ΣΤΕΠ και καταστάσεις»): ιατρικά, ΣΤΕΠ και νοσοκομείο, όχι άδειες, ποινές,
// εξοδούχοι. Ισχύει μέχρι «Σταμάτησε» (endStatus)· στο Excel το «έως» μένει κενό, όπως στις εγγραφές X4 από το Excel.
export const canOpen = (type: TypeKey) => TYPES[type].cat === 'med' || TYPES[type].cat === 'other';
const OPEN_END: ISODate = '9999-12-31';   // για τον σχεδιασμό: όλες οι μέρες από το «από» και μετά
export const planTo = <T extends Pick<StatusCmd, 'type' | 'to' | 'toTime' | 'open'>>(cmd: T): T => (cmd.open && canOpen(cmd.type) ? { ...cmd, to: OPEN_END, toTime: undefined } : cmd);
export interface PlanFile { fn: string; desc: string; warn?: boolean }
export interface StatusPlan {
  files: PlanFile[];
  overlaps: { pid: number; status: Status }[];
  conflicts: { pid: number; date: ISODate; k: string }[];
  past: { pid: number; date: ISODate; k: string }[];   // υπηρεσίες πριν από σήμερα: έγιναν, μένουν
  blocked: { pid: number; date: ISODate; reason: string }[];
  cancels: Status[];
  alongside: { pid: number; status: Status }[];   // άλλο ιατρικό στις ίδιες μέρες: ισχύουν και τα δύο
}
const overlapsRange = (s: Status, from: ISODate, to: ISODate) => !(to < s.from || (!s.open && from > s.to));
// Ιατρικά (Michael, 13/10): ένας στρατιώτης μπορεί να έχει μαζί π.χ. ΕΑ και ΕΥ. Ίδιο ιατρικό = ίδιο όνομα
// (ΕΑ με ΕΑ, «ΕΛ ΠΟΔ» με «ΕΛ ΠΟΔ»)· διαφορετικά ιατρικά ισχύουν μαζί και μετρά ο πιο αυστηρός περιορισμός.
export const sameMed = (a: Pick<Status, 'type' | 'kind'>, b: Pick<Status, 'type' | 'kind'>, lists?: UserLists) =>
  TYPES[a.type].cat === 'med' && TYPES[b.type].cat === 'med' && a.type === b.type && statusLbl(a, lists) === statusLbl(b, lists);
// Έξοδος/ΔΝ πολλών ημερών που ακυρώνεται μόνο για from–to: μένουν οι μέρες πριν και μετά.
// Το πρώτο κομμάτι κρατά το id (ίδια γραμμή στο Excel), το δεύτερο παίρνει νέο.
export function splitOut(st: Status, from: ISODate, to: ISODate, newId: () => string): Status[] {
  const out: Status[] = [];
  if (st.from < from) out.push({ ...st, to: addDays(from, -1) });
  if (st.to > to) out.push({ ...st, id: out.length ? newId() : st.id, from: addDays(to, 1) });
  return out;
}
// Ως πότε ακυρώνει τις εξόδους μια δήλωση: χωρίς την τελευταία μέρα, αν τελειώνει με ώρα πριν από την ώρα εξόδου
export const outCutTo = (s: AppState, cmd: Pick<StatusCmd, 'type' | 'to' | 'toTime'>) => (backBy(cmd, cmd.to, outMin(s.rules)) ? addDays(cmd.to, -1) : cmd.to);
// μία γραμμή ανά μέρα: ποιοι βγαίνουν από ποιες θέσεις
function conflictFiles(s: AppState, conflicts: StatusPlan['conflicts']): PlanFile[] {
  const pm = personMap(s.people), posts = allPosts(s.settings);
  return [...new Set(conflicts.map(x => x.date))].sort().map(date => {
    const cs = conflicts.filter(x => x.date === date);
    return { fn: 'Υπηρεσίες ' + dm(date), warn: true, desc: cs.map(x => shortName(pm.get(x.pid)!) + ' βγαίνει από ' + postTxt(posts.find(p => p.k === x.k)!)).join(' · ') + '. ' + (cs.length > 1 ? 'Οι θέσεις μένουν' : 'Η θέση μένει') + ' ΚΕΝΗ.' };
  });
}
const rangeTxt = (from: ISODate, to: ISODate) => (from === to ? dm(from) : dm(from) + '–' + dm(to));
// today: οι υπηρεσίες πριν από σήμερα δεν σβήνονται (έγιναν), μόνο αναφέρονται
export function planStatusChange(s: AppState, cmd0: StatusCmd, today?: ISODate): StatusPlan {
  const cmd = planTo(cmd0); const t = TYPES[cmd.type];
  const n = cmd.pids.length;
  const pm = personMap(s.people);
  const files: PlanFile[] = [];
  const overlaps: StatusPlan['overlaps'] = [], conflicts: StatusPlan['conflicts'] = [], past: StatusPlan['past'] = [], blocked: StatusPlan['blocked'] = [], cancels: Status[] = [], alongside: StatusPlan['alongside'] = [], warned: StatusPlan['conflicts'] = [];
  const lists = s.settings.lists;
  const clash = (x: Status) => (t.cat === 'med' && TYPES[x.type].cat === 'med' ? sameMed(x, cmd, lists) : TYPES[x.type].cat === t.cat) || (!!TYPES[x.type].away && !!t.away);
  // με ώρα αναχώρησης μετρά και η υπηρεσία της προηγούμενης μέρας (τελειώνει το μεσημέρι της πρώτης μέρας της άδειας)
  const first = cmd.fromTime && hasTimes(cmd.type) ? addDays(cmd.from, -1) : cmd.from;
  const dates = Object.keys(s.guards).filter(d => d >= first && d <= cmd.to).sort();
  const posts = allPosts(s.settings);
  // έξοδος/ΔΝ και άδεια που τελειώνει με ώρα επιστροφής πριν από την έξοδο: δεν πέφτουν μαζί (Michael, 18/10)
  const om = outMin(s.rules);
  const meets = (x: Status) => {
    if (!overlapsRange(x, cmd.from, cmd.to)) return false;
    const xo = TYPES[x.type].cat === 'out';
    if (t.cat === 'out' && !xo && backBy(x, x.to, om)) return overlapsRange({ ...x, to: addDays(x.to, -1) }, cmd.from, cmd.to) && x.from < x.to;
    if (xo && t.cat !== 'out' && backBy({ ...cmd, open: false }, cmd.to, om)) return overlapsRange(x, cmd.from, addDays(cmd.to, -1)) && cmd.from < cmd.to;
    return true;
  };
  for (const pid of cmd.pids) {
    const mine = statusesOf(s.statuses, pid).filter(meets);
    const ov = mine.find(clash);
    if (ov) overlaps.push({ pid, status: ov });
    else if (t.cat === 'med') mine.filter(x => TYPES[x.type].cat === 'med').forEach(x => alongside.push({ pid, status: x }));
    if (t.cat === 'out') {
      for (let d = cmd.from; d <= cmd.to; d = addDays(d, 1)) { const r = outBlock(s, d, pid); if (r) { blocked.push({ pid, date: d, reason: r }); break; } }
    } else if (cmd.type !== 'PUN') {
      // οι ίδιοι κανόνες με τις υπηρεσίες (dutyBlock): καμία υπηρεσία, όχι ένοπλη, ΕΟ/ΕΑ όχι μαγειρεία· με το είδος, ώστε
      // το δικό σου ιατρικό να έχει τους δικούς του κανόνες ανά υπηρεσία
      const hyp: Status = { id: '', pid, type: cmd.type, from: cmd.from, to: cmd.to, ...(cmd.kind ? { kind: cmd.kind } : {}), ...(cmd.fromTime ? { fromTime: cmd.fromTime } : {}), ...(cmd.toTime ? { toTime: cmd.toTime } : {}) };
      dates.forEach(date => posts.forEach(x => {
        if (s.guards[date][x.k] === pid && dutyBlock([hyp], date, pid, x, lists)) (today && date < today && !cmd.unlockPast ? past : conflicts).push({ pid, date, k: x.k });
      }));
    }
    // ιατρικό «μόνο προειδοποίηση»: οι υπηρεσίες μένουν, με προειδοποίηση
    if (medWarns(cmd, lists) && !(today && cmd.to < today)) dates.forEach(date => posts.forEach(x => { if ((!today || date >= today) && s.guards[date][x.k] === pid) warned.push({ pid, date, k: x.k }); }));
    // και η ποινή που ακόμα αιτείται κρατά τον στρατιώτη μέσα (outBlock)
    if (statNoOut(cmd, lists) && !t.away)
      s.statuses.forEach(x => { if (x.pid === pid && TYPES[x.type].cat === 'out' && meets(x)) cancels.push(x); });
  }
  const rows = (k: number) => '+' + k + (k > 1 ? ' γραμμές' : ' γραμμή');
  if (cmd.type === 'PUN') files.push({ fn: HK(), desc: 'Αιτείται στις Αποφάσεις Διοικητή (4. Ποινές)· ισχύει όταν εγκριθεί' });
  else if (t.cat === 'med' || t.cat === 'other') files.push({ fn: 'Ιατρικά', desc: rows(n) + ' · αφαιρείται μόνο του όταν λήξει' });
  else if (t.cat === 'abs') files.push({ fn: HK(), desc: 'Απόντες: ' + t.long + ' ' + rows(n) });
  if (t.hkai && cmd.type !== 'PUN' && t.cat !== 'abs') files.push({ fn: HK(), desc: 'Κωλυόμενοι: ' + t.long + ' ' + rows(n) });
  const keep = (x: Status) => splitOut(x, cmd.from, outCutTo(s, cmd), () => '').map(y => rangeTxt(y.from, y.to)).join(', ');
  if (cancels.length) files.push({ fn: 'Εξοδούχοι', warn: true, desc: 'Ακυρώνεται η έξοδος: ' + cancels.map(x => shortName(pm.get(x.pid)!) + ' (' + rangeTxt(x.from, x.to) + (keep(x) ? ', μένει ' + keep(x) : '') + ')').join(', ') + '. ' + (cmd.type === 'PUN' ? 'Ο τιμωρημένος' : t.label) + ' δεν βγαίνει έξοδο.' });
  files.push(...conflictFiles(s, conflicts));
  [...new Set(warned.map(x => x.date))].forEach(date => {
    files.push({ fn: 'Υπηρεσίες ' + dm(date), warn: true, desc: warned.filter(x => x.date === date).map(x => shortName(pm.get(x.pid)!) + ' (' + postTxt(posts.find(p => p.k === x.k)!) + ')').join(' · ') + ': έχει υπηρεσία. Μένει· έλεγξε αν μπορεί να την κάνει.' });
  });
  [...new Set(past.map(x => x.date))].forEach(date => {
    files.push({ fn: 'Υπηρεσίες ' + dm(date), desc: past.filter(x => x.date === date).map(x => shortName(pm.get(x.pid)!) + ' (' + postTxt(posts.find(p => p.k === x.k)!) + ')').join(' · ') + ': υπηρεσία που έγινε, μένει.' });
  });
  return { files, overlaps, conflicts, past, blocked, cancels, alongside };
}

// Πολλά ιατρικά μαζί (declareMany): ένα σχέδιο για όλα. Ίδιες γραμμές μία φορά· οι «+N γραμμές» στο ίδιο αρχείο αθροίζονται
export function planStatusChanges(s: AppState, cmds: StatusCmd[], today?: ISODate): StatusPlan {
  const ps = cmds.map(c => planStatusChange(s, c, today));
  if (ps.length === 1) return ps[0];
  const uniq = <T>(xs: T[], key: (x: T) => string) => { const seen = new Set<string>(); return xs.filter(x => !seen.has(key(x)) && !!seen.add(key(x))); };
  const ROWS = /^\+(\d+) γραμμ(?:ή|ές)/;
  const at = (x: { pid: number; date: ISODate; k: string }) => x.pid + '|' + x.date + '|' + x.k;
  const conflicts = uniq(ps.flatMap(p => p.conflicts), at), out = new Set(ps.flatMap(p => conflictFiles(s, p.conflicts)).map(f => f.fn + '|' + f.desc));
  const files: PlanFile[] = [];
  for (const f of ps.flatMap(p => p.files)) {
    if (out.has(f.fn + '|' + f.desc)) continue;   // οι γραμμές «βγαίνει από» ξαναφτιάχνονται από όλες μαζί

    const m = ROWS.exec(f.desc), rest = f.desc.replace(ROWS, '');
    const i = m ? files.findIndex(x => x.fn === f.fn && ROWS.test(x.desc) && x.desc.replace(ROWS, '') === rest) : -1;
    if (i >= 0) { const k = Number(ROWS.exec(files[i].desc)![1]) + Number(m![1]); files[i] = { ...files[i], desc: '+' + k + (k > 1 ? ' γραμμές' : ' γραμμή') + rest }; }
    else if (!files.some(x => x.fn === f.fn && x.desc === f.desc)) files.push(f);
  }
  files.push(...conflictFiles(s, conflicts));
  return {
    files,
    overlaps: ps.flatMap(p => p.overlaps), blocked: uniq(ps.flatMap(p => p.blocked), x => x.pid + '|' + x.date),
    conflicts, past: uniq(ps.flatMap(p => p.past), at),
    cancels: uniq(ps.flatMap(p => p.cancels), x => x.id), alongside: uniq(ps.flatMap(p => p.alongside), x => x.pid + '|' + x.status.id)
  };
}

// --------------------------- ΗΚΑΙ (Κ-17) ---------------------------
// Κάθε άτομο μετριέται σε ΜΙΑ στήλη: πρώτα απουσία, μετά υπηρεσία, ΕΥ, ποινή. Τα πόστα δεν μετρούν στην ΗΚΑΙ
// (Michael, 13/10)· η στήλη Ο/Σ γράφεται με το χέρι.
export const HK_K: [string, string, string][] = [['yp', 'Υπηρ.', 'Υπηρεσία εντός στρατοπέδου'], ['ey', 'ΕΥ', 'Ελεύθεροι υπηρεσίας'], ['tim', 'Τιμ.', 'Τιμωρημένοι'], ['bl', '', '(κενή στήλη του εντύπου)'], ['os', 'Ο/Σ', 'Ο/Σ'], ['mag', 'Μαγ.', 'Μαγειρεία'], ['sid', 'Σιδ.', 'Σιδηρουργείο'], ['kin', 'Κίν.', 'Σε κίνηση']];
export const HK_A: [string, string, string][] = [['ka', 'Κ.Άδ.', 'Κανονικές άδειες / ΑΜΔ / ΥΕΘΑ'], ['an', 'Αναρ.', 'Αναρρωτικές άδειες'], ['eid', 'Ειδ.', 'Ειδικές άδειες'], ['nos', 'Νοσ.', 'Νοσοκομείο / 401 ΓΣΝΑ'], ['prat', 'Πρατ.', 'Πρατήριο'], ['adik', 'Αδικ.', 'Αγνοούμενοι / Αδικαιολογήτως'], ['fp', 'Φ.Πορ.', 'Φύλλα πορείας - μεταβάσεως'], ['fyl', 'Φυλ.', 'Φυλάκια'], ['apal', 'Απαλ.', 'Απαλλαγή'], ['ekp', 'Εκπ.', 'Αποσπασμένοι σε εκπαίδευση'], ['allh', 'Άλλη Μ.', 'Αποσπασμένοι σε άλλη μονάδα']];
export { HK_OFFICERS, HK_NCO } from './ranks';
// Βαθμός (και προέλευση) προσώπου → γραμμή της ΗΚΑΙ: πρώτα ό,τι όρισες στις Λίστες για δικό σου βαθμό, αλλιώς από το
// όνομα· ΕΠΟΠ/ΟΒΑ στρατιώτης στη δική του γραμμή, ο ΕΠΟΠ ΛΧΙΑΣ στους Λοχίες
export function hkRankOf(rank: string, lists?: UserLists, origin?: string): string {
  const claim = hkClaimOf(lists, rank, origin, 'nco'); if (claim) return claim;
  const own = hkOfRank(lists, 'soldierRanks', rank); if (own && hkRowsOf(lists).nco.includes(own)) return own;
  const r = rank.toUpperCase().replace(/\./g, '');
  if (/ΑΡΧΙΛΧ|ΑΡΧΙΛΟΧ/.test(r)) return 'Αρχιλοχίες';
  if (/ΕΠΙΛΧ|ΕΠΙΛΟΧ/.test(r)) return 'Επιλοχίες';
  if (/ΛΧΙΑΣ|ΛΟΧΙΑΣ/.test(r)) return 'Λοχίες';
  if (/ΔΝΕΑΣ|ΔΕΚΑΝ/.test(r)) return 'Δεκανείς';
  if (/ΕΠΟΠ/.test(r)) return 'ΕΠΟΠ Στρατιώτης';
  if (/ΟΒΑ/.test(r)) return 'ΟΒΑ Στρατιώτης';
  return originRow(origin) || 'Στρατιώτες';
}
// Η κατάσταση ενός στελέχους μια μέρα (η πρώτη, αν κατά λάθος επικαλύπτονται)
export const cadreAbsOn = (s: Pick<AppState, 'cadreAbs'>, cid: string, date: ISODate): CadreAbs | undefined => (s.cadreAbs || []).find(x => x.cid === cid && x.from <= date && date <= x.to);
export interface HkaiRow { n: number; attached: number; c: Record<string, number> }   // c.ab = μισθοτροφοδοτηθέντες (μόνο με το χέρι)
// Στήλες της ΗΚΑΙ που δεν βγαίνουν από την εφαρμογή και γράφονται με το χέρι
export const HK_MANUAL: [string, string][] = [['os', 'Ο/Σ'], ['sid', 'Σιδ.'], ['kin', 'Κίν.'], ['eid', 'Ειδ.άδ.'], ['prat', 'Πρατ.'], ['adik', 'Αδικ.'], ['fp', 'Φ.Πορ.'], ['fyl', 'Φυλ.'], ['apal', 'Απαλ.'], ['ekp', 'Εκπ.'], ['allh', 'Άλλη Μ.'], ['ab', 'Μισθοτρ.']];
// cadre: τα στελέχη ανά στήλη (καρτέλα Στελέχη), για να φαίνονται με ονόματα όπως οι στρατιώτες
export interface Hkai { cols: Record<string, Person[]>; cadre: Record<string, Cadre[]>; rank: Record<string, HkaiRow>; kol: number; apo: number; total: number; avail: number; guardsN: number; soldiers: number; cadreN: number }
export function hkaiCounts(s: AppState, date: ISODate): Hkai {
  const g = s.guards[date] || {};
  const onDuty = new Map<number, DutyKind>();
  for (const k in g) { const p = postBy(s, k); if (p) onDuty.set(g[k], p.kind); }
  const cols: Record<string, Person[]> = {};
  [...HK_K, ...HK_A].forEach(([k]) => (cols[k] = []));
  const rank: Record<string, HkaiRow> = {};
  // στελέχη: από τη λίστα με ονόματα αν υπάρχει, αλλιώς οι αριθμοί των Ρυθμίσεων
  const cl = (s.cadreList || []).filter(c => c.active);
  const lists = s.settings.lists;
  hkRowList(lists).forEach(r => (rank[r] = { n: cl.length ? 0 : s.settings.cadre[r] || 0, attached: 0, c: {} }));
  // κατάσταση στελέχους = στήλη της ΗΚΑΙ: στους κωλυόμενους (υπηρεσία, ΕΥ…) ή στους απόντες (άδειες…)
  let cadreKol = 0, cadreAway = 0; const cadreCols: Record<string, Cadre[]> = {};
  for (const c of cl) {
    const hk = rank[c.hk] ? c.hk : guessHk(c.rank, lists, c.origin); const r = rank[hk] ? hk : 'Λοχίες'; rank[r].n++;
    const a = cadreAbsOn(s, c.id, date);
    // ΕΠΟΠ/ΟΒΑ με υπηρεσίες: η κατάσταση που έγραψες, αλλιώς η θέση της μέρας στις Υπηρεσίες (η απαλλαγή μόνο με το χέρι)
    const dk = c.pid != null ? onDuty.get(c.pid) : undefined;
    const col = (a && cadreAbsOf(a.kind, s.settings.lists)?.[2]) || (dk ? (dk === 'mg' ? 'mag' : 'yp') : undefined);
    if (col) { rank[r].c[col] = (rank[r].c[col] || 0) + 1; (cadreCols[col] ||= []).push(c); if (HK_K.some(x => x[0] === col)) cadreKol++; else cadreAway++; }
  }
  let soldiers = 0; const at = hkMin(s.rules);
  for (const p of activePeople(s)) {
    soldiers++;
    const r = hkRankOf(p.rank, s.settings.lists, p.origin); rank[r].n++; if (p.attached) rank[r].attached++;
    // γύρισε ως την ώρα της ΗΚΑΙ: παρών εκείνη τη μέρα (Michael, 18/10)
    const ss = statusesFrom(s.statuses, p.id, date, at);
    const abs = ss.find(x => TYPES[x.type].away && TYPES[x.type].hkai);
    const duty = onDuty.get(p.id);
    const col = abs ? (abs.type === 'LEAVE' ? leaveCol(abs.kind, s.settings.lists) : TYPES[abs.type].hkai!) : duty ? (duty === 'mg' ? 'mag' : 'yp') : ss.find(x => x.type === 'EY') ? 'ey' : ss.find(x => x.type === 'PUN') ? 'tim' : null;
    if (col) { cols[col].push(p); rank[r].c[col] = (rank[r].c[col] || 0) + 1; }
  }
  let kol = HK_K.reduce((a, [k]) => a + cols[k].length, 0) + cadreKol, apo = HK_A.reduce((a, [k]) => a + cols[k].length, 0) + cadreAway;
  // ό,τι γράφει ο χρήστης με το χέρι (σιδηρουργείο, πρατήριο, φυλάκια, αποσπασμένοι…, μισθοτροφοδοτηθέντες «ab»)
  const man = s.hkaiManual?.[date]?.cells || {};
  for (const r of Object.keys(man)) {
    if (!rank[r]) continue;
    for (const [k, v] of Object.entries(man[r])) {
      if (!v) continue;
      rank[r].c[k] = (rank[r].c[k] || 0) + v;
      if (HK_K.some(x => x[0] === k)) kol += v; else if (HK_A.some(x => x[0] === k)) apo += v;
    }
  }
  const cadre = cl.length || hkRowList(lists).reduce((a, r) => a + (s.settings.cadre[r] || 0), 0);
  return { cols, cadre: cadreCols, rank, kol, apo, total: soldiers + cadre, avail: soldiers + cadre - apo, guardsN: Object.keys(g).length, soldiers, cadreN: cadre };
}
