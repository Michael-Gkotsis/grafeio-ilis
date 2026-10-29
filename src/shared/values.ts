// Έντυπα › πίνακες τιμών (Michael, 24/10): γραμμές με δικό σου κείμενο αριστερά και τιμή δεξιά, από έναν κατάλογο μετρήσεων
// (Δύναμη, καταστάσεις, ιατρικά, υπηρεσίες, Οπλισμός, σύνολα ΗΚΑΙ…). Καμία μέτρηση δεν ξαναγράφεται εδώ: κάθε μία καλεί
// τον ίδιο μετρητή με την οθόνη της (strengthOf, kolView, hkaiCounts, outsTables, weaponInfo…), άρα οι αριθμοί βγαίνουν ίδιοι.
// Μέτρηση = σύνολο ατόμων (κλειδί 'p12' στρατιώτης, 'cΧΧΧ' στέλεχος) ή απλός αριθμός (θέσεις, ΗΚΑΙ). Σε ένα άθροισμα
// κάθε άτομο μετρά μία φορά (ένωση συνόλων, όπως η Δύναμη)· οι αριθμοί προστίθενται. Καθαρή λογική, χωρίς οθόνη.
import type { ISODate } from './dates';
import type { TabLay } from './reports';
import { KOL_COLS, TYPES, TYPE_KEYS, blocksOf, unitOf, type AppState, type Person, type TypeKey } from './domain';
import { HK_A, HK_K, activePeople, cadreSeats, hkMin, hkaiCounts, kolView, outMin, postsOf, seatMap, statusesAt, strengthAt, strengthOf } from './rules';
import { listOf, MED_LIKE, ownMed, hkRowList } from './ranks';
import { siCombos, siOf } from './si';
import { outsTables } from './returns';
import { outsAndStay } from './outsStay';
import { AUTO_KEY, dutyPicks, isOut, movesOn, noSeat, outPeople, outReasonOf, weaponInfo, weaponKey, weaponMatch, type WeaponFilter } from './weapons';
import { hmOf } from './armed';
import { mins } from './hours';
import { norm, normGreek, upper } from './text';
import { reportOf } from './unit';

// ------------------------------------------------------------------ μοντέλο
export interface VFilter { unit?: string; room?: number; rank?: string; arm?: 'armed' | 'unarmed'; who?: 'soldiers' | 'cadre' }
export interface VTerm { sign: '+' | '-'; metric: string; filter?: VFilter }
export type VExpr = VTerm[];
export type VFmt = 'int' | 'pct' | 'pct1';
// tag: η ετικέτα {ΟΝΟΜΑ} της γραμμής σε δικό σου πρότυπο Excel (κενό: από το κείμενο της γραμμής)
export interface VRow { label: string; expr: VExpr; percentOf?: VExpr; fmt?: VFmt; tag?: string }
// Θέση στο φύλλο που άφησε το «Φτιάξ' το εδώ» (στήλες c1–c2, και row αν είναι μόνος του σε ζώνη): μπαίνει από το withBuilt, όχι από τον χρήστη.
// Η θέση του πίνακα ως προς τους άλλους (κάτω από, δίπλα σε) είναι το Report.bands (shared/repBands.ts)· lay: πλάτος και στοίχιση (TabLay)
// tagsOnly: δεν γράφεται πίνακας, μόνο στα κελιά του Excel με την ετικέτα της γραμμής
export interface Spot { c1: number; c2: number; row?: number }
export interface ValueTable { id: string; title?: string; rows: VRow[]; lay?: TabLay; spot?: Spot; tagsOnly?: boolean }
export const FMTS: { id: VFmt; label: string }[] = [{ id: 'int', label: 'Αριθμός' }, { id: 'pct', label: 'Ποσοστό (96%)' }, { id: 'pct1', label: 'Ποσοστό με δεκαδικό (96,2%)' }];
export const newValueTable = (id: string): ValueTable => ({ id, title: '', rows: [newRow()] });
export const newRow = (): VRow => ({ label: '', expr: [{ sign: '+', metric: 'str.total' }] });
export const hasFilter = (f?: VFilter): f is VFilter => !!f && (f.unit != null || f.room != null || !!f.rank || !!f.arm || !!f.who);
// τίποτα να βγει: χωρίς γραμμή με όρους
export const valsUsed = (v?: ValueTable[]): ValueTable[] => (v || []).map(t => ({ ...t, rows: t.rows.filter(r => r.expr.length) })).filter(t => t.rows.length);
export const hasVals = (r: { vals?: ValueTable[] }) => valsUsed(r.vals).length > 0;
// Ετικέτα {ΟΝΟΜΑ} (Φάση 3): κεφαλαία, μόνο γράμματα, αριθμοί και κενά (ως 40, όσο δέχεται το TAG_RE). Δική της, αλλιώς από το κείμενο της γραμμής
export const tagText = (s: unknown): string => upper(s).replace(/[^\p{L}\p{N}_ ]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
export const rowTag = (r: Pick<VRow, 'label' | 'tag'>): string => tagText(r.tag != null && r.tag.trim() ? r.tag : r.label);
export const tagId = (s: unknown): string => normGreek(tagText(s));   // για σύγκριση με ό,τι έγραψε ο χρήστης στο Excel (λατινικά που μοιάζουν = ελληνικά)
// Οι ετικέτες των γραμμών με υπολογισμό: id → {πίνακας, γραμμή}. Σε διπλή ετικέτα (ή ετικέτα που την έχει ήδη κάποιο στοιχείο εντύπου, reserved) κερδίζει η πρώτη· dup/taken: οι υπόλοιπες
export function tagsOf(vals: ValueTable[] | undefined, reserved: (id: string) => boolean = () => false): { map: Map<string, { t: ValueTable; i: number }>; dup: string[]; taken: string[] } {
  const map = new Map<string, { t: ValueTable; i: number }>(); const dup: string[] = [], taken: string[] = [];
  for (const t of vals || []) t.rows.forEach((r, i) => {
    if (!r.expr.length) return;
    const tg = rowTag(r); if (!tg) return; const id = tagId(tg);
    if (reserved(id)) { if (!taken.includes(tg)) taken.push(tg); return; }
    if (map.has(id)) { if (!dup.includes(tg)) dup.push(tg); return; }
    map.set(id, { t, i });
  });
  return { map, dup, taken };
}
// έντυπο μόνο με πίνακες τιμών: χωρίς στήλες ατόμων (τίποτα να διαλέξεις, τίποτα να μετρήσεις σε «κανείς δεν περνά τα φίλτρα»)
export const noPeople = (r: { vals?: ValueTable[]; cols: unknown[] }) => hasVals(r) && !r.cols.length;

// ------------------------------------------------------------------ στιγμή μέτρησης
// undefined: όπως η Δύναμη της μέρας (σήμερα η ώρα της ΗΚΑΙ ή η τωρινή αν είναι μετά, αλλιώς η ώρα της ΗΚΑΙ)· 'hkai': ώρα ΗΚΑΙ· 'out': ώρα εξόδου
// των Κανόνων· 'now': η ώρα που βγαίνει το έντυπο· 'ΩΩ:ΛΛ': δική σου
export type VAt = string | undefined;
export const AT_CUSTOM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function atOf(s: Pick<AppState, 'rules'>, at: VAt, d: ISODate, today: ISODate, now: number): number {
  if (at === 'hkai') return hkMin(s.rules);
  if (at === 'out') return outMin(s.rules);
  if (at === 'now') return now;
  if (at && AT_CUSTOM.test(at)) return mins(at);
  return strengthAt(s.rules, d, today, now);
}
export const hhmm = (m: number) => hmOf(m);
export function atText(s: Pick<AppState, 'rules'>, at: VAt, hk = 'ΗΚΑΙ'): string {
  if (at === 'hkai') return 'ώρα ' + hk + ' (' + hhmm(hkMin(s.rules)) + ')';
  if (at === 'out') return 'ώρα εξόδου (' + hhmm(outMin(s.rules)) + ')';
  if (at === 'now') return 'τώρα';
  if (at && AT_CUSTOM.test(at)) return at;
  return 'όπως η Δύναμη';
}

// ------------------------------------------------------------------ περιβάλλον μέτρησης
// Ό,τι ακριβό υπολογίζεται (Δύναμη, ΗΚΑΙ, Οπλισμός…) μία φορά για όλες τις γραμμές: memo
export interface VCtx { s: AppState; d: ISODate; at: number; today: ISODate; memo: Map<string, unknown> }
export const vctx = (s: AppState, d: ISODate, at: number, today: ISODate = d): VCtx => ({ s, d, at, today, memo: new Map() });
const memo = <T,>(c: VCtx, k: string, f: () => T): T => { if (!c.memo.has(k)) c.memo.set(k, f()); return c.memo.get(k) as T; };

type VSet = Set<string>;
export const personKey = (p: Pick<Person, 'id' | 'cid'>) => (p.cid ? 'c' + p.cid : 'p' + p.id);
const keys = (ps: Iterable<Pick<Person, 'id' | 'cid'>>): VSet => { const o = new Set<string>(); for (const p of ps) o.add(personKey(p)); return o; };
const union = (...l: VSet[]): VSet => { const o = new Set<string>(); for (const x of l) x.forEach(k => o.add(k)); return o; };
const minus = (a: VSet, b: VSet): VSet => { const o = new Set<string>(); a.forEach(k => { if (!b.has(k)) o.add(k); }); return o; };

const stg = (c: VCtx) => memo(c, 'stg', () => strengthOf(c.s, c.d, c.at));
const kol = (c: VCtx) => memo(c, 'kol', () => kolView(c.s, c.d, c.at));
const hk = (c: VCtx) => memo(c, 'hk', () => hkaiCounts(c.s, c.d));
const live = (c: VCtx) => c.d === c.today;
const winfo = (c: VCtx) => memo(c, 'w', () => weaponInfo(c.s, c.d, live(c) ? hmOf(c.at) : undefined));
const armPpl = (c: VCtx) => memo(c, 'arm', () => [...c.s.people, ...cadreSeats(c.s)]);
const total = (c: VCtx) => memo(c, 'total', () => keys(activePeople(c.s)));
const away = (c: VCtx) => memo(c, 'away', () => { const g = stg(c); return keys(TYPE_KEYS.flatMap(k => g.awayLists[k])); });
const kolMinus = (c: VCtx) => memo(c, 'kolm', () => keys(kol(c).minus.map(x => x.p)));
const unarmedSet = (c: VCtx) => winfo(c).unarmed;
const cadreActive = (c: VCtx) => (c.s.cadreList || []).filter(x => x.active);
const cadreKeys = (c: VCtx, cols: string[]): VSet => { const h = hk(c); const o = new Set<string>(); for (const col of cols) for (const x of h.cadre[col] || []) o.add('c' + x.id); return o; };
// πρόσωπο της θέσης (στρατιώτης ή στέλεχος) από τον αριθμό της υπηρεσίας
const seatKey = (c: VCtx, pid: number): string | null => { const p = memo(c, 'seats', () => seatMap(c.s)).get(pid); return p ? personKey(p) : null; };
const pidKeys = (c: VCtx, pids: number[]): VSet => { const o = new Set<string>(); for (const pid of pids) { const k = seatKey(c, pid); if (k) o.add(k); } return o; };
const ssAll = (c: VCtx) => memo(c, 'ss', () => new Map(activePeople(c.s).map(p => [p.id, statusesAt(c.s, p.id, c.d, c.at)] as const)));

// ------------------------------------------------------------------ κατάλογος
export interface Metric { id: string; label: string; group: string; kind: 'set' | 'num'; tip?: string; fn: (c: VCtx) => VSet | number }
const S = (id: string, group: string, label: string, fn: (c: VCtx) => VSet | number, tip?: string): Metric => ({ id, label, group, kind: 'set', fn, ...(tip ? { tip } : {}) });
const N = (id: string, group: string, label: string, fn: (c: VCtx) => number, tip?: string): Metric => ({ id, label, group, kind: 'num', fn, ...(tip ? { tip } : {}) });

export const G = { str: 'Δύναμη', st: 'Καταστάσεις', med: 'Ιατρικά', req: 'Αιτήσεις', out: 'Έξοδοι και παραμένοντες', duty: 'Υπηρεσίες της μέρας', kol: 'Κωλυόμενοι (εξωτερική υπηρεσία)', cadre: 'Στελέχη', w: 'Οπλισμός', hk: 'Σύνολα ΗΚΑΙ' };
const CAT_LBL: Record<string, string> = { abs: 'Άδειες (ΚΑ, τιμητική, αναρρωτική)', pun: 'Ποινές', out: 'Έξοδοι (εξοδούχοι και ΔΝ)', other: 'ΣΤΕΠ και νοσοκομείο', med: 'Όλα τα ιατρικά (ΕΥ, ΕΑ, ΕΟ, ΕΑΡΒ και δικά σου)' };

const MET_CACHE = new WeakMap<object, Metric[]>();
export function metricsOf(s: AppState): Metric[] {
  let l = MET_CACHE.get(s.settings); if (l) return l;
  const lists = s.settings.lists; const HKN = reportOf(s.settings);
  const m: Metric[] = [];
  // ---- Δύναμη (στρατιώτες, στη στιγμή μέτρησης): ίδιοι αριθμοί με τη σελίδα Δύναμη
  m.push(S('str.total', G.str, 'Σε δύναμη (στρατιώτες)', c => total(c), 'Όλοι οι ενεργοί στρατιώτες, όπως το σύνολο της Δύναμης'));
  m.push(S('str.present', G.str, 'Παρόντες', c => minus(minus(total(c), away(c)), kolMinus(c)), 'Σε δύναμη χωρίς τους απόντες και τους κωλυόμενους, όπως η Δύναμη'));
  m.push(S('str.kol', G.str, 'Κωλυόμενοι (δηλωμένοι)', c => kolMinus(c), 'Όσοι έχουν δήλωση κωλυόμενου που τους αφαιρεί από τους παρόντες, όπως η Δύναμη. Η ' + HKN + ' έχει δικό της ορισμό (Σύνολα ' + HKN + ')'));
  m.push(S('str.away', G.str, 'Απόντες', c => away(c), 'Άδεια, νοσοκομείο, έξοδος ή ΔΝ τη στιγμή μέτρησης'));
  m.push(S('str.inside', G.str, 'Μέσα στο στρατόπεδο (παρόντες και κωλυόμενοι)', c => minus(total(c), away(c)), 'Σε δύναμη χωρίς τους απόντες: όσοι δεν λείπουν'));
  m.push(S('str.armed', G.str, 'Ένοπλοι (Σ.Ι. όχι άοπλος)', c => minus(total(c), keys(activePeople(c.s).filter(p => unarmedSet(c).has(p.id)))), 'Σε δύναμη με Σ.Ι. που δεν είναι άοπλη (το Ι3 ΜΕ ΟΠΛΟ μετρά ένοπλος)'));
  m.push(S('str.unarmed', G.str, 'Άοπλοι (Σ.Ι.)', c => keys(activePeople(c.s).filter(p => unarmedSet(c).has(p.id))), 'Ι3 ΧΩΡΙΣ ΟΠΛΟ, Ι4 ή ό,τι όρισες στις Ρυθμίσεις › Σ.Ι.'));
  m.push(S('str.all', G.str, 'Σε δύναμη: στρατιώτες και στελέχη', c => union(total(c), keys(cadreActive(c).map(x => ({ id: 0, cid: x.id })))), 'Στρατιώτες και ενεργά στελέχη (με φίλτρο «Στρατιώτες» ή «Στελέχη» ξεχωρίζουν)'));
  for (const lbl of siCombos(lists?.si)) m.push(S('si:' + lbl, G.str, 'Σ.Ι. ' + lbl, c => keys(activePeople(c.s).filter(p => p.si && siOf(p, c.s.settings.lists).label === lbl))));
  // ---- Καταστάσεις ανά τύπο και κατηγορία (τη στιγμή μέτρησης)
  for (const k of TYPE_KEYS) m.push(S('st.' + k, TYPES[k].cat === 'med' ? G.med : G.st, TYPES[k].long + (TYPES[k].cat === 'med' ? ' (' + TYPES[k].label + ')' : ''), c => keys(stg(c).lists[k])));
  for (const cat of ['abs', 'pun', 'out', 'other', 'med']) m.push(S('cat.' + cat, cat === 'med' ? G.med : G.st, CAT_LBL[cat], c => union(...(TYPE_KEYS as TypeKey[]).filter(k => TYPES[k].cat === cat).map(k => keys(stg(c).lists[k])))));
  for (const mk of listOf(lists, 'medKinds').filter(n => !MED_LIKE.map(k => TYPES[k].label).includes(n))) {
    m.push(S('med.kind:' + mk, G.med, 'Ιατρικό «' + mk + '»', c => keys(activePeople(c.s).filter(p => (ssAll(c).get(p.id) || []).some(x => MED_LIKE.includes(x.type) && ownMed(c.s.settings.lists, x.kind)?.name === mk)))));
  }
  // ---- Αιτήσεις της μέρας
  const reqs = (c: VCtx, f: (x: AppState['requests'][number]) => boolean) => { const pm = new Set(activePeople(c.s).map(p => p.id)); return new Set(c.s.requests.filter(x => x.date === c.d && pm.has(x.pid) && f(x)).map(x => 'p' + x.pid)); };
  m.push(S('req.all', G.req, 'Αιτούντες της μέρας', c => reqs(c, () => true), 'Στρατιώτες με αίτηση που έγινε τη μέρα του εντύπου (5. ΑΙΤΗΣΕΙΣ της ' + HKN + ')'));
  m.push(S('req.pending', G.req, 'Αιτήσεις που εκκρεμούν', c => reqs(c, x => !x.decision)));
  m.push(S('req.ok', G.req, 'Αιτήσεις που εγκρίθηκαν', c => reqs(c, x => x.decision === 'ok')));
  m.push(S('req.no', G.req, 'Αιτήσεις που απορρίφθηκαν', c => reqs(c, x => x.decision === 'no')));
  // ---- Έξοδοι: όπως τα Excel «Εξοδούχοι / Παραμένοντες» (ώρα εξόδου) και «Σε 4 πίνακες»
  const oas = (c: VCtx) => memo(c, 'oas', () => outsAndStay(c.s, c.d));
  m.push(S('out.outs', G.out, 'Εξοδούχοι και ΔΝ (κατάσταση εξόδου)', c => keys(oas(c).outs.map(x => x.p)), 'Όπως το Excel «Εξοδούχοι»: τη μέρα, με την ώρα εξόδου των Κανόνων (όχι τη στιγμή μέτρησης)'));
  m.push(S('out.out', G.out, 'Εξοδούχοι (έξοδος)', c => keys(oas(c).outs.filter(x => x.st.type === 'OUT').map(x => x.p))));
  m.push(S('out.dn', G.out, 'ΔΝ (κατάσταση εξόδου)', c => keys(oas(c).outs.filter(x => x.st.type === 'DN').map(x => x.p))));
  m.push(S('out.stay', G.out, 'Παραμένοντες', c => keys(oas(c).stay.map(x => x.p)), 'Όπως το Excel «Παραμένοντες»: δεν είναι εξοδούχοι ούτε σε άδεια'));
  const ot = (c: VCtx) => memo(c, 'ot', () => outsTables(c.s, c.d));
  m.push(S('ret.dn', G.out, 'Βγαίνουν σήμερα ΔΝ', c => keys(ot(c).dn.map(x => x.p)), 'Όπως ο πίνακας «Βγαίνουν ΔΝ» των Εξοδούχων (Σε 4 πίνακες)'));
  m.push(S('ret.out', G.out, 'Βγαίνουν σήμερα εξοδούχοι', c => keys(ot(c).out.map(x => x.p))));
  m.push(S('ret.tonight', G.out, 'Γυρίζουν σήμερα (απόψε)', c => keys(ot(c).tonight.map(x => x.p))));
  m.push(S('ret.tomorrow', G.out, 'Γυρίζουν αύριο', c => keys(ot(c).tomorrow.map(x => x.p))));
  // ---- Κωλυόμενοι με δήλωση (υπηρεσία εκτός δικών μας): όλοι, όσοι αφαιρούνται από τους παρόντες, όσοι μένουν παρόντες, και ανά στήλη της ΗΚΑΙ
  m.push(S('kol.man', G.kol, 'Κωλυόμενοι με δήλωση (όλοι)', c => keys(kol(c).man.map(x => x.p)), 'Όσοι έχουν δήλωση κωλυόμενου τη στιγμή μέτρησης, είτε αφαιρούνται από τους παρόντες είτε όχι'));
  m.push(S('kol.minus', G.kol, 'Κωλυόμενοι που αφαιρούνται από τους παρόντες', c => kolMinus(c), 'Όπως οι «Κωλυόμενοι (δηλωμένοι)» της Δύναμης'));
  m.push(S('kol.keep', G.kol, 'Κωλυόμενοι που μένουν παρόντες', c => keys(kol(c).keep.map(x => x.p))));
  for (const [k, lbl] of KOL_COLS) m.push(S('kol.col:' + k, G.kol, 'Κωλυόμενοι στη στήλη «' + lbl + '» της ' + HKN, c => keys(kol(c).minus.filter(x => x.col === k).map(x => x.p))));
  // ---- Υπηρεσίες της μέρας (guards + dutyLog της μέρας)
  const picks = (c: VCtx) => memo(c, 'picks', () => dutyPicks(c.s, c.d));
  const guard = (c: VCtx) => c.s.guards?.[c.d] || {};
  const filled = (c: VCtx, f: (p: ReturnType<typeof postsOf>[number]) => boolean) => postsOf(c.s.settings).filter(p => f(p) && guard(c)[p.k] != null).length;
  m.push(S('duty.people', G.duty, 'Σε υπηρεσία (άτομα)', c => pidKeys(c, picks(c).flatMap(x => x.pids)), 'Στρατιώτες και στελέχη με θέση τη μέρα'));
  m.push(S('duty.armed', G.duty, 'Σε ένοπλη υπηρεσία (άτομα)', c => pidKeys(c, picks(c).filter(x => x.armed).flatMap(x => x.pids))));
  m.push(N('duty.posts', G.duty, 'Θέσεις υπηρεσιών (σύνολο)', c => postsOf(c.s.settings).length));
  m.push(N('duty.filled', G.duty, 'Θέσεις γεμάτες', c => filled(c, () => true)));
  m.push(N('duty.empty', G.duty, 'Θέσεις κενές', c => postsOf(c.s.settings).length - filled(c, () => true)));
  m.push(N('duty.aposts', G.duty, 'Ένοπλες θέσεις (σύνολο)', c => postsOf(c.s.settings).filter(p => p.armed).length));
  m.push(N('duty.afilled', G.duty, 'Ένοπλες θέσεις γεμάτες', c => filled(c, p => p.armed)));
  m.push(N('duty.aempty', G.duty, 'Ένοπλες θέσεις κενές', c => postsOf(c.s.settings).filter(p => p.armed).length - filled(c, p => p.armed)));
  for (const b of (blocksOf(s.settings) || s.settings.blocks).filter(x => !x.hidden)) {
    m.push(S('duty.b:' + b.id, G.duty, b.name + ' (άτομα)', c => pidKeys(c, picks(c).filter(x => x.block === b.id).flatMap(x => x.pids))));
    m.push(N('duty.be:' + b.id, G.duty, b.name + ' (κενές θέσεις)', c => postsOf(c.s.settings).filter(p => p.block === b.id).length - filled(c, p => p.block === b.id)));
  }
  // ---- Στελέχη (ΗΚΑΙ): κωλυόμενοι στις στήλες υπηρεσίας/ΕΥ…, απόντες στις στήλες αδειών…
  m.push(S('cadre.all', G.cadre, 'Στελέχη σε δύναμη', c => (cadreActive(c).length ? keys(cadreActive(c).map(x => ({ id: 0, cid: x.id }))) : hk(c).cadreN), 'Η λίστα Στελέχη· αν δεν την έχεις συμπληρώσει, οι αριθμοί των Ρυθμίσεων'));
  m.push(S('cadre.kol', G.cadre, 'Στελέχη κωλυόμενα', c => cadreKeys(c, HK_K.map(x => x[0])), 'Στελέχη στις στήλες κωλυομένων της ' + HKN + ' (υπηρεσία, ΕΥ, τιμωρημένοι…)'));
  m.push(S('cadre.apo', G.cadre, 'Στελέχη απόντα', c => cadreKeys(c, HK_A.map(x => x[0])), 'Στελέχη στις στήλες απόντων της ' + HKN + ' (άδειες, νοσοκομείο…)'));
  // ---- Οπλισμός (όπως η σελίδα Οπλισμός: σήμερα με την ώρα, άλλες μέρες όλα τα νούμερα της μέρας)
  const wm = (c: VCtx, f: WeaponFilter) => keys(c.s.people.filter(p => weaponMatch(f, p, winfo(c))));
  const outs = (c: VCtx) => memo(c, 'wout', () => outPeople(armPpl(c), winfo(c)));
  m.push(S('w.with', G.w, 'Δύναμη όπλων (σε δύναμη, με αριθμό όπλου)', c => wm(c, 'with')));
  for (const t of listOf(lists, 'weaponTypes')) m.push(S('w.type:' + t, G.w, 'Δύναμη όπλων: ' + t, c => keys(c.s.people.filter(p => weaponMatch('with', p, winfo(c)) && norm(p.wtype) === norm(t)))));
  m.push(S('w.type:', G.w, 'Δύναμη όπλων: χωρίς τύπο', c => keys(c.s.people.filter(p => weaponMatch('with', p, winfo(c)) && !norm(p.wtype)))));
  m.push(S('w.in', G.w, 'ΕΝΤΟΣ (στον οπλοβαστό)', c => keys(c.s.people.filter(p => p.active && weaponKey(p.weapon) && !isOut(winfo(c), p.id))), 'Με όπλο και όχι εκτός οπλοβαστού'));
  m.push(S('w.out', G.w, 'ΕΚΤΟΣ (σύνολο)', c => keys(outs(c)), 'Κινήσεις και ένοπλες υπηρεσίες, μία φορά ο καθένας, όπως η κεφαλίδα του Οπλισμού (και στελέχη σε ένοπλη υπηρεσία)'));
  m.push(S('w.out.man', G.w, 'ΕΚΤΟΣ με έξοδο όπλου (χειροκίνητη κίνηση)', c => keys(outs(c).filter(p => outReasonOf(winfo(c), p.id) !== AUTO_KEY))));
  m.push(S('w.out.duty', G.w, 'ΕΚΤΟΣ λόγω ένοπλης υπηρεσίας', c => keys(outs(c).filter(p => outReasonOf(winfo(c), p.id) === AUTO_KEY))));
  for (const r of listOf(lists, 'weaponOut')) m.push(S('w.out.r:' + r, G.w, 'ΕΚΤΟΣ λόγω «' + r + '»', c => keys(outs(c).filter(p => norm(outReasonOf(winfo(c), p.id)) === norm(r)))));
  m.push(S('w.without', G.w, 'Χωρίς όπλο (ένοπλοι κατά Σ.Ι.)', c => wm(c, 'without')));
  m.push(S('w.unarmed', G.w, 'Άοπλοι με όπλο', c => wm(c, 'unarmed')));
  m.push(S('w.dup', G.w, 'Ίδιος αριθμός ή ίδια θέση', c => wm(c, 'dup')));
  m.push(S('w.noseat', G.w, 'Χωρίς θέση στον οπλοβαστό', c => keys(c.s.people.filter(noSeat))));
  m.push(S('w.return', G.w, 'Να παραδώσουν (εκτός δύναμης με όπλο)', c => wm(c, 'return')));
  m.push(N('w.moves.out', G.w, 'Έξοδοι όπλων της μέρας', c => movesOn(c.s.weaponLog, c.d).filter(x => x.outDay === c.d).length));
  m.push(N('w.moves.in', G.w, 'Είσοδοι όπλων της μέρας', c => movesOn(c.s.weaponLog, c.d).filter(x => x.inDay === c.d).length));
  // ---- Σύνολα ΗΚΑΙ (ώρα ΗΚΑΙ, όπως το έντυπο): στρατιώτες και στελέχη, και ό,τι γράφεται με το χέρι
  const col = (c: VCtx, k: string) => Object.values(hk(c).rank).reduce((a, r) => a + (r.c[k] || 0), 0);
  m.push(N('hk.total', G.hk, HKN + ': Δύναμη', c => hk(c).total, 'Στρατιώτες και στελέχη, όπως η ' + HKN));
  m.push(N('hk.soldiers', G.hk, HKN + ': Στρατιώτες', c => hk(c).soldiers));
  m.push(N('hk.cadre', G.hk, HKN + ': Στελέχη', c => hk(c).cadreN));
  m.push(N('hk.kol', G.hk, HKN + ': Κωλυόμενοι', c => hk(c).kol, 'Άθροισμα των στηλών κωλυομένων της ' + HKN + ' (υπηρεσία, ΕΥ, τιμωρημένοι…): άλλος ορισμός από τους Κωλυόμενους της Δύναμης'));
  m.push(N('hk.apo', G.hk, HKN + ': Απόντες', c => hk(c).apo));
  m.push(N('hk.avail', G.hk, HKN + ': Διαθέσιμοι', c => hk(c).avail, 'Δύναμη μείον απόντες'));
  for (const [k, short, long] of HK_K) if (k !== 'bl') m.push(N('hk.k:' + k, G.hk, HKN + ' κωλυόμενοι: ' + (long || short), c => col(c, k)));
  for (const [k, , long] of HK_A) m.push(N('hk.a:' + k, G.hk, HKN + ' απόντες: ' + long, c => col(c, k)));
  m.push(N('hk.a:ab', G.hk, HKN + ': Μισθοτροφοδοτηθέντες (με το χέρι)', c => col(c, 'ab')));
  for (const r of hkRowList(lists)) m.push(N('hk.row:' + r, G.hk, HKN + ' γραμμή: ' + r + ' (δύναμη)', c => hk(c).rank[r]?.n || 0));
  MET_CACHE.set(s.settings, m);
  return m;
}
const BY_ID = new WeakMap<Metric[], Map<string, Metric>>();
export function metricOf(s: AppState, id: string): Metric | undefined {
  const l = metricsOf(s); let m = BY_ID.get(l); if (!m) { m = new Map(l.map(x => [x.id, x])); BY_ID.set(l, m); }
  return m.get(id);
}
export const metricLabel = (s: AppState, id: string) => metricOf(s, id)?.label || '(δεν υπάρχει πια)';
// Οι ομάδες με τη σειρά που φαίνονται στον κατάλογο
export function metricGroups(s: AppState): { group: string; items: Metric[] }[] {
  const out = new Map<string, Metric[]>();
  for (const m of metricsOf(s)) { const l = out.get(m.group); if (l) l.push(m); else out.set(m.group, [m]); }
  return [...out].map(([group, items]) => ({ group, items }));
}

// ------------------------------------------------------------------ φίλτρα
interface PInfo { cad: boolean; unit: string; room: number | null; rank: string; armed: boolean | null }
function index(c: VCtx): Map<string, PInfo> {
  return memo(c, 'idx', () => {
    const m = new Map<string, PInfo>(); const un = unarmedSet(c);
    for (const p of c.s.people) m.set('p' + p.id, { cad: false, unit: unitOf(p, c.s.settings), room: p.room ?? null, rank: p.rank, armed: !un.has(p.id) });
    for (const x of c.s.cadreList || []) m.set('c' + x.id, { cad: true, unit: '—', room: null, rank: x.rank, armed: null });
    return m;
  });
}
function applyFilter(c: VCtx, v: VSet, f: VFilter): VSet {
  const idx = index(c); const o = new Set<string>(); const rk = f.rank ? normGreek(f.rank) : '';
  v.forEach(k => {
    const i = idx.get(k); if (!i) return;
    if (f.who && (f.who === 'cadre') !== i.cad) return;
    if (f.unit != null && i.unit !== f.unit) return;
    if (f.room != null && i.room !== f.room) return;
    if (rk && normGreek(i.rank) !== rk) return;
    if (f.arm && i.armed !== (f.arm === 'armed')) return;
    o.add(k);
  });
  return o;
}
// Ποιες επιλογές φίλτρου υπάρχουν (ουλαμοί, θάλαμοι, βαθμοί των ατόμων της εφαρμογής)
export function filterChoices(s: AppState): { units: string[]; rooms: number[]; ranks: string[] } {
  const units = new Set<string>(), rooms = new Set<number>(), ranks = new Set<string>();
  for (const p of s.people) { if (!p.active) continue; const u = unitOf(p, s.settings); if (u !== '—') units.add(u); if (p.room != null) rooms.add(p.room); if (p.rank) ranks.add(p.rank); }
  for (const x of s.cadreList || []) if (x.active && x.rank) ranks.add(x.rank);
  return { units: [...units], rooms: [...rooms].sort((a, b) => a - b), ranks: [...ranks].sort((a, b) => a.localeCompare(b, 'el')) };
}
export function filterText(f?: VFilter): string {
  if (!hasFilter(f)) return '';
  return [f.unit, f.room != null && 'Θ' + f.room, f.rank, f.arm === 'armed' ? 'ένοπλοι' : f.arm === 'unarmed' ? 'άοπλοι' : '', f.who === 'soldiers' ? 'στρατιώτες' : f.who === 'cadre' ? 'στελέχη' : ''].filter(Boolean).join(', ');
}

// ------------------------------------------------------------------ υπολογισμός
// Άτομα: οι όροι με + ενώνονται, από αυτούς φεύγουν όσοι είναι σε όρο με − (κάθε άτομο μία φορά, ανεξάρτητα από τη σειρά)· αριθμοί: προσθέτονται
// και αφαιρούνται. Αν δεν υπάρχει όρος + με άτομα, οι όροι − αφαιρούνται ως πλήθος (π.χ. Δύναμη ΗΚΑΙ − Απόντες).
export function evalValue(s: AppState, d: ISODate, at: number, expr: VExpr, cx?: VCtx): number {
  const c = cx || vctx(s, d, at);
  const plus = new Set<string>(), neg = new Set<string>(); let hasPlus = false, num = 0;
  for (const t of expr) {
    const m = metricOf(s, t.metric); if (!m) continue;
    let v = m.fn(c);
    if (typeof v === 'number') { num += t.sign === '-' ? -v : v; continue; }
    if (hasFilter(t.filter)) v = applyFilter(c, v, t.filter);
    if (t.sign === '-') v.forEach(k => neg.add(k)); else { hasPlus = true; v.forEach(k => plus.add(k)); }
  }
  if (!hasPlus) return num - neg.size;
  let n = 0; plus.forEach(k => { if (!neg.has(k)) n++; });
  return n + num;
}
export const fmtOf = (r: Pick<VRow, 'fmt' | 'percentOf'>): VFmt => r.fmt ?? (r.percentOf?.length ? 'pct' : 'int');
// Η τιμή της γραμμής: αριθμός, ή (με «ως ποσοστό του…») κλάσμα 0–1· null όταν ο παρονομαστής είναι 0
export function rowValue(s: AppState, d: ISODate, at: number, row: VRow, cx?: VCtx): number | null {
  const c = cx || vctx(s, d, at);
  const n = evalValue(s, d, at, row.expr, c);
  if (!row.percentOf?.length) return n;
  const den = evalValue(s, d, at, row.percentOf, c);
  return den ? n / den : null;
}
export function valueText(v: number | null, fmt: VFmt): string {
  if (v == null) return '—';
  if (fmt === 'pct') return Math.round(v * 100) + '%';
  if (fmt === 'pct1') return (Math.round(v * 1000) / 10).toFixed(1).replace('.', ',') + '%';
  return String(Math.round(v * 100) / 100).replace('.', ',');
}
// id, tag και θέση: για να μπει στη θέση του (Φάση 3) και στα κελιά {ΟΝΟΜΑ} του Excel
export interface ValueOut { id: string; title: string; rows: { label: string; v: number | null; fmt: VFmt; tag?: string }[]; lay?: TabLay; spot?: Spot; tagsOnly?: boolean }
// Όλοι οι πίνακες τιμών ενός εντύπου για τη μέρα d και στιγμή at (λεπτά), με κοινά αποτελέσματα μετρήσεων
export function evalTables(s: AppState, d: ISODate, at: number, vals: ValueTable[] | undefined, today: ISODate = d): ValueOut[] {
  const c = vctx(s, d, at, today);
  return valsUsed(vals).map(t => ({ id: t.id, title: (t.title || '').trim(), rows: t.rows.map(r => ({ label: r.label.trim(), v: rowValue(s, d, at, r, c), fmt: fmtOf(r), ...(rowTag(r) ? { tag: rowTag(r) } : {}) })),
    ...(t.lay ? { lay: t.lay } : {}), ...(t.spot ? { spot: t.spot } : {}), ...(t.tagsOnly ? { tagsOnly: true } : {}) }));
}
// «ΚΑ + Τιμητική + ΔΝ» για τη λίστα και τη συμβουλή
export function exprText(s: AppState, e: VExpr): string {
  return e.map((t, i) => (i ? (t.sign === '-' ? ' − ' : ' + ') : t.sign === '-' ? '−' : '') + metricLabel(s, t.metric) + (hasFilter(t.filter) ? ' (' + filterText(t.filter) + ')' : '')).join('');
}
// Μετρήσεις των πινάκων που δεν υπάρχουν πια (π.χ. υπηρεσία που σβήστηκε από τις Ρυθμίσεις)
export function valsMissing(s: AppState, vals: ValueTable[] | undefined): string[] {
  const out = new Set<string>();
  for (const t of valsUsed(vals)) for (const r of t.rows) for (const x of [...r.expr, ...(r.percentOf || [])]) if (!metricOf(s, x.metric)) out.add(x.metric);
  return [...out];
}
