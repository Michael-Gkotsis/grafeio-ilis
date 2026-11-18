// Δυναμολόγιο ΑΛΛΗΣ μονάδας (πρότυπα άλλων μονάδων, φάση 4): ανάγνωση, μοντέλο της οθόνης «Αντιστοίχιση…» και προφίλ (kind 'roster').
// Η μονάδα έχει δικό της αρχείο: κύριος κατάλογος με στελέχη και στρατιώτες μαζί, βαθμός με το όπλο σε παρένθεση, ΙΛΗ με δικούς της κωδικούς,
// ΚΑΤΑΣΤΑΣΗ με δικές της λέξεις, αριθμημένες θέσεις χωρίς όνομα, λίστες απόντων / παρόντων που βγαίνουν από τον κατάλογο και σύνοψη με τύπους.
//   - το αρχείο που δουλεύει σήμερα (parseRoster, roster.ts) δεν αλλάζει καθόλου: εδώ μπαίνει μόνο όταν b.own
//   - κανένα «σίγουρο» χωρίς λόγο: η στήλη, ο βαθμός, η λέξη κατάστασης και η τιμή ΙΛΗ που δεν είναι γνωστά ΔΕΝ μαντεύονται (πρόταση ή «Δεν το ξέρω»)
//   - η ΚΑΤΑΣΤΑΣΗ διαβάζεται ως πληροφορία (φαίνεται στην προεπισκόπηση)· δεν φτιάχνει καταστάσεις με ημερομηνίες
//   - στελέχη (και βαθμοί που δεν ξέρουμε) ΔΕΝ μπαίνουν στους στρατιώτες· το μέτρημά τους φαίνεται στην προεπισκόπηση
import { normGreek } from './text';
import { Grid, valueText, type SheetModel } from './sheetModel';
import { buildLexicon, normText, phraseKey, type Lexicon } from './lexicon';
import { detectSheet, type ListRegion } from './shape';
import { readRoster, type RosterAsk, type RosterPerson, type RosterRead } from './rosterRead';
import { withOrigin, listRows } from './ranks';
import { personKey } from './commands';
import type { ImportRow } from './commands';
import { isUnit } from './mode';
import { essoPersonTxt } from './esso';
import { colLetter, type SourceBinding } from './sources';
import type { AppState, Person, Settings } from './domain';
import type { CellValue, RawSheet } from './roster';
import { profilesOf, type RosterProfile, type RosterRole, type TplProfile } from './tplStore';
import { PROFILE_VERSION } from './tplStore';

export const ROSTER_PROFILE_ID = 'roster-1';
export const rosterProfileOf = (settings: Pick<Settings, 'tplProfiles'> | undefined): TplProfile | null => profilesOf(settings).find(p => p.kind === 'roster') ?? null;
export const emptyRos = (sheet = ''): RosterProfile => ({ sheet, cols: {}, ignore: [], roles: {}, refill: [], status: {}, subs: {}, ranks: {} });

// Οι ρόλοι των στηλών: τα πεδία του Προσωπικού της εφαρμογής που μπορεί να έχει το αρχείο
export type Role = 'aa' | 'rank' | 'spec' | 'name' | 'last' | 'first' | 'father' | 'asm' | 'sub' | 'status' | 'remarks' | 'phone' | 'room' | 'essos' | 'si';
export const ROLES: Role[] = ['aa', 'rank', 'spec', 'name', 'last', 'first', 'father', 'asm', 'sub', 'status', 'remarks', 'phone', 'room', 'essos', 'si'];
export const ROLE_LABEL: Record<Role, string> = {
  aa: 'Α/Α', rank: 'Βαθμός (με το όπλο σε παρένθεση)', spec: 'Ο/Σ (όπλο ή ειδικότητα)', name: 'Ονοματεπώνυμο (σε ένα κελί)', last: 'Επώνυμο', first: 'Όνομα', father: 'Πατρώνυμο', asm: 'ΑΣΜ / ΑΜ',
  sub: 'ΙΛΗ / ΛΟΧΟΣ (Λόχος / Ίλα της εφαρμογής)', status: 'ΚΑΤΑΣΤΑΣΗ (πληροφορία)', remarks: 'ΠΑΡΑΤΗΡΗΣΕΙΣ (ρόλος)', phone: 'Τηλέφωνο', room: 'Θάλαμος', essos: 'ΕΣΣΟ', si: 'Σ.Ι.'
};
// Τι διαβάζεται σε κάθε ρόλο και πού γράφεται πίσω (b.cols της αντιστοίχισης): η κατάσταση δεν γράφεται ποτέ στον κατάλογο
const BCOL: Partial<Record<Role, string>> = { aa: 'aa', rank: 'rank', spec: 'spec', name: 'name', last: 'last', first: 'first', father: 'father', asm: 'asm', sub: 'sub', remarks: 'remarks', phone: 'phone', room: 'room', essos: 'essos', si: 'si' };
export const SHEET_ROLES: { value: SheetRole; label: string }[] = [
  { value: 'master', label: 'Κύριος κατάλογος (από εδώ διαβάζει)' }, { value: 'abs', label: 'Λίστα απόντων (βγαίνει από τον κατάλογο)' }, { value: 'pres', label: 'Λίστα παρόντων (βγαίνει από τον κατάλογο)' },
  { value: 'summary', label: 'Σύνοψη / σύνολα (δεν πειράζεται)' }, { value: 'skip', label: 'Άλλο φύλλο (δεν πειράζεται)' }
];
export type SheetRole = 'master' | RosterRole;

// ------------------------------------------------------------------ το φύλλο της εφαρμογής ως μοντέλο της μηχανής
export function toModel(s: RawSheet, blank: number[] = [], from = 0): SheetModel {
  const rows = blank.length ? s.rows.map((row, r) => (r <= from || !row ? row : row.map((v, c) => (blank.includes(c) ? null : v)))) : s.rows;
  return { name: s.name, state: 'visible', rows, fx: s.fx || new Set<string>(), formulas: new Map<string, string>(), merges: [], validations: [] };
}
const txt = (v: CellValue): string => valueText(v as never);

// ------------------------------------------------------------------ βαθμοί: τι είναι στρατιώτης της εφαρμογής
const APP_RANK: Record<string, string> = { ΣΤΡΑΤΙΩΤΗΣ: 'ΣΤΡ', ΥΠΟΔΕΚΑΝΕΑΣ: 'ΥΔΝΕΑΣ', ΔΕΚΑΝΕΑΣ: 'ΔΝΕΑΣ', ΛΟΧΙΑΣ: 'ΛΧΙΑΣ', ΔΕΑ: 'ΔΕΑ' };
const BRACKET = /\(([^)]*)\)/g;
export const baseRank = (rank: string) => rank.replace(BRACKET, ' ').replace(/\s+/g, ' ').trim();
export const armOf = (rank: string): string => { const m = /\(([^)]*)\)\s*$/.exec(rank); return m ? normGreek(m[1]).replace(/[\s.]/g, '') : ''; };

// ------------------------------------------------------------------ λέξεις: ΚΑΤΑΣΤΑΣΗ και ΙΛΗ
export type State = 'sure' | 'suggest' | 'unknown' | 'mine' | 'ignored';
export interface WordView { key: string; text: string; n: number; state: State; value: string; suggest?: string; suggestText?: string; why: string }
export interface Opt { value: string; label: string; group: string }
export interface ColView { c: number; ref: string; text: string; role: Role | null; state: State; value: string; why: string }
export interface AskView { key: string; rank: string; n: number; value: '' | 'cadre' | 'soldier'; proposal?: 'cadre' | 'soldier'; why: string }
export interface SheetView { name: string; role: SheetRole; auto: boolean; people: number; rows: number; formulas: number; hint: string }

const statusLabel = (lex: Lexicon, v: string) => (v === 'present' ? 'Παρών' : v === 'ignore' ? 'Δεν το διαβάζω' : v.startsWith('own:') ? v.slice(4) : lex.label(v) || v);
export function statusOptions(lex: Lexicon): Opt[] {
  const out: Opt[] = [{ value: 'present', label: 'Παρών', group: 'Παρών' }];
  for (const c of lex.concepts.values()) if (c.kind === 'status' && c.id !== 'status:ΠΑΡΩΝ') out.push({ value: c.id, label: c.label, group: 'Κατάσταση της εφαρμογής' });
  out.push({ value: 'ignore', label: 'Δεν το διαβάζω (το αφήνω όπως είναι)', group: 'Αγνόησε' });
  return out;
}
export const subNames = (settings: Settings): string[] => listRows(settings.lists, 'subUnits').filter(r => !r.hidden).map(r => r.name);
export function subOptions(settings: Settings): Opt[] {
  return [...subNames(settings).map(n => ({ value: n, label: n, group: 'Λόχος / Ίλα της εφαρμογής' })), { value: 'ignore', label: 'Καμία (το αφήνω όπως είναι)', group: 'Αγνόησε' }];
}
// τιμή ΙΛΗ → Λόχος/Ίλα: ίδιο κείμενο με στοιχείο της λίστας = σίγουρο· ένα μόνο στοιχείο που περιέχει την τιμή ως ολόκληρη λέξη = πρόταση· αλλιώς δεν το ξέρω
export function guessSub(text: string, names: string[]): { value: string; state: State; why: string } {
  const k = phraseKey(text); if (!k) return { value: '', state: 'unknown', why: 'κενό' };
  const eq = names.filter(n => phraseKey(n) === k); if (eq.length === 1) return { value: eq[0], state: 'sure', why: 'ίδιο όνομα με της λίστας' };
  const has = names.filter(n => phraseKey(n).split(' ').includes(k)); if (has.length === 1) return { value: has[0], state: 'suggest', why: 'περιέχεται στο όνομα «' + has[0] + '»' };
  return { value: '', state: 'unknown', why: names.length ? 'δεν μοιάζει με κάποιον Λόχο / Ίλα της λίστας' : 'δεν υπάρχουν Λόχοι / Ίλες στη λίστα' };
}
export function guessStatus(text: string, lex: Lexicon): { value: string; state: State; why: string } {
  const m = lex.match(text, { kinds: ['status'] });
  if (m.confidence === 'unknown' || !m.concept) return { value: '', state: 'unknown', why: 'άγνωστη λέξη' };
  const v = m.concept === 'status:ΠΑΡΩΝ' ? 'present' : m.concept;
  return { value: v, state: m.confidence === 'sure' ? 'sure' : 'suggest', why: lex.label(m.concept) || '' };
}

// ------------------------------------------------------------------ το αποτέλεσμα της ανάγνωσης
export interface WordStat { key: string; text: string; n: number }
export interface OwnPerson { p: RosterPerson; last: string; first: string; father: string; rank: string; spec: string; kind: 'cadre' | 'soldier' | 'ask'; r: number; sub: string; status: string; row?: ImportRow }
export interface OwnRead {
  found: boolean; sheet: string; header: number; first: number; cols: Record<string, number>; heads: Record<string, string>;
  persons: OwnPerson[]; rows: ImportRow[];
  counts: { people: number; cadre: number; soldier: number; ask: number; vacant: number; noName: number; nonSoldierNoRank: number };
  asks: RosterAsk[]; statusWords: WordStat[]; subWords: WordStat[]; unmappedSub: number; sureCols: string[]; suggestCols: string[];
  warnings: string[]; skipped: string[]; stoppedAt?: string; scanned: number;
}
export interface ReadIn { settings: Settings; people: Person[]; ros: RosterProfile; lex?: Lexicon; assume?: 'cadre' | 'soldier' }

export const lexOf = (settings: Settings, profile?: TplProfile | null): Lexicon => buildLexicon({ lists: settings.lists, ...(profile ? { learned: {} } : {}) });

// στήλες της επικεφαλίδας του πίνακα (όλες, και όσες δεν ξέρουμε)
function headerCols(m: SheetModel, reg: ListRegion): { c: number; text: string; concept: string | null; confidence: string }[] {
  const g = new Grid(m); const out: { c: number; text: string; concept: string | null; confidence: string }[] = [];
  const seen = new Set<number>();
  for (const c of reg.cols) { if (seen.has(c.c)) continue; seen.add(c.c); out.push({ c: c.c, text: c.leaf || c.text, concept: c.match.concept, confidence: c.match.confidence }); }
  void g;
  return out.sort((a, b) => a.c - b.c);
}
const headKey = (t: string) => phraseKey(t);

// Οι ρόλοι των στηλών: αυτά που διάλεξε ο χρήστης (με επικεφαλίδα), αλλιώς αυτά που ξέρει η μηχανή
function pickRegion(m: SheetModel, lex: Lexicon): { reg: ListRegion; shape: ReturnType<typeof detectSheet> } | null {
  const shape = detectSheet(m, { lexicon: lex });
  const hasName = (l: ListRegion) => l.cols.some(c => c.match.confidence !== 'unknown' && /^person:(name|last)$/.test(c.match.concept || ''));
  const reg = shape.regions.filter((x): x is ListRegion => x.type === 'list' && hasName(x)).sort((a, b) => a.headerRows[0] - b.headerRows[0])[0];
  return reg ? { reg, shape } : null;
}
interface Resolved { reg: ListRegion; shape: ReturnType<typeof detectSheet>; cols: ColView[]; byRole: Record<string, number>; ignored: number[] }
export function resolveCols(sheet: RawSheet, ros: RosterProfile, lex: Lexicon): Resolved | null {
  const m = toModel(sheet); const pr = pickRegion(m, lex); if (!pr) return null;
  const hc = headerCols(m, pr.reg); const ign = new Set(ros.ignore.map(headKey));
  const mine = new Map<string, Role>(); for (const [role, h] of Object.entries(ros.cols)) mine.set(headKey(h), role as Role);
  const cols: ColView[] = []; const byRole: Record<string, number> = {}; const ignored: number[] = [];
  for (const h of hc) {
    const hk = headKey(h.text); let role: Role | null = null; let state: State = 'unknown'; let why = '';
    if (mine.has(hk)) { role = mine.get(hk)!; state = 'mine'; }
    else if (ign.has(hk)) { state = 'ignored'; ignored.push(h.c); }
    else {
      const k = (h.concept || '').replace(/^person:/, '') as Role;
      if (h.concept && h.confidence !== 'unknown' && (ROLES as string[]).includes(k)) {
        role = k; state = h.confidence === 'sure' ? 'sure' : 'suggest';
        // οι παρατηρήσεις είναι ρόλος στην εφαρμογή (ΘΑΛΑΜΑΡΧΗΣ…): στο αρχείο μιας άλλης μονάδας μπορεί να είναι ελεύθερο κείμενο, άρα μόνο πρόταση
        if (k === 'remarks') { state = 'suggest'; why = 'στην εφαρμογή οι παρατηρήσεις είναι ο ρόλος του ατόμου (ΘΑΛΑΜΑΡΧΗΣ…)· είναι έτσι και εδώ;'; }
        else if (k === 'name' && !ros.order && !/ΕΠΩΝΥΜ.*ΟΝΟΜΑ|ΟΝΟΜΑ.*ΕΠΩΝΥΜ/.test(normText(h.text))) { state = 'suggest'; why = 'δεν φαίνεται ποιο είναι πρώτο, επώνυμο ή όνομα'; }
      }
    }
    // δύο στήλες με τον ίδιο ρόλο: κρατιέται η πρώτη, η άλλη μένει «Δεν τη διαβάζω»
    if (role && role in byRole) { role = null; state = 'unknown'; why = 'ο ρόλος υπάρχει ήδη σε άλλη στήλη'; }
    if (role) byRole[role] = h.c;
    cols.push({ c: h.c, ref: colLetter(h.c), text: h.text, role, state, value: role || '', why });
  }
  return { reg: pr.reg, shape: pr.shape, cols, byRole, ignored };
}

const splitName = (name: string, order: 'last-first' | 'first-last' | undefined): { last: string; first: string; father: string } | null => {
  const w = name.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!order || w.length < 2) return null;
  if (w.length === 2) return order === 'last-first' ? { last: w[0], first: w[1], father: '' } : { first: w[0], last: w[1], father: '' };
  if (w.length === 3 && order === 'last-first') return { last: w[0], first: w[1], father: w[2] };
  return null;   // επώνυμο ή όνομα με πολλές λέξεις: δεν μαντεύεται
};

// Ο κύριος κατάλογος → άτομα
export function readOwnRoster(sheet: RawSheet, o: ReadIn): OwnRead {
  const lex = o.lex || lexOf(o.settings); const ros = o.ros;
  const out: OwnRead = { found: false, sheet: sheet.name, header: -1, first: -1, cols: {}, heads: {}, persons: [], rows: [], counts: { people: 0, cadre: 0, soldier: 0, ask: 0, vacant: 0, noName: 0, nonSoldierNoRank: 0 }, asks: [], statusWords: [], subWords: [], unmappedSub: 0, sureCols: [], suggestCols: [], warnings: [], skipped: [], scanned: sheet.rows.length };
  const rc = resolveCols(sheet, ros, lex);
  if (!rc) { out.warnings.push('Δεν βρέθηκε πίνακας με ονόματα στο φύλλο «' + sheet.name + '».'); return out; }
  out.found = true; out.header = rc.reg.headerRows[1]; out.first = rc.reg.headerRows[1] + 1;
  for (const c of rc.cols) if (c.role) { out.cols[c.role] = c.c; out.heads[c.role] = c.text; (c.state === 'sure' || c.state === 'mine' ? out.sureCols : out.suggestCols).push(c.role); }
  // μόνο οι στήλες με ρόλο περνούν στην μηχανή: οι άλλες (και όσες αγνόησε ο χρήστης) δεν επηρεάζουν τίποτα
  const use = new Set(Object.values(out.cols)); const drop = rc.cols.filter(c => !use.has(c.c)).map(c => c.c);
  const model = toModel(sheet, drop, out.header);
  const answers: Record<string, 'cadre' | 'soldier'> = {}; for (const [k, v] of Object.entries(ros.ranks)) answers[k] = v;
  const colsForRead: Record<string, number> = {}; for (const [r, c] of Object.entries(out.cols)) colsForRead[r === 'sub' || r === 'status' ? 'person:' + r : r] = c;
  let rr: RosterRead;
  try { rr = readRoster(model, { lexicon: lex, shape: rc.shape, cols: colsForRead, answers, ...(o.assume ? { assume: o.assume } : {}) }); } catch (e) { out.warnings.push('Η ανάγνωση του φύλλου «' + sheet.name + '» δεν πέτυχε: ' + (e instanceof Error ? e.message : String(e))); out.found = false; return out; }
  // ο βαθμός ρωτιέται χωρίς το όπλο σε παρένθεση: «ΔΝΕΑΣ (ΜΧ)» και «ΔΝΕΑΣ (ΤΘ)» είναι μία ερώτηση
  const askKey = (rank: string) => phraseKey(baseRank(rank));
  for (const p of rr.people) if (p.kind === 'ask' && ros.ranks[askKey(p.rank)]) p.kind = ros.ranks[askKey(p.rank)];
  const grouped = new Map<string, RosterAsk>();
  for (const a of rr.ask) { const rows = a.rows.filter(r => rr.people.find(p => p.r === r)?.kind === 'ask'); if (!rows.length) continue; const k = askKey(a.rank) || '·'; const g = grouped.get(k); if (g) g.rows.push(...rows); else grouped.set(k, { ...a, rank: baseRank(a.rank), rows: [...rows] }); }
  out.counts.vacant = rr.vacant; out.asks = [...grouped.values()]; out.skipped = rr.skipped.filter(s => s.why !== 'θέση χωρίς όνομα').slice(0, 50).map(s => 'γραμμή ' + (s.r + 1) + ': ' + s.why);
  if (rr.stoppedAt) out.stoppedAt = 'γραμμή ' + (rr.stoppedAt.r + 1) + ': ' + rr.stoppedAt.why;
  out.warnings.push(...rr.warnings);
  const cell = (r: number, role: string): string => (out.cols[role] == null ? '' : txt((sheet.rows[r] || [])[out.cols[role]]));
  const names = subNames(o.settings); const unit = isUnit(o.settings);
  const byAsm = new Map(o.people.filter(p => p.asm).map(p => [p.asm, p])); const byKey = new Map(o.people.map(p => [personKey(p), p]));
  const sw = new Map<string, WordStat>(), bw = new Map<string, WordStat>();
  const bump = (m: Map<string, WordStat>, t: string) => { const k = phraseKey(t); if (!k) return; const x = m.get(k); if (x) x.n++; else m.set(k, { key: k, text: t, n: 1 }); };
  for (const p of rr.people) {
    let last = p.last || '', first = p.first || '', father = p.father || '';
    if (!last && !first && p.name) { const s = splitName(p.name, ros.order); if (s) ({ last, first, father } = s); }
    const rank = p.rank; const spec = armOf(rank);
    const status = cell(p.r, 'status'); const sub = cell(p.r, 'sub');
    const x: OwnPerson = { p, last, first, father, rank, spec, kind: p.kind, r: p.r, sub, status };
    out.persons.push(x); out.counts.people++;
    if (status) bump(sw, status);
    if (p.kind === 'ask') { out.counts.ask++; continue; }
    if (p.kind === 'cadre') { out.counts.cadre++; continue; }
    out.counts.soldier++;
    if (sub) bump(bw, sub);
    if (!last || !first) { out.counts.noName++; continue; }
    // ---- η γραμμή για την εισαγωγή: μόνο όσα δίνει το αρχείο (όσα λείπουν μένουν όπως είναι στην εφαρμογή)
    const base = baseRank(rank);
    const app = p.rankConcept ? APP_RANK[p.rankConcept.slice(5)] : undefined;
    const ro = withOrigin({ rank: app || normGreek(base) || 'ΣΤΡ', ...(p.origin && !app ? { origin: p.origin } : {}) }, o.settings.lists);
    const row: Record<string, unknown> = { last: normGreek(last).toUpperCase() === last ? last : last, first, ...(father ? { father } : {}) };
    if (out.cols.rank != null) { row.rank = ro.rank || 'ΣΤΡ'; if (ro.origin) row.origin = ro.origin; }
    const sp = out.cols.spec != null ? normGreek(cell(p.r, 'spec')) : spec; if (out.cols.spec != null || spec) row.spec = sp;
    if (out.cols.asm != null && cell(p.r, 'asm')) row.asm = cell(p.r, 'asm').replace(/\s/g, '');
    if (out.cols.phone != null && cell(p.r, 'phone')) row.phone = cell(p.r, 'phone').replace(/\s/g, '');
    if (out.cols.room != null) { const n = parseInt(cell(p.r, 'room'), 10); row.room = n > 0 ? n : null; }
    if (out.cols.si != null) row.si = normGreek(cell(p.r, 'si'));
    if (out.cols.remarks != null) row.role = cell(p.r, 'remarks') || null;
    if (unit && out.cols.sub != null && sub) {
      const pick = ros.subs[phraseKey(sub)]; const g = guessSub(sub, names);
      const v = pick !== undefined ? pick : g.state === 'sure' ? g.value : '';
      if (v && v !== 'ignore') row.sub = v; else out.unmappedSub++;
    }
    if (unit && out.cols.essos != null && cell(p.r, 'essos')) row.essos = cell(p.r, 'essos');
    const ex = (row.asm && byAsm.get(row.asm as string)) || byKey.get(personKey({ last: row.last as string, first: row.first as string, father: (row.father as string) || '' }));
    if (!ex) Object.assign(row, { rank: row.rank ?? 'ΣΤΡ', spec: row.spec ?? '', father: row.father ?? '', asm: row.asm ?? '', phone: row.phone ?? '', room: row.room ?? null, si: row.si ?? '', role: row.role ?? null, essos: row.essos ?? (o.settings.essos ? essoPersonTxt(o.settings.essos) : '') });
    x.row = row as unknown as ImportRow; out.rows.push(x.row);
  }
  out.statusWords = [...sw.values()]; out.subWords = [...bw.values()];
  if (out.counts.noName) out.warnings.push(out.counts.noName + ' στρατιώτες δεν διαβάστηκαν: το ονοματεπώνυμο δεν χωρίζεται με σιγουριά σε επώνυμο και όνομα.');
  return out;
}

// ------------------------------------------------------------------ τα φύλλα του βιβλίου: ποιο είναι τι
const ABS_RE = /ΑΠΟΝΤ/, PRES_RE = /ΠΑΡΟΝΤ/;
export function sheetViews(sheets: RawSheet[], o: { settings: Settings; ros: RosterProfile | null; lex?: Lexicon }): { views: SheetView[]; master: string } {
  const lex = o.lex || lexOf(o.settings); const ros = o.ros;
  const counts = sheets.map(s => {
    let n = 0, vacant = 0;
    try { const rd = readOwnRoster(s, { settings: o.settings, people: [], ros: emptyRos(s.name), lex }); n = rd.counts.people; vacant = rd.counts.vacant; } catch { /* άλλο φύλλο */ }
    return { s, n, vacant, fx: s.fx?.size || 0 };
  });
  const best = [...counts].filter(c => !ABS_RE.test(normText(c.s.name)) && !PRES_RE.test(normText(c.s.name))).sort((a, b) => b.n + b.vacant - (a.n + a.vacant))[0];
  const asked = ros?.sheet && sheets.some(s => s.name === ros.sheet) ? ros.sheet : '';
  const master = asked || (best && best.n > 0 ? best.s.name : '');
  const views = counts.map(({ s, n, vacant, fx }): SheetView => {
    const given = ros?.roles[s.name]; const nm = normText(s.name);
    let role: SheetRole; let auto = true; let hint = '';
    if (s.name === master) { role = 'master'; auto = !!asked || counts.filter(c => c.n > 0).length === 1; hint = asked ? '' : counts.filter(c => c.n > 0).length === 1 ? 'το μόνο φύλλο με ονόματα' : 'το φύλλο με τα περισσότερα ονόματα'; }
    else if (given) { role = given; auto = false; }
    else if (n > 0 && ABS_RE.test(nm)) { role = 'abs'; hint = 'λίστα απόντων από τον κατάλογο'; }
    else if (n > 0 && PRES_RE.test(nm)) { role = 'pres'; hint = 'λίστα παρόντων από τον κατάλογο'; }
    else if (n === 0 && fx > 3) { role = 'summary'; hint = 'έχει τύπους και δεν έχει ονόματα'; }
    else { role = 'skip'; hint = n > 0 ? 'έχει ονόματα· πες μου αν είναι λίστα που βγαίνει από τον κατάλογο' : ''; auto = true; }
    if (s.name === master && given && given !== 'skip') role = 'master';
    return { name: s.name, role, auto, people: n, rows: s.rows.length, formulas: fx, hint: vacant && s.name === master ? hint + (hint ? ' · ' : '') + vacant + ' θέσεις χωρίς όνομα' : hint };
  });
  return { views, master };
}

// Χρειάζεται «Αντιστοίχιση…»; ναι όταν ο υπάρχων αναγνώστης θα έβαζε λάθος: στελέχη μέσα στη λίστα, βαθμοί που δεν ξέρει, λέξεις ΙΛΗ που δεν ξέρει
export function rosterNeeds(sheets: RawSheet[], settings: Settings): number {
  const { master } = sheetViews(sheets, { settings, ros: null }); const s = sheets.find(x => x.name === master); if (!s) return 0;
  const lex = lexOf(settings);
  const rd = readOwnRoster(s, { settings, people: [], ros: emptyRos(s.name), lex, assume: 'soldier' });
  // στο δικό μας αρχείο όλοι είναι στρατιώτες: οι βαθμοί που υπάρχουν και στις δύο λίστες (ΛΧΙΑΣ, ΔΕΑ) δεν ρωτιούνται εκεί
  const asks = rd.asks.length;
  return rd.counts.cadre + asks + rd.subWords.filter(w => guessSub(w.text, subNames(settings)).state !== 'sure').length * (isUnit(settings) ? 1 : 0);
}

// ------------------------------------------------------------------ το μοντέλο της οθόνης
export interface RosterModel {
  found: boolean; master: string; sheets: SheetView[]; cols: ColView[]; header: number; read: OwnRead | null;
  statusWords: WordView[]; subWords: WordView[]; asks: AskView[]; statusOptions: Opt[]; subOptions: Opt[]; issues: string[];
}
export interface ModelIn { settings: Settings; people: Person[]; sheets: RawSheet[]; ros: RosterProfile }
export function buildRosterModel(o: ModelIn): RosterModel {
  const lex = lexOf(o.settings); const { views, master: m0 } = sheetViews(o.sheets, { settings: o.settings, ros: o.ros, lex });
  const master = o.ros.sheet && o.sheets.some(s => s.name === o.ros.sheet) ? o.ros.sheet : m0;
  const sheet = o.sheets.find(s => s.name === master);
  const out: RosterModel = { found: false, master, sheets: views.map(v => (v.name === master ? { ...v, role: 'master' } : v.role === 'master' ? { ...v, role: 'skip' } : v)), cols: [], header: -1, read: null, statusWords: [], subWords: [], asks: [], statusOptions: statusOptions(lex), subOptions: subOptions(o.settings), issues: [] };
  if (!sheet) { out.issues.push('Δεν υπάρχει φύλλο με ονόματα.'); return out; }
  const ros = { ...o.ros, sheet: master };
  const rd = readOwnRoster(sheet, { settings: o.settings, people: o.people, ros, lex }); out.read = rd; out.found = rd.found; out.header = rd.header;
  const rc = resolveCols(sheet, ros, lex); out.cols = rc ? rc.cols : [];
  const names = subNames(o.settings);
  out.statusWords = rd.statusWords.map(w => {
    const pick = ros.status[w.key]; const g = guessStatus(w.text, lex);
    if (pick !== undefined) return { ...w, state: pick === 'ignore' ? 'ignored' as State : pick ? 'mine' as State : 'unknown' as State, value: pick, why: '' };
    return { ...w, state: g.state, value: g.state === 'sure' ? g.value : '', ...(g.state === 'suggest' ? { suggest: g.value, suggestText: statusLabel(lex, g.value) } : {}), why: g.why };
  });
  out.subWords = rd.subWords.map(w => {
    const pick = ros.subs[w.key]; const g = guessSub(w.text, names);
    if (pick !== undefined) return { ...w, state: pick === 'ignore' || pick === '' ? 'ignored' as State : 'mine' as State, value: pick || 'ignore', why: '' };
    return { ...w, state: g.state, value: g.state === 'sure' ? g.value : '', ...(g.state === 'suggest' ? { suggest: g.value, suggestText: g.value } : {}), why: g.why };
  });
  out.asks = rd.asks.map(a => ({ key: phraseKey(a.rank) || '·', rank: a.rank || '(κενός βαθμός)', n: a.rows.length, value: '', ...(a.proposal && a.proposal !== 'ask' ? { proposal: a.proposal } : {}), why: a.why }));
  // βαθμοί που απάντησε ο χρήστης δεν είναι πια «ask» στην ανάγνωση· φαίνονται για να αλλάζουν
  for (const [k, v] of Object.entries(ros.ranks)) if (!out.asks.some(a => a.key === k)) { const r = rd.persons.find(p => phraseKey(baseRank(p.rank)) === k); out.asks.push({ key: k, rank: r ? baseRank(r.rank) : k, n: rd.persons.filter(p => phraseKey(baseRank(p.rank)) === k).length, value: v, why: 'απάντησες εσύ' }); }
  for (const a of out.asks) if (ros.ranks[a.key]) a.value = ros.ranks[a.key];
  if (!('last' in rd.cols) && !('name' in rd.cols)) out.issues.push('Δεν υπάρχει στήλη με επώνυμο ή ονοματεπώνυμο.');
  if (rd.cols.name != null && rd.cols.last == null && !ros.order) out.issues.push('Το ονοματεπώνυμο είναι σε ένα κελί: πες ποιο είναι πρώτο, το επώνυμο ή το όνομα.');
  if (rd.cols.rank == null) out.issues.push('Δεν βρέθηκε στήλη βαθμού: χωρίς βαθμό δεν ξεχωρίζουν τα στελέχη από τους στρατιώτες (ρωτιούνται όλοι).');
  return out;
}

// Τι αποθηκεύεται: ό,τι είναι τώρα στο προσχέδιο (η οθόνη το αλλάζει μόνο με ό,τι κάνει ο χρήστης)
export function rosterProfileFrom(m: RosterModel, ros: RosterProfile, prev: TplProfile | null): TplProfile {
  const draft: RosterProfile = { ...ros, sheet: m.master };
  return { v: PROFILE_VERSION, id: prev?.id ?? ROSTER_PROFILE_ID, kind: 'roster', ...(prev?.name ? { name: prev.name } : {}), fp: prev?.fp ?? { sheets: [], regions: [] }, elements: prev?.elements ?? [], words: prev?.words ?? {}, ignore: prev?.ignore ?? [], ros: draft, ...(prev?.ours ? { ours: prev.ours } : {}) };
}

// Η αντιστοίχιση (SourceBinding) που γράφεται στο αρχείο: οι στήλες του κύριου καταλόγου, χωρίς την κατάσταση
export function ownBinding(rd: OwnRead, file: string, prev?: Partial<SourceBinding>): SourceBinding {
  const cols: Record<string, number> = {};
  for (const [role, c] of Object.entries(rd.cols)) { const k = BCOL[role as Role]; if (k) cols[k] = c; }
  return { file, sheet: rd.sheet, header: rd.header, cols, write: prev?.write ?? true, scope: prev?.scope ?? 'active', own: true };
}

// ------------------------------------------------------------------ δοκιμή: τι θα διαβαστεί και τι θα αλλάξει
export interface Trial {
  people: number; cadre: number; soldier: number; asked: number; vacant: number; noName: number; unmappedSub: number;
  add: number; change: number; same: number; missing: number; status: { label: string; n: number }[]; unknownStatus: string[]; unknownSub: string[];
  derived: { name: string; role: string; rows: number; refill: boolean }[]; warnings: string[]; stopped: string;
}
export function rosterTrial(o: { settings: Settings; sheets: RawSheet[]; ros: RosterProfile; state: AppState; rosterChanges: (s: AppState, rows: ImportRow[]) => { changes: unknown[]; same: number } }): Trial {
  const m = buildRosterModel({ settings: o.settings, people: o.state.people, sheets: o.sheets, ros: o.ros }); const rd = m.read;
  const lex = lexOf(o.settings);
  const t: Trial = { people: 0, cadre: 0, soldier: 0, asked: 0, vacant: 0, noName: 0, unmappedSub: 0, add: 0, change: 0, same: 0, missing: 0, status: [], unknownStatus: [], unknownSub: [], derived: [], warnings: [], stopped: '' };
  if (!rd || !rd.found) return t;
  t.people = rd.counts.people; t.cadre = rd.counts.cadre; t.soldier = rd.counts.soldier; t.asked = rd.counts.ask; t.vacant = rd.counts.vacant; t.noName = rd.counts.noName; t.unmappedSub = rd.unmappedSub; t.stopped = rd.stoppedAt || '';
  const byAsm = new Set(o.state.people.filter(p => p.asm).map(p => p.asm)); const byKey = new Set(o.state.people.map(p => personKey(p)));
  for (const r of rd.rows) { const ex = (r.asm && byAsm.has(r.asm)) || byKey.has(personKey({ last: r.last, first: r.first, father: r.father || '' })); if (!ex) t.add++; }
  const ch = o.rosterChanges(o.state, rd.rows); t.change = ch.changes.length; t.same = ch.same;
  const inFile = new Set(rd.rows.map(r => personKey({ last: r.last, first: r.first, father: r.father || '' })));
  t.missing = o.state.people.filter(p => p.active && !inFile.has(personKey(p)) && !(p.asm && rd.rows.some(r => r.asm === p.asm))).length;
  const tally = new Map<string, number>();
  for (const w of m.statusWords) { const lab = w.state === 'unknown' ? '' : w.value === 'ignore' ? '' : statusLabel(lex, w.value); if (!lab) { t.unknownStatus.push(w.text); continue; } tally.set(lab, (tally.get(lab) || 0) + w.n); }
  t.status = [...tally].map(([label, n]) => ({ label, n }));
  t.unknownSub = m.subWords.filter(w => w.state === 'unknown').map(w => w.text);
  for (const v of m.sheets) if (v.role === 'abs' || v.role === 'pres') t.derived.push({ name: v.name, role: v.role, rows: v.people, refill: o.ros.refill.includes(v.name) });
  t.warnings = rd.warnings;
  return t;
}

// Οι γραμμές της προεπισκόπησης «Τι θα αλλάξει»: τα στελέχη, οι θέσεις, η κατάσταση ως πληροφορία
export function previewNotes(rd: OwnRead, ros: RosterProfile, lex: Lexicon, settings: Settings): string[] {
  const out: string[] = [];
  if (rd.counts.cadre) out.push(rd.counts.cadre + ' στελέχη βρέθηκαν στη λίστα και δεν μπαίνουν στους στρατιώτες (τα στελέχη μπαίνουν από το αρχείο Στελεχών).');
  if (rd.counts.ask) out.push(rd.counts.ask + ' γραμμές με βαθμό που δεν ξέρω (' + rd.asks.map(a => (a.rank || 'κενός') + ' ×' + a.rows.length).slice(0, 6).join(', ') + '): δεν μπήκαν. Πες στην «Αντιστοίχιση…» αν είναι στελέχη ή στρατιώτες.');
  if (rd.counts.vacant) out.push(rd.counts.vacant + ' θέσεις με αριθμό και χωρίς όνομα: μένουν κενές, δεν είναι άτομα.');
  if (rd.unmappedSub) out.push(rd.unmappedSub + ' στρατιώτες έχουν ΙΛΗ που δεν αντιστοιχεί ακόμα σε Λόχο / Ίλα: δεν άλλαξε.');
  if (rd.statusWords.length) {
    const parts = rd.statusWords.map(w => {
      const pick = ros.status[w.key]; const g = guessStatus(w.text, lex);
      const v = pick !== undefined ? pick : g.state === 'sure' ? g.value : '';
      return w.text.toUpperCase() + ' ' + w.n + (v && v !== 'ignore' ? '' : ' (δεν το ξέρω)');
    });
    out.push('Κατάσταση στο αρχείο (πληροφορία, δεν γίνεται κατάσταση με ημερομηνίες): ' + parts.slice(0, 10).join(' · ') + (parts.length > 10 ? ' …' : ''));
  }
  void settings;
  return out;
}
