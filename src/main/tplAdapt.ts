// The main-process side of the mapping screen «Πρότυπο μονάδας» and of the adaptive ΗΚΑΙ/ΗΚΑΛ output.
//   modelOfFile / tryFill / restoreCopy   the three answers of the screen (the model, the trial fill with today's state, the copy with the formulas back)
//   profileFor                            builds the profile + the settings entries from the user's choices (the command adaptTpl saves them)
//   hkaiAdaptive                          called by fillHkai: when the unit's template has a saved profile and the old path cannot fill it completely, the fill is fillAdaptive
// The original file is never changed: .xls goes through the converter (cached copy), everything else is read. Nothing here writes to disk except the one copy the user saves.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { modelOfBuffer } from './bookModel';
import { convertXls } from './xlsConvert';
import { oldFormatError } from './sources';
import { applyFormulaFixes, fillAdaptive, restoreFormulas, type FillReport } from './fillAdaptive';
import { apply } from '../shared/commands';
import { detectBook } from '../shared/shape';
import { cellRef, colLetter, type SheetModel } from '../shared/sheetModel';
import { applyProfile, profilesOf, type TplProfile } from '../shared/tplProfile';
import { buildTplModel, classicFits, emptyChoices, kindOfSettings, lexFor, profileFromChoices, type ModelRes, type TplCreate, type TplModel, type TplReq, type TryRes, type TryRow, type VocabIn } from '../shared/tplMap';
import { mapMatrix, pickFront } from '../shared/hkRules';
import { hkRowList } from '../shared/ranks';
import { Evaluator, UNSUPPORTED } from '../shared/sheetEval';
import { Workbook } from './xlsx';
import { pickBack, SEC_NAME } from '../shared/backForm';
import { upper } from '../shared/text';
import type { Sig } from '../shared/sigs';
import { activePeople } from '../shared/rules';
import type { AppState } from '../shared/domain';
import type { ISODate } from '../shared/dates';

// ------------------------------------------------------------------ reading the file (xls through the converter, with a cache)
// An .xlsx path for any file: the file itself, or for an .xls the converted copy (kept in the temp folder, keyed by path + time + size)
export async function xlsxFile(file: string): Promise<string> {
  if (!/\.xls$/i.test(file)) return file;
  const st = fs.statSync(file); const key = crypto.createHash('sha1').update(path.resolve(file) + '|' + st.mtimeMs + '|' + st.size).digest('hex').slice(0, 20);
  const dir = path.join(os.tmpdir(), 'grafeio-xls-cache'); const cached = path.join(dir, key + '.xlsx');
  if (fs.existsSync(cached)) return cached;
  const conv = await convertXls(file);
  if (!conv) throw oldFormatError(file);
  try { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(conv.file, cached); } finally { conv.cleanup(); }
  return cached;
}
export async function xlsxBuffer(file: string): Promise<Buffer> { return fs.promises.readFile(await xlsxFile(file)); }

// ------------------------------------------------------------------ which saved profile is the template of this file
export function matchProfile(sheets: SheetModel[], s: AppState, profiles: TplProfile[]): { profile: TplProfile; score: number } | null {
  let best: { profile: TplProfile; score: number } | null = null;
  for (const p of profiles) {
    const a = applyProfile(sheets, p, { lexicon: lexFor(s.settings.lists, p) });
    if (a.match.ok && (!best || a.match.score > best.score)) best = { profile: p, score: a.match.score };
  }
  return best;
}
const peoplePosts = (s: AppState) => [...new Set(activePeople(s).map(p => (p.post || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'));

// ------------------------------------------------------------------ the model of the screen
export async function modelOfFile(file: string, s: AppState, date: ISODate, sheet?: string): Promise<{ model: ModelRes; buf: Buffer; sheets: SheetModel[] }> {
  const buf = await xlsxBuffer(file); const sheets = await modelOfBuffer(buf);
  const kind = kindOfSettings(s.settings); const hit = matchProfile(sheets, s, profilesOf(s.settings).filter(p => p.kind === kind));
  // the words of the data sheet and the cells that count it: from a dry run with today's state
  let vocab: VocabIn[] = []; let driven: TplModel['driven'] = null;
  try {
    const { report } = await fillAdaptive(buf, s, date, hit?.profile ?? null, { dryRun: true, cross: false, ...(sheet ? { sheet } : {}) });
    if (report.data) {
      driven = { sheet: report.data.sheet, cells: report.data.vocab.length };
      const rankCol = report.data.columns.rank;
      vocab = report.data.vocab.map(v => ({ col: v.col, role: v.col === rankCol ? 'rank' as const : 'status' as const, text: v.text, concept: v.concept }));
    }
  } catch { /* the model of the columns does not need the dry run */ }
  const m = buildTplModel(sheets, { settings: s.settings, kind, profile: hit?.profile ?? null, ...(sheet ? { sheet } : {}), posts: peoplePosts(s), vocab, driven });
  return { model: { ...m, file, profileId: hit?.profile.id ?? null, profileName: hit?.profile.name ?? '' }, buf, sheets };
}

// ------------------------------------------------------------------ the profile and the settings entries from the choices
export function profileFor(sheets: SheetModel[], s: AppState, req: TplReq): { profile: TplProfile; state: AppState; create: TplCreate[] } {
  const kind = kindOfSettings(s.settings); const all = profilesOf(s.settings);
  const hit = matchProfile(sheets, s, all.filter(p => p.kind === kind))?.profile ?? null;
  let id = hit?.id; if (!id) { let n = 1; while (all.some(p => p.id === kind + '-' + n)) n++; id = kind + '-' + n; }
  const create = req.creates || [];
  // the entries the user created (a row, a status) are part of the unit's lists before the profile reads the file: its words may be those
  const profile0 = profileFromChoices(sheets, { kind, settings: s.settings, choices: req.choices || emptyChoices(), prev: hit, id, ...(req.sheet ? { sheet: req.sheet } : {}), name: req.name ?? hit?.name });
  const next = apply(s, { t: 'adaptTpl', profile: profile0, create, text: 'δοκιμή' }, { today: '2000-01-01', newId: () => 'x' }).state;
  const profile = profileFromChoices(sheets, { kind, settings: next.settings, choices: req.choices || emptyChoices(), prev: hit, id, ...(req.sheet ? { sheet: req.sheet } : {}), name: req.name ?? hit?.name });
  return { profile, state: next, create };
}

// ------------------------------------------------------------------ the trial: today's numbers in the user's own table
const WHY: Record<string, string> = { formula: 'έχει τύπο', label: 'έχει κείμενο του εντύπου', 'merge-child': 'είναι μέσα σε ενωμένο κελί', outside: 'είναι έξω από τον πίνακα', 'no-sheet': 'λείπει το φύλλο', 'bad-value': 'δεν είναι έγκυρη τιμή', conflict: 'το ζητούν δύο γραμμές' };
export async function tryFill(sheets: SheetModel[], buf: Buffer, s: AppState, date: ISODate, req: TplReq): Promise<TryRes> {
  const { profile, state } = profileFor(sheets, s, req);
  const { buffer, report } = await fillAdaptive(buf, state, date, profile, { ...(req.sheet ? { sheet: req.sheet } : {}) });
  const res = resultOf(report);
  if (!report.front) return { ...res, head: [], rows: [], fixes: [] };
  // the table as the filled file would show it (the template's own formulas recomputed over the new values)
  const out = await modelOfBuffer(buffer); const lex = lexFor(state.settings.lists, profile);
  const shape = detectBook({ sheets: out }, { lexicon: lex }); const pick = pickFront(shape, report.front); const fm = out.find(x => x.name === report.front);
  const fixes = restoreFormulas(sheets, profile, { lists: state.settings.lists, sheet: report.front }).slice(0, 60).map(f => ({ ref: f.ref, formula: f.formula, why: f.why }));
  if (!pick || !fm) return { ...res, head: [], rows: [], fixes };
  const map = mapMatrix(fm, pick.region, { lex, rows: hkRowList(state.settings.lists), settings: state.settings, profile });
  const ev = new Evaluator(out); const wrote = new Set(report.written.map(w => w.sheet + '|' + w.r + ':' + w.c));
  const cols = map.cols.filter(c => c.rule);
  const rows: TryRow[] = map.rows.filter(r => r.rule || r.total).map(r => ({
    label: r.text, ref: String(r.r + 1), total: !!r.total, skipped: r.unsafe || '',
    cells: cols.map(c => {
      const got = ev.cell(fm, r.r, c.c); const w = wrote.has(report.front + '|' + r.r + ':' + c.c);
      const isF = fm.fx.has(r.r + ':' + c.c);
      const v = got === UNSUPPORTED ? '?' : got === '' || got == null ? null : typeof got === 'number' ? got : String(got);
      return { v, how: w ? 'written' as const : isF ? 'formula' as const : r.total && v != null && v !== '' ? 'stale' as const : '' as const };
    })
  }));
  return { ...res, head: cols.map(c => ({ ref: colLetter(c.c), text: c.text })), rows, fixes };
}
function resultOf(report: FillReport): Omit<TryRes, 'head' | 'rows' | 'fixes'> {
  return {
    front: report.front, written: report.written.length, kept: report.kept,
    refused: report.refused.map(x => ({ ref: x.ref, why: WHY[x.reason] || x.detail })),
    unmappedCols: report.unmappedCols.map(x => ({ ref: x.ref, text: x.text, hasData: x.hasData })), unmappedRows: report.unmappedRows.map(x => ({ ref: x.ref, text: x.text, hasData: x.hasData })),
    cross: { checked: report.cross.checked, matched: report.cross.matched, unevaluated: report.cross.unevaluated, mismatches: report.cross.mismatches.map(m => ({ ref: m.ref, expected: m.expected, got: String(m.got ?? '') })) },
    warnings: report.warnings, back: report.back.sections.filter(x => x.entries > 0).map(x => ({ name: SEC_NAME[x.id], entries: x.entries, placed: x.placed, moved: x.moved, unplaced: Math.max(0, x.unplaced) })), data: report.data ? { sheet: report.data.sheet, rows: report.data.rows, unwritable: report.data.unwritable.length } : null
  };
}

// ------------------------------------------------------------------ «Επαναφορά τύπων»: only into a copy
export async function restoreCopy(sheets: SheetModel[], buf: Buffer, s: AppState, req: TplReq): Promise<{ buffer: Buffer; applied: number; skipped: number }> {
  const { profile, state } = profileFor(sheets, s, req);
  const fixes = restoreFormulas(sheets, profile, { lists: state.settings.lists, ...(req.sheet ? { sheet: req.sheet } : {}) });
  const r = await applyFormulaFixes(buf, fixes);
  return { buffer: r.buffer, applied: r.applied.length, skipped: r.skipped.length };
}

// ------------------------------------------------------------------ the output of the ΗΚΑΙ/ΗΚΑΛ
// null = the old path (fillHkai) fills this template: no profile for it, the template has cell corrections of the old dialog, or the old path fills it completely
export interface AdaptiveOut { data: Buffer; warnings: string[]; sheet?: string; profile: TplProfile | null }
// A cheap look at a template before the heavy model: does any sheet have the words of a back side of another unit (a decision column, ΑΠΟΥΣΙΕΣ, ΟΜΑΔΑ Α΄)?
const FOREIGN_WORD = /^(ΕΙΣΗΓΗΣΗ|ΑΠΟΦΑΣΗ|ΕΛΑΒΑ ΓΝΩΣΗ)(?![\p{L}])|^\d?\s*\.?\s*(ΑΠΟΥΣΙΕΣ|ΑΝΑΦΟΡΕΣ)\s*:?$|^ΟΜΑΔΑ\s+[ΑΒ]/u;
export async function foreignBack(tpl: Buffer): Promise<boolean> {
  try {
    const wb = await Workbook.open(tpl);
    for (const n of wb.sheetNames()) for (const row of await wb.values(n, 400, 40)) for (const v of row) if (typeof v === 'string' && v.length < 60 && FOREIGN_WORD.test(upper(v).replace(/\s+/g, ' ').trim())) return true;
  } catch { /* unreadable: the classic path reports it */ }
  return false;
}
// true when the back side of the book has sections the classic path would write wrongly: rows under the label, a decision column, ΑΠΟΥΣΙΕΣ/ΑΝΑΦΟΡΕΣ
export function backIsForeign(sheets: SheetModel[], s: AppState, profile: TplProfile | null): boolean {
  const lex = lexFor(s.settings.lists, profile);
  const p = pickBack(sheets, { lex, ...(profile?.back?.accepted ? { accepted: profile.back.accepted } : {}) });
  if (!p) return false;
  return p.form.decision.length > 0 || p.form.sections.some(x => (x.layout === 'below' && x.slots.length > 0) || x.id === 'absences' || x.id === 'reports');
}
export async function hkaiAdaptive(tpl: Buffer, s: AppState, d: ISODate, o: { front?: string; cells?: object; sigs?: Sig[] | null }): Promise<AdaptiveOut | null> {
  const kind = kindOfSettings(s.settings);
  const ps = profilesOf(s.settings).filter(p => p.kind === kind);
  if (o.cells && Object.keys(o.cells).length) return null;
  const sheets = await modelOfBuffer(tpl);
  const hit = ps.length ? matchProfile(sheets, s, ps) : null;
  const foreign = backIsForeign(sheets, s, hit?.profile ?? null);
  if (!hit && !foreign) return null;
  if (!foreign && classicFits(sheets, s.settings, o.front).fits) return null;
  const { buffer, report } = await fillAdaptive(tpl, s, d, hit?.profile ?? null, { ...(o.front ? { sheet: o.front } : {}), ...(o.sigs !== undefined ? { sigs: o.sigs } : {}) });
  if (!report.front) return null;
  const warnings = [...report.warnings];
  return { data: buffer, warnings, sheet: report.front, profile: hit?.profile ?? null };
}
void cellRef;
