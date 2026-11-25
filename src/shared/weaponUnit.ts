// Αρχείο οπλισμού ΑΛΛΗΣ μονάδας (πρότυπα άλλων μονάδων, φάση 5): ανάγνωση, μοντέλο της οθόνης «Αντιστοίχιση…» και σχέδιο εισαγωγής στο Μητρώο (assets.ts).
// Η μονάδα έχει δικό της βιβλίο: ένα φύλλο ανά τύπο όπλου (ή ονομαστική λίστα), λίστες που βγαίνουν από άλλο φύλλο με τύπους, λέξεις θέσης δικές της (Α.Ο, Φ.Γ, ΚΙΒΩΤΙΟ 52…),
// «_» στο όνομα = αχρέωτο, κάνες στα πολυβόλα. Κανόνες:
//   - ΜΟΝΟ ΑΝΑΓΝΩΣΗ: δεν υπάρχει διαδρομή εγγραφής σε φύλλο οπλισμού (ούτε του δικού μας αρχείου), άρα το αρχείο της μονάδας δεν αλλάζει ποτέ από εδώ
//   - κανένα «σίγουρο» χωρίς λόγο: κατηγορία, λέξη θέσης και κάτοχος που δεν είναι γνωστά ΔΕΝ μαντεύονται· η γραμμή περιμένει απάντηση και δεν μπαίνει
//   - το πρώτο όπλο ατόμου/στελέχους σε κατηγορία κύριου όπλου γίνεται Person.weapon/wtype/rack/wpos (μόνο αν είναι κενά)· τα υπόλοιπα, οι αχρέωτοι και οι άλλοι κάτοχοι γίνονται assets[]
//   - ό,τι υπάρχει ήδη (ίδιος weaponKey) δεν αλλάζει ποτέ: αναφέρεται ως ίδιο ή ως σύγκρουση· τίποτα δεν σβήνεται και τίποτα δεν δημιουργείται χωρίς προεπισκόπηση και επιβεβαίωση
import { normGreek } from './text';
import { valueText } from './sheetModel';
import { buildLexicon, normText, phraseKey, type Lexicon } from './lexicon';
import { detectSheet, type ListRegion } from './shape';
import { toModel, baseRank, type State, type Opt } from './rosterUnit';
import { assetCfgOf, placeWord, PLACE_MEANS, registry, holderText } from './assets';
import { normWeapon, weaponKey, normRack, normPos, seatTxt } from './weapons';
import { listOf } from './ranks';
import { colLetter } from './sources';
import { profilesOf, PROFILE_VERSION, type TplProfile, type WeaponProfile, type WeaponSheetRole } from './tplStore';
import type { AppState, Asset, AssetCat, AssetCfg, AssetHolder, PlaceWord, Settings } from './domain';
import type { CellValue, RawSheet } from './roster';

export const WEAPON_PROFILE_ID = 'weapons-1';
export const weaponProfileOf = (settings: Pick<Settings, 'tplProfiles'> | undefined): TplProfile | null => profilesOf(settings).find(p => p.kind === 'weapons') ?? null;
export const emptyWpn = (): WeaponProfile => ({ roles: {}, cats: {}, cols: {}, ignore: [], types: {}, places: {}, holders: {} });

export type WRole = 'aa' | 'rank' | 'name' | 'first' | 'type' | 'no' | 'place' | 'barrel' | 'spare' | 'note';
export const WROLES: WRole[] = ['aa', 'rank', 'name', 'first', 'type', 'no', 'place', 'barrel', 'spare', 'note'];
export const WROLE_LABEL: Record<WRole, string> = {
  aa: 'Α/Α', rank: 'Βαθμός κατόχου', name: 'Ονοματεπώνυμο κατόχου', first: 'Όνομα κατόχου (όταν το επώνυμο είναι σε άλλη στήλη)', type: 'Τύπος όπλου', no: 'Αριθμός όπλου', place: 'Θέση (οπλοβαστός, κιβώτιο, Α.Ο…)',
  barrel: 'Αριθμός κάνης (πεδίο της κατηγορίας)', spare: 'Αριθμός εφεδρικής κάνης (πεδίο της κατηγορίας)', note: 'Παρατηρήσεις (σημείωση της εγγραφής)'
};
const CONCEPT_ROLE: Record<string, WRole> = { 'person:aa': 'aa', 'person:rank': 'rank', 'person:name': 'name', 'person:last': 'name', 'person:first': 'first', 'weapon:type': 'type', 'weapon:number': 'no', 'weapon:slot': 'place', 'weapon:barrel': 'barrel', 'weapon:spareBarrel': 'spare', 'person:remarks': 'note' };
export const SHEET_ROLE_OPTS: { value: WeaponSheetRole; label: string }[] = [
  { value: 'items', label: 'Λίστα οπλισμού (από εδώ διαβάζει)' }, { value: 'derived', label: 'Βγαίνει από άλλο φύλλο με τύπους (δεν πειράζεται)' }, { value: 'skip', label: 'Άλλο φύλλο (δεν πειράζεται)' }
];

const txt = (v: CellValue | undefined): string => valueText(v as never);
const headKey = (t: string) => phraseKey(t);
const DIGIT = /\d/;
// «_», παύλες, τελείες, κενό = αχρέωτο / χωρίς τιμή
export const blankWord = (t: string) => /^[\s_\-–—.·*]*$/.test(t);
const STATUS_WORD = new Set(['ΑΧΡΕΩΤΟ', 'ΧΡΕΩΜΕΝΟ', 'ΧΡΕΩΜΕΝΑ', 'ΑΧΡΕΩΤΑ', 'ΧΡΕΩΣΗ']);
const toks = (s: unknown): string[] => normGreek(s).replace(/[^Α-ΩA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const setKey = (t: string[]) => [...t].sort().join(' ');
const lc = (s: string) => normGreek(s).replace(/\s+/g, '');

// Επώνυμο και όνομα σε δύο στήλες (ΕΠΩΝΥΜΟ, ΟΝΟΜΑ): ενώνονται, αλλιώς ο κάτοχος ήταν μία λέξη και δεν ταίριαζε ποτέ (έλεγχος Π2, 25/11)
const fullName = (name: string, first: string): string => { const f = first.trim(); if (!f || blankWord(f) || blankWord(name)) return name; const have = new Set(toks(name)); return toks(f).every(t => have.has(t)) ? name : (name.trim() + ' ' + f).trim(); };
// ------------------------------------------------------------------ θέση: αριθμημένη θέση ή λέξη
export function placeParts(text: string): { seat?: { rack: string; wpos: string }; word?: string; extra?: string } {
  const t = text.replace(/\s+/g, ' ').trim(); if (!t || blankWord(t)) return {};
  if (/^\d+([/\-.]\d+)*$/.test(t)) return { seat: { rack: '', wpos: t } };
  const par = /^(\d+([/\-.]\d+)*)\s*\(.*\)$/.exec(t);   // «2 (2η ΙΛΗ)»: η θέση με σχόλιο της μονάδας· το σχόλιο μένει στη σημείωση
  if (par) return { seat: { rack: '', wpos: par[1] }, extra: t };
  const m = /^([Α-ΩA-Za-zα-ω]{1,2})\s*[-.]?\s*(\d[\d/\-]*)$/.exec(t);
  if (m) return { seat: { rack: normRack(m[1]), wpos: normPos(m[2]) } };
  return { word: t };
}
// η λέξη χωρίς τον αριθμό που ακολουθεί: «ΚΙΒΩΤΙΟ 52» → «ΚΙΒΩΤΙΟ»
export const placeKey = (t: string) => phraseKey(t).replace(/\s+\d[\d\s/]*$/, '').trim();
const MEANS_HINT: [RegExp, PlaceWord['means']][] = [[/ΟΠΛΟΒ/, 'rack'], [/ΚΙΒΩΤ/, 'box'], [/ΑΔΕΙΑ|ΑΠΟΣΠΑΣ/, 'leave'], [/ΑΠΟΘΗΚ/, 'store'], [/ΦΡΟΥΡ|^Φ /, 'guard']];
const MEANS_SET = new Set(PLACE_MEANS.map(x => x[0]));
export const meansLabel = (m: string) => PLACE_MEANS.find(x => x[0] === m)?.[1] || m;

// ------------------------------------------------------------------ τα φύλλα: τι διαβάστηκε
export interface RawItem { sheet: string; r: number; no: string; type: string; rank: string; name: string; place: string; note: string; barrel: string; spare: string }
export interface WColView { key: string; text: string; role: WRole | null; state: State; why: string; sheets: number }
export interface WSheetView { name: string; role: WeaponSheetRole; auto: boolean; items: number; rows: number; formulas: number; title: string; cat: string; catState: State; catWhy: string; hint: string }
export interface WeaponRead { sheets: WSheetView[]; cols: WColView[]; items: RawItem[]; skippedRows: number; formulaRows: number; warnings: string[] }
interface Rg { sheet: string; reg: ListRegion; byRole: Partial<Record<WRole, number>>; formulaRatio: number; title: string }

function titleOf(sheet: RawSheet, reg: ListRegion): string {
  const out: string[] = [];
  for (let r = Math.max(0, reg.headerRows[0] - 8); r < reg.headerRows[0]; r++) for (const v of sheet.rows[r] || []) { const t = txt(v); if (t.length > 3 && !out.includes(t)) out.push(t); }
  return out.slice(-2).join(' · ');
}

export function readWeaponBook(sheets: RawSheet[], o: { prof: WeaponProfile; lex?: Lexicon }): WeaponRead {
  const lex = o.lex || buildLexicon(); const prof = o.prof;
  const out: WeaponRead = { sheets: [], cols: [], items: [], skippedRows: 0, formulaRows: 0, warnings: [] };
  const ign = new Set(prof.ignore.map(headKey)); const mine = new Map<string, WRole>(); for (const [role, h] of Object.entries(prof.cols)) mine.set(headKey(h), role as WRole);
  const colSeen = new Map<string, WColView>();
  for (const sh of sheets) {
    let regs: Rg[] = [];
    try {
      const shape = detectSheet(toModel(sh), { lexicon: lex });
      for (const reg of shape.regions) {
        if (reg.type !== 'list' || reg.subkind !== 'weapons') continue;
        const byRole: Partial<Record<WRole, number>> = {};
        const colViews: WColView[] = [];
        for (const c of reg.cols) {
          const hk = headKey(c.leaf || c.text); if (!hk) continue;
          let role: WRole | null = null; let state: State = 'unknown'; let why = '';
          if (mine.has(hk)) { role = mine.get(hk)!; state = 'mine'; }
          else if (ign.has(hk)) state = 'ignored';
          else if (c.match.concept && c.match.confidence !== 'unknown' && CONCEPT_ROLE[c.match.concept]) { role = CONCEPT_ROLE[c.match.concept]; state = c.match.confidence === 'sure' ? 'sure' : 'suggest'; }
          if (role && role in byRole) { role = null; state = 'unknown'; why = 'ο ρόλος υπάρχει ήδη σε άλλη στήλη'; }
          if (role) byRole[role] = c.c;
          colViews.push({ key: hk, text: c.leaf || c.text, role, state, why, sheets: 1 });
        }
        if (byRole.no == null) continue;
        const fx = sh.fx || new Set<string>(); let cells = 0, f = 0;
        for (let r = reg.headerRows[1] + 1; r <= reg.r2; r++) for (let c = reg.c1; c <= reg.c2; c++) if (txt((sh.rows[r] || [])[c]) !== '') { cells++; if (fx.has(r + ':' + c)) f++; }
        regs.push({ sheet: sh.name, reg, byRole, formulaRatio: cells ? f / cells : 0, title: titleOf(sh, reg) });
        for (const v of colViews) { const x = colSeen.get(v.key); if (!x) colSeen.set(v.key, v); else { x.sheets++; if (v.state === 'sure' && x.state !== 'mine') Object.assign(x, { role: v.role, state: v.state }); } }
      }
    } catch (e) { out.warnings.push('Το φύλλο «' + sh.name + '» δεν διαβάστηκε: ' + (e instanceof Error ? e.message : String(e))); regs = []; }
    const given = prof.roles[sh.name];
    const derivedAuto = regs.length > 0 && (regs.every(x => x.formulaRatio >= 0.5) || (/ΑΠΟΝΤ|ΠΑΡΟΝΤ/.test(normText(sh.name)) && (sh.fx?.size || 0) > 20));   // λίστες απόντων / παρόντων που βγαίνουν από την ονομαστική
    const role: WeaponSheetRole = given || (!regs.length ? 'skip' : derivedAuto ? 'derived' : 'items');
    const fxN = sh.fx?.size || 0;
    const view: WSheetView = { name: sh.name, role, auto: !given, items: 0, rows: sh.rows.length, formulas: fxN, title: regs[0]?.title || '', cat: '', catState: 'unknown', catWhy: '',
      hint: !regs.length ? 'δεν βρέθηκε πίνακας οπλισμού' : derivedAuto ? 'τα κελιά του είναι τύποι που βγαίνουν από άλλο φύλλο' : fxN > 3 ? 'έχει και στήλες με τύπους· δεν πειράζονται' : '' };
    out.sheets.push(view);
    if (role !== 'items') continue;
    const sorted = [...regs].sort((a, b) => a.reg.headerRows[0] - b.reg.headerRows[0]);
    sorted.forEach((g, i) => {
      const next = sorted[i + 1]?.reg.headerRows[0] ?? sh.rows.length; const fx = sh.fx || new Set<string>();
      const cell = (r: number, role: WRole) => (g.byRole[role] == null ? '' : txt((sh.rows[r] || [])[g.byRole[role]!]));
      let blankRun = 0;
      for (let r = g.reg.headerRows[1] + 1; r < next; r++) {
        const no = cell(r, 'no');
        if (no === '') { if (++blankRun >= 12 && r > g.reg.r2) break; continue; }
        blankRun = 0;
        if (g.byRole.no != null && fx.has(r + ':' + g.byRole.no)) { out.formulaRows++; continue; }
        if (!DIGIT.test(no)) { out.skippedRows++; continue; }
        out.items.push({ sheet: sh.name, r, no, type: cell(r, 'type'), rank: cell(r, 'rank'), name: fullName(cell(r, 'name'), cell(r, 'first')), place: cell(r, 'place'), note: cell(r, 'note'), barrel: cell(r, 'barrel'), spare: cell(r, 'spare') });
        view.items++;
      }
    });
  }
  out.cols = [...colSeen.values()];
  return out;
}

// ------------------------------------------------------------------ κατηγορίες και τύποι
export const catOptions = (cfg: AssetCfg): Opt[] => cfg.cats.map(c => ({ value: c.id, label: c.name, group: c.kind === 'weapon' ? 'Όπλα' : c.kind === 'material' ? 'Υλικό' : 'Οχήματα' }));
const catRef = (cfg: AssetCfg, ref: string): AssetCat | undefined => {
  if (!ref) return undefined;
  const hit = cfg.cats.find(c => c.id === ref); if (hit) return hit;
  return ref.startsWith('new:') ? cfg.cats.find(c => normGreek(c.name) === normGreek(ref.slice(4))) : undefined;
};
const typeCat = (cfg: AssetCfg, type: string): AssetCat | undefined => { const t = lc(type); return t ? cfg.cats.find(c => c.kind !== 'vehicle' && c.types.some(x => lc(x) === t)) : undefined; };
// η λέξη-ρίζα του ονόματος μιας κατηγορίας (ΤΥΦΕΚ…) που εμφανίζεται στον τίτλο του φύλλου («ΚΑΤΑΣΤΑΣΗ ΤΥΦΕΚΙΩΝ»)
function titleCat(cfg: AssetCfg, text: string): AssetCat | undefined {
  const t = normGreek(text); const hits = cfg.cats.filter(c => c.kind !== 'vehicle').filter(c => { const s = normGreek(c.name).replace(/[^Α-Ω]/g, '').slice(0, 5); return s.length >= 5 && t.includes(s); });
  return hits.length === 1 ? hits[0] : undefined;
}
export const primaryCats = (cfg: AssetCfg, settings: Pick<Settings, 'lists'>): Set<string> => {
  const types = new Set(listOf(settings.lists, 'weaponTypes').map(lc));
  return new Set(cfg.cats.filter(c => c.kind === 'weapon' && (c.id === 'tyfekia' || c.id === 'pistolia' || c.types.some(t => types.has(lc(t))))).map(c => c.id));
};

// ------------------------------------------------------------------ λέξεις
export interface WWord { key: string; text: string; n: number; state: State; value: string; suggest?: string; suggestText?: string; why: string }
export interface Cand { k: 'person' | 'cadre'; id: number | string; rank: string; active: boolean; label: string }

export interface Resolved {
  holder: { t: 'free' } | { t: 'person'; k: 'person' | 'cadre'; id: number | string; label: string } | { t: 'absent'; text: string } | { t: 'ambiguous'; text: string; n: number } | { t: 'rankdiff'; text: string } | { t: 'wait'; text: string } | { t: 'skip' };
  cat: AssetCat | null; catWait: string; type: string;
  seat: { rack: string; wpos: string } | null; word: string; wordMeans: PlaceWord['means'] | ''; wordIgnored: boolean;
  note: string; markedHeld: boolean; markedFree: boolean;
}
export interface WResolved { read: WeaponRead; items: { it: RawItem; res: Resolved }[]; typeWords: WWord[]; placeWords: WWord[]; holderWords: WWord[]; sheets: WSheetView[]; cfg: AssetCfg }
export interface WIn { settings: Settings; people: AppState['people']; cadreList: AppState['cadreList']; sheets: RawSheet[]; prof: WeaponProfile }

export function resolveWeapons(o: WIn): WResolved {
  const lex = buildLexicon({ lists: o.settings.lists }); const prof = o.prof;
  const read = readWeaponBook(o.sheets, { prof, lex });
  const cfg = assetCfgOf(o.settings, { people: o.people, cadreList: o.cadreList });
  // κάτοχοι: ονοματεπώνυμο ως σύνολο λέξεων (η σειρά δεν μετρά), με πατρώνυμο ή χωρίς
  const idx = new Map<string, Cand[]>();
  const add = (k: string, c: Cand) => { const l = idx.get(k); if (l) l.push(c); else idx.set(k, [c]); };
  for (const p of o.people) { const c: Cand = { k: 'person', id: p.id, rank: p.rank, active: !!p.active, label: p.last + ' ' + p.first }; add(setKey(toks(p.last + ' ' + p.first)), c); if (p.father) add(setKey(toks(p.last + ' ' + p.first + ' ' + p.father)), c); }
  for (const c of o.cadreList) add(setKey(toks(c.last + ' ' + c.first)), { k: 'cadre', id: c.id, rank: c.rank, active: !!c.active, label: c.last + ' ' + c.first });
  const byInitial = new Map<string, Cand[]>();
  const addI = (last: string, first: string, c: Cand) => { const k = setKey(toks(last)) + '|' + normGreek(first).charAt(0); const l = byInitial.get(k); if (l) l.push(c); else byInitial.set(k, [c]); };
  for (const p of o.people) addI(p.last, p.first, { k: 'person', id: p.id, rank: p.rank, active: !!p.active, label: p.last + ' ' + p.first });
  for (const c of o.cadreList) addI(c.last, c.first, { k: 'cadre', id: c.id, rank: c.rank, active: !!c.active, label: c.last + ' ' + c.first });
  const rankOf = (t: string) => lex.match(baseRank(t), { kinds: ['rank'] });
  const rankDiff = (file: string, app: string): boolean => { if (!file || blankWord(file)) return false; const a = rankOf(file), b = rankOf(app); return !!a.concept && !!b.concept && a.confidence !== 'unknown' && b.confidence !== 'unknown' && a.concept !== b.concept; };
  const primary = primaryCats(cfg, o.settings);
  void primary;
  // τύποι ανά φύλλο: κατηγορία φύλλου
  const bySheet = new Map<string, RawItem[]>(); for (const it of read.items) { const l = bySheet.get(it.sheet); if (l) l.push(it); else bySheet.set(it.sheet, [it]); }
  const sheetCat = new Map<string, { cat: AssetCat | null; state: State; why: string }>();
  for (const v of read.sheets) {
    if (v.role !== 'items') continue;
    const given = prof.cats[v.name]; const mineCat = catRef(cfg, given || '');
    if (mineCat) { sheetCat.set(v.name, { cat: mineCat, state: 'mine', why: 'το όρισες εσύ' }); continue; }
    const items = bySheet.get(v.name) || []; const known = new Set(items.map(i => typeCat(cfg, i.type)?.id).filter(Boolean) as string[]);
    if (known.size === 1) { sheetCat.set(v.name, { cat: cfg.cats.find(c => c.id === [...known][0])!, state: 'sure', why: 'οι τύποι του φύλλου ανήκουν σε αυτή την κατηγορία' }); continue; }
    if (known.size > 1) { sheetCat.set(v.name, { cat: null, state: 'unknown', why: 'οι τύποι του φύλλου ανήκουν σε διαφορετικές κατηγορίες· κάθε τύπος αντιστοιχίζεται μόνος του' }); continue; }
    const t = titleCat(cfg, v.title + ' ' + v.name);
    sheetCat.set(v.name, t ? { cat: t, state: 'suggest', why: 'ο τίτλος του φύλλου μιλά για «' + t.name + '»' } : { cat: null, state: 'unknown', why: 'ο τίτλος και ο τύπος δεν λένε κατηγορία' });
  }
  for (const v of read.sheets) { const c = sheetCat.get(v.name); if (c) { v.cat = c.cat?.id || ''; v.catState = c.state; v.catWhy = c.why; } }
  const sheetView = new Map(read.sheets.map(v => [v.name, v]));
  void sheetView;
  const typeW = new Map<string, WWord & { sheets: Set<string> }>(), placeW = new Map<string, WWord>(), holdW = new Map<string, WWord>();
  const placeState = (text: string): { means: PlaceWord['means'] | 'ignore' | ''; state: State; suggest?: PlaceWord['means']; why: string } => {
    const k = placeKey(text); const pick = prof.places[k];
    if (pick !== undefined) return { means: pick === 'ignore' ? 'ignore' : MEANS_SET.has(pick as never) ? (pick as PlaceWord['means']) : '', state: pick === 'ignore' ? 'ignored' : 'mine', why: '' };
    const w = placeWord(cfg, text); if (w) return { means: w.means, state: 'sure', why: 'λέξη θέσης των Ρυθμίσεων' };
    const h = MEANS_HINT.find(x => x[0].test(normText(text)));
    return h ? { means: '', state: 'suggest', suggest: h[1], why: 'μοιάζει με «' + meansLabel(h[1]) + '»' } : { means: '', state: 'unknown', why: 'άγνωστη λέξη' };
  };
  const items: WResolved['items'] = [];
  for (const it of read.items) {
    const v = read.sheets.find(x => x.name === it.sheet)!; const sc = sheetCat.get(it.sheet);
    // ---- κατηγορία
    let cat: AssetCat | null = null; let catWait = ''; const tk = phraseKey(it.type); let skip = false;
    if (tk) {
      const pick = prof.types[tk];
      const known = typeCat(cfg, it.type);
      if (pick === 'ignore') skip = true;
      else if (pick) { cat = catRef(cfg, pick) || null; if (!cat) catWait = 'ο τύπος «' + it.type + '» περιμένει κατηγορία'; }
      else if (known) cat = known;
      else if (sc?.cat && sc.state === 'mine') cat = sc.cat;
      else catWait = 'ο τύπος «' + it.type + '» δεν είναι σε κατηγορία';
      const w = typeW.get(tk) ?? { key: tk, text: it.type, n: 0, state: 'unknown' as State, value: '', why: '', sheets: new Set<string>() }; w.n++; w.sheets.add(it.sheet); typeW.set(tk, w);
    } else if (sc?.cat && (sc.state === 'mine' || sc.state === 'sure')) cat = sc.cat;
    else catWait = 'το φύλλο «' + it.sheet + '» δεν έχει κατηγορία';
    // ---- θέση
    const pp = placeParts(it.place); const placeExtra = pp.extra || ''; let word = pp.word || ''; let seat = pp.seat || null; let note = blankWord(it.note) ? '' : it.note;
    // η στήλη παρατηρήσεων μπορεί να κρατά τη λέξη θέσης (όταν η θέση είναι μόνο αριθμός ή κενή)
    if (!word && note && !STATUS_WORD.has(phraseKey(note)) && (placeWord(cfg, note) || prof.places[placeKey(note)] !== undefined)) { word = note; note = ''; }
    const status = phraseKey(note); const stWord = STATUS_WORD.has(status); if (stWord) note = '';
    const markedHeld = stWord && /^ΧΡΕΩ(ΜΕΝΟ|ΜΕΝΑ|ΣΗ)$/.test(status); const markedFree = stWord && /^ΑΧΡΕΩΤ/.test(status);
    // ---- κάτοχος
    let holder: Resolved['holder'];
    const nameTxt = blankWord(it.name) ? '' : it.name;
    if (!nameTxt) holder = { t: 'free' };
    else {
      const key = setKey(toks(nameTxt)); let l = idx.get(key) || [];
      if (toks(nameTxt).length < 2) l = [];
      else if (!l.length) {   // «ΕΠΩΝΥΜΟ Γ.»: επώνυμο και αρχικό, μόνο αν δείχνει έναν
        const t = toks(nameTxt); const ini = t.filter(x => x.length === 1);
        if (t.length >= 2 && ini.length === 1) l = byInitial.get(setKey(t.filter(x => x.length > 1)) + '|' + ini[0]) || [];
        if (l.length > 1) { const act = l.filter(c => c.active); if (act.length === 1) l = act; else l = []; }
      }
      if (l.length > 1) { const act = l.filter(c => c.active); if (act.length) l = act; }
      if (l.length > 1) { const same = l.filter(c => !rankDiff(it.rank, c.rank)); if (same.length) l = same; }
      if (l.length === 1) holder = rankDiff(it.rank, l[0].rank) ? { t: 'rankdiff', text: nameTxt } : { t: 'person', k: l[0].k, id: l[0].id, label: l[0].label };
      else if (l.length > 1) holder = { t: 'ambiguous', text: nameTxt, n: l.length };
      else {
        const hk = phraseKey(nameTxt); const pick = prof.holders[hk];
        const isPlace = pick === 'place' || (pick === undefined && !!placeWord(cfg, nameTxt));
        if (pick === 'skip') holder = { t: 'skip' };
        else if (isPlace) { holder = { t: 'free' }; if (!word) word = nameTxt; }
        else if (pick === 'free') holder = { t: 'absent', text: nameTxt };
        else if (toks(nameTxt).length >= 2 && !/\d/.test(nameTxt)) holder = { t: 'absent', text: nameTxt };
        else {
          holder = { t: 'wait', text: nameTxt };
          const x = holdW.get(hk) ?? { key: hk, text: nameTxt, n: 0, state: 'unknown' as State, value: '', why: 'δεν είναι άτομο του Δυναμολογίου ούτε λέξη θέσης' }; x.n++; holdW.set(hk, x);
        }
        if (isPlace && pick !== undefined) { const x = holdW.get(hk) ?? { key: hk, text: nameTxt, n: 0, state: 'mine' as State, value: 'place', why: '' }; x.n++; holdW.set(hk, x); }
        if (pick === 'free' || pick === 'skip') { const x = holdW.get(hk) ?? { key: hk, text: nameTxt, n: 0, state: (pick === 'skip' ? 'ignored' : 'mine') as State, value: pick, why: '' }; x.n++; holdW.set(hk, x); }
      }
    }
    if (word) { const pk = placeKey(word); const st = placeState(word); const x = placeW.get(pk) ?? { key: pk, text: word.replace(/\s+\d[\d\s/]*$/, '').trim() || word, n: 0, state: st.state, value: st.means === 'ignore' ? 'ignore' : st.means, ...(st.suggest ? { suggest: st.suggest, suggestText: meansLabel(st.suggest) } : {}), why: st.why }; x.n++; placeW.set(pk, x); }
    void v;
    if (placeExtra) note = [note, 'Θέση: ' + placeExtra].filter(Boolean).join(' · ');
    items.push({ it, res: { holder: skip ? { t: 'skip' } : holder, cat, catWait, type: normWeapon(it.type), seat, word, wordMeans: '', wordIgnored: false, note, markedHeld, markedFree } });
  }
  for (const x of items) { if (x.res.word) { const st = placeState(x.res.word); x.res.wordMeans = st.means === 'ignore' || st.means === '' ? '' : st.means; x.res.wordIgnored = st.means === 'ignore'; } }
  // λέξεις τύπου: γνωστός, δικός σου ή πρόταση από το φύλλο
  const typeWords: WWord[] = [];
  for (const w of typeW.values()) {
    const pick = prof.types[w.key]; const known = typeCat(cfg, w.text);
    if (pick !== undefined) typeWords.push({ ...w, state: pick === 'ignore' ? 'ignored' : 'mine', value: pick, why: '' });
    else if (known) typeWords.push({ ...w, state: 'sure', value: known.id, why: 'τύπος της κατηγορίας «' + known.name + '»' });
    else {
      const cs = [...w.sheets].map(n => sheetCat.get(n)).filter(c => c?.cat) as { cat: AssetCat; state: State }[];
      const ids = new Set(cs.map(c => c.cat.id));
      typeWords.push(ids.size === 1 ? { ...w, state: 'suggest', value: '', suggest: cs[0].cat.id, suggestText: cs[0].cat.name, why: 'το φύλλο είναι «' + cs[0].cat.name + '»' } : { ...w, state: 'unknown', value: '', why: 'άγνωστος τύπος' });
    }
  }
  // μόνο για το Words step: οι λέξεις θέσης από τη στήλη ονόματος είναι ήδη μέσα στο placeW
  return { read, items, typeWords, placeWords: [...placeW.values()], holderWords: [...holdW.values()], sheets: read.sheets, cfg };
}

// ------------------------------------------------------------------ σχέδιο εισαγωγής
// rec: όταν το κύριο όπλο έχει κάτι που το Δυναμολόγιο δεν κρατά (κιβώτιο, αποθήκη ή άλλη λέξη θέσης, κάνη, σημείωση), μπαίνει και εγγραφή Μητρώου με τον ίδιο αριθμό
export interface PrimaryPut { owner: Extract<AssetHolder, { k: 'person' | 'cadre' }>; weapon: string; wtype: string; rack: string; wpos: string; label: string; rec?: Omit<Asset, 'id'> }
export interface WeaponApply { primary: PrimaryPut[]; assets: Omit<Asset, 'id'>[] }
export interface PlanLine { kind: 'primary' | 'asset' | 'same' | 'conflict' | 'dup' | 'wait' | 'skip'; text: string }
export interface WeaponCounts {
  read: number; sheets: number; free: number; held: number; people: number; cadre: number; primary: number; second: number; assets: number; unassigned: number;
  same: number; dups: number; conflicts: number; wait: number; skipped: number; absent: number; ambiguous: number; rankdiff: number; formulaRows: number; markedHeldNoName: number; markedFreeButHeld: number; barrels: number;
}
export interface WeaponPlan { apply: WeaponApply; lines: PlanLine[]; counts: WeaponCounts; resolved: WResolved }

const holderKey = (h: AssetHolder | undefined) => (!h ? '' : h.k === 'person' ? 'p' + h.pid : h.k === 'cadre' ? 'c' + h.cid : h.k + ':' + h.name);
export function planWeapons(o: WIn & { state: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'settings'> }): WeaponPlan {
  const rz = resolveWeapons(o); const cfg = rz.cfg; const prim = primaryCats(cfg, o.settings);
  const counts: WeaponCounts = { read: 0, sheets: rz.sheets.filter(s => s.role === 'items').length, free: 0, held: 0, people: 0, cadre: 0, primary: 0, second: 0, assets: 0, unassigned: 0, same: 0, dups: 0, conflicts: 0, wait: 0, skipped: 0, absent: 0, ambiguous: 0, rankdiff: 0, formulaRows: rz.read.formulaRows, markedHeldNoName: 0, markedFreeButHeld: 0, barrels: 0 };
  const lines: PlanLine[] = []; const apply: WeaponApply = { primary: [], assets: [] };
  const reg = registry(o.state); const existing = new Map<string, { holder: AssetHolder | undefined; cat: string; no: string }>();
  const kindOf = (id: string) => cfg.cats.find(c => c.id === id)?.kind;
  const dupKey = (cat: string, no: string) => (kindOf(cat) === 'weapon' ? 'w' : cat) + ':' + weaponKey(no);
  for (const r of reg) if (!r.a.gone) existing.set(dupKey(r.a.cat, r.a.no), { holder: r.a.holder, cat: r.a.cat, no: r.a.no });
  const seen = new Map<string, RawItem>();
  const pm = new Map(o.people.map(p => [p.id, p])); const cm = new Map(o.cadreList.map(c => [c.id, c]));
  const who = (h: AssetHolder | undefined) => holderText(o.state, h);
  type Ok = { it: RawItem; res: Resolved; cat: AssetCat; holder?: Extract<AssetHolder, { k: 'person' | 'cadre' }>; absent?: string; label: string };
  const ok: Ok[] = [];
  for (const { it, res } of rz.items) {
    counts.read++;
    const lab = it.type ? it.type + ' ' + it.no : it.no;
    if (res.holder.t === 'skip') { counts.skipped++; continue; }
    if (res.markedHeld && res.holder.t === 'free') counts.markedHeldNoName++;
    if (res.holder.t === 'wait') { counts.wait++; lines.push({ kind: 'wait', text: lab + ' (' + it.sheet + '): το «' + res.holder.text + '» στη στήλη ονόματος περιμένει απάντηση, δεν μπήκε' }); continue; }
    if (!res.cat) { counts.wait++; lines.push({ kind: 'wait', text: lab + ' (' + it.sheet + '): ' + res.catWait + ', δεν μπήκε' }); continue; }
    const key = dupKey(res.cat.id, it.no);
    const first = seen.get(key);
    if (first) { counts.dups++; lines.push({ kind: 'dup', text: lab + ' (' + it.sheet + ', γραμμή ' + (it.r + 1) + '): ο ίδιος αριθμός υπάρχει ήδη στο «' + first.sheet + '», γραμμή ' + (first.r + 1) + ' (δεν ξαναμπαίνει)' }); continue; }
    seen.set(key, it);
    let holder: Ok['holder']; let absent: string | undefined;
    if (res.holder.t === 'person') { holder = res.holder.k === 'person' ? { k: 'person', pid: res.holder.id as number } : { k: 'cadre', cid: res.holder.id as string }; }
    else if (res.holder.t === 'absent') { absent = res.holder.text; counts.absent++; }
    else if (res.holder.t === 'ambiguous') { absent = res.holder.text; counts.ambiguous++; }
    else if (res.holder.t === 'rankdiff') { absent = res.holder.text; counts.rankdiff++; }
    if (res.markedFree && holder) counts.markedFreeButHeld++;
    const ex = existing.get(key);
    if (ex) {
      const same = holder ? holderKey(holder) === holderKey(ex.holder) : !ex.holder;
      if (same) { counts.same++; lines.push({ kind: 'same', text: lab + ': υπάρχει ήδη στο Μητρώο, ίδιος κάτοχος' }); }
      else { counts.conflicts++; lines.push({ kind: 'conflict', text: lab + ': στο Μητρώο έχει κάτοχο «' + (ex.holder ? who(ex.holder) : 'αχρέωτο') + '», το αρχείο λέει «' + (holder ? who(holder) : absent || 'αχρέωτο') + '» (δεν αλλάζει)' }); }
      continue;
    }
    ok.push({ it, res, cat: res.cat, holder, absent, label: lab });
  }
  // Η εγγραφή Μητρώου ενός όπλου του αρχείου: κάτοχος, θέση οπλοβαστού, λέξη θέσης (κιβώτιο, αποθήκη…), κάνες, σημείωση
  const recOf = (x: Ok): Omit<Asset, 'id'> => {
    const a: Omit<Asset, 'id'> = { cat: x.cat.id, type: x.res.type, no: normWeapon(x.it.no), state: 'ok' };
    if (x.holder) a.holder = x.holder;
    const r = x.res.seat; if (r) { if (r.rack) a.rack = r.rack; if (r.wpos) a.wpos = r.wpos; }
    if (x.res.word && !x.res.wordIgnored) { a.fileWord = normPos(x.res.word); if (!r && (!x.res.wordMeans || x.res.wordMeans === 'box' || x.res.wordMeans === 'store' || x.res.wordMeans === 'other')) a.place = normPos(x.res.word); }
    const extra: Record<string, string> = {}; if (x.it.barrel && !blankWord(x.it.barrel)) extra.barrel = x.it.barrel; if (x.it.spare && !blankWord(x.it.spare)) extra.spare = x.it.spare;
    if (Object.keys(extra).length) a.extra = extra;
    const note = [x.res.note, x.absent ? 'Στο αρχείο: ' + x.absent : ''].filter(Boolean).join(' · '); if (note) a.note = note;
    return a;
  };
  // ---- κύριο όπλο ή δεύτερο: ανά κάτοχο, με τη σειρά των κατηγοριών και του αρχείου
  const order = new Map(cfg.cats.map((c, i) => [c.id, i]));
  const byOwner = new Map<string, Ok[]>(); for (const x of ok) if (x.holder) { const k = holderKey(x.holder); const l = byOwner.get(k); if (l) l.push(x); else byOwner.set(k, [x]); }
  const asPrimary = new Set<Ok>();
  for (const l of byOwner.values()) {
    const h = l[0].holder!; const cur = h.k === 'person' ? pm.get(h.pid) : cm.get(h.cid);
    if (!cur) continue;
    counts[h.k === 'person' ? 'people' : 'cadre']++;
    const curNo = weaponKey(cur.weapon); const curCat = curNo ? cfg.cats.find(c => c.types.some(t => lc(t) === lc(cur.wtype || ''))) : undefined;
    const eligible = l.filter(x => prim.has(x.cat.id)).sort((a, b) => (order.get(a.cat.id) ?? 99) - (order.get(b.cat.id) ?? 99));
    if (!curNo) {
      const x = eligible[0];
      if (x) {
        asPrimary.add(x);
        const r = x.res.seat; const rackOk = !cur.rack && !cur.wpos;
        const rec = recOf(x); const more = rec.place || rec.fileWord || rec.extra || rec.note;
        apply.primary.push({ owner: h, weapon: normWeapon(x.it.no), wtype: !cur.wtype ? x.res.type : '', rack: rackOk && r ? r.rack : '', wpos: rackOk && r ? r.wpos : '', label: x.label, ...(more ? { rec } : {}) });
        counts.primary++; lines.push({ kind: 'primary', text: x.label + ' → κύριο όπλο του ' + who(h) + ' στο Δυναμολόγιο' + (r ? ' (θέση ' + seatTxt(r.rack, r.wpos) + (rackOk ? '' : ', η θέση του Δυναμολογίου μένει' ) + ')' : '') + (!r && rec.place ? ' (θέση ' + rec.place + ')' : '') });
      }
    } else {
      // έχει ήδη κύριο όπλο: άλλο όπλο της ίδιας κατηγορίας με το δικό του είναι σύγκρουση, άλλης κατηγορίας δεύτερο όπλο
      for (const x of eligible) if (curCat && x.cat.id === curCat.id) { counts.conflicts++; lines.push({ kind: 'conflict', text: x.label + ': ο ' + who(h) + ' έχει ήδη κύριο όπλο ' + normWeapon(cur.weapon) + ', το αρχείο λέει άλλο· δεν μπήκε' }); asPrimary.add(x); }
    }
  }
  for (const x of ok) {
    if (asPrimary.has(x) && apply.primary.some(p => p.label === x.label)) continue;
    if (asPrimary.has(x)) continue;
    const a = recOf(x); if (a.extra) counts.barrels++;
    apply.assets.push(a); counts.assets++;
    if (x.holder) { counts.second++; lines.push({ kind: 'asset', text: x.label + ' (' + x.cat.name + ') → ' + who(x.holder) + ' (δεύτερο όπλο ή όπλο εκτός κύριου)' }); }
    else { counts.unassigned++; lines.push({ kind: 'asset', text: x.label + ' (' + x.cat.name + ') → ' + (x.absent ? 'αχρέωτο· στο αρχείο: ' + x.absent + (x.res.holder.t === 'ambiguous' ? ' (πολλά άτομα με αυτό το όνομα)' : x.res.holder.t === 'rankdiff' ? ' (ο βαθμός δεν ταιριάζει)' : ' (δεν υπάρχει στο Δυναμολόγιο)') : 'αχρέωτο') }); }
  }
  for (const x of ok) { if (x.holder) counts.held++; else counts.free++; }
  return { apply, lines, counts, resolved: rz };
}

// ------------------------------------------------------------------ το μοντέλο της οθόνης
export interface WeaponModel {
  sheets: WSheetView[]; cols: WColView[]; typeWords: WWord[]; placeWords: WWord[]; holderWords: WWord[]; catOpts: Opt[]; meansOpts: Opt[]; issues: string[]; plan: WeaponPlan;
}
export function buildWeaponModel(o: WIn & { state: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'settings'> }): WeaponModel {
  const plan = planWeapons(o); const rz = plan.resolved; const issues: string[] = [];
  if (!rz.read.sheets.some(s => s.role === 'items')) issues.push('Δεν βρέθηκε φύλλο με λίστα οπλισμού.');
  if (rz.read.sheets.some(s => s.role === 'items') && !rz.read.items.length) issues.push('Στα φύλλα που διάλεξες δεν διαβάστηκε κανένα όπλο.');
  if (!rz.read.cols.some(c => c.role === 'name')) issues.push('Δεν βρέθηκε στήλη ονοματεπώνυμου: τα όπλα θα μπουν αχρέωτα.');
  return {
    sheets: rz.sheets, cols: rz.read.cols, typeWords: rz.typeWords, placeWords: rz.placeWords, holderWords: rz.holderWords, catOpts: catOptions(rz.cfg),
    meansOpts: [...PLACE_MEANS.map(([value, label]) => ({ value, label, group: 'Τι σημαίνει' })), { value: 'ignore', label: 'Δεν το αποθηκεύω (το αφήνω)', group: 'Αγνόησε' }], issues, plan
  };
}
export function weaponProfileFrom(prof: WeaponProfile, prev: TplProfile | null): TplProfile {
  return { v: PROFILE_VERSION, id: prev?.id ?? WEAPON_PROFILE_ID, kind: 'weapons', ...(prev?.name ? { name: prev.name } : {}), fp: prev?.fp ?? { sheets: [], regions: [] }, elements: prev?.elements ?? [], words: prev?.words ?? {}, ignore: prev?.ignore ?? [], wpn: prof, ...(prev?.ours ? { ours: prev.ours } : {}) };
}
export const colRef = (c: number) => colLetter(c);
