// Η πλευρά του main για τις λίστες ΑΛΛΗΣ μονάδας (3β): κατάσταση υπηρεσιών σε λίστα, εξοδούχοι/αδειούχοι δίπλα δίπλα, θαλαμιζόμενοι με VLOOKUP.
//   listsFill     γεμίζει το αρχείο της μονάδας (ΦΡΟΥΡΑ ή Εξοδούχοι) όταν υπάρχει αποθηκευμένη αντιστοίχιση για αυτό: null = η παλιά διαδρομή (fillFroura / fillOuts)
//   svcModel…     το μοντέλο για το παράθυρο «Αντιστοίχιση…» (μόνο ανάγνωση)
// Όλες οι εγγραφές περνούν από το safeWrite (τύποι, ετικέτες, παιδιά συγχωνεύσεων δεν πειράζονται ποτέ) και βγαίνουν με κεφαλαία. Δεν προστίθεται φύλλο ή κείμενο εξήγησης.
import { Workbook } from './xlsx';
import { modelOfBuffer } from './bookModel';
import { safeWrite, type PlannedWrite, type WriteReport } from './safeWrite';
import { buildLexicon } from '../shared/lexicon';
import { postsOf, seatMap } from '../shared/rules';
import { outsAndStay } from '../shared/outsStay';
import { formatOf, frontTexts } from '../shared/backForm';
import { sigsCustom, sigsFor, sigsSaved, type Sig } from '../shared/sigs';
import { profilesOf, type ProfileKind, type TplProfile } from '../shared/tplStore';
import { detectOuts, detectRooms, detectSvc, matchSvc, oursKey, outsRowsOf, planOuts, planRooms, planSvc, planTitle, svcKeyOf, svcTargets, type OutsSheet, type RoomPlan, type SvcMatch, type SvcPlan, type SvcSheet, type SvcTarget } from '../shared/unitLists';
import type { SheetModel } from '../shared/sheetModel';
import type { AppState, Post } from '../shared/domain';
import type { ISODate } from '../shared/dates';
import { unitText } from '../shared/unit';
import { fullName } from '../shared/domain';
import { rankTxt } from '../shared/ranks';
import { apply } from '../shared/commands';
import { activePeople } from '../shared/rules';
import { listProfileFrom, outsView, svcView, type ListForm, type ListModel, type ListReq, type ListTryRes } from '../shared/listMap';
import { xlsxBuffer } from './tplAdapt';
import { restructureSvc, type AddSvc } from './formEdit';
import type { ListProfile } from '../shared/tplStore';

export interface ListsOut { data: Buffer; warnings: string[]; sheet: string; report: ListsReport }
export interface ListsReport { written: number; refused: { ref: string; reason: string }[]; unplaced: string[]; cleared: number; rooms: RoomPlan[]; placed: number; lines: { label: string; text: string }[] }
const lexFor = (s: AppState, p?: TplProfile | null) => buildLexicon({ lists: s.settings.lists, ...(p && Object.keys(p.words).length ? {} : {}) });

const svcDetect = (sh: SheetModel, lst: ListProfile, lex: ReturnType<typeof buildLexicon>): SvcSheet | null => {
  const svcCols = lst.cols ? Object.fromEntries(Object.entries(lst.cols).filter(([k]) => !k.includes('.'))) : undefined;
  return detectSvc(sh, { lex, ...(svcCols && Object.keys(svcCols).length ? { cols: svcCols } : {}) });
};
// Το φύλλο της αντιστοίχισης μέσα σε αυτό το αρχείο: με το ίδιο όνομα, αλλιώς όποιο έχει τουλάχιστον τις μισές λέξεις θέσεων της αντιστοίχισης
export function profileSheet(sheets: SheetModel[], p: TplProfile, kind: 'services' | 'outs', s: AppState): { sheet: SheetModel; det: SvcSheet | OutsSheet } | null {
  const lex = lexFor(s, p); const lst = p.lst; if (!lst) return null;
  const cols = lst.cols; const outsCols = cols ? Object.fromEntries(Object.entries(cols).filter(([k]) => k.includes('.'))) : undefined;
  const det = (sh: SheetModel) => (kind === 'services' ? svcDetect(sh, lst, lex) : detectOuts(sh, outsCols && Object.keys(outsCols).length ? { cols: outsCols } : {}));
  const same = sheets.find(x => x.name === lst.sheet); const d0 = same ? det(same) : null;
  if (same && d0) return { sheet: same, det: d0 };
  const saved = new Set(Object.keys(lst.posts || {}).map(k => k.slice(0, k.lastIndexOf('#'))));
  for (const sh of sheets) {
    const d = det(sh); if (!d) continue;
    if (kind === 'outs') return { sheet: sh, det: d };
    const have = new Set((d as SvcSheet).blocks.map(b => b.key)); const hit = [...saved].filter(k => have.has(k)).length;
    if (saved.size && hit / saved.size >= 0.5) return { sheet: sh, det: d };
  }
  return null;
}
export function pickProfile(s: AppState, kind: ProfileKind): TplProfile[] { return profilesOf(s.settings).filter(p => p.kind === kind && p.lst); }

function sigPlan(sh: SheetModel, s: AppState, d: ISODate, form: 'froura' | 'outs', given: Sig[] | null | undefined, warnings: string[]): PlannedWrite[] {
  const sigsIn = given ?? (sigsCustom(s.settings, form) ? sigsSaved(s.settings, form) : null);
  const sigs = sigsIn ? sigsFor(s.settings, sigsIn) : [];
  if (!sigs.some(x => x.name)) return [];
  const fp = frontTexts(sh, { unit: '', place: '', d, fmt: formatOf(undefined).date, sigs });
  for (const x of sigs) if (x.name && x.title && !fp.sigsDone.includes(x.title)) warnings.push('Η υπογραφή «' + [x.art, x.title].filter(Boolean).join(' ') + '» δεν βρέθηκε στη λίστα (ή δεν έχει γραμμή για το όνομα): το όνομα δεν γράφτηκε');
  // μόνο οι γραμμές ονομάτων υπογραφής (όχι τίτλος/τόπος: αυτά τα χειρίζεται η λίστα η ίδια)
  return fp.writes.filter(w => typeof w.value === 'string' && sigs.some(x => x.name && w.value === (x.name || '').toUpperCase())).map(w => ({ sheet: w.sheet, r: w.r, c: w.c, value: w.value, exact: true, over: w.over }));
}
const reportOf = (rep: WriteReport) => rep.refused.map(x => ({ ref: x.sheet + '!' + x.ref, reason: x.reason }));

// ------------------------------------------------------------------ δομή του εντύπου: μπλοκ που βγαίνουν, υπηρεσίες που μπαίνουν (formEdit.ts)
export const addOf = (t: SvcTarget, a: { after: string; like: string }): AddSvc => ({ value: t.value, label: t.label, nums: t.groups.length, per: Math.max(1, ...t.groups.map(gp => gp.length)), hours: t.groups.map(gp => (gp[0]?.hours || '').trim()), after: a.after, like: a.like });
interface Shaped { tpl: Buffer; sheets: SheetModel[]; sh: SheetModel; det: SvcSheet; lst: ListProfile; ours: Record<string, string> }
async function shapeSvc(tpl: Buffer, sheets: SheetModel[], sh: SheetModel, det: SvcSheet, lst: ListProfile, targets: SvcTarget[], ours: Record<string, string>, lex: ReturnType<typeof buildLexicon>, warnings: string[]): Promise<Shaped | null> {
  const remove = Object.entries(lst.show || {}).filter(([, v]) => v === 'remove').map(([k]) => k).filter(k => det.blocks.some(b => svcKeyOf(b) === k));
  const placed = new Set(matchSvc(det, targets, lst).filter(m => (m.sure === 'sure' || m.sure === 'mine') && m.value).map(m => m.value));
  const add: AddSvc[] = [];
  for (const a of lst.add || []) {
    const t = targets.find(x => x.value === a.value);
    if (!t || t.kept || !t.groups.length) { warnings.push('Η υπηρεσία που ζητήθηκε να μπει στο έντυπο δεν είναι ενεργή στην εφαρμογή: δεν μπήκε.'); continue; }
    if (placed.has(a.value)) continue;                     // υπάρχει ήδη στο αρχείο (π.χ. το έντυπο έχει ήδη βγει από εδώ)
    add.push(addOf(t, a));
  }
  if (!remove.length && !add.length) return null;
  const r = await restructureSvc(tpl, sh, det, { remove, add }, x => svcDetect(x, lst, lex));
  if (!r.ok) { warnings.push(...r.warnings); return null; }
  warnings.push(...r.warnings);
  const posts: Record<string, string> = {}; for (const [k, v] of Object.entries(lst.posts || {})) if (r.keys[k]) posts[r.keys[k]] = v;
  for (const [v, k] of Object.entries(r.added)) posts[k] = v;
  const show: Record<string, 'keep' | 'remove'> = {}; for (const [k, v] of Object.entries(lst.show || {})) if (v === 'keep' && r.keys[k]) show[r.keys[k]] = v;
  const o2: Record<string, string> = {};
  for (const [k, v] of Object.entries(ours)) { const m = /^(.*)\|(\d+):(\d+)$/.exec(k); if (!m || m[1] !== sh.name) { o2[k] = v; continue; } const nr = r.rowMap(Number(m[2])); if (nr != null) o2[oursKey(m[1], nr, Number(m[3]))] = v; }
  return { tpl: r.data, sheets: r.sheets, sh: r.sheet, det: r.det, lst: { ...lst, posts, show }, ours: o2 };
}

// ------------------------------------------------------------------ το γέμισμα
export interface FillIn { kind: 'services' | 'outs'; sheets?: SheetModel[]; sigs?: Sig[] | null; sheet?: string; profile?: TplProfile | null; dryRun?: boolean }
export async function listsFill(tpl: Buffer, s: AppState, d: ISODate, o: FillIn): Promise<ListsOut | null> {
  const profiles = o.profile ? [o.profile] : pickProfile(s, o.kind);
  if (!profiles.length) return null;
  let sheets = o.sheets ?? await modelOfBuffer(tpl);
  const warnings: string[] = []; const lex = lexFor(s);
  let hit: { p: TplProfile; sh: SheetModel; det: SvcSheet | OutsSheet } | null = null;
  for (const p of profiles) { const f = profileSheet(sheets, p, o.kind, s); if (f) { hit = { p, sh: f.sheet, det: f.det }; break; } }
  if (!hit) return null;
  const plan: PlannedWrite[] = []; let placed = 0; let cleared = 0; const unplaced: string[] = []; const lines: { label: string; text: string }[] = [];
  let ours = hit.p.ours || {}; let lstE = hit.p.lst; let tplE = tpl;
  if (o.kind === 'services') {
    let det = hit.det as SvcSheet; const posts: Post[] = postsOf(s.settings);
    const targets: SvcTarget[] = svcTargets(s, posts);
    // δομή: μπλοκ που δεν υπάρχουν πια στο έντυπο βγαίνουν, υπηρεσίες που λείπουν μπαίνουν (στο αντίγραφο που βγαίνει)· οι θέσεις των γραμμών μετά είναι άλλες
    if (lstE && (lstE.add?.length || Object.values(lstE.show || {}).includes('remove'))) {
      const sp = await shapeSvc(tpl, sheets, hit.sh, det, lstE, targets, ours, lex, warnings);
      if (sp) { tplE = sp.tpl; sheets = sp.sheets; hit = { p: hit.p, sh: sp.sh, det: sp.det }; det = sp.det; lstE = sp.lst; ours = sp.ours; }
    }
    // τι είναι κάθε μπλοκ: οι επιλογές του χρήστη, αλλιώς μόνο ό,τι είναι σίγουρο (ό,τι μένει Πρόταση / άγνωστο δεν γράφεται)· «φαίνεται, δεν γεμίζει» = ανενεργό
    const ms: SvcMatch[] = matchSvc(det, targets, lstE).map(m => (lstE?.show?.[m.labelKey] ? { ...m, value: '', sure: 'ignored' as const } : m.sure === 'sure' || m.sure === 'mine' ? m : { ...m, value: '' }));
    const sp: SvcPlan = planSvc(hit.sh, det, ms, targets, s, d, posts, ours, lex);
    plan.push(...sp.writes); placed = sp.placed.length; cleared = sp.cleared; unplaced.push(...sp.unplaced.map(x => x.label + ': ' + x.who));
    warnings.push(...sp.warnings);
    for (const x of sp.placed) { const p = seatMap(s).get(x.pid); const b = det.blocks.find(bl => bl.rows.some(rw => rw.r === x.r)); if (p) lines.push({ label: x.block || b?.label || '', text: [rankTxt(p), fullName(p)].join(' ') }); }
    const left = ms.filter(m => !m.value && m.sure !== 'ignored').length;
    if (left) warnings.push(left + ' μπλοκ της λίστας δεν έχουν αντιστοιχιστεί σε υπηρεσία της εφαρμογής (Αντιστοίχιση…) και δεν γράφτηκαν');
    const t = planTitle(hit.sh, det.title, d); if (t.write) plan.push(t.write); if (t.warning) warnings.push(t.warning);
    plan.push(...sigPlan(hit.sh, s, d, 'froura', o.sigs, warnings));
  } else {
    const det = hit.det as OutsSheet; const { outs } = outsAndStay(s, d);
    const rows = outsRowsOf(s, d, outs);
    const op = planOuts(hit.sh, det, rows, ours);
    plan.push(...op.writes); placed = op.counts.o + op.counts.l; lines.push({ label: 'Εξοδούχοι', text: op.counts.o + ' άτομα' }, { label: 'Αδειούχοι', text: op.counts.l + ' άτομα' }); cleared = op.cleared; unplaced.push(...op.unplaced.map(x => x.who)); warnings.push(...op.warnings);
    const t = planTitle(hit.sh, det.titleRow, d, /^ΚΑΤΑΣΤΑΣΗ ΕΞΟΔΟΥΧΩΝ/, 'ΚΑΤΑΣΤΑΣΗ ΕΞΟΔΟΥΧΩΝ'); if (t.write) plan.push(t.write); if (t.warning) warnings.push(t.warning);
    plan.push(...sigPlan(hit.sh, s, d, 'outs', o.sigs, warnings));
  }
  // οι θαλαμιζόμενοι του ίδιου αρχείου (κλειδιά για τους τύπους της μονάδας)
  const rooms: RoomPlan[] = [];
  if (o.kind === 'services') for (const rp of pickProfile(s, 'rooms')) {
    for (const det of detectRooms(sheets)) {
      if (rp.lst?.sheets && !rp.lst.sheets.includes(det.sheet)) continue;
      const pl = planRooms(sheets, det, s, { who: rp.lst?.who?.[det.sheet] ?? '', ours: rp.ours }); rooms.push(pl); plan.push(...pl.writes); warnings.push(...pl.warnings);
    }
  }
  const wb = await Workbook.open(tplE); wb.widen = false;
  const rep = await safeWrite(wb, plan, { ours, dryRun: o.dryRun, margin: 0 });
  for (const x of rep.refused) if (x.reason !== 'conflict') warnings.push('Δεν γράφτηκε το ' + x.ref + ' (' + (x.reason === 'label' ? 'έχει δικό σου κείμενο' : x.reason === 'formula' ? 'έχει τύπο' : x.reason === 'merge-child' ? 'είναι μέσα σε ενωμένο κελί' : 'είναι εκτός πίνακα') + ')');
  const data = o.dryRun ? tpl : await wb.save();
  return { data, warnings: [...new Set(warnings)], sheet: hit.sh.name, report: { written: rep.written.length, refused: reportOf(rep), unplaced, cleared, rooms, placed, lines } };
}
void seatMap; void svcKeyOf; void unitText;

// ------------------------------------------------------------------ η οθόνη «Αντιστοίχιση…»
export async function listModelOf(file: string, s: AppState, form: ListForm, want?: string): Promise<{ model: ListModel; sheets: SheetModel[]; buf: Buffer }> {
  const buf = await xlsxBuffer(file); const sheets = await modelOfBuffer(buf);
  const kind = form === 'outs' ? 'outs' as const : 'services' as const; const lex = lexFor(s);
  const prof = pickProfile(s, kind)[0] ?? null;
  const hit = prof ? profileSheet(sheets, prof, kind, s) : null;
  const det = (sh: SheetModel, cols?: Record<string, number>) => (kind === 'services' ? detectSvc(sh, { lex, ...(cols ? { cols } : {}) }) : detectOuts(sh, cols ? { cols } : {}));
  const pickName = want && sheets.some(x => x.name === want) ? want : hit?.sheet.name ?? sheets.find(x => det(x))?.name ?? sheets[0]?.name ?? '';
  const sh = sheets.find(x => x.name === pickName);
  const own = prof && prof.lst && hit?.sheet.name === pickName ? prof.lst : null;
  const d = sh ? det(sh, own?.cols) : null;
  const rp = pickProfile(s, 'rooms')[0];
  const model: ListModel = {
    ok: true, form, kind, file, sheets: sheets.map(x => x.name), sheet: pickName, found: !!d, profileId: prof?.id ?? null,
    rooms: detectRooms(sheets).map(r => ({ sheet: r.sheet, keys: r.rows.length, table: r.table.sheet, tableRows: Math.max(0, r.table.last - r.table.first + 1), who: rp?.lst?.who?.[r.sheet] ?? '', saved: !!rp?.lst?.sheets?.includes(r.sheet) })),
    subs: [...new Set(activePeople(s).map(p => (p.sub || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'))
  };
  if (d && kind === 'services') model.svc = svcView(d as SvcSheet, svcTargets(s, postsOf(s.settings)), own);
  if (d && kind === 'outs') model.outs = outsView(d as OutsSheet);
  return { model, sheets, buf };
}
// Η δοκιμή: το προφίλ από τις επιλογές (με τις νέες υπηρεσίες που ζήτησε ο χρήστης) και η συμπλήρωση σε αντίγραφο στη μνήμη με τα σημερινά
export function draftState(s: AppState, form: ListForm, sheet: string, req: ListReq): { state: AppState; profile: TplProfile } {
  const kind = form === 'outs' ? 'outs' as const : 'services' as const;
  const prev = pickProfile(s, kind)[0] ?? null;
  const ctx = { today: '2000-01-01', newId: () => 'x' };
  const cols = Object.fromEntries(Object.entries(req.cols).filter(([k, v]) => typeof v === 'number' && v >= 0));
  const prof = listProfileFrom(kind, { prev, sheet, posts: req.posts, cols, show: req.show, add: req.add });
  let st = apply(s, { t: 'adaptTpl', profile: prof, create: req.creates.map(c => ({ k: 'service' as const, name: c.name })), text: 'δοκιμή' }, ctx).state;
  const on = req.rooms.filter(r => r.on);
  if (on.length) st = apply(st, { t: 'adaptTpl', profile: listProfileFrom('rooms', { prev: pickProfile(st, 'rooms')[0] ?? null, sheet: on[0].sheet, rooms: on }), text: 'δοκιμή' }, ctx).state;
  const saved = pickProfile(st, kind)[0]; if (!saved) throw new Error('Η αντιστοίχιση δεν αποθηκεύεται (λάθος μορφή)');
  return { state: st, profile: saved };
}
export async function listTry(sheets: SheetModel[], buf: Buffer, s: AppState, d: ISODate, form: ListForm, sheet: string, req: ListReq): Promise<ListTryRes> {
  const { state, profile } = draftState(s, form, sheet, req);
  const out = await listsFill(buf, state, d, { kind: form === 'outs' ? 'outs' : 'services', sheets, profile, dryRun: true });
  if (!out) return { placed: 0, written: 0, kept: 0, cleared: 0, refused: [], unplaced: [], warnings: ['Η αντιστοίχιση δεν ταιριάζει με το φύλλο.'], lines: [], rooms: [] };
  const r = out.report;
  return {
    placed: r.placed, written: r.written, kept: r.refused.length, cleared: r.cleared, refused: r.refused.map(x => ({ ref: x.ref, why: x.reason })), unplaced: r.unplaced, warnings: out.warnings, lines: r.lines,
    rooms: r.rooms.map(x => ({ sheet: '', keys: x.keys.length, unplaced: x.unplaced.length, checked: x.cross.checked, matched: x.cross.matched, unevaluated: x.cross.unevaluated, mismatches: x.cross.mismatches }))
  };
}
