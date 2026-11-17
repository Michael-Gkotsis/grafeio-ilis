// Μητρώο οπλισμού και υλικού (Michael, 17/11, πρόταση λοχία, φάση 4): γενικό μητρώο πάνω στο σχήμα του sxima-mitroou.md
// (Asset, AssetEvent, settings.assets). Οι κατηγορίες, οι τύποι, τα πεδία ανά κατηγορία και οι λέξεις θέσης είναι δεδομένα του χρήστη.
// Το κύριο όπλο κάθε ατόμου μένει στο Person.weapon/wtype/rack/wpos (και στο Cadre): το μητρώο το δείχνει ως «εικονική» γραμμή και
// γίνεται αληθινή εγγραφή (ίδιος αριθμός) την πρώτη φορά που την αλλάζεις. Ο σύνδεσμος είναι το weaponKey. Τίποτα δεν μπλοκάρεται.
// Το νήμα «πρότυπα άλλων μονάδων» διαβάζει/γράφει τα αρχεία τους μέσα σε αυτό το σχήμα (fileWord, extra, αντιστοίχιση με weaponKey).
import { addDays, dmy, type ISODate } from './dates';
import type { AppState, Asset, AssetCat, AssetCfg, AssetEvent, AssetHolder, PlaceWord, Settings } from './domain';
import { listOf, rankTxt } from './ranks';
import { normGreek, upper } from './text';
import { normPos, normRack, normWeapon, seatTxt, weaponKey } from './weapons';

export const ASSET_WARN_DAYS = 30;
// Οι προεπιλεγμένες κατηγορίες: τα id μένουν σταθερά (τα χρησιμοποιούν οι εγγραφές)
const CAT_RIFLE = 'tyfekia';
const cat = (id: string, name: string, kind: AssetCat['kind'], types: string[] = [], fields: AssetCat['fields'] = []): AssetCat => ({ id, name, kind, types, fields });
export function defaultCats(lists?: Settings['lists']): AssetCat[] {
  const rifles = [...new Set([...listOf(lists, 'weaponTypes'), 'G3A3', 'G3A4'])];
  return [
    cat(CAT_RIFLE, 'Τυφέκια', 'weapon', rifles), cat('pistolia', 'Πιστόλια', 'weapon', ['Μ1911 Α1']),
    cat('polyvola', 'Πολυβόλα', 'weapon', ['MG3A1', 'ΠΟΛ 0,50'], [{ id: 'barrel', name: 'Αριθμός κάνης' }, { id: 'spare', name: 'Εφεδρική κάνη' }]),
    cat('antiarm', 'Αντιαρματικά', 'weapon'), cat('pyrovola', 'Πυροβόλα', 'weapon'),
    cat('diopt', 'Διόπτρες', 'material'), cat('asyrm', 'Ασύρματοι', 'material'), cat('imatismos', 'Ιματισμός', 'material'), cat('loipo', 'Λοιπό υλικό', 'material'),
    // οχήματα (φάση 5): κάθε 6 μήνες ή 5.000 χλμ· τα ερπυστριοφόρα μπορούν να μετρούν ώρες κινητήρα (hours)
    { ...cat('troxofora', 'Τροχοφόρα', 'vehicle', ['1/4 τόνου', 'ΜΑΝ 6t', 'HUMMER', 'Φορτηγό', 'Ρυμουλκούμενο']), every: 6, everyKm: 5000 },
    { ...cat('erpystr', 'Ερπυστριοφόρα', 'vehicle', ['M113', 'M577', 'M48']), every: 6, everyKm: 5000, hours: true },
    { ...cat('politikou', 'Πολιτικού τύπου', 'vehicle', ['Nissan', 'Fiat', 'Λεωφορείο']), every: 6, everyKm: 5000 }
  ];
}
export const DEFAULT_PLACES: PlaceWord[] = [
  { word: 'ΟΠΛΟΒΑΣΤΟ', means: 'rack' }, { word: 'ΚΙΒΩΤΙΟ', means: 'box' }, { word: 'Α.Ο', means: 'duty' }, { word: 'Α.Ο (ΑΔΕΙΑ)', means: 'leave' },
  { word: 'Φ.Γ', means: 'guard' }, { word: 'Φ.Μ', means: 'guard' }, { word: 'ΑΠΟΘΗΚΗ', means: 'store' }
];
export const PLACE_MEANS: [PlaceWord['means'], string][] = [['rack', 'Οπλοβαστός'], ['box', 'Κιβώτιο'], ['duty', 'Σε υπηρεσία'], ['leave', 'Σε άδεια'], ['guard', 'Φρουρά'], ['store', 'Αποθήκη'], ['other', 'Άλλο']];
// Ρυθμίσεις με τις προεπιλογές στα κενά (ό,τι λείπει από το settings.assets)
export function assetCfgOf(st: Pick<Settings, 'assets' | 'lists'> | undefined): AssetCfg {
  const a = st?.assets || {};
  const warn = Math.floor(Number(a.warnDays));
  return {
    cats: a.cats?.length ? a.cats.map(c => ({ ...c, types: c.types || [], fields: c.fields || [] })) : defaultCats(st?.lists),
    places: a.places ? a.places : DEFAULT_PLACES.map(p => ({ ...p })),
    warnDays: warn >= 0 && isFinite(warn) && a.warnDays != null ? warn : ASSET_WARN_DAYS
  };
}
export const catOf = (cfg: AssetCfg, id: string): AssetCat | undefined => cfg.cats.find(c => c.id === id);
// Τύπος όπλου → κατηγορία: αυτή που τον έχει στη λίστα της, αλλιώς Τυφέκια (η πρώτη κατηγορία όπλων αν σβήστηκαν)
export function catOfType(cfg: AssetCfg, type: string | undefined): AssetCat {
  const t = normGreek(type);
  const hit = t ? cfg.cats.find(c => c.kind === 'weapon' && c.types.some(x => normGreek(x) === t)) : undefined;
  return hit || catOf(cfg, CAT_RIFLE) || cfg.cats.find(c => c.kind === 'weapon') || cfg.cats[0];
}
export const newAssetCatId = (cats: AssetCat[]): string => { let n = cats.length + 1; while (cats.some(c => c.id === 'c' + n)) n++; return 'c' + n; };

// ---------- ημερομηνίες συντήρησης ----------
export function addMonths(d: ISODate, n: number): ISODate {
  const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n, day = +d.slice(8, 10);
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const last = new Date(yy, mm + 1, 0).getDate();
  return yy + '-' + String(mm + 1).padStart(2, '0') + '-' + String(Math.min(day, last)).padStart(2, '0');
}
export type MaintState = 'none' | 'ok' | 'soon' | 'overdue';
export function maintState(a: Pick<Asset, 'maint'>, today: ISODate, warn: number): MaintState {
  const n = a.maint?.next; if (!n) return 'none';
  return n < today ? 'overdue' : n <= addDays(today, warn) ? 'soon' : 'ok';
}
// Μέρες ως την επόμενη συντήρηση (αρνητικές: καθυστέρηση)
export const maintDays = (a: Pick<Asset, 'maint'>, today: ISODate): number | null => {
  const n = a.maint?.next; if (!n) return null;
  return Math.round((new Date(n + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 864e5);
};
export const maintTxt = (a: Pick<Asset, 'maint'>, today: ISODate): string => {
  const d = maintDays(a, today); if (d == null) return '';
  return d < 0 ? 'καθυστέρηση ' + -d + (d === -1 ? ' μέρα' : ' μέρες') : d === 0 ? 'σήμερα' : 'σε ' + d + (d === 1 ? ' μέρα' : ' μέρες');
};
// Η συντήρηση που έγινε: τελευταία = date, επόμενη = date + every μήνες (του ίδιου ή της κατηγορίας)
export function doMaint(a: Asset, c: AssetCat | undefined, date: ISODate): NonNullable<Asset['maint']> {
  const every = a.maint?.every ?? c?.every;
  return { ...(a.maint || {}), last: date, ...(every ? { every, next: addMonths(date, every) } : { next: undefined }) };
}

// ---------- κάτοχοι ----------
const holderKey = (h?: AssetHolder): string => (!h ? '' : h.k === 'person' ? 'p' + h.pid : h.k === 'cadre' ? 'c' + h.cid : h.k + ':' + normGreek(h.name));
export const sameHolder = (a?: AssetHolder, b?: AssetHolder) => holderKey(a) === holderKey(b);
const personOf = (s: Pick<AppState, 'people'>, pid: number) => s.people.find(p => p.id === pid);
const cadreById = (s: Pick<AppState, 'cadreList'>, cid: string) => (s.cadreList || []).find(c => c.id === cid);
const nameOf = (x: { last: string; first: string }) => (x.last + ' ' + x.first).trim();
export function holderParts(s: Pick<AppState, 'people' | 'cadreList'>, h?: AssetHolder): { rank: string; name: string } {
  if (!h) return { rank: '', name: '' };
  if (h.k === 'person') { const p = personOf(s, h.pid); return p ? { rank: rankTxt(p), name: nameOf(p) } : { rank: '', name: '(άγνωστος)' }; }
  if (h.k === 'cadre') { const c = cadreById(s, h.cid); return c ? { rank: rankTxt(c), name: nameOf(c) } : { rank: '', name: '(άγνωστο στέλεχος)' }; }
  return { rank: '', name: h.name };
}
export function holderText(s: Pick<AppState, 'people' | 'cadreList'>, h?: AssetHolder): string {
  if (!h) return 'αχρέωτο';
  const x = holderParts(s, h); const t = (x.rank + ' ' + x.name).trim();
  return h.k === 'cadre' ? t + ' (στέλεχος)' : h.k === 'unit' ? t + ' (άλλη μονάδα)' : h.k === 'ext' ? t + ' (φυσικό πρόσωπο)' : t;
}
// Είναι εκτός δύναμης ο κάτοχος (άτομο ή στέλεχος που δεν είναι ενεργός)
export function holderOut(s: Pick<AppState, 'people' | 'cadreList'>, h?: AssetHolder): boolean {
  if (h?.k === 'person') { const p = personOf(s, h.pid); return !!p && !p.active; }
  if (h?.k === 'cadre') { const c = cadreById(s, h.cid); return !!c && !c.active; }
  return false;
}

// ---------- λέξεις θέσης ----------
const pk = (v: unknown) => normGreek(v).replace(/[\s.\-/()]/g, '');
// Η λέξη θέσης που ταιριάζει σε ένα κείμενο («ΚΙΒΩΤΙΟ 53» → ΚΙΒΩΤΙΟ): η μακρύτερη που αρχίζει το κείμενο (χωρίς τόνους, τελείες, κενά)
export function placeWord(cfg: Pick<AssetCfg, 'places'>, text: string | undefined): PlaceWord | undefined {
  const t = pk(text); if (!t) return undefined;
  let best: PlaceWord | undefined; let bl = 0;
  for (const w of cfg.places) { const k = pk(w.word); if (k && t.startsWith(k) && k.length > bl) { best = w; bl = k.length; } }
  return best;
}
const rackWord = (cfg: Pick<AssetCfg, 'places'>) => cfg.places.find(p => p.means === 'rack')?.word || 'ΟΠΛΟΒΑΣΤΟ';
// Η θέση όπως φαίνεται: οπλοβαστός + θέση, αλλιώς το ελεύθερο κείμενο
export const placeText = (cfg: Pick<AssetCfg, 'places'>, a: Pick<Asset, 'rack' | 'wpos' | 'place'>): string =>
  a.rack || a.wpos ? (rackWord(cfg) + ' ' + seatTxt(a.rack, a.wpos)).trim() : a.place || '';
// Τι σημαίνει η θέση (οπλοβαστός, κιβώτιο, υπηρεσία, άδεια…): από τη λέξη του αρχείου της μονάδας (fileWord) ή τη θέση
export const placeMeans = (cfg: Pick<AssetCfg, 'places'>, a: Pick<Asset, 'rack' | 'wpos' | 'place' | 'fileWord'>): PlaceWord['means'] | '' =>
  (a.rack ? 'rack' : (placeWord(cfg, a.fileWord) || placeWord(cfg, a.place))?.means || '');

// ---------- το μητρώο: αληθινές εγγραφές + «εικονικές» από τα κύρια όπλα ----------
export interface AssetRow {
  key: string;                                 // id της εγγραφής ή «v:p:ΑΡΙΘΜΟΣ» / «v:c:ID» για εικονική γραμμή
  a: Asset;                                    // ό,τι φαίνεται (κάτοχος, τύπος, οπλοβαστός από το Δυναμολόγιο όταν είναι κύριο όπλο)
  stored: boolean;                             // υπάρχει ως εγγραφή στο s.assets
  link?: Extract<AssetHolder, { k: 'person' | 'cadre' }>;                          // είναι το κύριο όπλο αυτού του ατόμου/στελέχους (από το Δυναμολόγιο)
  cat: AssetCat | undefined;
}
interface Primary { h: Extract<AssetHolder, { k: 'person' | 'cadre' }>; no: string; type: string; rack: string; wpos: string; active: boolean }
// Τα κύρια όπλα όσων έχουν αριθμό (και όσων βγήκαν εκτός δύναμης και δεν παρέδωσαν)
export function primaryWeapons(s: Pick<AppState, 'people' | 'cadreList'>): Primary[] {
  const out: Primary[] = [];
  for (const p of s.people) if (weaponKey(p.weapon)) out.push({ h: { k: 'person', pid: p.id }, no: normWeapon(p.weapon), type: p.wtype || '', rack: p.rack || '', wpos: p.wpos || '', active: !!p.active });
  for (const c of s.cadreList || []) if (weaponKey(c.weapon)) out.push({ h: { k: 'cadre', cid: c.id }, no: normWeapon(c.weapon), type: c.wtype || '', rack: c.rack || '', wpos: c.wpos || '', active: !!c.active });
  return out;
}
const clean = <T extends object>(o: T): T => { for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k]; return o; };
export function registry(s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'settings'>): AssetRow[] {
  const cfg = assetCfgOf(s.settings); const prim = primaryWeapons(s);
  const byKey = new Map<string, Primary>();
  for (const x of prim) { const k = weaponKey(x.no); const o = byKey.get(k); if (!o || (!o.active && x.active)) byKey.set(k, x); }
  const rows: AssetRow[] = []; const seen = new Set<string>();
  for (const a of s.assets || []) {
    if (a.gone) { seen.add(weaponKey(a.no)); continue; }
    const k = weaponKey(a.no); seen.add(k);
    const pr = cfg.cats.find(c => c.id === a.cat)?.kind === 'weapon' || !catOf(cfg, a.cat) ? byKey.get(k) : undefined;
    // κύριο όπλο κάποιου: κάτοχος, τύπος, οπλοβαστός και θέση από το Δυναμολόγιο, όχι από την εγγραφή
    rows.push(pr && k ? { key: a.id, a: clean({ ...a, holder: pr.h, type: pr.type || a.type, rack: pr.rack || undefined, wpos: pr.wpos || undefined }), stored: true, link: pr.h, cat: catOf(cfg, a.cat) } : { key: a.id, a, stored: true, cat: catOf(cfg, a.cat) });
  }
  for (const x of prim) {
    if (seen.has(weaponKey(x.no))) continue;
    const c = catOfType(cfg, x.type); const id = x.h.k === 'person' ? 'v:p:' + x.h.pid : 'v:c:' + x.h.cid;
    rows.push({ key: id, a: clean({ id, cat: c.id, type: x.type, no: x.no, holder: x.h, rack: x.rack || undefined, wpos: x.wpos || undefined, state: 'ok' as const }), stored: false, link: x.h, cat: c });
  }
  const order = new Map(cfg.cats.map((c, i) => [c.id, i]));
  return rows.sort((x, y) => (order.get(x.a.cat) ?? 99) - (order.get(y.a.cat) ?? 99));   // με τη σειρά των κατηγοριών (σταθερή ταξινόμηση)
}
// Η εγγραφή που θα αποθηκευτεί όταν αλλάξεις μια εικονική γραμμή (ίδιος αριθμός, κάτοχος, τύπος, οπλοβαστός)
export const materialise = (row: AssetRow, id: string): Asset => ({ ...row.a, id });

// ---------- φίλτρα και αναζήτηση ----------
export type AssetFilter = 'all' | 'held' | 'free' | 'other' | 'repair' | 'writeoff' | 'war' | 'due' | 'out';
export const ASSET_FILTER_IDS: string[] = ['all', 'held', 'free', 'other', 'repair', 'writeoff', 'war', 'due', 'out'];
export const ASSET_FILTERS = (warn: number): [AssetFilter, string, string][] => [
  ['all', 'Όλα', 'Όλα τα είδη'], ['held', 'Χρεωμένα', 'Χρεωμένα σε στρατιώτη ή στέλεχος'], ['free', 'Αχρέωτα', 'Χωρίς κάτοχο'],
  ['other', 'Σε άλλον', 'Σε άλλη μονάδα ή φυσικό πρόσωπο'], ['repair', 'Προς επισκευή', 'Προς επισκευή'], ['writeoff', 'Προς διαγραφή', 'Προς διαγραφή ή καταστροφή'],
  ['war', 'Μόνο εμπόλεμη', 'Χρησιμοποιούνται μόνο σε εμπόλεμη περίοδο'], ['due', 'Συντήρηση σε ' + warn + ' μέρες', 'Η επόμενη συντήρηση είναι μέσα σε ' + warn + ' μέρες ή έχει περάσει'],
  ['out', 'Σε εκτός δύναμης', 'Ο κάτοχος είναι εκτός δύναμης και δεν έχει παραδώσει']
];
export function assetMatch(f: AssetFilter, r: AssetRow, s: Pick<AppState, 'people' | 'cadreList'>, today: ISODate, warn: number): boolean {
  const a = r.a; const k = a.holder?.k;
  switch (f) {
    case 'all': return true;
    case 'held': return k === 'person' || k === 'cadre';
    case 'free': return !a.holder;
    case 'other': return k === 'unit' || k === 'ext';
    case 'repair': return a.state === 'repair' || a.state === 'immobile';
    case 'writeoff': return a.state === 'writeoff';
    case 'war': return !!a.warOnly;
    case 'due': { const m = maintState(a, today, warn); return m === 'soon' || m === 'overdue'; }
    case 'out': return holderOut(s, a.holder);
  }
}
const collator = new Intl.Collator('el', { sensitivity: 'base', numeric: true });
export interface AssetQuery { cat?: string; filter?: AssetFilter; q?: string; kinds?: AssetCat['kind'][] }
// Οι γραμμές του πίνακα: κατηγορίες όπλων και υλικού (τα οχήματα έχουν δική τους οθόνη), με τη σειρά κατηγορία, τύπος, αριθμός
export function assetView(s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'settings'>, o: AssetQuery, today: ISODate, all?: AssetRow[]): AssetRow[] {
  const cfg = assetCfgOf(s.settings); const kinds = o.kinds || ['weapon', 'material'];
  const order = new Map(cfg.cats.map((c, i) => [c.id, i])); const q = normGreek(o.q || '').replace(/\s+/g, ' ');
  const rows = (all || registry(s)).filter(r => (!r.cat || kinds.includes(r.cat.kind)) && (!o.cat || r.a.cat === o.cat) && assetMatch(o.filter || 'all', r, s, today, cfg.warnDays)
    && (!q || normGreek([r.a.no, r.a.type, holderText(s, r.a.holder), placeText(cfg, r.a), r.a.place, r.a.fileWord, r.a.note, r.cat?.name].join(' ')).includes(q)));
  return rows.sort((x, y) => (order.get(x.a.cat) ?? 99) - (order.get(y.a.cat) ?? 99) || collator.compare(x.a.type, y.a.type) || collator.compare(x.a.no, y.a.no));
}
// Πόσα ανά κατηγορία (με το φίλτρο και την αναζήτηση, χωρίς την κατηγορία)
export function catCounts(s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'settings'>, o: AssetQuery, today: ISODate, all?: AssetRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of assetView(s, { ...o, cat: undefined }, today, all)) m.set(r.a.cat, (m.get(r.a.cat) || 0) + 1);
  return m;
}
// Ό,τι έχει χρεωμένο ένα άτομο ή στέλεχος (κύριο και δεύτερο όπλο, υλικό), από όλο το μητρώο
export function heldBy(rows: AssetRow[], h: AssetHolder): AssetRow[] { return rows.filter(r => !r.a.gone && sameHolder(r.a.holder, h)); }
export const heldGroups = (rows: AssetRow[], h: AssetHolder): [string, AssetRow[]][] => {
  const m = new Map<string, AssetRow[]>(); for (const r of heldBy(rows, h)) { const n = r.cat?.name || 'Άλλο'; const l = m.get(n); if (l) l.push(r); else m.set(n, [r]); }
  return [...m];
};
// Ο ίδιος αριθμός σε άλλη γραμμή (προειδοποίηση)
export const sameNo = (rows: AssetRow[], r: Pick<AssetRow, 'key' | 'a'>, no = r.a.no): AssetRow[] => { const k = weaponKey(no); return k ? rows.filter(x => x.key !== r.key && weaponKey(x.a.no) === k && x.a.cat === r.a.cat) : []; };
export const assetHistory = (log: AssetEvent[] | undefined, aid: string): AssetEvent[] =>
  (log || []).filter(e => e.aid === aid).map((e, i) => [e, i] as const).sort((x, y) => y[0].date.localeCompare(x[0].date) || y[1] - x[1]).map(x => x[0]);

export const STATE_TXT: Record<Asset['state'], string> = { ok: 'Λειτουργικό', repair: 'Προς επισκευή', writeoff: 'Προς διαγραφή', immobile: 'Ακινησία' };
export const EVENT_TXT: Record<AssetEvent['what'], string> = { maint: 'συντήρηση', assign: 'χρέωση', repair: 'προς επισκευή', back: 'επέστρεψε από επισκευή', writeoff: 'προς διαγραφή', immobile: 'ακινησία', fuel: 'καύσιμα', km: 'χιλιόμετρα', note: 'αλλαγή' };

// ---------- Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ»: ένα φύλλο ανά τύπο όπλου, ένα ανά κατηγορία υλικού, και ΣΥΝΟΛΑ ----------
export interface AssetSheet { name: string; title: string; head: string[]; rows: (string | number)[][]; note: string; kind: 'weapon' | 'material' | 'totals' | 'vehicle' | 'fuel' | 'maint' }
const stateXl = (a: Asset) => upper(STATE_TXT[a.state] + (a.warOnly ? ' · ΜΟΝΟ ΕΜΠΟΛΕΜΗ' : ''));
const holderXl = (s: Pick<AppState, 'people' | 'cadreList'>, h?: AssetHolder): [string, string] => {
  if (!h) return ['', 'ΑΧΡΕΩΤΟ']; const x = holderParts(s, h);
  return [upper(x.rank), upper(x.name) + (h.k === 'unit' ? ' (ΑΛΛΗ ΜΟΝΑΔΑ)' : h.k === 'ext' ? ' (ΦΥΣΙΚΟ ΠΡΟΣΩΠΟ)' : '')];
};
const dateXl = (d?: ISODate) => (d ? dmy(d) : '');
export function assetSheets(s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'settings'>, rows: AssetRow[], d: ISODate): AssetSheet[] {
  const cfg = assetCfgOf(s.settings); const out: AssetSheet[] = []; const used = new Set<string>();
  const uniq = (n: string) => { let x = upper(n).replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'ΦΥΛΛΟ'; let i = 2; const base = x; while (used.has(x)) x = base.slice(0, 28) + ' (' + i++ + ')'; used.add(x); return x; };
  const wk = rows.filter(r => r.cat?.kind === 'weapon'); const mat = rows.filter(r => r.cat?.kind === 'material');
  const order = new Map(cfg.cats.map((c, i) => [c.id, i]));
  // τύποι όπλων: με τη σειρά των κατηγοριών και των λιστών τους, μετά όσοι δεν είναι σε λίστα
  const types: string[] = []; const add = (t: string) => { if (!types.some(x => normGreek(x) === normGreek(t))) types.push(t); };
  for (const c of cfg.cats) if (c.kind === 'weapon') for (const t of c.types) if (wk.some(r => normGreek(r.a.type) === normGreek(t))) add(t);
  for (const r of wk) if (r.a.type) add(r.a.type);
  if (wk.some(r => !r.a.type)) add('');
  const sortRows = (l: AssetRow[]) => [...l].sort((x, y) => (order.get(x.a.cat) ?? 99) - (order.get(y.a.cat) ?? 99) || collator.compare(x.a.no, y.a.no));
  const extras = (l: AssetRow[]) => { const f: { id: string; name: string }[] = []; for (const r of l) for (const x of r.cat?.fields || []) if (!f.some(y => y.id === x.id)) f.push(x); return f; };
  const maintCells = (a: Asset) => [dateXl(a.maint?.last), dateXl(a.maint?.next)];
  for (const t of types) {
    const l = sortRows(wk.filter(r => normGreek(r.a.type) === normGreek(t))); const fx = extras(l); const name = t ? upper(t) : 'ΧΩΡΙΣ ΤΥΠΟ';
    const head = ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΘΕΣΗ', 'ΚΑΤΑΣΤΑΣΗ', 'ΤΕΛ. ΣΥΝΤΗΡΗΣΗ', 'ΕΠΟΜ. ΣΥΝΤΗΡΗΣΗ', ...fx.map(x => upper(x.name)), 'ΠΑΡΑΤΗΡΗΣΕΙΣ'];
    out.push({ name: uniq(name), title: 'ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ ' + name + ' ' + dmy(d), head, kind: 'weapon', note: 'ΤΑ ΑΧΡΕΩΤΑ ΦΑΙΝΟΝΤΑΙ ΩΣ «ΑΧΡΕΩΤΟ»',
      rows: l.map((r, j) => { const [rk, nm] = holderXl(s, r.a.holder); return [j + 1, rk, nm, upper(r.a.type), upper(r.a.no), upper(placeText(cfg, r.a)), stateXl(r.a), ...maintCells(r.a), ...fx.map(x => upper(r.a.extra?.[x.id] || '')), upper([r.a.acc && 'ΠΑΡΕΛΚΟΜΕΝΑ: ' + r.a.acc, r.a.why && 'ΛΟΓΟΣ: ' + r.a.why, r.a.note].filter(Boolean).join(' · '))]; }) });
  }
  for (const c of cfg.cats) {
    if (c.kind !== 'material') continue; const l = sortRows(mat.filter(r => r.a.cat === c.id)); if (!l.length) continue;
    const fx = extras(l);
    const head = ['Α/Α', 'ΤΥΠΟΣ', 'ΑΡΙΘΜΟΣ', 'ΠΟΣΟΤΗΤΑ', 'ΒΑΘΜΟΣ', 'ΧΡΕΩΜΕΝΟ ΣΕ', 'ΘΕΣΗ', 'ΚΑΤΑΣΤΑΣΗ', 'ΤΕΛ. ΣΥΝΤΗΡΗΣΗ', 'ΕΠΟΜ. ΣΥΝΤΗΡΗΣΗ', ...fx.map(x => upper(x.name)), 'ΠΑΡΑΤΗΡΗΣΕΙΣ'];
    out.push({ name: uniq(c.name), title: 'ΜΗΤΡΩΟ ΥΛΙΚΟΥ ' + upper(c.name) + ' ' + dmy(d), head, kind: 'material', note: 'ΤΑ ΑΧΡΕΩΤΑ ΦΑΙΝΟΝΤΑΙ ΩΣ «ΑΧΡΕΩΤΟ»',
      rows: l.map((r, j) => { const [rk, nm] = holderXl(s, r.a.holder); return [j + 1, upper(r.a.type), upper(r.a.no), r.a.qty || 1, rk, nm, upper(placeText(cfg, r.a)), stateXl(r.a), ...maintCells(r.a), ...fx.map(x => upper(r.a.extra?.[x.id] || '')), upper([r.a.acc && 'ΠΑΡΕΛΚΟΜΕΝΑ: ' + r.a.acc, r.a.why && 'ΛΟΓΟΣ: ' + r.a.why, r.a.note].filter(Boolean).join(' · '))]; }) });
  }
  out.push(totalsSheet(rows, cfg, d, uniq('ΣΥΝΟΛΑ')));
  return out;
}
// Σύνολα ανά κατηγορία και τύπο: σύνολο, χρεωμένα (σε στρατιώτη/στέλεχος), αχρέωτα, σε άλλον, επισκευή, διαγραφή. Το υλικό μετρά με την ποσότητά του
export function totalsSheet(rows: AssetRow[], cfg: AssetCfg, d: ISODate, name = 'ΣΥΝΟΛΑ'): AssetSheet {
  const head = ['ΚΑΤΗΓΟΡΙΑ', 'ΤΥΠΟΣ', 'ΣΥΝΟΛΟ', 'ΧΡΕΩΜΕΝΑ', 'ΑΧΡΕΩΤΑ', 'ΣΕ ΑΛΛΟΝ', 'ΕΠΙΣΚΕΥΗ', 'ΔΙΑΓΡΑΦΗ'];
  const body: (string | number)[][] = []; const tot = [0, 0, 0, 0, 0, 0];
  const count = (l: AssetRow[]) => {
    const n = [0, 0, 0, 0, 0, 0];
    for (const r of l) { const q = r.a.qty || 1; const k = r.a.holder?.k; n[0] += q; if (k === 'person' || k === 'cadre') n[1] += q; else if (!k) n[2] += q; else n[3] += q; if (r.a.state === 'repair' || r.a.state === 'immobile') n[4] += q; if (r.a.state === 'writeoff') n[5] += q; }
    return n;
  };
  for (const c of cfg.cats) {
    if (c.kind === 'vehicle') continue; const l = rows.filter(r => r.a.cat === c.id); if (!l.length) continue;
    const ts: string[] = []; for (const r of l) { const t = r.a.type; if (!ts.some(x => normGreek(x) === normGreek(t))) ts.push(t); }
    ts.sort((x, y) => collator.compare(x, y));
    for (const t of ts) { const n = count(l.filter(r => normGreek(r.a.type) === normGreek(t))); n.forEach((v, i) => { tot[i] += v; }); body.push([upper(c.name), upper(t) || '—', ...n]); }
  }
  body.push(['ΓΕΝΙΚΟ ΣΥΝΟΛΟ', '', ...tot]);
  return { name, title: 'ΣΥΝΟΛΑ ΟΠΛΙΣΜΟΥ ΚΑΙ ΥΛΙΚΟΥ ' + dmy(d), head, rows: body, kind: 'totals', note: 'ΤΟ ΥΛΙΚΟ ΜΕΤΡΑ ΜΕ ΤΗΝ ΠΟΣΟΤΗΤΑ ΤΟΥ· ΣΕ ΑΛΛΟΝ: ΑΛΛΗ ΜΟΝΑΔΑ Ή ΦΥΣΙΚΟ ΠΡΟΣΩΠΟ' };
}

// Ό,τι δεν είναι έγκυρο το καθαρίζουμε με το γράψιμο (όχι μπλοκάρισμα): κανονικοποίηση μιας εγγραφής
export function cleanAsset(a: Omit<Asset, 'id'> & { id?: string }, id: string): Asset {
  const t = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const x: Asset = { id, cat: a.cat, type: t(a.type), no: normWeapon(a.no), state: a.state || 'ok' };
  const q = Math.floor(Number(a.qty)); if (q > 1) x.qty = q;
  if (a.holder) x.holder = a.holder.k === 'unit' || a.holder.k === 'ext' ? { k: a.holder.k, name: t(a.holder.name) } : a.holder;
  if (x.holder && (x.holder.k === 'unit' || x.holder.k === 'ext') && !x.holder.name) delete x.holder;
  if (normRack(a.rack)) x.rack = normRack(a.rack); if (normPos(a.wpos)) x.wpos = normPos(a.wpos);
  if (t(a.place)) x.place = normPos(a.place); if (t(a.fileWord)) x.fileWord = normPos(a.fileWord);
  if (t(a.why)) x.why = t(a.why); if (a.warOnly) x.warOnly = true;
  if (a.maint) { const m = clean({ last: a.maint.last || undefined, next: a.maint.next || undefined, every: a.maint.every && a.maint.every > 0 ? Math.floor(a.maint.every) : undefined, lastKm: a.maint.lastKm, nextKm: a.maint.nextKm }); if (Object.keys(m).length) x.maint = m; }
  if (a.extra) { const e: Record<string, string> = {}; for (const [k, v] of Object.entries(a.extra)) if (t(v)) e[k] = t(v); if (Object.keys(e).length) x.extra = e; }
  if (t(a.acc)) x.acc = t(a.acc); if (t(a.note)) x.note = t(a.note);
  if (t(a.plate)) x.plate = t(a.plate); if (a.driver) x.driver = a.driver;
  if (a.km != null) x.km = a.km; if (a.kmOn) x.kmOn = a.kmOn; if (a.gone) x.gone = a.gone;
  return x;
}
