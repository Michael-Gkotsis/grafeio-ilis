// The mapping screen «Πρότυπο μονάδας» of the ΗΚΑΙ/ΗΚΑΛ: what the engine understood of the unit's own template, what the user changed, and the profile that is saved.
//   buildTplModel       the file's columns and rows with the engine's answer: Σίγουρο (green) · Πρόταση (one click) · Δεν το ξέρω (pick from a list) · Αγνόησε
//   profileFromChoices  the user's choices (+ what was learned before) → the TplProfile that settings.tplProfiles keeps (rules, accepted words, ignored marks)
//   classicFits         can the old path (fillHkai/detectHkai) fill this file completely? If yes the old path stays in use and the output stays byte-identical
// Pure functions over the sheet model, no file access, no jargon on screen (the words of the model are the words of the screen).
import { backView, formatOf, type BackFormat, type BackView } from './backForm';
import { buildLexicon, phraseForms, phraseKey, type Lexicon } from './lexicon';
import { detectBook, type BookShape, type MatrixRegion } from './shape';
import { cellRef, colLetter, key as cellKey, valueText, type SheetModel } from './sheetModel';
import { ignoreMark, learnedNames, profileOf, setByUser, teach } from './tplProfile';
import type { ProfileKind, TplProfile } from './tplStore';
import { ABS_KEYS, KOL_KEYS, asColRule, asRowRule, defaultColRule, defaultRowRule, mapMatrix, pickFront, resolveRow, type ColRule, type FrontMap, type RowRule, type RuleCtx, type TotalKind } from './hkRules';
import { HK_A, HK_K, hkRowList, type UserLists } from './ranks';
import { HK_MANUAL } from './rules';
import { hkRowLabel } from './unit';
import type { Settings } from './domain';

// ------------------------------------------------------------------ the choices of the user (plain JSON; keys are column / row numbers, 0-based)
export type ColChoice =
  | { k: 'keys'; keys: string[] }               // counts the people of these states (one or more columns of the app)
  | { k: 'calc'; what: string }                 // placed · attached · sum · prov · avail · sumK · sumA
  | { k: 'post'; posts: string[] }              // people with these posts
  | { k: 'ignore' };                            // leave it as it is
export type RowChoice = { k: 'row'; key: string } | { k: 'ignore' };
export interface Choices {
  cols: Record<string, ColChoice>;
  rows: Record<string, RowChoice>;
  words: Record<string, string>;                // word of the data sheet → concept id («status:ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ»)
  skip?: string[];                              // words of the data sheet the user chose to ignore (kept in the profile)
  back?: Partial<BackFormat> & { accepted?: string[] };   // the format of a line of the back side, and the section words accepted as proposed
}
export const emptyChoices = (): Choices => ({ cols: {}, rows: {}, words: {} });
// What «Δημιουργία» adds to the app's own settings (commands.ts adaptTpl)
export type TplCreate =
  | { k: 'hkRow'; name: string; grp: 'off' | 'nco'; after?: string; ranks?: string[] }
  | { k: 'leaveKind'; name: string; col: string }
  | { k: 'subUnit'; name: string }            // Δυναμολόγιο άλλης μονάδας: νέος Λόχος / Ίλα στη λίστα των Ρυθμίσεων
  | { k: 'service'; name: string };           // έλεγχος υπηρεσιών: νέα υπηρεσία (ανενεργή, είδος «άλλη», με δική της στήλη στις δυνατότητες)· στο προφίλ είναι η θέση «@new:όνομα»

// ------------------------------------------------------------------ names on screen
const CALC: Record<string, string> = {
  placed: 'Τοποθετημένοι (η δύναμη χωρίς τους προσκολλημένους)', attached: 'Προσκολλημένοι', sum: 'Σύνολο δύναμης', prov: 'Προβλέπονται από τη σύνθεση',
  sumK: 'Σύνολο κωλυομένων', sumA: 'Σύνολο απόντων', avail: 'Διαθέσιμοι (δύναμη μείον απόντες)'
};
export const MANUAL_KEYS = HK_MANUAL.map(x => x[0]);
const STATE_LABEL: Record<string, string> = Object.fromEntries([...HK_K, ...HK_A].filter(x => x[0] !== 'bl').map(([k, , full]) => [k, full]).concat([['ab', 'Μισθοτροφοδοτηθέντες']]));
export const stateLabel = (k: string) => STATE_LABEL[k] || k;
export interface Opt { value: string; label: string; group: string }
const manualTag = (k: string) => (MANUAL_KEYS.includes(k) ? ' · τον γράφεις και με το χέρι' : '');
export const COL_OPTIONS: Opt[] = [
  ...['placed', 'attached', 'sum', 'prov'].map(k => ({ value: 'calc:' + k, label: CALC[k], group: 'Δύναμη' })),
  ...HK_K.filter(x => x[0] !== 'bl').map(([k, , full]) => ({ value: 'state:' + k, label: full + manualTag(k), group: 'Κωλυόμενοι: όσοι είναι σε…' })),
  ...HK_A.map(([k, , full]) => ({ value: 'state:' + k, label: full + manualTag(k), group: 'Απόντες' })),
  { value: 'state:ab', label: 'Μισθοτροφοδοτηθέντες · τον γράφεις εσύ', group: 'Τα γράφω εγώ' },
  ...['sumK', 'sumA', 'avail'].map(k => ({ value: 'calc:' + k, label: CALC[k], group: 'Σύνολα' }))
];
export const choiceValue = (c: ColChoice | undefined): string => (!c ? '' : c.k === 'keys' ? (c.keys.length === 1 ? 'state:' + c.keys[0] : 'keys') : c.k === 'calc' ? 'calc:' + c.what : c.k === 'post' ? 'post' : 'ignore');
export const choiceText = (c: ColChoice | undefined, posts: string[] = []): string =>
  !c ? '' : c.k === 'keys' ? c.keys.map(stateLabel).join(' + ') : c.k === 'calc' ? CALC[c.what] || c.what : c.k === 'post' ? 'Πόστο: ' + (posts.join(', ') || '…') : 'Το αφήνω όπως είναι';
export function ruleText(r: ColRule | null): string {
  if (!r) return '';
  switch (r.t) {
    case 'state': {
      if (r.keys.length === KOL_KEYS.length && KOL_KEYS.every(k => r.keys.includes(k))) return CALC.sumK;
      if (r.keys.length === ABS_KEYS.length && ABS_KEYS.every(k => r.keys.includes(k))) return CALC.sumA;
      return r.keys.map(stateLabel).join(' + ');
    }
    case 'placed': return CALC.placed; case 'attached': return CALC.attached; case 'force': return CALC.sum; case 'avail': return CALC.avail; case 'prov': return CALC.prov;
    case 'post': return 'Πόστο: ' + r.posts.join(', ');
    case 'sum': return 'Άθροισμα: ' + r.of.map(ruleText).join(' + ');
  }
}
// a rule → the choice that makes it (what the user picked before)
export function choiceOfRule(r: ColRule): ColChoice | null {
  switch (r.t) {
    case 'state': {
      if (r.keys.length === KOL_KEYS.length && KOL_KEYS.every(k => r.keys.includes(k))) return { k: 'calc', what: 'sumK' };
      if (r.keys.length === ABS_KEYS.length && ABS_KEYS.every(k => r.keys.includes(k))) return { k: 'calc', what: 'sumA' };
      return { k: 'keys', keys: r.keys };
    }
    case 'placed': return { k: 'calc', what: 'placed' }; case 'attached': return { k: 'calc', what: 'attached' }; case 'force': return { k: 'calc', what: 'sum' };
    case 'avail': return { k: 'calc', what: 'avail' }; case 'prov': return { k: 'calc', what: 'prov' };
    case 'post': return { k: 'post', posts: r.posts };
    default: return null;
  }
}
export function ruleOfChoice(c: ColChoice): ColRule | null {
  if (c.k === 'keys') return c.keys.length ? { t: 'state', keys: c.keys } : null;
  if (c.k === 'calc') return defaultColRule(c.what);
  if (c.k === 'post') return c.posts.length ? { t: 'post', posts: c.posts.map(phraseKey) } : null;
  return null;
}

// ------------------------------------------------------------------ the model
export type Sureness = 'sure' | 'suggest' | 'unknown' | 'ignored';
export interface ColView {
  c: number; ref: string; text: string; group: string;
  state: Sureness; to: string;                  // «Τι σημαίνει» (what it counts), when it is known or chosen
  value: string;                                // the select value of the current answer ('' = none yet)
  suggest: string; suggestText: string;         // the proposal («Πρόταση»): select value + words
  posts?: string[];                             // the posts of a post column
  user: boolean;                                // set by the user (not by the engine)
  hasData: boolean; why: string;
}
export interface RowView {
  r: number; ref: string; text: string;
  state: Sureness; to: string; value: string;   // value: ΗΚΑΙ row key, '' = none yet, 'ignore'
  suggest: string; suggestText: string;
  total?: TotalKind; user: boolean; hasData: boolean; why: string;
}
export interface WordView { col: string; text: string; state: Sureness; concept: string | null; to: string; suggest: string; suggestText: string; group: 'Βαθμοί' | 'Καταστάσεις' }
export interface TplModel {
  kind: ProfileKind; sheet: string; sheets: string[];
  cols: ColView[]; rows: RowView[]; words: WordView[];
  cells: string[][];                            // the file's own table (row labels × columns), as text, for the left side
  colOptions: Opt[]; rowOptions: { value: string; label: string }[]; posts: string[]; freeKeys: string[];
  wordOptions: { rank: { value: string; label: string }[]; status: { value: string; label: string }[] };     // what a word of the data sheet can mean
  count: { sure: number; suggest: number; unknown: number; ignored: number };
  driven: { sheet: string; cells: number } | null;     // the cells count another sheet (Παρουσιολόγιο): the data sheet is filled with the file's own words
  lost: number;                                 // total cells that hold a number where a formula should be
  back: BackView | null;                        // the back side: sections found by their words, the format of a line
  noFront: boolean;                             // no ΗΚΑΙ/ΗΚΑΛ table found
  choices: Choices;                             // what the user had chosen before (from the saved profile)
  needs: boolean;                               // something is not understood: the screen opens by itself
}
export interface VocabIn { col: string; role: 'rank' | 'status'; text: string; concept: string | null }
export interface ModelOpts {
  settings: Pick<Settings, 'lists' | 'unitKind'> & Partial<Settings>;
  kind: ProfileKind;
  profile?: TplProfile | null;
  sheet?: string;
  posts?: string[];                             // the posts of the people (Δυναμολόγιο)
  vocab?: VocabIn[];                            // words of the data sheet with the concept the engine found (from the dry run)
  driven?: { sheet: string; cells: number } | null;
}
// ------------------------------------------------------------------ what the main process answers to the screen (api.ts)
export type ModelRes = TplModel & { file: string; profileId: string | null; profileName: string };
export interface TplReq { file?: string; sheet?: string; choices: Choices; creates?: TplCreate[]; name?: string }
export interface TryCell { v: number | string | null; how: '' | 'written' | 'formula' | 'stale' }   // stale: a typed number of the template (a total) that today's fill does not write
export interface TryRow { label: string; ref: string; total: boolean; skipped: string; cells: TryCell[] }
export interface TryRes {
  front: string | null; head: { ref: string; text: string }[]; rows: TryRow[];
  written: number; kept: number; refused: { ref: string; why: string }[];
  unmappedCols: { ref: string; text: string; hasData: boolean }[]; unmappedRows: { ref: string; text: string; hasData: boolean }[];
  cross: { checked: number; matched: number; unevaluated: number; mismatches: { ref: string; expected: number; got: string }[] };
  warnings: string[]; fixes: { ref: string; formula: string; why: string }[];
  data: { sheet: string; rows: number; unwritable: number } | null;
  back: { name: string; entries: number; placed: number; moved: number; unplaced: number }[];   // the back side of the trial: lines of each section
}
export const lexFor = (lists: UserLists | undefined, profile?: TplProfile | null): Lexicon =>
  buildLexicon({ lists, ...(profile && Object.keys(profile.words).length ? { learned: learnedNames(profile) } : {}) });

const hasCell = (sh: SheetModel, r: number, c: number) => valueText(sh.rows[r]?.[c]) !== '' || sh.fx.has(cellKey(r, c));
// total cells that hold a stale number where the template's formula was lost (the classic path throws on the derived ones, and leaves the others stale)
export function lostCells(sh: SheetModel, map: FrontMap): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  const derived = map.cols.filter(c => c.derived && c.rule);
  for (const row of map.rows) {
    if (row.rule) for (const col of derived) if (!hasCell(sh, row.r, col.c) || !sh.fx.has(cellKey(row.r, col.c))) out.push({ r: row.r, c: col.c });
    if (row.total && row.members?.length && !row.unsafe) for (const col of map.cols) if (col.rule && col.rule.t !== 'prov' && !sh.fx.has(cellKey(row.r, col.c)) && hasCell(sh, row.r, col.c)) out.push({ r: row.r, c: col.c });
  }
  return out;
}
const ctxOf = (o: { settings: ModelOpts['settings'] }, lex: Lexicon, profile?: TplProfile | null): RuleCtx => ({ lex, rows: hkRowList(o.settings.lists), settings: o.settings as Settings, profile });

// A column the lexicon knows as something else than a count of the ΗΚΑΙ («ΜΕΤΑΒΟΛΕΣ ΤΗΣ ΠΡΟΗΓΟΥΜΕΝΗΣ ΗΜΕΡΑΣ», a notes area): text of the form, it stays as it is
const isTextCol = (ci: { match: { confidence: string; concept: string | null } }) => ci.match.confidence === 'sure' && !!ci.match.concept && !ci.match.concept.startsWith('hkcol:') && !ci.match.concept.startsWith('total:') && !ci.match.concept.startsWith('group:');

// Can the classic path (fillHkai/detectHkai: the 27 standard columns and the standard rows) fill this file completely?
// Yes when the default reading (no profile, no learned words) gives every column with a header or data a standard meaning, every row with data a row of the app,
// no cell counts another sheet and no total lost its formula.
export function classicFits(sheets: SheetModel[], settings: ModelOpts['settings'], sheet?: string): { fits: boolean; why: string[] } {
  const lex = buildLexicon({ lists: settings.lists });
  const shape = detectBook({ sheets }, { lexicon: lex });
  const pick = pickFront(shape, sheet); if (!pick) return { fits: true, why: [] };
  const sh = sheets.find(x => x.name === pick.sh.name)!;
  const map = mapMatrix(sh, pick.region, ctxOf({ settings }, lex, null));
  const why: string[] = [];
  if (pick.region.driven) why.push('οι αριθμοί μετριούνται από το φύλλο «' + pick.region.driven.dataSheet + '»');
  for (const c of map.cols) if (!c.rule && c.hasData && !isTextCol(pick.region.cols.find(x => x.c === c.c)!)) why.push('η στήλη «' + c.text + '» δεν είναι γνωστή');
  for (const r of map.rows) if (!r.rule && !r.total && r.hasData) why.push('η γραμμή «' + r.text + '» δεν είναι γνωστή');
  if (lostCells(sh, map).length) why.push('κάποια σύνολα έχουν αριθμούς αντί για τύπους');
  return { fits: why.length === 0, why };
}

const SEP = /[\s/,+&-]+/;
export function buildTplModel(sheets: SheetModel[], o: ModelOpts): TplModel {
  const profile = o.profile ?? null; const lists = o.settings.lists;
  const lex = lexFor(lists, profile);
  const shape = detectBook({ sheets }, { lexicon: lex });
  const pick = pickFront(shape, o.sheet);
  const base: TplModel = {
    kind: o.kind, sheet: o.sheet || '', sheets: sheets.map(s => s.name), cols: [], rows: [], words: [], cells: [], colOptions: COL_OPTIONS, rowOptions: [], posts: o.posts || [], freeKeys: [], wordOptions: { rank: [], status: [] },
    count: { sure: 0, suggest: 0, unknown: 0, ignored: 0 }, driven: o.driven ?? null, lost: 0, back: null, noFront: !pick, choices: emptyChoices(), needs: false
  };
  const rowKeys = hkRowList(lists);
  for (const c of lex.concepts.values()) {
    if (c.kind === 'status' && c.id !== 'status:ΠΑΡΩΝ') base.wordOptions.status.push({ value: c.id, label: c.label });
    if (c.kind === 'rank' || c.kind === 'hkrow') base.wordOptions.rank.push({ value: c.id, label: c.label });
  }
  base.rowOptions = rowKeys.map(k => ({ value: k, label: hkRowLabel(k, o.settings as Settings) }));
  base.back = backView(sheets, { lex, ...(profile?.back?.accepted ? { accepted: profile.back.accepted } : {}) });
  if (!pick) { base.needs = true; return base; }
  const sh = sheets.find(x => x.name === pick.sh.name)!; const region = pick.region;
  base.sheet = sh.name;
  const ctx = ctxOf(o, lex, profile); const map = mapMatrix(sh, region, ctx);
  const ign = (type: 'col' | 'row', text: string) => !!profile?.ignore.some(m => m.type === type && phraseKey(m.text) === phraseKey(text));
  const choices = emptyChoices();
  // ---- columns
  for (const mc of map.cols) {
    const ci = region.cols.find(x => x.c === mc.c)!; const text = mc.text; const kq = phraseKey(text);
    if (!text && !mc.hasData) continue;
    const view: ColView = { c: mc.c, ref: colLetter(mc.c), text: text || '(χωρίς επικεφαλίδα)', group: ci.parent || '', state: 'unknown', to: '', value: '', suggest: '', suggestText: '', user: false, hasData: mc.hasData, why: mc.why };
    const userRule = asColRule(profile?.rules?.cols?.[kq]);
    const m = ci.match;
    if (!mc.rule && isTextCol(ci) && !ign('col', text)) { view.state = 'sure'; view.to = 'Κείμενο του εντύπου, δεν είναι στήλη με αριθμούς: μένει όπως είναι'; view.why = ''; }
    else if (ign('col', text)) { view.state = 'ignored'; view.value = 'ignore'; view.to = 'Το αφήνω όπως είναι'; view.user = true; choices.cols[mc.c] = { k: 'ignore' }; }
    else if (mc.rule) {
      view.state = 'sure'; view.to = ruleText(mc.rule);
      // the answer as a choice: the user's own rule, or the engine's reading (a standard column of the app)
      const k = mc.concept?.startsWith('hkcol:') ? mc.concept.slice(6) : '';
      const auto: ColChoice | null = mc.rule.t === 'state' && mc.rule.keys.length === 1 && !mc.derived ? { k: 'keys', keys: mc.rule.keys } : k ? { k: 'calc', what: k } : null;
      const ch = userRule ? choiceOfRule(userRule) : auto;
      view.value = choiceValue(ch || undefined); if (ch?.k === 'post') view.posts = ch.posts;
      // set by the user: an own rule, or a word the user accepted / taught
      if (userRule || profile?.elements.some(e => e.type === 'col' && e.how !== 'auto-sure' && phraseKey(e.text) === kq)) { view.user = true; if (ch) choices.cols[mc.c] = ch; }
    } else {
      // a proposal: the lexicon thinks it is a column of the app but is not sure; or the header is made of the names of posts
      const sc = m.confidence === 'suggest' && m.concept?.startsWith('hkcol:') ? m.concept.slice(6) : '';
      if (sc && defaultColRule(sc)) { const derived = ['placed', 'attached', 'sum', 'prov', 'sumK', 'sumA', 'avail'].includes(sc); view.state = 'suggest'; view.suggest = (derived ? 'calc:' : 'state:') + sc; view.suggestText = derived ? CALC[sc] : stateLabel(sc); }
      else {
        const parts = text.split(SEP).map(phraseKey).filter(Boolean); const found = new Set<string>();
        for (const p of o.posts || []) { const pk = phraseKey(p); if (parts.some(w => w === pk || phraseForms(w).includes(pk) || phraseForms(pk).includes(w))) found.add(p); }
        if (found.size >= 1 && found.size >= Math.ceil(parts.length / 2)) { view.state = 'suggest'; view.suggest = 'post'; view.posts = [...found]; view.suggestText = 'Πόστο: ' + [...found].join(', '); }
      }
    }
    if (view.state === 'unknown' && !text) view.why = 'στήλη χωρίς επικεφαλίδα που έχει στοιχεία';
    base.cols.push(view);
  }
  // a proposal that another column has too (or that a sure column already counts) is never a one-click answer: the user decides which one is meant
  const sureVals = new Set(base.cols.filter(c => c.state === 'sure' && c.value).map(c => c.value));
  const sugCount = new Map<string, number>(); for (const c of base.cols) if (c.state === 'suggest' && c.suggest !== 'post') sugCount.set(c.suggest, (sugCount.get(c.suggest) || 0) + 1);
  for (const c of base.cols) if (c.state === 'suggest' && c.suggest !== 'post' && ((sugCount.get(c.suggest) || 0) > 1 || sureVals.has(c.suggest))) {
    c.state = 'unknown'; c.why = 'Μοιάζει με «' + c.suggestText + '», αλλά αυτό το μετρά ήδη άλλη στήλη. Διάλεξε εσύ τι είναι.'; c.suggest = ''; c.suggestText = '';
  }
  // ---- rows
  for (const mr of map.rows) {
    const kq = phraseKey(mr.text);
    const view: RowView = { r: mr.r, ref: String(mr.r + 1), text: mr.text, state: 'unknown', to: '', value: '', suggest: '', suggestText: '', user: false, hasData: mr.hasData, why: mr.why };
    const userRule = asRowRule(profile?.rules?.rows?.[kq]);
    if (ign('row', mr.text)) { view.state = 'ignored'; view.value = 'ignore'; view.to = 'Το αφήνω όπως είναι'; view.user = true; choices.rows[mr.r] = { k: 'ignore' }; }
    else if (mr.total) { view.state = 'sure'; view.total = mr.total; view.to = 'Σύνολο' + (mr.unsafe ? ' (δεν γράφεται: ' + mr.unsafe + ')' : ''); }
    else if (mr.rule) {
      view.state = 'sure'; view.value = mr.rule.keys[0];
      view.to = hkRowLabel(mr.rule.keys[0], o.settings as Settings) + (mr.rule.origins ? ' · μόνο ' + mr.rule.origins.map(x => x.replace(/^origin:/, '')).join('/') : '') + (mr.rule.ranks ? ' · μόνο ο βαθμός της γραμμής' : '');
      if (userRule || profile?.elements.some(e => e.type === 'row' && e.how !== 'auto-sure' && phraseKey(e.text) === kq)) { view.user = true; choices.rows[mr.r] = { k: 'row', key: mr.rule.keys[0] }; }
    } else {
      const bs = mr.text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      const hm = lex.match(bs, { kinds: ['hkrow'] });
      let sk = '';
      if (hm.confidence === 'suggest' && hm.concept?.startsWith('hkrow:') && rowKeys.includes(hm.concept.slice(6))) sk = hm.concept.slice(6);
      if (sk) { view.state = 'suggest'; view.suggest = sk; view.suggestText = hkRowLabel(sk, o.settings as Settings); }
    }
    base.rows.push(view);
  }
  // ---- the file's own table, as text (left side)
  const cols = base.cols.slice(0, 60);
  for (const r of base.rows.slice(0, 60)) base.cells.push(cols.map(c => { const v = valueText(sh.rows[r.r]?.[c.c]); return sh.fx.has(cellKey(r.r, c.c)) && !v ? 'τύπος' : v.length > 6 ? v.slice(0, 5) + '…' : v; }));
  base.lost = lostCells(sh, map).length;
  // ---- the words of the data sheet
  if (o.vocab) {
    for (const v of o.vocab) {
      const m = lex.match(v.text, { kinds: v.role === 'rank' ? ['rank', 'hkrow'] : ['status', 'hkcol'] });
      const isRank = v.role === 'rank';
      const w: WordView = { col: v.col, text: v.text, state: v.concept ? 'sure' : m.confidence === 'suggest' && m.concept ? 'suggest' : 'unknown', concept: v.concept, to: v.concept ? lex.label(v.concept) : '', suggest: !v.concept && m.confidence === 'suggest' && m.concept ? m.concept : '', suggestText: !v.concept && m.confidence === 'suggest' && m.concept ? lex.label(m.concept) : '', group: isRank ? 'Βαθμοί' : 'Καταστάσεις' };
      const learned = profile?.words[phraseKey(v.text)]; if (learned) { w.state = 'sure'; w.concept = learned; w.to = lex.label(learned); choices.words[v.text] = learned; }
      base.words.push(w);
    }
  }
  // ---- free keys: the states no column of this table shows yet (offered first for a new status or a hand-written column)
  const used = new Set<string>(); for (const c of base.cols) { if (c.value.startsWith('state:')) used.add(c.value.slice(6)); }
  base.freeKeys = [...KOL_KEYS.filter(k => k !== 'bl'), ...ABS_KEYS, 'ab'].filter(k => !used.has(k));
  for (const c of base.cols) base.count[c.state]++;
  for (const r of base.rows) base.count[r.state]++;
  if (profile?.back) choices.back = { ...profile.back };
  if (profile?.ignoreWords?.length) choices.skip = [...profile.ignoreWords];
  base.choices = choices;
  const cl = classicFits(sheets, o.settings, base.sheet);
  base.needs = !cl.fits || base.count.suggest + base.count.unknown > 0 || !!base.driven || !!base.back?.sections.some(x => x.state === 'suggest');
  return base;
}

// ------------------------------------------------------------------ the profile that is saved
export interface FromChoices {
  kind: ProfileKind; settings: ModelOpts['settings']; sheet?: string; choices: Choices;
  prev?: TplProfile | null; id: string; name?: string;
}
// Rebuilds the profile from the sure answers of the engine + ALL the user's choices (the screen keeps the earlier ones, so nothing is lost).
// The words the unit uses are learned (profile.words): the next detection finds the same column «σίγουρο».
export function profileFromChoices(sheets: SheetModel[], o: FromChoices): TplProfile {
  const lex0 = lexFor(o.settings.lists, null);
  const shape0: BookShape = detectBook({ sheets }, { lexicon: lex0 });
  let p: TplProfile = { ...profileOf(shape0, o.kind, { id: o.id, ...(o.name ? { name: o.name } : {}) }), ...(o.prev?.ours ? { ours: o.prev.ours } : {}) };
  const pick = pickFront(shape0, o.sheet);
  const rules: { cols: Record<string, unknown>; rows: Record<string, unknown> } = { cols: {}, rows: {} };
  if (pick) {
    const sheet = pick.sh.name; const region: MatrixRegion = pick.region;
    for (const [cs, ch] of Object.entries(o.choices.cols)) {
      const ci = region.cols.find(x => x.c === Number(cs)); if (!ci) continue;
      const text = ci.leaf || ci.text; if (!text) continue;
      if (ch.k === 'ignore') { p = ignoreMark(p, shape0, sheet, 'col', ci.c); continue; }
      const rule = ruleOfChoice(ch); if (!rule) continue;
      rules.cols[phraseKey(text)] = rule;
      // one single answer of the app also becomes an accepted word (and a learned name) of this unit
      const concept = ch.k === 'keys' && ch.keys.length === 1 ? 'hkcol:' + ch.keys[0] : ch.k === 'calc' ? 'hkcol:' + ch.what : '';
      if (concept) p = setByUser(p, shape0, { sheet, type: 'col', c: ci.c, concept });
    }
    for (const [rs, ch] of Object.entries(o.choices.rows)) {
      const ri = region.rows.find(x => x.r === Number(rs)); if (!ri) continue;
      if (ch.k === 'ignore') { p = ignoreMark(p, shape0, sheet, 'row', ri.r); continue; }
      if (!hkRowList(o.settings.lists).includes(ch.key)) continue;
      // the brackets of the file («Λχίες (ΕΠΟΠ)») keep narrowing the row: the rule is the engine's own reading of the text with the chosen row
      const res = resolveRow(ri.text, undefined, { lex: lex0, rows: [ch.key], settings: o.settings as Settings, profile: null });
      const rule: RowRule = res.rule && res.rule.keys[0] === ch.key ? res.rule : { ...defaultRowRule(ch.key), ...(res.rule?.origins ? { origins: res.rule.origins } : {}) };
      rules.rows[phraseKey(ri.text)] = rule;
      p = setByUser(p, shape0, { sheet, type: 'row', r: ri.r, concept: 'hkrow:' + ch.key });
    }
  }
  for (const [w, id] of Object.entries(o.choices.words)) if (id && id.includes(':')) p = teach(p, w, id);
  // the back side: the format of a line and the accepted proposals; the ignored words: the choice of this screen, else what was saved before
  const bk = o.choices.back ?? o.prev?.back;
  if (bk) { const f = formatOf(bk); p = { ...p, back: { num: f.num, date: f.date, line: f.line, ...(bk.accepted?.length ? { accepted: [...new Set(bk.accepted)] } : {}) } }; }
  const iw = o.choices.skip ?? o.prev?.ignoreWords; if (iw?.length) p = { ...p, ignoreWords: [...new Set(iw)] };
  if (Object.keys(rules.cols).length || Object.keys(rules.rows).length) p = { ...p, rules };
  // the fingerprint is taken with the unit's own words, the way the next detection will see the file
  const lex1 = lexFor(o.settings.lists, p); const shape1 = detectBook({ sheets }, { lexicon: lex1 });
  const p1 = profileOf(shape1, o.kind, { id: o.id }); return { ...p, fp: p1.fp };
}

// ------------------------------------------------------------------ two columns that count the same
// The answer of every column as it will be saved (the user's choice, else the engine's sure answer). Two columns must not count the same people twice.
export function valueChoice(v: string, posts?: string[]): ColChoice | null {
  if (v.startsWith('state:')) return { k: 'keys', keys: [v.slice(6)] };
  if (v.startsWith('calc:')) return { k: 'calc', what: v.slice(5) };
  if (v === 'post' && posts?.length) return { k: 'post', posts };
  return null;
}
export function effectiveChoices(model: TplModel, ch: Choices): Record<number, ColChoice> {
  const out: Record<number, ColChoice> = {};
  for (const c of model.cols) { const x = ch.cols[c.c] ?? (c.state === 'sure' ? valueChoice(c.value, c.posts) : null); if (x && x.k !== 'ignore') out[c.c] = x; }
  return out;
}
export function duplicates(model: TplModel, ch: Choices): { what: string; cols: number[] }[] {
  const by = new Map<string, number[]>();
  for (const [c, x] of Object.entries(effectiveChoices(model, ch))) {
    const ks = x.k === 'keys' ? x.keys.map(k => 'state:' + k) : x.k === 'calc' ? ['calc:' + x.what] : x.k === 'post' ? x.posts.map(p => 'post:' + phraseKey(p)) : [];
    for (const k of ks) by.set(k, [...(by.get(k) || []), Number(c)]);
  }
  return [...by].filter(([, cs]) => cs.length > 1).map(([k, cols]) => ({ what: k.startsWith('state:') ? stateLabel(k.slice(6)) : k.startsWith('calc:') ? CALC[k.slice(5)] || k : 'το πόστο ' + k.slice(5), cols }));
}

export const kindOfSettings = (st: Pick<Settings, 'unitKind'> | null | undefined): ProfileKind => (st?.unitKind === 'lochos' ? 'hkal' : 'hkai');
export const cellName = cellRef;
