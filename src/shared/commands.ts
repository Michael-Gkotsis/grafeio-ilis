// Όλες οι ενέργειες του χρήστη ως καθαρές συναρτήσεις: (κατάσταση, εντολή) → νέα κατάσταση + εγγραφή ιστορικού.
// Τρέχουν στο main process· η βάση αποθηκεύει τη διαφορά και την κρατά για αναίρεση (08 §3.7).
import { HK } from './unit';
import { addDays, dayName, daysBetween, dm, DOW_FULL, type ISODate } from './dates';
import { norm, normGreek, upper } from './text';
import { noPending, TYPES, RECORD_CATS, WEEK, CAP_ACC, OUT_NOTE, PUN_KINDS, KIND_NAME, blocksOf, cleanShift, everyBlock, phaseBase, phaseList, phaseName, shiftGroups, withBlocks, postTxt, shortName, fullName, type AppState, type Baseline, type Cadre, type CadreAbs, type Note, type BlockDef, type ShiftDef, type CapKey, type DutyKind, type HkaiManual, type Person, type PersonRequest, type Phase, type Rules, type Settings, type Skip, type Status, type TypeKey, type WeaponMove } from './domain';
import { codeErrors, freeCode } from './codes';
import { mergeDuties, type DutyCell } from './sources';
import { seatMap, skipTxt, capBlock, capCell, capCols, dutyBlock, lastResort, swapCheck, fillDay, outBlock, personMap, planStatusChange, postBy, postOf, ruleBlock, isRecordExpiredOn, sameMed, splitOut, outCutTo, planTo, canOpen, statusesOn, statusWarn, type StatusCmd } from './rules';
import { cadreAbsOf, guessHk, hkClaimOf, hkRowList, itemKey, itemName, listRows, rankTxt, statusLbl, weaponBack, withOrigin, type HkRowDef, type ListId, type UserLists } from './ranks';
import { insertCadre, isManualOrder } from './cadre';
import { hasTimes, mins, normTime, rangeHm, timeNames, timesTxt } from './hours';
import { fitDeprivations, isDeprivation, punLbl, servedDays } from './punish';
import { normPos, normRack, normWeapon } from './weapons';
import { isSat, isWk, WK } from './weekend';
import { NOTE_MAX, noteHead, noteWho, normNote } from './notes';

export type Command =
  | { t: 'declare'; cmd: StatusCmd }
  // πολλά ιατρικά μαζί για τους ίδιους, με τις ίδιες ημερομηνίες (Michael, 18/10): καθένα σε δική του γραμμή, μία αναίρεση
  | { t: 'declareMany'; cmds: StatusCmd[] }
  // wk: «ΔΝ ΣΚ» το Σάββατο (ΔΝ και εξοδούχος την Κυριακή)· notes: παρατηρήσεις της μέρας («ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)»), κενό = σβήνει
  | { t: 'outs'; date: ISODate; changes: { pid: number; from: TypeKey | null; to: TypeKey | null; wk?: boolean }[]; notes?: { pid: number; note: string }[]; force?: boolean }
  | { t: 'endStatus'; id: string }
  | { t: 'saveCadre'; cadre: Omit<Cadre, 'id' | 'active'> & { id?: string; active?: boolean } }
  | { t: 'deleteCadre'; id: string }
  | { t: 'orderCadre'; ids: string[] }   // η σειρά των στελεχών, όλα τα id με τη νέα σειρά
  | { t: 'addCadreAbs'; abs: Omit<CadreAbs, 'id'> & { id?: string }; replace?: boolean }   // id: αλλαγή · replace: κόβει όσες πέφτουν στις ίδιες μέρες
  | { t: 'deleteCadreAbs'; id: string }
  | { t: 'setPunInfo'; id: string; by: string; reason: string; on: ISODate }
  | { t: 'setTimes'; id: string; fromTime: string; toTime: string }
  | { t: 'addRequest'; req: Omit<PersonRequest, 'id'> }
  | { t: 'updateRequest'; req: PersonRequest }
  | { t: 'deleteRequest'; id: string }
  // αίτηση άδειας: ok = εγκρίθηκε (γίνεται άδεια), false = απορρίφθηκε, null = αναίρεση της απόφασης
  | { t: 'decideRequest'; id: string; ok: boolean | null }
  | { t: 'deleteStatus'; id: string }
  // σημειώσεις του γραφείου (shared/notes.ts): who χωρίς pids/cids = γενική· μία σημείωση δένεται σε πολλά άτομα· rem '' = χωρίς υπενθύμιση
  | { t: 'addNote'; note: { text: string; pids?: number[]; cids?: string[]; rem?: ISODate; star?: boolean } }
  | { t: 'editNote'; id: string; patch: { text?: string; who?: { pids?: number[]; cids?: string[] } | null; rem?: ISODate | ''; star?: boolean } }
  | { t: 'doneNote'; id: string; done: boolean }
  | { t: 'deleteNote'; id: string }
  // διόρθωση ιατρικού/ποινής που μπήκε λάθος: φεύγει η παλιά και γίνεται η δήλωση από την αρχή (ίδιοι έλεγχοι), μία αναίρεση
  | { t: 'replaceStatus'; id: string; cmds: StatusCmd[] }
  // Άδεια (κανονική, τιμητική, αναρρωτική): ακύρωση = φεύγει όλη (δεν έφυγε ή μπήκε λάθος)· διακοπή = γύρισε νωρίτερα, στη μέρα και ώρα που λες
  | { t: 'cancelLeave'; id: string }
  | { t: 'endLeave'; id: string; date: ISODate; time: string }
  | { t: 'approvePun'; id: string }
  | { t: 'assign'; date: ISODate; k: string; pid: number | null; force?: string; move?: string }
  | { t: 'autofill'; date: ISODate }
  | { t: 'clearDay'; date: ISODate }
  | { t: 'setRules'; rules: Rules; text: string }
  // v: off = δεν κάνει (λοχίας), on = ρητά κάνει (και παρά Σ.Ι./πόστο), clear = ό,τι λένε Σ.Ι. και πόστο
  | { t: 'setCap'; pid: number; key: CapKey; v: 'off' | 'on' | 'clear' }
  | { t: 'setOffDays'; pid: number; days: number[] }
  // εφάπαξ εξαίρεση από υπηρεσίες από–έως (id: αλλαγή υπάρχουσας)· delSkip: σβήσιμο
  | { t: 'setSkip'; pid: number; id?: string; from: ISODate; to: ISODate; why?: string }
  | { t: 'delSkip'; pid: number; id: string }
  // συντομεύσεις της καρτέλας (π.χ. «Όχι ΣΚ», «Μόνο μαγειρεία»): ίδια δεδομένα με τα κουτάκια, μία αναίρεση.
  // off: είδη που δεν κάνει (από τον λοχία)· on: είδη που ξανακάνει (φεύγει η εξαίρεση του λοχία)· reset: χωρίς καμία εξαίρεση του λοχία
  | { t: 'setDutyProfile'; pid: number; off?: DutyKind[]; on?: DutyKind[]; days?: number[]; reset?: boolean; text: string }
  | { t: 'setSettings'; settings: Partial<Settings>; text: string }
  // γραμμές της ΗΚΑΙ που πρόσθεσες: τα στελέχη με βαθμό που μαζεύει μια γραμμή πηγαίνουν σε αυτήν (και φεύγουν όταν σβηστεί)
  | { t: 'setHkRows'; rows: HkRowDef[]; names?: Record<string, string>; text: string }
  | { t: 'printed'; date: ISODate; at: string; files: string[] }
  | { t: 'importPeople'; rows: ImportRow[]; source: string; deactivateMissing: boolean }
  | { t: 'updatePerson'; person: Person }
  | { t: 'addPerson'; person: NewPerson }
  | { t: 'addPeople'; people: NewPerson[] }
  | { t: 'setBaseline'; pid: number; baseline: Baseline }
  | { t: 'setBaselines'; baselines: Record<number, Baseline> }
  | { t: 'removeDutyLog'; date: ISODate; pid: number; kind: DutyKind }
  | { t: 'setHkaiManual'; date: ISODate; manual: HkaiManual }
  | { t: 'setPhase'; phase: Phase }
  | { t: 'addPhase'; name: string; from: Phase }
  | { t: 'renamePhase'; id: Phase; name: string }
  | { t: 'delPhase'; id: Phase }
  | { t: 'addBlock'; phase: Phase; name: string; kind?: DutyKind; armed: boolean; n: number; hrs: string; off?: boolean; shift?: ShiftDef | null }
  | { t: 'editBlock'; phase: Phase; id: string; name: string; n: number; hrs: Record<string, string>; move?: number; codes?: Record<string, string>; shift?: ShiftDef | null }
  | { t: 'setBlock'; phase: Phase; id: string; patch: Partial<Pick<BlockDef, 'armed' | 'hidden'>> }
  | { t: 'autofillRange'; dates: ISODate[] }
  | { t: 'swapPosts'; date: ISODate; a: string; b: string; force?: string }
  | { t: 'importRecords'; adds: Omit<Status, 'id'>[]; updates: { id: string; patch: Partial<Status> }[]; deletes?: string[]; source: string; what: string }
  | { t: 'setPeopleFields'; changes: { pid: number; patch: Partial<Pick<Person, 'post' | 'active' | 'notes'>> }[]; source: string; what: string }
  | { t: 'importCaps'; changes: { pid: number; kind: CapKey; reason: string | null }[]; source: string }
  | { t: 'importDuties'; days: Record<ISODate, DutyCell[]>; source: string }
  | { t: 'expire' }
  | { t: 'extendOpen' }
  | { t: 'setNightTraining'; date: ISODate; on: boolean }
  // ΗΚΑΙ 1. ΕΓΓΡΑΦΕΣ / 2. ΔΙΑΓΡΑΦΕΣ: άλλη μέρα, ή null = να μη γραφτεί
  | { t: 'setPersonMove'; pid: number; field: 'inOn' | 'outOn'; date: ISODate | null }
  // Οπλισμός: αριθμοί όπλων, πολλοί μαζί με μία αναίρεση (επικόλληση στήλης, μεταφορά από άλλον). '' = χωρίς όπλο / παρέδωσε
  | { t: 'setWeapons'; changes: WeaponChange[]; what?: string }
  // Έξοδος και είσοδος όπλων από τον οπλοβαστό (Michael, 18/10). Ώρα ΩΩ:ΛΛ (η φόρμα βάζει την τωρινή). Είσοδος χωρίς reason:
  // ο λόγος εισαγωγής κάθε εξόδου από τη λίστα (ΕΚΠ → ΛΗΞ ΕΚΠ)
  | { t: 'weaponOut'; pids: number[]; reason: string; day: ISODate; time: string; note?: string }
  | { t: 'weaponIn'; ids: string[]; day: ISODate; time: string; reason?: string }
  | { t: 'editWeaponMove'; id: string; patch: Partial<Pick<WeaponMove, 'reason' | 'outDay' | 'outTime' | 'inDay' | 'inTime' | 'inReason' | 'note'>> }
  | { t: 'deleteWeaponMove'; id: string };

// Οπλισμός: μόνο τα πεδία που δόθηκαν αλλάζουν (αριθμός, τύπος, θέση οπλοβαστού)· κενό = σβήνεται
export interface WeaponChange { pid: number; weapon?: string; wtype?: string; rack?: string; wpos?: string }

// Πόστο, προσκολλημένος, σημειώσεις και «σε δύναμη» μόνο όταν το αρχείο έχει πηγή γι' αυτά· ό,τι λείπει μένει όπως είναι
export interface ImportRow extends Omit<Person, 'id' | 'active' | 'post' | 'attached' | 'notes'> { active?: boolean; post?: string | null; attached?: boolean; notes?: string }

// Νέος στρατιώτης από την εφαρμογή: ό,τι γράφει η φόρμα (το id, το «σε δύναμη» και το «νέος» τα βάζει η εντολή)
export type NewPerson = Omit<Person, 'id' | 'active' | 'added'>;

export interface Ctx { today: ISODate; newId: () => string }
export interface Result { state: AppState; text: string; files: string[]; source?: 'app' | 'auto' | 'import' | 'excel'; undoable?: boolean; extra?: string[] }

const who = (s: AppState, pids: number[]) => {
  const pm = personMap(s.people);
  return pids.length === 1 ? shortName(pm.get(pids[0])!) : pids.length + ' άτομα';
};
// Σημειώσεις: καθαρές εντολές χωρίς Excel (files: [])· το κείμενο στο Ιστορικό είναι η αρχή της σημείωσης
function noteCmd(s: AppState, c: Extract<Command, { t: 'addNote' | 'editNote' | 'doneNote' | 'deleteNote' }>, ctx: Ctx): Result {
  const notes = s.notes || [];
  const uniq = <T,>(a: T[] | undefined): T[] => [...new Set(a || [])];
  const setWho = (n: Note, w: { pids?: number[]; cids?: string[] }) => {
    const pids = uniq(w.pids); const cids = uniq(w.cids);
    if (pids.some(id => !s.people.some(p => p.id === id))) throw new Error('Δεν βρέθηκε ο στρατιώτης');
    if (cids.some(id => !s.cadreList.some(x => x.id === id))) throw new Error('Δεν βρέθηκε το στέλεχος');
    delete n.pids; delete n.cids; delete n.pid; delete n.cid;
    if (pids.length) n.pids = pids; if (cids.length) n.cids = cids;
  };
  const checkRem = (rem: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(rem)) throw new Error('Η ημερομηνία υπενθύμισης δεν είναι σωστή'); };
  const text = (raw: string) => { const t = (raw || '').replace(/\r\n/g, '\n').trim(); if (!t) throw new Error('Γράψε τη σημείωση'); if (t.length > NOTE_MAX) throw new Error('Η σημείωση είναι πολύ μεγάλη (το πολύ ' + NOTE_MAX + ' γράμματα)'); return t; };
  const label = (n: Note) => { const w = noteWho(s, n); return (w.kind === 'gen' ? '' : ' (' + w.label + ')') + ': «' + noteHead(n.text) + '»'; };
  if (c.t === 'addNote') {
    const x = c.note; const n: Note = { id: 'n' + ctx.newId(), text: text(x.text), at: ctx.today };
    setWho(n, x);
    if (x.rem) { checkRem(x.rem); if (x.rem < ctx.today) throw new Error('Η υπενθύμιση είναι σε μέρα που πέρασε'); n.rem = x.rem; }
    if (x.star) n.star = true;
    return { state: { ...s, notes: [...notes, n] }, text: 'Σημείωση' + label(n) + (n.rem ? ' · υπενθύμιση ' + dm(n.rem) : ''), files: [] };
  }
  const old = notes.find(x => x.id === c.id); if (!old) throw new Error('Δεν βρέθηκε η σημείωση');
  const put = (n: Note, t: string): Result => ({ state: { ...s, notes: notes.map(x => (x === old ? n : x)) }, text: t, files: [] });
  if (c.t === 'deleteNote') return { state: { ...s, notes: notes.filter(x => x !== old) }, text: 'Σβήστηκε σημείωση' + label(old), files: [] };
  if (c.t === 'doneNote') {
    if (!!old.done === c.done) return { state: s, text: '', files: [] };
    const n = { ...old }; if (c.done) n.done = ctx.today; else delete n.done;
    return put(n, (c.done ? 'Ολοκληρώθηκε σημείωση' : 'Ξανάνοιξε σημείωση') + label(old));
  }
  const p = c.patch; const n: Note = normNote(old);
  if (p.text !== undefined) n.text = text(p.text);
  if (p.who !== undefined) {
    setWho(n, p.who || {});
  }
  if (p.rem !== undefined) { if (p.rem) { checkRem(p.rem); if (p.rem !== old.rem && p.rem < ctx.today) throw new Error('Η υπενθύμιση είναι σε μέρα που πέρασε'); n.rem = p.rem; } else delete n.rem; }
  if (p.star !== undefined) { if (p.star) n.star = true; else delete n.star; }
  if (JSON.stringify(n) === JSON.stringify(old)) return { state: s, text: '', files: [] };
  return put(n, 'Άλλαξε σημείωση' + label(n) + (n.rem !== old.rem ? (n.rem ? ' · υπενθύμιση ' + dm(n.rem) : ' · χωρίς υπενθύμιση') : ''));
}
// Οι βάρδιες μιας υπηρεσίας όπως αποθηκεύονται (cleanShift). Λίστα που δεν έχει ούτε μία σωστή βάρδια δεν γίνεται σιωπηλά «κάθε τόσες ώρες»
function blockShift(sh: ShiftDef | null | undefined, count: number): ShiftDef | null {
  const r = cleanShift(sh, count);
  if (sh?.list?.length && !r?.list) throw new Error('Οι δικές μου βάρδιες δεν είναι σωστές: κάθε βάρδια θέλει Από και Ως, διαφορετικές ώρες');
  return r;
}
// θέσεις μιας υπηρεσίας χωρίς κωδικό (νέες, ή σβησμένος κωδικός): ο επόμενος ελεύθερος (Υ1, Υ2…)
function fillCodes(settings: Settings, phase: Phase, id: string): Settings {
  let st = settings;
  for (;;) {
    const list = blocksOf(st, phase); const i = list.findIndex(x => x.id === id); const b = list[i];
    const j = b ? b.posts.findIndex(p => !p.code) : -1; if (j < 0) return st;
    const posts = b.posts.map((p, q) => (q === j ? { ...p, code: freeCode(st, b.kind, j + 1) } : p));
    st = withBlocks(st, phase, list.map((x, q) => (q === i ? { ...b, posts } : x)));
  }
}
// Όνομα δικού σου εντύπου υπηρεσιών: κεφαλαία (γράφεται στο όνομα του Excel), όχι ίδιο με άλλο, όχι «ΦΡΟΥΡΑ …»
function phaseNameOk(st: Settings, raw: string, self?: Phase): string {
  const name = upper(raw).replace(/\s+/g, ' ').replace(/^ΦΡΟΥΡΑ\s+/, '').trim();
  if (!name) throw new Error('Γράψε όνομα για το έντυπο υπηρεσιών');
  if (/[\\/:*?"<>|]/.test(name)) throw new Error('Το όνομα μπαίνει στο όνομα του αρχείου Excel: χωρίς \\ / : * ? " < > |');
  if (phaseList(st).some(x => x.id !== self && norm(x.name) === norm(name))) throw new Error('Υπάρχει ήδη έντυπο υπηρεσιών ' + name);
  return name;
}
// Γιατί δεν διαγράφεται ένα δικό σου έντυπο υπηρεσιών ('' = διαγράφεται): όχι αυτό που ισχύει, όχι αν υπηρεσίες που
// έχει μόνο αυτό έχουν μπει σε κάποια μέρα (θα χανόταν το όνομά τους από το ιστορικό)
export function phaseDelWhy(s: AppState, id: Phase): string {
  if ((s.settings.phase || 'sven') === id) return 'Ισχύει τώρα: διάλεξε πρώτα άλλο έντυπο στις Θέσεις';
  const mine = new Set(blocksOf(s.settings, id).flatMap(b => b.posts.map(p => p.k)));
  const rest = { ...s.settings, phases: (s.settings.phases || []).filter(x => x.id !== id) };
  for (const b of everyBlock(rest)) for (const p of b.posts) mine.delete(p.k);
  if (!mine.size) return '';
  const used = Object.values(s.guards).some(g => Object.keys(g).some(k => mine.has(k)));
  return used ? 'Έχει υπηρεσίες που έγιναν και υπάρχουν μόνο σε αυτό· μένει για το ιστορικό' : '';
}
const setGuard = (s: AppState, date: ISODate, k: string, pid: number | null): AppState => {
  const g = { ...(s.guards[date] || {}) };
  if (pid) g[k] = pid; else delete g[k];
  return { ...s, guards: { ...s.guards, [date]: g } };
};
// «αιτείται μετάθεση.» → «μετάθεση»: η πρόταση της ΗΚΑΙ βάζει μόνη της το «αιτείται» και την τελεία
export const reqText = (t: string) => t.trim().replace(/^αιτ[εέ][ιί]ται\s+/i, '').replace(/[.\s]+$/, '').trim();
// Οπλισμός: λόγος με κεφαλαία, ώρα ΩΩ:ΛΛ (υποχρεωτική)
const wReason = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
function wTime(v: unknown, what: string): string {
  const t = normTime(v); if (!t) throw new Error('Γράψε την ώρα ' + what + ', π.χ. 08:15'); return t;
}
const leaveFile = (st: Status) => (st.type === 'LEAVE' || st.type === 'HON' ? 'Άδειες' : 'Ιατρικά');
const range = (from: ISODate, to: ISODate) => (from === to ? dm(from) : dm(from) + '–' + dm(to));

// Ώρες: μόνο στα είδη με ώρες (άδειες, νοσοκομείο, ΣΤΕΠ, hours.ts), σε μορφή ΩΩ:ΛΛ· την ίδια μέρα η επιστροφή μετά την αναχώρηση. Χωρίς λήξη δεν έχει ώρα επιστροφής.
function checkTimes(c: { type: TypeKey; from: ISODate; to: ISODate; fromTime?: string; toTime?: string; open?: boolean }): { fromTime?: string; toTime?: string } {
  if (!hasTimes(c.type)) return {};
  const f = normTime(c.fromTime), t = c.open ? '' : normTime(c.toTime), n = timeNames(c.type);
  if (f == null) throw new Error('Η ώρα ' + n.fromG + ' «' + c.fromTime + '» δεν διαβάζεται. Γράψε π.χ. 14:00.');
  if (t == null) throw new Error('Η ώρα ' + n.toG + ' «' + c.toTime + '» δεν διαβάζεται. Γράψε π.χ. 22:00.');
  if (f && t && c.from === c.to && mins(t) <= mins(f)) throw new Error('Την ίδια μέρα η ' + n.to + ' (' + t + ') πρέπει να είναι μετά την ' + n.from + ' (' + f + ')');
  return { ...(f ? { fromTime: f } : {}), ...(t ? { toTime: t } : {}) };
}

// Μετά από κάθε ενέργεια: η λήξη κάθε στέρησης εξόδου ξαναβγαίνει από τις ημέρες της (υπηρεσίες, βραδινή εκπαίδευση)
// Νέος βαθμός, προέλευση ή Ο/Σ γραμμένος με το χέρι στη φόρμα του στρατιώτη μένει στις Λίστες (Ρυθμίσεις › Λίστες), για να
// προτείνεται από εδώ και πέρα (Michael, 17/10: «έτοιμη η εισαγωγή νέου βαθμού και να την αποθηκεύει»).
// Στη διόρθωση μόνο αν άλλαξε: όσα ήρθαν από το Δυναμολόγιο προτείνονται έτσι κι αλλιώς.
function rememberChoices(st: Settings, p: Person, old?: Person): Settings {
  let lists = st.lists;
  for (const [id, v, was] of [['soldierRanks', p.rank, old?.rank], ['origins', p.origin, old?.origin], ['specs', p.spec, old?.spec]] as [ListId, string | undefined, string | undefined][]) {
    const n = itemName(v || '', id); if (!n || (old && itemKey(n) === itemKey(was || ''))) continue;
    if (/[,"]/.test(n) || listRows(lists, id).some(r => itemKey(r.name) === itemKey(n))) continue;
    lists = { ...lists, [id]: { ...(lists?.[id] || {}), add: [...(lists?.[id]?.add || []), { name: n }] } };
  }
  return lists === st.lists ? st : { ...st, lists };
}

// Νέος στρατιώτης όπως τον γράφει η εισαγωγή του Δυναμολογίου (roster.ts), ώστε να ταιριάζει μετά· «ΕΠΟΠ ΣΤΡ» στον
// βαθμό γίνεται βαθμός ΣΤΡ με προέλευση ΕΠΟΠ
export function shapePerson(x: NewPerson, id: number, lists?: UserLists): Person {
  const t = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const p: Person = withOrigin({
    ...x, id, active: true, added: true,
    rank: normGreek(t(x.rank)), spec: normGreek(t(x.spec)), last: norm(t(x.last)), first: norm(t(x.first)), father: norm(t(x.father)),
    asm: t(x.asm).replace(/\s/g, ''), phone: t(x.phone).replace(/\s/g, ''), si: normGreek(t(x.si)), essos: t(x.essos),
    room: x.room != null && x.room > 0 ? Math.floor(x.room) : null, post: t(x.post) ? norm(t(x.post)) : null, role: t(x.role) ? norm(t(x.role)) : null,
    attached: !!x.attached, notes: t(x.notes)
  }, lists);
  if (!x.weapon?.trim()) delete p.weapon; else p.weapon = x.weapon.trim();
  if (!x.siCat?.trim()) delete p.siCat; else p.siCat = normGreek(t(x.siCat));
  if (!p.dn) delete p.dn;
  if (!p.offDays?.length) delete p.offDays;
  if (!(Number(x.monthMax) > 0)) delete p.monthMax; else p.monthMax = Math.floor(Number(x.monthMax));
  return p;
}
// διπλός: ίδιο ΑΣΜ, ή ίδιο ονοματεπώνυμο και πατρώνυμο
export const twinText = (twin: Person, asm: string) => 'Υπάρχει ήδη ' + (twin.asm && twin.asm === asm ? 'άτομο με ΑΣΜ ' + asm + ': ' : 'ο ') + rankTxt(twin) + ' ' + twin.last + ' ' + twin.first + (twin.father ? ' του ' + twin.father : '') + (twin.active ? '' : ' (εκτός δύναμης)');
function makePerson(s: AppState, x: NewPerson): Person {
  const p = shapePerson(x, s.people.reduce((a, y) => Math.max(a, y.id), 0) + 1, s.settings.lists);
  if (!p.last || !p.first) throw new Error('Γράψε επώνυμο και όνομα');
  const twin = (p.asm && s.people.find(y => y.asm === p.asm)) || s.people.find(y => personKey(y) === personKey(p));
  if (twin) throw new Error(twinText(twin, p.asm));
  return p;
}

// Εγγραφές και διαγραφές της ΗΚΑΙ (Michael, 17/10): όποιος βγαίνει εκτός δύναμης παίρνει τη σημερινή μέρα στο outOn
// (φεύγει αν ξαναμπεί σε δύναμη)· ο «Νέος στρατιώτης» και οι νέες γραμμές του Δυναμολογίου στο inOn. Η πρώτη εισαγωγή
// (χωρίς κανέναν σε δύναμη πριν) δεν είναι εγγραφές.
function stampMoves(prev: AppState, next: AppState, c: Command, today: ISODate): AppState {
  if (prev.people === next.people) return next;
  const before = new Map(prev.people.map(p => [p.id, p]));
  const joins = (c.t === 'addPerson' || c.t === 'addPeople' || c.t === 'importPeople') && prev.people.some(p => p.active);
  let out: Person[] | null = null;
  next.people.forEach((p, i) => {
    const b = before.get(p.id); let q: Person | null = null;
    if (!b) { if (joins && p.active && !p.inOn) q = { ...p, inOn: today }; }
    else if (b.active && !p.active && !p.outOn) q = { ...p, outOn: today };
    else if (!b.active && p.active && p.outOn) { q = { ...p }; delete q.outOn; }
    if (q) { out = out || [...next.people]; out[i] = q; }
  });
  return out ? { ...next, people: out } : next;
}
export function apply(s: AppState, c: Command, ctx: Ctx): Result {
  const r = run(s, c, ctx);
  const state = fitDeprivations(noPending(stampMoves(s, r.state, c, ctx.today)));
  return state === r.state ? r : { ...r, state, files: r.files.includes('Ποινές') ? r.files : [...r.files, 'Ποινές'] };
}
function run(s: AppState, c: Command, ctx: Ctx): Result {
  const pm = seatMap(s);   // στρατιώτες και στελέχη με υπηρεσίες (ΕΠΟΠ/ΟΒΑ)
  switch (c.t) {
    case 'declare': {
      const { cmd } = c; const plan = planStatusChange(s, cmd, ctx.today);
      if (!cmd.pids.length) throw new Error('Δεν διάλεξες άτομο');
      if (cmd.open && !canOpen(cmd.type)) throw new Error('«Χωρίς λήξη» δηλώνονται μόνο ιατρικά, ΣΤΕΠ και νοσοκομείο');
      // χωρίς λήξη: το «έως» είναι σήμερα (ή το «από») και προχωρά μόνο του κάθε μέρα (extendOpen)
      const open = !!cmd.open; const to = open ? (cmd.from > ctx.today ? cmd.from : ctx.today) : cmd.to;
      if (!open && cmd.to < cmd.from) throw new Error('Το «έως» είναι πριν από το «από»');
      const tm = checkTimes({ ...cmd, open });
      if (plan.blocked.length && !cmd.force) { const b = plan.blocked[0]; throw new Error(shortName(pm.get(b.pid)!) + ' δεν βγαίνει έξοδο ' + dm(b.date) + ': ' + b.reason); }
      // η ίδια δήλωση δεύτερη φορά (π.χ. διπλό κλικ): δεν γράφεται διπλή
      const twin = s.statuses.find(x => cmd.pids.includes(x.pid) && x.type === cmd.type && x.from === cmd.from && (open ? !!x.open : !x.open && x.to === cmd.to) && (TYPES[x.type].cat !== 'med' || sameMed(x, cmd, s.settings.lists)));
      const when = open ? 'από ' + dm(cmd.from) + ' χωρίς λήξη' : range(cmd.from, cmd.to);
      if (twin) throw new Error(shortName(pm.get(twin.pid)!) + ' έχει ήδη ' + (cmd.type === 'PUN' ? 'την ίδια ποινή' : statusLbl(cmd, s.settings.lists)) + ' ' + when);
      const drop = new Set(plan.cancels.map(x => x.id));
      let next: AppState = {
        ...s,
        statuses: [...s.statuses.filter(x => !drop.has(x.id)), ...plan.cancels.flatMap(x => splitOut(x, cmd.from, outCutTo(s, planTo(cmd)), ctx.newId)), ...cmd.pids.map(pid => {
          const st: Status = { id: ctx.newId(), pid, type: cmd.type, from: cmd.from, to };
          if (open) st.open = true;
          if (cmd.note) st.note = cmd.note;
          if (cmd.kind) st.kind = cmd.kind;
          Object.assign(st, tm);
          if (cmd.type === 'PUN') { st.kind = cmd.kind || PUN_KINDS[0]; if (cmd.by?.trim()) st.by = cmd.by.trim(); if (cmd.reason?.trim()) st.reason = cmd.reason.trim(); if (cmd.on) st.on = cmd.on; }
          if (isDeprivation(st)) st.days = daysBetween(cmd.from, cmd.to);   // οι ημέρες της ποινής· το «έως» μετακινείται στο apply
          return st;
        })]
      };
      plan.conflicts.forEach(x => { next = setGuard(next, x.date, x.k, null); });
      const verb = cmd.type === 'PUN' ? 'Ποινή (' + punLbl(cmd.kind || PUN_KINDS[0]) + ')' : 'Δηλώθηκε ' + statusLbl(cmd, s.settings.lists);
      return { state: next, text: verb + ' ' + when + ': ' + who(s, cmd.pids), files: plan.files.map(f => f.fn) };
    }
    case 'declareMany': {
      if (!c.cmds.length) throw new Error('Δεν διάλεξες κατάσταση');
      let next = s; const files: string[] = [], texts: string[] = [];
      for (const cmd of c.cmds) { const r = run(next, { t: 'declare', cmd }, ctx); next = r.state; files.push(...r.files); texts.push(r.text); }
      const c0 = c.cmds[0];
      const text = c.cmds.length === 1 ? texts[0] : 'Δηλώθηκαν ' + c.cmds.map(x => statusLbl(x, s.settings.lists)).join(' + ') + ' ' + (c0.open ? 'από ' + dm(c0.from) + ' χωρίς λήξη' : range(c0.from, c0.to)) + ': ' + who(s, c0.pids);
      return { state: next, text, files: [...new Set(files)] };
    }
    case 'outs': {
      // Κ-Ε1…Κ-Ε3: ο ίδιος έλεγχος και εδώ, όχι μόνο στην οθόνη
      // Τίποτα δεν απαγορεύεται πλήρως (Michael, 17/10): με force ο χρήστης είδε την προειδοποίηση και το επιβεβαίωσε
      if (!c.force) for (const x of c.changes) if (x.to) {
        const r = outBlock(s, c.date, x.pid);
        if (r) throw new Error(shortName(pm.get(x.pid)!) + ' δεν βγαίνει έξοδο: ' + r);
      }
      const pids = new Set(c.changes.map(x => x.pid));
      // έξοδος/ΔΝ πολλών ημερών: αλλάζει μόνο αυτή η μέρα, οι άλλες μένουν
      const hit = (x: Status) => pids.has(x.pid) && TYPES[x.type].cat === 'out' && x.from <= c.date && c.date <= x.to;
      let statuses = [...s.statuses.filter(x => !hit(x)), ...s.statuses.filter(hit).flatMap(x => splitOut(x, c.date, c.date, ctx.newId))];
      const wk = isSat(c.date) ? c.changes.filter(x => x.wk && x.to === 'DN') : [];
      const added: Status[] = c.changes.filter(x => x.to).map(x => ({ id: ctx.newId(), pid: x.pid, type: x.to!, from: c.date, to: c.date, ...(wk.includes(x) ? { kind: WK } : {}) }));
      // ΔΝ ΣΚ (Michael, 18/10, 24/10): την Κυριακή μπαίνει μόνος του ΔΝ κι εκείνη τη μέρα, εκτός αν έχει ήδη έξοδο/ΔΝ,
      // λείπει, ή κάτι τον κρατά μέσα (υπηρεσία, ποινή…): τότε μένει η ΔΝ του Σαββάτου και γυρίζει Κυριακή πρωί.
      // Αν η άδειά του ξεκινά την Κυριακή, δεν γυρίζει: φεύγει για άδεια.
      // Όποιος δεν είναι πια ΔΝ ΣΚ το Σάββατο χάνει και τη ΔΝ της Κυριακής που είχε μπει μόνη της.
      const sun = addDays(c.date, 1); const kept: string[] = []; const leaving: string[] = [];
      if (isSat(c.date)) {
        const wkIds = new Set(wk.map(x => x.pid));
        statuses = statuses.filter(x => !(pids.has(x.pid) && !wkIds.has(x.pid) && isWk(x) && x.from === sun && x.to === sun));
        for (const x of wk) {
          const onSun = statusesOn(statuses, x.pid, sun);
          if (onSun.some(y => TYPES[y.type].cat === 'out')) continue;
          if (onSun.some(y => TYPES[y.type].cat === 'abs' && y.from >= c.date)) { leaving.push(shortName(pm.get(x.pid)!)); continue; }
          if (onSun.some(y => TYPES[y.type].away) || outBlock(s, sun, x.pid)) { kept.push(shortName(pm.get(x.pid)!)); continue; }
          added.push({ id: ctx.newId(), pid: x.pid, type: 'DN', from: sun, to: sun, kind: WK });
        }
      }
      let outNotes = s.outNotes;
      if (c.notes?.length) {
        const day = { ...(s.outNotes?.[c.date] || {}) };
        for (const n of c.notes) { const v = norm(n.note).trim(); if (v) day[n.pid] = v; else delete day[n.pid]; }
        outNotes = { ...(s.outNotes || {}) }; if (Object.keys(day).length) outNotes[c.date] = day; else delete outNotes[c.date];
      }
      const parts = [c.changes.length && c.changes.length + ' αλλαγές', wk.length && 'ΔΝ ΣΚ ' + wk.length, kept.length && 'γυρίζουν Κυριακή πρωί: ' + kept.join(', '), leaving.length && 'άδεια από Κυριακή: ' + leaving.join(', '), c.notes?.length && c.notes.length + ' παρατηρήσεις'].filter(Boolean);
      return { state: { ...s, statuses: [...statuses, ...added], outNotes }, text: 'Εξοδούχοι ' + dm(c.date) + ': ' + parts.join(' · '), files: ['Εξοδούχοι-Παραμένοντες', HK()] };
    }
    case 'saveCadre': {
      const c0 = c.cadre; const last = normGreek(c0.last || '').trim(), first = normGreek(c0.first || '').trim();
      if (!last) throw new Error('Γράψε επώνυμο');
      const old = c0.id ? s.cadreList.find(x => x.id === c0.id) : undefined;
      const ro = withOrigin({ rank: (c0.rank || '').trim().replace(/\s+/g, ' ').toUpperCase(), origin: c0.origin }, s.settings.lists);
      const x: Cadre = { id: old?.id || 's' + ctx.newId(), rank: ro.rank, ...(ro.origin ? { origin: ro.origin } : {}), hk: c0.hk, last, first, active: c0.active ?? old?.active ?? true };
      if (c0.spec?.trim()) x.spec = itemName(c0.spec, 'specs'); if (c0.am?.trim()) x.am = c0.am.trim().toUpperCase();
      if (c0.phone?.trim()) x.phone = c0.phone.trim(); if (c0.role?.trim()) x.role = c0.role.trim();
      if (old?.pos != null) x.pos = old.pos;
      // ΕΠΟΠ/ΟΒΑ με υπηρεσίες τον μήνα: αριθμός θέσης μία φορά (αρνητικός), και μένει ακόμα κι αν σβήσεις το όριο
      const mx = Math.floor(Number(c0.monthMax)); if (mx > 0) x.monthMax = mx;
      if (old?.pid != null) x.pid = old.pid; else if (mx > 0) x.pid = Math.min(0, ...s.cadreList.map(y => y.pid ?? 0)) - 1;
      // βγήκε εκτός δύναμης: φεύγει από τις υπηρεσίες από σήμερα και μετά (όπως ο στρατιώτης)
      let guards = s.guards;
      if (old?.active && !x.active && x.pid != null) for (const d of Object.keys(guards)) if (d >= ctx.today && Object.values(guards[d] || {}).includes(x.pid)) { const g = { ...guards[d] }; for (const k in g) if (g[k] === x.pid) delete g[k]; guards = { ...guards, [d]: g }; }
      // σε χειροκίνητη σειρά το νέο μπαίνει κάτω από τους ίδιους ή ανώτερους βαθμούς (μετά το μετακινεί όπου θέλει)
      const cadreList = old ? s.cadreList.map(y => (y === old ? x : y)) : isManualOrder(s.cadreList) ? insertCadre(s.cadreList, x) : [...s.cadreList, x];
      // νέα προέλευση γραμμένη με το χέρι: μένει στις Λίστες, όπως στον στρατιώτη
      const o = x.origin; const lists0 = s.settings.lists;
      const settings = o && !/[,"]/.test(o) && itemKey(o) !== itemKey(old?.origin || '') && !listRows(lists0, 'origins').some(r => itemKey(r.name) === itemKey(o)) ? { ...s.settings, lists: { ...lists0, origins: { ...(lists0?.origins || {}), add: [...(lists0?.origins?.add || []), { name: o }] } } } : s.settings;
      return { state: { ...s, cadreList, guards, settings }, text: (old ? 'Άλλαξαν τα στοιχεία στελέχους: ' : 'Νέο στέλεχος: ') + rankTxt(x) + ' ' + x.last + ' ' + x.first + (x.monthMax ? ' (υπηρεσίες ' + x.monthMax + ' τον μήνα)' : ''), files: guards !== s.guards ? [HK(), 'Υπηρεσίες', 'Έλεγχος υπηρεσιών'] : [HK()] };
    }
    case 'orderCadre': {
      const ids = new Set(c.ids); const by = new Map(s.cadreList.map(x => [x.id, x]));
      if (ids.size !== c.ids.length || c.ids.length !== s.cadreList.length || c.ids.some(id => !by.has(id))) throw new Error('Άλλαξε η λίστα των στελεχών, δοκίμασε ξανά');
      return { state: { ...s, cadreList: c.ids.map((id, pos) => ({ ...by.get(id)!, pos })) }, text: 'Άλλαξε η σειρά των στελεχών', files: [] };
    }
    case 'deleteCadre': {
      const x = s.cadreList.find(y => y.id === c.id); if (!x) throw new Error('Δεν βρέθηκε το στέλεχος');
      if (x.pid != null && (Object.values(s.guards).some(g => Object.values(g || {}).includes(x.pid!)) || Object.values(s.dutyLog || {}).some(l => l.some(e => e.pid === x.pid))))
        throw new Error('Ο ' + rankTxt(x) + ' ' + x.last + ' έχει υπηρεσίες στο ημερολόγιο. Βάλ\' τον «εκτός δύναμης» από τα «Στοιχεία», για να μείνει το ιστορικό.');
      return { state: { ...s, cadreList: s.cadreList.filter(y => y !== x), cadreAbs: s.cadreAbs.filter(a => a.cid !== x.id) }, text: 'Διαγράφηκε το στέλεχος ' + rankTxt(x) + ' ' + x.last, files: [HK()] };
    }
    case 'addCadreAbs': {
      const x = s.cadreList.find(y => y.id === c.abs.cid); if (!x) throw new Error('Δεν βρέθηκε το στέλεχος');
      if (c.abs.to < c.abs.from) throw new Error('Το «έως» είναι πριν από το «από»');
      const old = c.abs.id ? s.cadreAbs.find(a => a.id === c.abs.id) : undefined;
      if (c.abs.id && !old) throw new Error('Δεν βρέθηκε η κατάσταση');
      // μία κατάσταση τη μέρα (μία στήλη στην ΗΚΑΙ): η οθόνη ρωτά πριν, και με «replace» η νέα κόβει τις παλιές σε αυτές τις μέρες
      const clash = s.cadreAbs.filter(a => a !== old && a.cid === x.id && a.from <= c.abs.to && c.abs.from <= a.to);
      if (clash.length && !c.replace) throw new Error(x.last + ' έχει ήδη κατάσταση ' + dm(clash[0].from) + '–' + dm(clash[0].to));
      const abs: CadreAbs = { ...c.abs, id: old?.id || 'a' + ctx.newId() }; if (!abs.note) delete abs.note;
      const cut = clash.flatMap(a => {
        const parts: CadreAbs[] = [];
        if (a.from < abs.from) parts.push({ ...a, to: addDays(abs.from, -1) });
        if (a.to > abs.to) parts.push({ ...a, id: parts.length ? 'a' + ctx.newId() : a.id, from: addDays(abs.to, 1) });
        return parts;
      });
      const base = s.cadreAbs.filter(a => !clash.includes(a));
      const cadreAbs = old ? [...base.map(a => (a === old ? abs : a)), ...cut] : [...base, ...cut, abs];
      const lbl = cadreAbsOf(abs.kind, s.settings.lists)?.[1] || abs.kind;
      return { state: { ...s, cadreAbs }, text: 'Στέλεχος: ' + rankTxt(x) + ' ' + x.last + ', ' + lbl.toLowerCase() + ' ' + range(abs.from, abs.to) + (old ? ' (αλλαγή)' : '') + (clash.length ? ', στη θέση ' + (clash.length === 1 ? 'άλλης' : clash.length + ' άλλων') : ''), files: [HK()] };
    }
    case 'deleteCadreAbs': {
      const a = s.cadreAbs.find(y => y.id === c.id); if (!a) throw new Error('Δεν βρέθηκε η κατάσταση');
      const x = s.cadreList.find(y => y.id === a.cid);
      return { state: { ...s, cadreAbs: s.cadreAbs.filter(y => y !== a) }, text: 'Διαγράφηκε κατάσταση στελέχους' + (x ? ': ' + rankTxt(x) + ' ' + x.last : ''), files: [HK()] };
    }
    case 'addRequest': case 'updateRequest': {
      const p = pm.get(c.req.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      const lv = c.req.leave;
      const text = reqText(c.req.text || ''); if (!text && !lv) throw new Error('Γράψε τι αιτείται');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.req.date || '')) throw new Error('Διάλεξε ημερομηνία για την αίτηση');
      if (lv && (!/^\d{4}-\d{2}-\d{2}$/.test(lv.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(lv.to || ''))) throw new Error('Διάλεξε από πότε έως πότε είναι η άδεια');
      if (lv && lv.to < lv.from) throw new Error('Το «έως» είναι πριν από το «από»');
      const tm = lv ? checkTimes({ type: lv.type === 'HON' ? 'HON' : 'LEAVE', from: lv.from, to: lv.to, fromTime: lv.fromTime, toTime: lv.toTime }) : {};
      const old = c.t === 'updateRequest' ? s.requests.find(x => x.id === c.req.id) : undefined;
      if (c.t === 'updateRequest' && !old) throw new Error('Δεν βρέθηκε η αίτηση');
      if (old?.decision) throw new Error('Η αίτηση έχει ήδη ' + (old.decision === 'ok' ? 'εγκριθεί' : 'απορριφθεί') + '. Αναίρεσε πρώτα την απόφαση.');
      const req: PersonRequest = { id: old?.id || 'r' + ctx.newId(), pid: p.id, date: c.req.date, text };
      if (lv) req.leave = { type: lv.type === 'HON' ? 'HON' : 'LEAVE', ...(lv.type !== 'HON' && lv.kind ? { kind: lv.kind } : {}), from: lv.from, to: lv.to, ...tm };
      const same = (x: PersonRequest) => x.pid === req.pid && x.date === req.date && x.text === req.text && JSON.stringify(x.leave || null) === JSON.stringify(req.leave || null);
      // διπλό κλικ στην αποθήκευση: η ίδια αίτηση δεν γράφεται δεύτερη φορά
      if (!old && s.requests.some(same)) throw new Error(shortName(p) + ' έχει ήδη αυτή την αίτηση στις ' + dm(req.date));
      const requests = old ? s.requests.map(x => (x === old ? req : x)) : [...s.requests, req];
      const what = req.leave ? 'άδεια ' + rangeHm(req.leave, dm) + (text ? ', ' + text : '') : text;
      return { state: { ...s, requests }, text: (old ? 'Άλλαξε αίτηση: ' : 'Αίτηση: ') + shortName(p) + ' – ' + what + ' (' + dm(req.date) + ')', files: [HK()] };
    }
    case 'deleteRequest': {
      const r = s.requests.find(x => x.id === c.id); if (!r) throw new Error('Δεν βρέθηκε η αίτηση');
      const p = pm.get(r.pid);
      // εγκεκριμένη αίτηση άδειας: φεύγει μαζί και η άδεια που έγινε από αυτή
      const st = r.sid ? s.statuses.find(x => x.id === r.sid) : undefined;
      return { state: { ...s, requests: s.requests.filter(x => x !== r), statuses: st ? s.statuses.filter(x => x !== st) : s.statuses }, text: 'Διαγράφηκε αίτηση' + (p ? ': ' + shortName(p) : '') + ' – ' + (r.leave ? 'άδεια ' + range(r.leave.from, r.leave.to) : r.text) + (st ? ', μαζί με την άδεια' : ''), files: st ? [HK(), 'Άδειες'] : [HK()] };
    }
    case 'decideRequest': {
      const r = s.requests.find(x => x.id === c.id); if (!r || !r.leave) throw new Error('Δεν βρέθηκε η αίτηση άδειας');
      const p = pm.get(r.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      const lv = r.leave;
      if (c.ok === null) {
        const st = r.sid ? s.statuses.find(x => x.id === r.sid) : undefined;
        const nr: PersonRequest = { ...r }; delete nr.decision; delete nr.decided; delete nr.sid;
        return { state: { ...s, requests: s.requests.map(x => (x === r ? nr : x)), statuses: st ? s.statuses.filter(x => x !== st) : s.statuses }, text: 'Αναίρεση απόφασης για την αίτηση άδειας του ' + shortName(p) + (st ? ': η άδεια ' + range(st.from, st.to) + ' βγήκε' : ''), files: st ? [HK(), 'Άδειες'] : [HK()] };
      }
      if (r.decision) throw new Error('Η αίτηση έχει ήδη ' + (r.decision === 'ok' ? 'εγκριθεί' : 'απορριφθεί'));
      // η απόφαση γράφεται στην ΗΚΑΙ της μέρας που πατήθηκε (όχι πριν από την ίδια την αίτηση)
      const decided = r.date > ctx.today ? r.date : ctx.today;
      if (!c.ok) return { state: { ...s, requests: s.requests.map(x => (x === r ? { ...r, decision: 'no' as const, decided } : x)) }, text: 'Απορρίφθηκε η αίτηση άδειας του ' + shortName(p) + ' (' + range(lv.from, lv.to) + ')', files: [HK()] };
      // εγκρίθηκε: ίδια δήλωση με το «Δήλωσε κατάσταση» (ίδιοι έλεγχοι, βγαίνει από υπηρεσίες και εξόδους)
      const d = run(s, { t: 'declare', cmd: { type: lv.type, pids: [p.id], from: lv.from, to: lv.to, ...(lv.kind ? { kind: lv.kind } : {}), ...(lv.fromTime ? { fromTime: lv.fromTime } : {}), ...(lv.toTime ? { toTime: lv.toTime } : {}) } }, ctx);
      const had = new Set(s.statuses.map(x => x.id));
      const st = d.state.statuses.find(x => !had.has(x.id) && x.pid === p.id && x.type === lv.type && x.from === lv.from);
      if (!st) throw new Error('Δεν έγινε η άδεια');
      const statuses = d.state.statuses.map(x => (x === st ? { ...x, req: r.id } : x));
      return { ...d, state: { ...d.state, statuses, requests: s.requests.map(x => (x === r ? { ...r, decision: 'ok' as const, decided, sid: st.id } : x)) }, text: 'Εγκρίθηκε η αίτηση άδειας του ' + shortName(p) + ' (' + range(lv.from, lv.to) + ')', files: [...new Set([HK(), ...d.files])] };
    }
    case 'setPersonMove': {
      const p = pm.get(c.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      if (c.date && !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) throw new Error('Λάθος ημερομηνία');
      const q: Person = { ...p }; if (c.date) q[c.field] = c.date; else delete q[c.field];
      const what = c.field === 'inOn' ? '1. Εγγραφές' : '2. Διαγραφές';
      return { state: { ...s, people: s.people.map(x => (x === p ? q : x)) }, text: HK() + ' ' + what + ': ' + shortName(p) + (c.date ? ' στις ' + dm(c.date) : ', να μη γραφτεί'), files: [HK()] };
    }
    case 'setPunInfo': {
      const st = s.statuses.find(x => x.id === c.id); if (!st || st.type !== 'PUN') throw new Error('Δεν βρέθηκε η ποινή');
      const next: Status = { ...st, on: c.on || undefined, by: c.by.trim() || undefined, reason: c.reason.trim() || undefined };
      (['on', 'by', 'reason'] as const).forEach(k => { if (next[k] === undefined) delete next[k]; });
      return { state: { ...s, statuses: s.statuses.map(x => (x === st ? next : x)) }, text: 'Στοιχεία ποινής: ' + shortName(pm.get(st.pid)!) + (next.by ? ', από ' + next.by : '') + (next.reason ? ', διότι ' + next.reason : ''), files: [] };
    }
    case 'setTimes': {
      const st = s.statuses.find(x => x.id === c.id); if (!st || !hasTimes(st.type)) throw new Error('Δεν βρέθηκε η καταχώρηση');
      const tm = checkTimes({ ...st, fromTime: c.fromTime, toTime: c.toTime });
      const next: Status = { ...st, ...tm };
      if (!tm.fromTime) delete next.fromTime;
      if (!tm.toTime) delete next.toTime;
      // υπηρεσίες που δεν γίνονται πια με τις νέες ώρες: η θέση μένει κενή, όπως στη δήλωση
      const plan = planStatusChange({ ...s, statuses: s.statuses.filter(x => x !== st) }, { type: st.type, pids: [st.pid], from: st.from, to: st.to, ...tm }, ctx.today);
      let out: AppState = { ...s, statuses: s.statuses.map(x => (x === st ? next : x)) };
      plan.conflicts.forEach(x => { out = setGuard(out, x.date, x.k, null); });
      const t = timesTxt(next), lv = TYPES[st.type].cat === 'abs';
      return { state: out, text: 'Ώρες ' + (lv ? 'άδειας' : TYPES[st.type].label) + ' ' + range(st.from, st.to) + ' του ' + shortName(pm.get(st.pid)!) + ': ' + (t || 'χωρίς ώρες'), files: [st.type === 'LEAVE' || st.type === 'HON' ? 'Άδειες' : 'Ιατρικά', ...plan.files.filter(f => f.fn.startsWith('Υπηρεσίες')).map(f => f.fn)] };
    }
    case 'endStatus': {
      const st = s.statuses.find(x => x.id === c.id); if (!st) throw new Error('Δεν βρέθηκε η καταχώρηση');
      const y = addDays(ctx.today, -1);
      const statuses = st.from > y ? s.statuses.filter(x => x !== st) : s.statuses.map(x => { if (x !== st) return x; const n = { ...x, to: y }; delete n.open; delete n.days; return n; });
      return { state: { ...s, statuses }, text: 'Τέλος από σήμερα: ' + (st.type === 'PUN' ? 'ποινή' : statusLbl(st, s.settings.lists)) + ' του ' + shortName(pm.get(st.pid)!), files: [st.type === 'PUN' ? 'Ποινές' : 'Ιατρικά'] };
    }
    case 'deleteStatus': {
      const st = s.statuses.find(x => x.id === c.id); if (!st) throw new Error('Δεν βρέθηκε η καταχώρηση');
      return { state: { ...s, statuses: s.statuses.filter(x => x !== st) }, text: 'Διαγράφηκε (μπήκε λάθος): ' + (st.type === 'PUN' ? 'ποινή' : statusLbl(st, s.settings.lists)) + ' ' + (st.open ? 'από ' + dm(st.from) + ' χωρίς λήξη' : range(st.from, st.to)) + ' του ' + shortName(pm.get(st.pid)!), files: [st.type === 'PUN' ? 'Ποινές' : 'Ιατρικά', HK()] };
    }
    case 'replaceStatus': {
      const st = s.statuses.find(x => x.id === c.id); if (!st) throw new Error('Δεν βρέθηκε η καταχώρηση');
      if (!RECORD_CATS.includes(TYPES[st.type].cat)) throw new Error('Διορθώνονται εδώ μόνο ιατρικά και ποινές');
      if (!c.cmds.length) throw new Error('Δεν διάλεξες κατάσταση');
      const base: AppState = { ...s, statuses: s.statuses.filter(x => x !== st) };
      const r = run(base, c.cmds.length > 1 ? { t: 'declareMany', cmds: c.cmds } : { t: 'declare', cmd: c.cmds[0] }, ctx);
      const was = (st.type === 'PUN' ? 'ποινή (' + punLbl(st.kind || PUN_KINDS[0]) + ')' : statusLbl(st, s.settings.lists)) + ' ' + (st.open ? 'από ' + dm(st.from) + ' χωρίς λήξη' : range(st.from, st.to));
      return { state: r.state, text: 'Διόρθωση: ' + r.text + ' (ήταν ' + was + ')', files: [...new Set([st.type === 'PUN' ? 'Ποινές' : 'Ιατρικά', ...r.files])] };
    }
    case 'cancelLeave': {
      const st = s.statuses.find(x => x.id === c.id); if (!st || !hasTimes(st.type)) throw new Error('Δεν βρέθηκε η άδεια');
      // από εγκεκριμένη αίτηση: η αίτηση μένει εγκεκριμένη, χωρίς άδεια (δεν γράφεται πια στην ΗΚΑΙ ως άδεια)
      const requests = s.requests.map(r => { if (r.sid !== st.id) return r; const n = { ...r }; delete n.sid; return n; });
      return { state: { ...s, statuses: s.statuses.filter(x => x !== st), requests }, text: (TYPES[st.type].cat === 'abs' ? 'Ακυρώθηκε η ' : 'Διαγράφηκε η ') + TYPES[st.type].long.toLowerCase() + ' ' + range(st.from, st.to) + ' του ' + shortName(pm.get(st.pid)!), files: [leaveFile(st), HK()] };
    }
    case 'endLeave': {
      const st = s.statuses.find(x => x.id === c.id); if (!st || !hasTimes(st.type)) throw new Error('Δεν βρέθηκε η άδεια');
      const abs = TYPES[st.type].cat === 'abs', tn = timeNames(st.type);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) throw new Error('Λάθος ημερομηνία');
      const t = normTime(c.time); if (t == null) throw new Error('Η ώρα ' + tn.toG + ' «' + c.time + '» δεν διαβάζεται. Γράψε π.χ. 22:00.');
      const was = st.open ? 'χωρίς λήξη' : 'έως ' + dm(st.to) + (st.toTime ? ' ' + st.toTime : '');
      if (c.date < st.from || (c.date === st.from && st.fromTime && t && mins(t) <= mins(st.fromTime))) throw new Error((abs ? 'Η άδεια' : 'Η ' + TYPES[st.type].long.toLowerCase()) + ' ξεκινά ' + dm(st.from) + (st.fromTime ? ' ' + st.fromTime : '') + (abs ? '. Αν δεν έφυγε καθόλου, πάτα «Ακύρωση άδειας».' : '. Αν μπήκε λάθος, πάτα «Διαγραφή».'));
      // ίδια ή μεταγενέστερη επιστροφή: δεν είναι διακοπή (για παράταση άλλαξε την άδεια)
      if (!st.open && (c.date > st.to || (c.date === st.to && (!t || (!!st.toTime && mins(t) >= mins(st.toTime)))))) throw new Error((abs ? 'Η άδεια' : 'Η ' + TYPES[st.type].long.toLowerCase()) + ' είναι ήδη ' + was + '. Διάλεξε νωρίτερη ' + tn.to + '.');
      const n: Status = { ...st, to: c.date }; delete n.open; delete n.days;
      if (t) n.toTime = t; else delete n.toTime;
      return { state: { ...s, statuses: s.statuses.map(x => (x === st ? n : x)) }, text: 'Διακοπή: ' + TYPES[st.type].long.toLowerCase() + ' του ' + shortName(pm.get(st.pid)!) + ', ' + tn.to + ' ' + dm(c.date) + (t ? ' ' + t : '') + ' (ήταν ' + was + ')', files: [leaveFile(st), HK()] };
    }
    case 'approvePun': {
      const st = s.statuses.find(x => x.id === c.id); if (!st) throw new Error('Δεν βρέθηκε η ποινή');
      return { state: { ...s, statuses: s.statuses.map(x => (x === st ? { ...x, pending: false } : x)) }, text: 'Εγκρίθηκε από τον Διοικητή η ποινή (' + punLbl(st.kind) + ') του ' + shortName(pm.get(st.pid)!), files: [HK(), 'Ποινές'] };
    }
    case 'assign': {
      const post = postBy(s, c.k); if (!post) throw new Error('Άγνωστη θέση');
      // Τίποτα δεν απαγορεύεται πλήρως (Michael, 17/10): κατάσταση (ΕΥ, άδεια…), ανάπαυση, ΣΚ, δυνατότητα και «ήδη σε άλλη
      // θέση» περνούν με αιτιολογία. move: η άλλη θέση του αδειάζει (μετακίνηση), αλλιώς μένει και στις δύο.
      let note = ''; let base = s;
      if (c.pid) {
        if (!pm.get(c.pid)?.active) throw new Error('Το άτομο είναι εκτός δύναμης');
        const other = postOf(s, c.date, c.pid, c.k);
        if (c.move && other && other.k === c.move) { base = setGuard(s, c.date, c.move, null); note = ' (από ' + postTxt(other) + ')'; }
        const twice = !c.move && other ? 'ήδη ' + postTxt(other) : null;
        const soft = dutyBlock(s.statuses, c.date, c.pid, post, s.settings.lists) || twice || capBlock(base, c.date, c.pid, post) || ruleBlock(base, c.date, c.pid, undefined, c.k);
        if (soft && !c.force) throw new Error(shortName(pm.get(c.pid)!) + ' δεν μπαίνει: ' + soft);
        if (soft) note += ' (παρά τον κανόνα: ' + soft + '. Αιτία: ' + c.force + ')';
        const lr = lastResort(s.statuses, c.date, c.pid, post, s.settings.lists) || statusWarn(s, c.date, c.pid); if (lr) note += ' (' + lr + ')';
      }
      let next = setGuard(base, c.date, c.k, c.pid);
      // είχε την ίδια μέρα υπηρεσία του ίδιου είδους χωρίς θέση (από Excel): τώρα έχει θέση
      const sl = c.pid ? (s.dutyLog[c.date] || []).filter(e => !(e.pid === c.pid && e.kind === post.kind)) : null;
      if (sl && sl.length !== (s.dutyLog[c.date] || []).length) { const dutyLog = { ...s.dutyLog, [c.date]: sl }; if (!sl.length) delete dutyLog[c.date]; next = { ...next, dutyLog }; }
      return { state: next, text: 'Υπηρεσίες ' + dm(c.date) + ': ' + (c.pid ? shortName(pm.get(c.pid)!) + ' σε ' : 'κενή η θέση ') + postTxt(post) + note, files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'swapPosts': {
      const A = postBy(s, c.a), B = postBy(s, c.b); const g = s.guards[c.date] || {};
      const chk = swapCheck(s, c.date, c.a, c.b);
      if (chk.hard) throw new Error('Δεν γίνεται ανταλλαγή: ' + chk.hard);
      if (chk.soft && !c.force) throw new Error('Δεν γίνεται ανταλλαγή: ' + chk.soft);
      const pa = g[c.a], pb = g[c.b];
      const guards = { ...s.guards, [c.date]: { ...g, [c.a]: pb, [c.b]: pa } };
      return { state: { ...s, guards }, text: 'Υπηρεσίες ' + dm(c.date) + ': ανταλλαγή ' + shortName(pm.get(pa)!) + ' (' + postTxt(A!) + ') ↔ ' + shortName(pm.get(pb)!) + ' (' + postTxt(B!) + ')' + (chk.soft ? ' (παρά τον κανόνα: ' + chk.soft + '. Αιτία: ' + c.force + ')' : ''), files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'autofillRange': {
      // ΠΣΚ: μία μέρα μετά την άλλη, ώστε οι κανόνες (ανάπαυση, νούμερα, ΣΚ) να ισχύουν και ανάμεσά τους
      let st = s; const parts: string[] = []; let empty = 0; const warn: string[] = [];
      for (const d of c.dates) { const r = fillDay(st, d); st = { ...st, guards: r.guards }; parts.push(dayName(d, ctx.today).toLowerCase() + ' ' + r.n); empty += r.empty.length; warn.push(...r.warn); }
      return { state: st, text: 'Υπηρεσίες ΠΣΚ ' + range(c.dates[0], c.dates[c.dates.length - 1]) + ': αυτόματη συμπλήρωση (' + parts.join(', ') + ')' + (empty ? ', ' + empty + ' έμειναν κενές (κανείς δεν επιτρέπεται)' : '') + (warn.length ? '. Χωρίς άλλη επιλογή: ' + warn.join('· ') : ''), files: c.dates.map(d => 'Υπηρεσίες ' + dm(d)).concat('Έλεγχος υπηρεσιών') };
    }
    case 'autofill': {
      const r = fillDay(s, c.date);
      return { state: { ...s, guards: r.guards }, text: 'Υπηρεσίες ' + dm(c.date) + ': αυτόματη συμπλήρωση ' + r.n + ' θέσεων' + (r.empty.length ? ', ' + r.empty.length + ' έμειναν κενές (κανείς δεν επιτρέπεται)' : '') + (r.warn.length ? '. Χωρίς άλλη επιλογή: ' + r.warn.join('· ') : ''), files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'clearDay': {
      const guards = { ...s.guards }; delete guards[c.date];
      return { state: { ...s, guards }, text: 'Υπηρεσίες ' + dm(c.date) + ': καθαρίστηκαν όλες οι θέσεις', files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'setRules':
      return { state: { ...s, rules: c.rules }, text: 'Άλλαξαν οι κανόνες υπηρεσιών: ' + c.text, files: [] };
    case 'setCap': {
      const p = pm.get(c.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      const cur = { ...(s.caps[c.pid] || {}) };
      if (c.v === 'clear') delete cur[c.key]; else cur[c.key] = c.v === 'on' ? null : 'Από τον λοχία';
      const caps = { ...s.caps }; if (Object.keys(cur).length) caps[c.pid] = cur; else delete caps[c.pid];
      const col = capCols(s.settings).find(x => x.key === c.key);
      const what = col?.block ? col.block.name : (CAP_ACC as Record<string, string>)[c.key] || c.key;
      const next = { ...s, caps };
      const after = c.v === 'off' ? ' δεν κάνει ' : c.v === 'on' || !col || capCell(next, p, col).on ? ' κάνει ' : ' δεν κάνει (' + capCell(next, p, col).why + ') ';
      return { state: next, text: 'Δυνατότητα υπηρεσιών: ' + shortName(p) + after + what, files: [] };
    }
    case 'setOffDays': {
      const p = pm.get(c.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      const days = WEEK.filter(d => c.days.includes(d));
      const next: Person = { ...p }; if (days.length) next.offDays = days; else delete next.offDays;
      return { state: { ...s, people: s.people.map(x => (x.id === p.id ? next : x)) }, text: 'Μέρες υπηρεσίας: ' + shortName(p) + (days.length ? ' όχι ' + days.map(d => DOW_FULL[d]).join(', ') : ' όλες τις μέρες'), files: [] };
    }
    case 'setSkip': {
      const p = pm.get(c.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      if (!c.from || !c.to) throw new Error('Βάλε από ποια μέρα και έως ποια');
      if (c.to < c.from) throw new Error('Το «έως» είναι πριν από το «από»');
      const why = c.why?.trim(); const old = c.id ? p.skips?.find(k => k.id === c.id) : undefined;
      if (c.id && !old) throw new Error('Δεν βρέθηκε η εξαίρεση');
      const k: Skip = { id: old?.id || ctx.newId(), from: c.from, to: c.to, ...(why ? { why } : {}) };
      const skips = [...(p.skips || []).filter(x => x.id !== k.id), k].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
      return { state: { ...s, people: s.people.map(x => (x.id === p.id ? { ...p, skips } : x)) }, text: (old ? 'Άλλαξε η εξαίρεση από υπηρεσίες: ' : 'Εξαίρεση από υπηρεσίες: ') + shortName(p) + ' ' + skipTxt(k), files: [] };
    }
    case 'delSkip': {
      const p = pm.get(c.pid); const old = p?.skips?.find(k => k.id === c.id); if (!p || !old) throw new Error('Δεν βρέθηκε η εξαίρεση');
      const next: Person = { ...p, skips: p.skips!.filter(k => k.id !== c.id) }; if (!next.skips!.length) delete next.skips;
      return { state: { ...s, people: s.people.map(x => (x.id === p.id ? next : x)) }, text: 'Σβήστηκε η εξαίρεση από υπηρεσίες: ' + shortName(p) + ' ' + skipTxt(old), files: [] };
    }
    case 'setDutyProfile': {
      const p = pm.get(c.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      const cur: Partial<Record<DutyKind, string | null>> = c.reset ? {} : { ...(s.caps[c.pid] || {}) };
      (c.on || []).forEach(k => { if (cur[k]) delete cur[k]; });
      (c.off || []).forEach(k => { cur[k] = 'Από τον λοχία'; });
      const caps = { ...s.caps }; if (Object.keys(cur).length) caps[c.pid] = cur as any; else delete caps[c.pid];
      const dset = c.reset ? [] : c.days;
      let people = s.people;
      if (dset) {
        const days = WEEK.filter(d => dset.includes(d)); const next: Person = { ...p };
        if (days.length) next.offDays = days; else delete next.offDays;
        people = s.people.map(x => (x.id === p.id ? next : x));
      }
      return { state: { ...s, caps, people }, text: 'Δυνατότητα υπηρεσιών: ' + shortName(p) + ' · ' + c.text, files: [] };
    }
    case 'setSettings':
      return { state: { ...s, settings: { ...s.settings, ...c.settings } }, text: 'Ρυθμίσεις: ' + c.text, files: [] };
    case 'setHkRows': {
      const before = s.settings.lists; const lists = { ...(before || {}), hkRows: c.rows };
      const rows = new Set(hkRowList(lists));
      // άλλα ονόματα: μόνο για γραμμές που υπάρχουν, χωρίς κενά
      const names = Object.fromEntries(Object.entries(c.names || before?.hkNames || {}).map(([k, v]) => [k, (v || '').trim().replace(/\s+/g, ' ')]).filter(([k, v]) => v && rows.has(k)));
      if (Object.keys(names).length) lists.hkNames = names; else delete lists.hkNames;
      const cadreList = s.cadreList.map(x => {
        const claim = hkClaimOf(lists, x.rank, x.origin);
        if (claim) return claim === x.hk ? x : { ...x, hk: claim };
        // η γραμμή του σβήστηκε ή δεν μαζεύει πια τον βαθμό του: πάει εκεί που θα πήγαινε χωρίς αυτήν
        return !rows.has(x.hk) || hkClaimOf(before, x.rank, x.origin) === x.hk ? { ...x, hk: guessHk(x.rank, lists, x.origin) } : x;
      });
      const only = (o: Record<string, number> | undefined) => o && Object.fromEntries(Object.entries(o).filter(([k]) => rows.has(k)));
      const hkai = s.settings.hkai?.prov ? { ...s.settings.hkai, prov: only(s.settings.hkai.prov) } : s.settings.hkai;
      return { state: { ...s, cadreList, settings: { ...s.settings, lists, cadre: only(s.settings.cadre)!, hkai } }, text: 'Ρυθμίσεις: ' + c.text, files: [] };
    }
    case 'printed':
      return { state: { ...s, printed: { ...s.printed, [c.date]: c.at } }, text: 'Βγήκε ' + c.files.join(', '), files: c.files, undoable: false };
    case 'importPeople':
      return importPeople(s, c.rows, c.source, c.deactivateMissing);
    case 'importRecords': {
      // Από τα Αρχεία Excel: νέες εγγραφές και αλλαγές σε υπάρχουσες (ίδιο άτομο, ίδιο είδος, ίδια έναρξη)
      const byId = new Map(c.updates.map(u => [u.id, u.patch]));
      const adds = c.adds.filter(a => pm.has(a.pid) && TYPES[a.type] && a.from && a.to && a.to >= a.from);
      const del = new Set((c.deletes || []).filter(id => s.statuses.some(x => x.id === id)));
      if (!adds.length && !byId.size && !del.size) return { state: s, text: '', files: [] };
      // ώρα άδειας που σβήστηκε στο Excel: έρχεται κενή και φεύγει από την εγγραφή
      const tidy = (x: Status) => { if (x.fromTime === '') delete x.fromTime; if (x.toTime === '') delete x.toTime; return x; };
      // στέρηση εξόδου από Excel: η λήξη του Excel μένει όπως είναι, και μετακινείται μόνο για όσες υπηρεσίες ή βραδινές
      // εκπαιδεύσεις μπουν αργότερα μέσα στο διάστημα (οι ημέρες = όσες μετράνε τώρα από το «από» ως το «έως»)
      const days = (x: Status) => { if (!isDeprivation(x) || x.open) { delete x.days; return x; } const n = servedDays(s, x.pid, x.from, x.to); if (n > 0) x.days = n; else delete x.days; return x; };
      const moved = (x: Status, p: Partial<Status>) => p.to !== undefined || p.from !== undefined || p.open !== undefined || p.kind !== undefined;
      const statuses = [...s.statuses.filter(x => !del.has(x.id)).map(x => (byId.has(x.id) ? (moved(x, byId.get(x.id)!) ? days(tidy({ ...x, ...byId.get(x.id) })) : tidy({ ...x, ...byId.get(x.id) })) : x)), ...adds.map(a => days({ ...a, id: ctx.newId() }))];
      const parts = [adds.length && adds.length + (adds.length === 1 ? ' νέα' : ' νέες'), byId.size && byId.size + (byId.size === 1 ? ' αλλαγή' : ' αλλαγές'), del.size && del.size + (del.size === 1 ? ' σβήστηκε' : ' σβήστηκαν')].filter(Boolean).join(', ');
      return { state: { ...s, statuses }, text: 'Από Excel (' + c.source + '), ' + c.what + ': ' + parts, files: [], source: 'excel' };
    }
    case 'setPeopleFields': {
      // Από τα Αρχεία Excel (πόστα, εκτός δύναμης): μόνο αυτά τα πεδία, μόνο σε άτομα που υπάρχουν
      const by = new Map<number, Partial<Person>>();
      for (const ch of c.changes) {
        if (!pm.has(ch.pid)) continue;
        const pt: Partial<Person> = {};
        if ('post' in ch.patch) pt.post = ch.patch.post ? String(ch.patch.post) : null;
        if ('active' in ch.patch) pt.active = !!ch.patch.active;
        if ('notes' in ch.patch) pt.notes = String(ch.patch.notes ?? '');
        by.set(ch.pid, { ...(by.get(ch.pid) || {}), ...pt });
      }
      if (!by.size) return { state: s, text: '', files: [] };
      const people = s.people.map(p => (by.has(p.id) ? { ...p, ...by.get(p.id) } : p));
      return { state: { ...s, people }, text: 'Από Excel (' + c.source + '), ' + c.what + ': ' + by.size + (by.size === 1 ? ' αλλαγή' : ' αλλαγές'), files: [], source: 'excel' };
    }
    case 'importCaps': {
      const caps = { ...s.caps }; let n = 0;
      for (const ch of c.changes) {
        // βασικό είδος, ή δική σου υπηρεσία («b:» + id) που υπάρχει ακόμα στις Ρυθμίσεις
        if (!pm.has(ch.pid) || !(CAP_ACC[ch.kind as DutyKind] || capCols(s.settings).some(x => x.key === ch.kind))) continue;
        const cur = { ...(caps[ch.pid] || {}) };
        if (ch.reason) cur[ch.kind] = ch.reason; else delete cur[ch.kind];
        caps[ch.pid] = cur; n++;
      }
      for (const k of Object.keys(caps)) if (!Object.keys(caps[+k]).length) delete caps[+k];
      if (!n) return { state: s, text: '', files: [] };
      return { state: { ...s, caps }, text: 'Από Excel (' + c.source + '), δυνατότητα υπηρεσιών: ' + n + (n === 1 ? ' αλλαγή' : ' αλλαγές'), files: [], source: 'excel' };
    }
    case 'importDuties': {
      // Από τον έλεγχο υπηρεσιών: μπαίνει ό,τι λείπει από την εφαρμογή (mergeDuties, όπως στην προεπισκόπηση), για
      // μέρες ως σήμερα· ό,τι διαφέρει μένει της εφαρμογής. Μέρα με ίδιο κωδικό θέσης δύο φορές δεν περνά.
      const guards = { ...s.guards }; const dutyLog = { ...s.dutyLog }; let n = 0, days = 0;
      for (const [d, cells] of Object.entries(c.days || {})) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > ctx.today || !Array.isArray(cells)) continue;
        const ok = cells.filter(e => pm.has(e.pid) && KIND_NAME[e.kind]).map(e => (e.k && !postBy(s, e.k) ? { ...e, k: undefined } : e));
        const r = mergeDuties(s, d, ok); if (r.dup || !r.adds.length) continue;
        n += r.adds.length; days++;
        if (Object.keys(r.day.seats).length) guards[d] = r.day.seats; else delete guards[d];
        if (r.day.seatless.length) dutyLog[d] = r.day.seatless; else delete dutyLog[d];
      }
      if (!n) return { state: s, text: '', files: [] };
      return { state: { ...s, guards, dutyLog }, text: 'Από Excel (' + c.source + '), έλεγχος υπηρεσιών: ' + n + (n === 1 ? ' υπηρεσία' : ' υπηρεσίες') + ' σε ' + days + (days === 1 ? ' μέρα' : ' μέρες'), files: ['Έλεγχος υπηρεσιών'], source: 'excel' };
    }
    case 'removeDutyLog': {
      const p = pm.get(c.pid); const list = s.dutyLog[c.date] || []; const i = list.findIndex(e => e.pid === c.pid && e.kind === c.kind);
      if (i < 0) return { state: s, text: '', files: [] };
      const dutyLog = { ...s.dutyLog, [c.date]: list.filter((_, j) => j !== i) }; if (!dutyLog[c.date].length) delete dutyLog[c.date];
      return { state: { ...s, dutyLog }, text: 'Υπηρεσίες ' + dm(c.date) + ': βγήκε ' + (p ? shortName(p) : 'άτομο') + ' (' + KIND_NAME[c.kind].toLowerCase() + ' χωρίς θέση, από Excel)', files: ['Έλεγχος υπηρεσιών'] };
    }
    case 'setBaselines': {
      // ο έλεγχος των προηγούμενων υπηρεσιών μετά την αναβάθμιση: όλα μαζί, μία αναίρεση
      const baseline = { ...s.baseline }; let n = 0;
      for (const [id, b] of Object.entries(c.baselines)) {
        const pid = Number(id); if (!pm.has(pid) && !baseline[pid]) continue;
        const clean: Baseline = {}; for (const [k, v] of Object.entries(b || {})) { const x = Math.max(0, Math.floor(Number(v) || 0)); if (x) (clean as Record<string, number>)[k] = x; }
        if (JSON.stringify(clean) === JSON.stringify(baseline[pid] || {})) continue;
        if (Object.keys(clean).length) baseline[pid] = clean; else delete baseline[pid];
        n++;
      }
      const settings = s.settings.baselineReviewed ? s.settings : { ...s.settings, baselineReviewed: true };
      if (!n && settings === s.settings) return { state: s, text: '', files: [] };
      return { state: { ...s, baseline: n ? baseline : s.baseline, settings }, text: n ? 'Προηγούμενες υπηρεσίες: άλλαξαν σε ' + n + (n === 1 ? ' άτομο' : ' άτομα') : 'Προηγούμενες υπηρεσίες: έμειναν όπως ήταν', files: n ? ['Έλεγχος υπηρεσιών'] : [] };
    }
    case 'updatePerson': {
      const old = pm.get(c.person.id); if (!old) throw new Error('Δεν βρέθηκε το άτομο');
      // όριο υπηρεσιών τον μήνα (ΕΠΟΠ/ΟΒΑ): ακέραιος πάνω από 0, αλλιώς χωρίς όριο
      const person: Person = withOrigin({ ...c.person }, s.settings.lists); const mx = Math.floor(Number(person.monthMax)); if (mx > 0) person.monthMax = mx; else delete person.monthMax;
      let next: AppState = { ...s, people: s.people.map(p => (p.id === person.id ? person : p)), settings: rememberChoices(s.settings, person, old) };
      // βγήκε εκτός δύναμης: φεύγει από τις υπηρεσίες από σήμερα και μετά (οι περασμένες μένουν όπως έγιναν)
      const gone = old.active && !person.active ? Object.keys(s.guards).filter(d => d >= ctx.today).flatMap(d => Object.entries(s.guards[d] || {}).filter(([, pid]) => pid === old.id).map(([k]) => ({ d, k }))) : [];
      gone.forEach(x => { next = setGuard(next, x.d, x.k, null); });
      const text = old.active && !person.active ? shortName(person) + ': εκτός δύναμης' + (gone.length ? ' (βγήκε από ' + gone.length + (gone.length === 1 ? ' υπηρεσία' : ' υπηρεσίες') + ')' : '') : !old.active && person.active ? shortName(person) + ': ξανά σε δύναμη' : 'Άλλαξαν τα στοιχεία: ' + shortName(person);
      return { state: next, text, files: gone.length ? ['Υπηρεσίες', 'Έλεγχος υπηρεσιών'] : [] };
    }
    case 'setWeapons': {
      const F = { weapon: normWeapon, wtype: (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase(), rack: normRack, wpos: normPos } as const;
      const by = new Map<number, Person>();
      for (const ch of c.changes) {
        const p0 = pm.get(ch.pid); if (!p0) throw new Error('Δεν βρέθηκε το άτομο');
        const q: Person = { ...(by.get(p0.id) || p0) };
        for (const f of ['weapon', 'wtype', 'rack', 'wpos'] as const) { if (ch[f] === undefined) continue; const v = F[f](ch[f]); if (v) q[f] = v; else delete q[f]; }
        if (q.weapon !== p0.weapon || q.wtype !== p0.wtype || q.rack !== p0.rack || q.wpos !== p0.wpos) by.set(p0.id, q); else by.delete(p0.id);
      }
      if (!by.size) return { state: s, text: '', files: [] };
      const people = s.people.map(p => by.get(p.id) || p);
      const [pid, q] = [...by][0]; const p = pm.get(pid)!;
      const one = [q.weapon !== p.weapon && (q.weapon ? 'όπλο ' + q.weapon : 'χωρίς όπλο' + (p.weapon ? ' (ήταν ' + p.weapon + ')' : '')),
        q.wtype !== p.wtype && 'τύπος ' + (q.wtype || '—'), q.rack !== p.rack && 'οπλοβαστός ' + (q.rack || '—'), q.wpos !== p.wpos && 'θέση ' + (q.wpos || '—')].filter(Boolean).join(', ');
      const onlyNum = q.wtype === p.wtype && q.rack === p.rack && q.wpos === p.wpos;
      const text = by.size === 1 ? (onlyNum ? 'Όπλο ' + shortName(p) + ': ' + (q.weapon || 'χωρίς όπλο' + (p.weapon ? ' (ήταν ' + p.weapon + ')' : '')) : 'Οπλισμός ' + shortName(p) + ': ' + one) : 'Οπλισμός' + (c.what ? ', ' + c.what : '') + ': άλλαξε σε ' + by.size + ' άτομα';
      return { state: { ...s, people }, text, files: [] };
    }
    case 'weaponOut': {
      const reason = wReason(c.reason); if (!reason) throw new Error('Διάλεξε τον λόγο εξόδου');
      const time = wTime(c.time, 'εξόδου'); const log = s.weaponLog || [];
      const open = new Set(log.filter(m => !m.inDay).map(m => m.pid));
      const add: WeaponMove[] = []; const noW: string[] = []; const already: string[] = [];
      for (const pid of [...new Set(c.pids)]) {
        const p = pm.get(pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
        if (!p.weapon) noW.push(shortName(p)); else if (open.has(pid)) already.push(shortName(p));
        else add.push({ id: ctx.newId(), pid, weapon: p.weapon, reason, outDay: c.day, outTime: time, ...(c.note?.trim() ? { note: c.note.trim() } : {}) });
      }
      if (!add.length) throw new Error(noW.length && !already.length ? 'Δεν έχει αριθμό όπλου: ' + noW.join(', ') : 'Είναι ήδη εκτός: ' + already.join(', ') + (noW.length ? ' · χωρίς αριθμό όπλου: ' + noW.join(', ') : ''));
      const skip = [noW.length && 'χωρίς αριθμό όπλου: ' + noW.join(', '), already.length && 'ήδη εκτός: ' + already.join(', ')].filter(Boolean).join(' · ');
      return { state: { ...s, weaponLog: [...log, ...add] }, text: 'Έξοδος όπλων (' + reason + ') ' + dm(c.day) + ' ' + time + ': ' + who(s, add.map(m => m.pid)) + (skip ? ' (δεν βγήκαν, ' + skip + ')' : ''), files: [] };
    }
    case 'weaponIn': {
      const time = wTime(c.time, 'εισόδου'); const ids = new Set(c.ids); const lists = s.settings.lists;
      const done: WeaponMove[] = [];
      const weaponLog = (s.weaponLog || []).map(m => {
        if (!ids.has(m.id) || m.inDay) return m;
        if (c.day + ' ' + time < m.outDay + ' ' + m.outTime) throw new Error('Η είσοδος (' + dm(c.day) + ' ' + time + ') είναι πριν την έξοδο (' + dm(m.outDay) + ' ' + m.outTime + ') για ' + shortName(pm.get(m.pid) || { last: '?', first: '' } as Person));
        const x: WeaponMove = { ...m, inDay: c.day, inTime: time, inReason: wReason(c.reason) || weaponBack(m.reason, lists) }; done.push(x); return x;
      });
      if (!done.length) return { state: s, text: '', files: [] };
      const rs = [...new Set(done.map(m => m.inReason))];
      return { state: { ...s, weaponLog }, text: 'Είσοδος όπλων (' + rs.join(', ') + ') ' + dm(c.day) + ' ' + time + ': ' + who(s, done.map(m => m.pid)), files: [] };
    }
    case 'editWeaponMove': {
      const log = s.weaponLog || []; const m = log.find(x => x.id === c.id); if (!m) throw new Error('Δεν βρέθηκε η κίνηση');
      const pt = c.patch; const x: WeaponMove = { ...m };
      if (pt.reason !== undefined) { const r = wReason(pt.reason); if (!r) throw new Error('Ο λόγος εξόδου δεν μένει κενός'); x.reason = r; }
      if (pt.outDay) x.outDay = pt.outDay;
      if (pt.outTime !== undefined) x.outTime = wTime(pt.outTime, 'εξόδου');
      if (pt.note !== undefined) { if (pt.note.trim()) x.note = pt.note.trim(); else delete x.note; }
      if (pt.inDay === '') { delete x.inDay; delete x.inTime; delete x.inReason; }
      else {
        if (pt.inDay) x.inDay = pt.inDay;
        if (pt.inTime !== undefined && x.inDay) x.inTime = wTime(pt.inTime, 'εισόδου');
        if (pt.inReason !== undefined && x.inDay) x.inReason = wReason(pt.inReason) || weaponBack(x.reason, s.settings.lists);
      }
      if (x.inDay && (x.inDay + ' ' + (x.inTime || '')) < x.outDay + ' ' + x.outTime) throw new Error('Η είσοδος είναι πριν την έξοδο');
      if (!x.inDay && log.some(y => y.id !== x.id && y.pid === x.pid && !y.inDay)) throw new Error('Το όπλο του έχει ήδη άλλη έξοδο χωρίς είσοδο');
      if (JSON.stringify(x) === JSON.stringify(m)) return { state: s, text: '', files: [] };
      const p = pm.get(m.pid);
      return { state: { ...s, weaponLog: log.map(y => (y.id === x.id ? x : y)) }, text: 'Διόρθωση κίνησης όπλου' + (p ? ' ' + shortName(p) : '') + ': ' + x.reason + ' ' + dm(x.outDay) + ' ' + x.outTime + (x.inDay ? ' → ' + (x.inReason || '') + ' ' + dm(x.inDay) + ' ' + x.inTime : ' (εκτός)'), files: [] };
    }
    case 'deleteWeaponMove': {
      const log = s.weaponLog || []; const m = log.find(x => x.id === c.id); if (!m) throw new Error('Δεν βρέθηκε η κίνηση');
      const p = pm.get(m.pid);
      return { state: { ...s, weaponLog: log.filter(x => x.id !== c.id) }, text: 'Σβήστηκε κίνηση όπλου' + (p ? ' ' + shortName(p) : '') + ': ' + m.reason + ' ' + dm(m.outDay) + ' ' + m.outTime, files: [] };
    }
    case 'addNote': case 'editNote': case 'doneNote': case 'deleteNote': return noteCmd(s, c, ctx);
    case 'addPerson': {
      const p = makePerson(s, c.person);
      return { state: { ...s, people: [...s.people, p], settings: rememberChoices(s.settings, p) }, text: 'Νέος στρατιώτης: ' + (rankTxt(p) ? rankTxt(p) + ' ' : '') + p.last + ' ' + p.first, files: [] };
    }
    case 'addPeople': {
      // Γρήγορη εισαγωγή (Νέα ΕΣΣΟ): όλοι μαζί, μία αναίρεση και μία εγγραφή στο Δυναμολόγιο· αν ένας δεν μπαίνει, δεν μπαίνει κανείς
      if (!c.people.length) throw new Error('Δεν έγραψες κανέναν στρατιώτη');
      let st = s; const added: Person[] = [];
      c.people.forEach((x, i) => {
        let p: Person;
        try { p = makePerson(st, x); } catch (e) { throw new Error('Γραμμή ' + (i + 1) + ': ' + (e instanceof Error ? e.message : String(e))); }
        added.push(p); st = { ...st, people: [...st.people, p], settings: rememberChoices(st.settings, p) };
      });
      const names = added.slice(0, 5).map(p => p.last + ' ' + p.first).join(', ') + (added.length > 5 ? ' και άλλοι ' + (added.length - 5) : '');
      return { state: st, text: (added.length === 1 ? 'Νέος στρατιώτης: ' : added.length + ' νέοι στρατιώτες: ') + names, files: [] };
    }
    case 'setBaseline': {
      const p = pm.get(c.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      const clean: Baseline = {}; let any = false;
      for (const [k, n] of Object.entries(c.baseline)) { const v = Math.max(0, Math.floor(Number(n) || 0)); if (v) { (clean as Record<string, number>)[k] = v; any = true; } }
      const baseline = { ...s.baseline }; if (any) baseline[c.pid] = clean; else delete baseline[c.pid];
      const txt = Object.entries(clean).map(([k, n]) => (k === 'hol' ? 'αργίες' : KIND_NAME[k as DutyKind] || k) + ' ' + n).join(', ') || 'καμία';
      // γραμμένες με το χέρι: ο έλεγχος μετά την αναβάθμιση (για όσες έβαζε η παλιά ανάγνωση του Excel) δεν χρειάζεται
      const settings = s.settings.baselineReviewed ? s.settings : { ...s.settings, baselineReviewed: true };
      return { state: { ...s, baseline, settings }, text: 'Προηγούμενες υπηρεσίες ' + shortName(p) + ': ' + txt, files: ['Έλεγχος υπηρεσιών'] };
    }
    case 'setHkaiManual': {
      const hkaiManual = { ...s.hkaiManual, [c.date]: c.manual };
      return { state: { ...s, hkaiManual }, text: HK() + ' ' + dm(c.date) + ': χειροκίνητα στοιχεία', files: [HK()] };
    }
    case 'setPhase':
      if (c.phase === s.settings.phase) return { state: s, text: '', files: [] };
      if (!phaseList(s.settings).some(x => x.id === c.phase)) throw new Error('Δεν βρέθηκε το έντυπο υπηρεσιών');
      return { state: { ...s, settings: { ...s.settings, phase: c.phase } }, text: 'Έντυπο υπηρεσιών: ΦΡΟΥΡΑ ' + phaseName(s.settings, c.phase), files: [] };
    // Δικά σου έντυπα υπηρεσιών (Michael, 22/10): ξεκινούν ως αντίγραφο ενός άλλου, με τις ίδιες υπηρεσίες και θέσεις
    // (ίδια κλειδιά = ίδιο ιστορικό και δικαιοσύνη), και βγαίνουν στο Excel με το έντυπο εκείνου (ΣΒΕΝ ή ΣΠΕΝ)
    case 'addPhase': {
      const name = phaseNameOk(s.settings, c.name);
      if (!phaseList(s.settings).some(x => x.id === c.from)) throw new Error('Δεν βρέθηκε το έντυπο υπηρεσιών');
      const id = 'f' + ctx.newId().replace(/[^a-z0-9]/gi, '').slice(0, 8);
      const phases = [...(s.settings.phases || []), { id, name, base: phaseBase(s.settings, c.from), blocks: blocksOf(s.settings, c.from).map(b => ({ ...b, posts: b.posts.map(p => ({ ...p })) })) }];
      return { state: { ...s, settings: { ...s.settings, phases } }, text: 'Νέο έντυπο υπηρεσιών: ΦΡΟΥΡΑ ' + name + ' (αντίγραφο της ΦΡΟΥΡΑ ' + phaseName(s.settings, c.from) + ')', files: [] };
    }
    case 'renamePhase': {
      const f = (s.settings.phases || []).find(x => x.id === c.id); if (!f) throw new Error('Η ΣΒΕΝ και η ΣΠΕΝ δεν αλλάζουν όνομα');
      const name = phaseNameOk(s.settings, c.name, c.id); if (name === f.name) return { state: s, text: '', files: [] };
      return { state: { ...s, settings: { ...s.settings, phases: s.settings.phases!.map(x => (x.id === c.id ? { ...x, name } : x)) } }, text: 'ΦΡΟΥΡΑ ' + f.name + ': λέγεται πια ΦΡΟΥΡΑ ' + name, files: [] };
    }
    case 'delPhase': {
      const f = (s.settings.phases || []).find(x => x.id === c.id); if (!f) throw new Error('Η ΣΒΕΝ και η ΣΠΕΝ δεν διαγράφονται');
      const why = phaseDelWhy(s, c.id); if (why) throw new Error(why);
      return { state: { ...s, settings: { ...s.settings, phases: s.settings.phases!.filter(x => x.id !== c.id) } }, text: 'Διαγράφηκε το έντυπο υπηρεσιών ΦΡΟΥΡΑ ' + f.name, files: [] };
    }
    case 'addBlock': {
      const name = c.name.trim(); if (!name) throw new Error('Γράψε όνομα για τη νέα υπηρεσία');
      const n = Math.min(10, Math.max(1, Math.floor(c.n) || 1));
      const id = 'x' + ctx.newId().replace(/[^a-z0-9]/gi, '').slice(0, 8);
      const short = (i: number) => (n === 1 ? name : (i + 1) + 'ος');
      const sh = blockShift(c.shift, n);
      // κάθε δική σου υπηρεσία μετρά ως δική της (Michael, 22/10): είδος «άλλη», με δική της στήλη στον έλεγχο και στη σειρά
      const b: BlockDef = { id, kind: c.kind || 'other', name, armed: c.armed, custom: true, ...(c.off ? { hidden: true } : {}), ...(sh ? { shift: sh } : {}), posts: Array.from({ length: n }, (_, i) => ({ k: id + '_' + (i + 1), label: name + (n === 1 ? '' : ' ' + (i + 1) + 'ος'), short: short(i), hrs: c.hrs.trim() || 'ημέρα' })) };
      return { state: { ...s, settings: fillCodes(withBlocks(s.settings, c.phase, [...blocksOf(s.settings, c.phase), b]), c.phase, id) }, text: 'Νέα υπηρεσία στη ΦΡΟΥΡΑ ' + phaseName(s.settings, c.phase) + ': ' + name + ' (' + n + (n === 1 ? ' άτομο' : ' άτομα') + (c.armed ? ', ένοπλη' : '') + (c.off ? ', ανενεργή' : '') + ')', files: [] };
    }
    case 'editBlock': {
      // Επεξεργασία υπηρεσίας: όνομα και πλήθος (μόνο στις δικές σου), ώρες ανά θέση (όσες δεν έχουν βάρδιες), σειρά
      const list = [...blocksOf(s.settings, c.phase)]; const i = list.findIndex(x => x.id === c.id); if (i < 0) throw new Error('Δεν βρέθηκε η υπηρεσία');
      const b = list[i];
      if (c.move) {
        const j = i + c.move; if (j < 0 || j >= list.length || list[j].kind === 'ly' || b.kind === 'ly') return { state: s, text: '', files: [] };
        [list[i], list[j]] = [list[j], list[i]];
        return { state: { ...s, settings: withBlocks(s.settings, c.phase, list) }, text: 'ΦΡΟΥΡΑ ' + phaseName(s.settings, c.phase) + ', ' + b.name + ': άλλαξε σειρά', files: [] };
      }
      const name = (b.custom && c.name.trim()) || b.name;
      let posts = b.posts.map(p => (p.rot == null && c.hrs[p.k] != null ? { ...p, hrs: c.hrs[p.k].trim() || 'ημέρα' } : p));
      if (b.custom) {
        const n = Math.min(10, Math.max(1, Math.floor(c.n) || 1));
        // οι θέσεις που περισσεύουν κρύβονται (όχι διαγραφή), για να μη χαθεί το ιστορικό τους
        for (let j = posts.length; j < n; j++) posts.push({ k: b.id + '_' + (j + 1), label: '', short: '', hrs: posts[0]?.hrs || 'ημέρα' });
        posts = posts.map((p, j) => ({ ...p, label: name + (n === 1 ? '' : ' ' + (j + 1) + 'ος'), short: n === 1 ? name : (j + 1) + 'ος', hidden: j >= n || undefined }));
        posts.forEach(p => { if (!p.hidden) delete p.hidden; });
      }
      if (c.codes) posts = posts.map(p => (c.codes![p.k] != null ? { ...p, code: c.codes![p.k].trim() } : p));
      const nb: BlockDef = { ...b, name, posts };
      // βάρδιες (Michael, 20/10): null = όπως πριν (οι βάρδιες 2 ωρών του εντύπου, ή οι ώρες κάθε θέσης)
      // δικές μου βάρδιες (Michael, 24/10): το νούμερο κάθε βάρδιας μέσα στα νούμερα της υπηρεσίας
      if (c.shift !== undefined) { const sh = blockShift(c.shift, shiftGroups(nb).length); if (sh) nb.shift = sh; else delete nb.shift; }
      list[i] = nb;
      const settings = fillCodes(withBlocks(s.settings, c.phase, list), c.phase, b.id);
      const errs = codeErrors(settings, { phase: c.phase, id: b.id }); if (errs.length) throw new Error(errs[0]);
      return { state: { ...s, settings }, text: 'ΦΡΟΥΡΑ ' + phaseName(s.settings, c.phase) + ', ' + name + ': άλλαξαν τα στοιχεία', files: [] };
    }
    case 'setBlock': {
      const list = blocksOf(s.settings, c.phase); const b = list.find(x => x.id === c.id); if (!b) throw new Error('Δεν βρέθηκε η υπηρεσία');
      // «Ενεργή» (Michael, 20/10): ανενεργή = hidden, δεν σβήνεται. Δεν μπαίνει στις θέσεις, στην αυτόματη συμπλήρωση και
      // στο έντυπο· οι υπηρεσίες που έγιναν μένουν στον έλεγχο υπηρεσιών, στη δικαιοσύνη και στην καρτέλα. Όσες είχαν
      // μπει για αύριο και μετά βγαίνουν (αλλιώς θα μετρούσαν χωρίς να φαίνονται)· η σημερινή μένει, μπορεί να έγινε ήδη.
      // Μόνο στο έντυπο που ισχύει: οι θέσεις του άλλου εντύπου μπορεί να έχουν τα ίδια κλειδιά (θαλαμοφύλακες, μαγειρεία).
      if (c.patch.hidden && b.kind === 'ly') throw new Error('Ο Λ/Υ και ο Δ/Υ μένουν πάντα ενεργοί (χρειάζονται στην ΗΚΑΙ)');
      let guards = s.guards, gone = 0;
      if (c.patch.hidden && !b.hidden && c.phase === (s.settings.phase || 'sven')) {
        const ks = new Set(b.posts.map(p => p.k));
        guards = { ...s.guards };
        for (const d in guards) if (d > ctx.today) {
          const g = guards[d]; const left = Object.fromEntries(Object.entries(g).filter(([k]) => !ks.has(k)));
          const n = Object.keys(g).length - Object.keys(left).length;
          if (n) { gone += n; if (Object.keys(left).length) guards[d] = left; else delete guards[d]; }
        }
        if (!gone) guards = s.guards;
      }
      const what = c.patch.hidden != null ? (c.patch.hidden ? 'ανενεργή' + (gone ? ', βγήκαν ' + gone + (gone === 1 ? ' υπηρεσία' : ' υπηρεσίες') + ' από αύριο και μετά' : '') : 'ενεργή') : c.patch.armed != null ? (c.patch.armed ? 'ένοπλη' : 'άοπλη') : 'άλλαξε';
      return { state: { ...s, guards, settings: withBlocks(s.settings, c.phase, list.map(x => (x.id === c.id ? { ...x, ...c.patch } : x))) }, text: 'ΦΡΟΥΡΑ ' + phaseName(s.settings, c.phase) + ', ' + b.name + ': ' + what, files: [] };
    }
    case 'setNightTraining': {
      const nightTraining = { ...(s.nightTraining || {}) };
      if (c.on === !!nightTraining[c.date]) return { state: s, text: '', files: [] };
      if (c.on) nightTraining[c.date] = true; else delete nightTraining[c.date];
      return { state: { ...s, nightTraining }, text: (c.on ? 'Βραδινή εκπαίδευση ' : 'Βγήκε η βραδινή εκπαίδευση ') + dayName(c.date, ctx.today).toLowerCase() + ' ' + dm(c.date) + (c.on ? ' (δεν μετρά στη στέρηση εξόδου)' : ''), files: [] };
    }
    case 'extendOpen': {
      // Εγγραφές χωρίς λήξη (κενό «έως» στο Excel): ισχύουν και σήμερα. Χωρίς γραμμή ιστορικού, δεν αναιρείται.
      const statuses = s.statuses.map(x => (x.open && x.to < ctx.today ? { ...x, to: ctx.today } : x));
      return { state: statuses.some((x, i) => x !== s.statuses[i]) ? { ...s, statuses } : s, text: '', files: [], source: 'auto', undoable: false };
    }
    case 'expire': {
      // Τα ιατρικά και οι ποινές που έληξαν «αφαιρούνται» (Κ-04, Κ-10): δεν αλλάζει κάτι στα δεδομένα, γράφεται μόνο στο
      // ιστορικό ώστε ο χρήστης να το δει. Όσα έληξαν από την προηγούμενη φορά (και όσο η εφαρμογή ήταν κλειστή) ως χθες.
      const since = s.lastExpire || addDays(ctx.today, -1);   // ίδια μέρα δεύτερη φορά: τίποτα
      const ex = s.statuses.filter(x => !x.pending && (s.lastExpire ? !x.open && RECORD_CATS.includes(TYPES[x.type].cat) && x.to >= since && x.to < ctx.today : isRecordExpiredOn(x, ctx.today)));
      return {
        state: s.lastExpire === ctx.today ? s : { ...s, lastExpire: ctx.today }, source: 'auto', undoable: false, files: [],
        text: ex.length ? 'Έληξαν και αφαιρέθηκαν ' + ex.length + ' καταχωρήσεις' : '',
        extra: ex.map(x => 'Έληξε: ' + (x.type === 'PUN' ? 'ποινή (' + punLbl(x.kind) + ')' : statusLbl(x, s.settings.lists)) + ' του ' + shortName(pm.get(x.pid)!) + ' (έως ' + dm(x.to) + ')')
      };
    }
  }
}

// Εισαγωγή/ενημέρωση από το Δυναμολόγιο: ταίριασμα με ΑΣΜ, αλλιώς με ονοματεπώνυμο + πατρώνυμο.
export const personKey = (p: { last: string; first: string; father: string }) => normGreek(p.last + '|' + p.first + '|' + p.father);
// Το άτομο μετά την εισαγωγή: αλλάζουν μόνο τα πεδία που έφερε η γραμμή. Χωρίς «σε δύναμη» στη γραμμή (το αρχείο δεν έχει
// φύλλο ΕΚΤΟΣ), όποιος είναι στο Δυναμολόγιο ξαναμπαίνει σε δύναμη, εκτός αν τον έβγαλε φύλλο ΕΚΤΟΣ ΔΥΝΑΜΗΣ (άλλο αρχείο).
// Όποιος ξαναμπαίνει σε δύναμη χάνει τη σημείωση «Εκτός δύναμης…» που είχε γράψει η εφαρμογή.
function mergeRow(ex: Person, r: ImportRow): Person {
  const auto = ex.notes.startsWith(OUT_NOTE);
  const active = r.active ?? (ex.active || !auto);
  const next: Person = { ...ex, ...r, id: ex.id, active };
  delete next.added; if (!next.origin) delete next.origin;
  if (active && r.notes === undefined && auto) next.notes = '';
  return next;
}
const newPerson = (r: ImportRow, id: number): Person => { const p: Person = { post: null, attached: false, notes: '', ...r, id, active: r.active ?? true }; if (!p.origin) delete p.origin; return p; };
function importPeople(s: AppState, rows: ImportRow[], source: string, deactivateMissing: boolean): Result {
  const byAsm = new Map(s.people.filter(p => p.asm).map(p => [p.asm, p]));
  const byName = new Map(s.people.map(p => [personKey(p), p]));
  let nextId = s.people.reduce((a, p) => Math.max(a, p.id), 0) + 1;
  const seen = new Set<number>();
  const updated = new Map<number, Person>();
  const added: Person[] = [];
  for (const r of rows) {
    const ex = (r.asm && byAsm.get(r.asm)) || byName.get(personKey(r));
    if (ex) { seen.add(ex.id); updated.set(ex.id, mergeRow(ex, r)); }
    else added.push(newPerson(r, nextId++));
  }
  // Όσοι λείπουν από το νέο Δυναμολόγιο: αν δεν έχουν καμία καταχώρηση ή υπηρεσία σβήνονται (π.χ. λάθος γραμμές
  // παλιάς εισαγωγής), αλλιώς γίνονται «εκτός δύναμης» για να μείνει το ιστορικό τους.
  const used = new Set<number>(s.statuses.map(x => x.pid));
  Object.values(s.guards).forEach(g => Object.values(g).forEach(id => used.add(id)));
  let deact = 0, removed = 0;
  const people = s.people.flatMap(p => {
    const u = updated.get(p.id); if (u) return [u];
    if (deactivateMissing && !used.has(p.id)) { removed++; return []; }
    // νέος από την εφαρμογή που δεν είναι στο Δυναμολόγιο: τον έσβησε ο λοχίας, δεν ξαναγράφεται εκεί
    if (deactivateMissing && p.active) { deact++; const q = { ...p, active: false }; delete q.added; return [q]; }
    return [p];
  }).concat(added);
  const caps = { ...s.caps }; for (const k of Object.keys(caps)) if (!people.some(p => p.id === +k)) delete caps[+k];
  const parts = [added.length + ' νέα', updated.size + ' ενημερώθηκαν'].concat(deact ? [deact + ' εκτός δύναμης'] : [], removed ? [removed + ' αφαιρέθηκαν'] : []);
  return { state: { ...s, people, caps }, text: 'Εισαγωγή από ' + source + ': ' + parts.join(', '), files: [source], source: 'import' };
}

// Τι αλλάζει στον καθένα με μια εισαγωγή προσωπικού (για την προεπισκόπηση: «ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.: Σ.Ι Ι1 → Ι3»)
const ROSTER_FIELDS: [keyof ImportRow, string][] = [['rank', 'βαθμός'], ['origin', 'προέλευση'], ['spec', 'Ο/Σ'], ['last', 'επώνυμο'], ['first', 'όνομα'], ['father', 'πατρώνυμο'], ['asm', 'ΑΣΜ'],
  ['phone', 'τηλέφωνο'], ['room', 'θάλαμος'], ['si', 'Σ.Ι'], ['post', 'πόστο'], ['role', 'ρόλος'], ['dn', 'ΔΝ'], ['active', 'σε δύναμη']];
const rv = (v: unknown) => (v == null || v === '' ? '—' : v === true ? 'ναι' : v === false ? 'όχι' : String(v));
export function rosterChanges(s: AppState, rows: ImportRow[]): { changes: { who: string; what: string }[]; same: number } {
  const byAsm = new Map(s.people.filter(p => p.asm).map(p => [p.asm, p]));
  const byName = new Map(s.people.map(p => [personKey(p), p]));
  const changes: { who: string; what: string }[] = []; let same = 0;
  for (const r of rows) {
    const ex = (r.asm && byAsm.get(r.asm)) || byName.get(personKey(r)); if (!ex) continue;
    const next = mergeRow(ex, r) as unknown as Record<string, unknown>; const cur = ex as unknown as Record<string, unknown>;
    const what = ROSTER_FIELDS.filter(([k]) => (r[k] !== undefined || k === 'active') && rv(cur[k] ?? (k === 'dn' ? false : null)) !== rv(next[k] ?? (k === 'dn' ? false : null)))
      .map(([k, label]) => label + ' ' + rv(cur[k] ?? (k === 'dn' ? false : null)) + ' → ' + rv(next[k]));
    if (what.length) changes.push({ who: fullName(ex), what: what.join(', ') }); else same++;
  }
  return { changes, same };
}

export const describeDay = (d: ISODate, today: ISODate) => dayName(d, today).toLowerCase();
