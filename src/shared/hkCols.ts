// Δικές σου στήλες της ΗΚΑΙ (UserLists.hkCols, Michael 17/11): προσθήκη, αλλαγή ονόματος, διαγραφή, με έλεγχο.
// Όταν σβηστεί μια στήλη, όλα όσα τη χρησιμοποιούσαν (υπηρεσίες, είδη άδειας, δηλώσεις κωλυόμενου, υπηρεσίες και απουσίες στελεχών) γυρνούν στην
// προεπιλογή τους και το ιστορικό γράφει ποια· κανείς δεν χάνεται από την ΗΚΑΙ (μετρά στην προεπιλεγμένη στήλη).
import { TYPES, type AppState, type BlockDef, type Settings } from './domain';
import { HK_A, HK_COLS_MAX, HK_K, hkColsOf, itemKey, type HkColDef, type UserLists } from './ranks';

export interface HkColInput { key?: string; name: string; grp: 'kol' | 'abs'; short?: string }
export const HK_COL_NAME_MAX = 40, HK_COL_SHORT_MAX = 12;
const clean = (v: string | undefined, max: number) => (v || '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
const GRP_NAME = { kol: 'Κωλυόμενοι', abs: 'Απόντες' } as const;
// τα ονόματα των βασικών στηλών (μακριά και σύντομα): μια δική σου στήλη δεν μπορεί να λέγεται όπως αυτές
const SYNOLO = itemKey('Σύνολο');
const BUILTIN = new Set([...HK_K, ...HK_A].flatMap(([, s, l]) => [itemKey(s), itemKey(l)]).filter(Boolean));

// Τα στοιχεία ελέγχονται εδώ και όχι στη φόρμα: σφάλμα = Error με πρόταση στα ελληνικά
export function cleanHkCols(list: HkColInput[], before: HkColDef[]): HkColDef[] {
  if (list.length > HK_COLS_MAX) throw new Error('Το πολύ ' + HK_COLS_MAX + ' δικές σου στήλες');
  const have = new Set(before.map(x => x.key)), used = new Set<string>();
  let n = Math.max(0, ...[...before, ...list].map(x => +(/^u(\d+)$/.exec(x.key || '')?.[1] || 0)));
  const out: HkColDef[] = []; const names = new Set<string>();
  for (const x of list) {
    const name = clean(x.name, HK_COL_NAME_MAX); if (!name) throw new Error('Γράψε όνομα για τη στήλη');
    if (x.grp !== 'kol' && x.grp !== 'abs') throw new Error('Διάλεξε ομάδα για τη στήλη «' + name + '»');
    const k = itemKey(name);
    if (BUILTIN.has(k)) throw new Error('Υπάρχει ήδη στήλη «' + name + '» στην ΗΚΑΙ');
    if (k.startsWith(SYNOLO)) throw new Error('Το όνομα «' + name + '» μοιάζει με σύνολο· διάλεξε άλλο');
    if (names.has(k)) throw new Error('Έχεις ήδη στήλη «' + name + '»');
    names.add(k);
    let key = x.key && have.has(x.key) && !used.has(x.key) ? x.key : '';
    if (!key) key = 'u' + ++n;
    used.add(key);
    const short = clean(x.short, HK_COL_SHORT_MAX);
    out.push({ key, name, grp: x.grp, ...(short ? { short } : {}) });
  }
  return out;
}

const join = (l: string[]) => l.map(x => '«' + x + '»').join(', ');
// Σβήνει τις αναφορές στις στήλες που διαγράφηκαν· επιστρέφει τη νέα κατάσταση και τι γύρισε στην προεπιλογή (σε απλά ελληνικά)
function dropRefs(s: AppState, gone: HkColDef[], lists: UserLists): { state: AppState; fell: string[] } {
  const g = new Map(gone.map(x => [x.key, x] as const)); const fell: string[] = [];
  const blocks: string[] = [], leave: string[] = [], cadreAbs: string[] = [], svc: string[] = [];
  const fixBlocks = (l?: BlockDef[]) => l?.map(b => { if (!b.hkCol || !g.has(b.hkCol)) return b; blocks.push(b.name); const { hkCol, ...r } = b; return r as BlockDef; });
  const st: Settings = { ...s.settings, lists };
  if (st.blocks) st.blocks = fixBlocks(st.blocks)!;
  if (st.blocksSpen) st.blocksSpen = fixBlocks(st.blocksSpen)!;
  if (st.phases) st.phases = st.phases.map(x => ({ ...x, blocks: fixBlocks(x.blocks) || x.blocks }));
  const fixItems = (id: 'leaveKinds' | 'cadreAbs', into: string[], def: (c: HkColDef) => string) => {
    const add = lists[id]?.add; if (!add?.some(x => x.col && g.has(x.col))) return;
    lists[id] = { ...lists[id], add: add.map(x => { if (!x.col || !g.has(x.col)) return x; into.push(x.name); const d = def(g.get(x.col)!); const { col, ...r } = x; return d ? { ...r, col: d } : r; }) };
  };
  fixItems('leaveKinds', leave, () => '');   // χωρίς στήλη: η προεπιλογή των αδειών (Κανονικές)
  fixItems('cadreAbs', cadreAbs, c => (c.grp === 'abs' ? 'ka' : 'yp'));
  // Στήλη ΗΚΑΙ ανά κατάσταση και στήλη του ΣΤΕΠ (Ρυθμίσεις): γυρνούν στην προεπιλογή
  const typeFell: string[] = [];
  if (lists.stepCol && g.has(lists.stepCol)) { delete lists.stepCol; typeFell.push('ΣΤΕΠ'); }
  if (lists.typeCols) {
    const tc = { ...lists.typeCols }; for (const k of Object.keys(tc) as (keyof typeof tc)[]) if (tc[k] && g.has(tc[k]!)) { delete tc[k]; typeFell.push(TYPES[k].label); }
    if (Object.keys(tc).length) lists.typeCols = tc; else delete lists.typeCols;
  }
  const cd = st.cadreDuty;
  if (cd?.groups?.some(x => x.services?.some(v => v.hkCol && g.has(v.hkCol)))) {
    st.cadreDuty = { ...cd, groups: cd.groups.map(x => ({ ...x, services: (x.services || []).map(v => { if (!v.hkCol || !g.has(v.hkCol)) return v; svc.push(v.name); return { ...v, hkCol: g.get(v.hkCol)!.grp === 'abs' ? 'ka' : 'yp' }; }) })) };
  }
  let stN = 0;
  const statuses = s.statuses.some(x => x.hkCol && g.has(x.hkCol)) ? s.statuses.map(x => { if (!x.hkCol || !g.has(x.hkCol)) return x; stN++; const { hkCol, ...r } = x; return r; }) : s.statuses;
  const uniq = (l: string[]) => [...new Set(l)];
  if (typeFell.length) fell.push('η στήλη ανά κατάσταση ' + join(typeFell));
  if (blocks.length) fell.push('οι υπηρεσίες ' + join(uniq(blocks)));
  if (leave.length) fell.push('τα είδη άδειας ' + join(uniq(leave)) + ' (στις Κανονικές)');
  if (cadreAbs.length) fell.push('οι απουσίες στελεχών ' + join(uniq(cadreAbs)));
  if (svc.length) fell.push('οι υπηρεσίες στελεχών ' + join(uniq(svc)));
  if (stN) fell.push(stN === 1 ? 'μία δήλωση κωλυόμενου' : stN + ' δηλώσεις κωλυόμενου');
  return { state: { ...s, statuses, settings: st }, fell };
}

// hk: το όνομα της ΗΚΑΙ στη μονάδα
export function applyHkCols(s: AppState, input: HkColInput[], hk: string): { state: AppState; text: string } {
  const before = hkColsOf(s.settings.lists), cols = cleanHkCols(input, before);
  const lists: UserLists = { ...(s.settings.lists || {}) };
  if (cols.length) lists.hkCols = cols; else delete lists.hkCols;
  const gone = before.filter(b => !cols.some(c => c.key === b.key));
  const bk = new Map(before.map(b => [b.key, b] as const));
  const parts: string[] = [];
  for (const c of cols) {
    const b = bk.get(c.key);
    if (!b) parts.push('νέα στήλη «' + c.name + '» (' + GRP_NAME[c.grp] + ')');
    else {
      const ch: string[] = [];
      if (b.name !== c.name) ch.push('όνομα «' + b.name + '» → «' + c.name + '»');
      if (b.grp !== c.grp) ch.push('ομάδα ' + GRP_NAME[b.grp] + ' → ' + GRP_NAME[c.grp]);
      if ((b.short || '') !== (c.short || '')) ch.push(c.short ? 'συντομία «' + c.short + '»' : 'χωρίς συντομία');
      if (ch.length) parts.push('στήλη «' + b.name + '»: ' + ch.join(', '));
    }
  }
  let state: AppState = { ...s, settings: { ...s.settings, lists } };
  for (const x of gone) parts.push('διαγράφηκε η στήλη «' + x.name + '»');
  if (gone.length) {
    const r = dropRefs(state, gone, lists); state = r.state;
    if (r.fell.length) parts.push(r.fell.join(', ') + ' γύρισαν στην προεπιλογή');
  }
  // μια στήλη που άλλαξε ομάδα (κωλυόμενοι ↔ απόντες): ό,τι τη χρησιμοποιεί μετρά πια αλλιώς· δεν χάνεται κανείς, αλλά το γράφουμε
  const moved = cols.filter(c => bk.get(c.key) && bk.get(c.key)!.grp !== c.grp);
  if (moved.length) parts.push('προσοχή: ό,τι χρησιμοποιεί ' + (moved.length > 1 ? 'τις στήλες ' : 'τη στήλη ') + join(moved.map(x => x.name)) + ' μετρά πια ' + (moved.length > 1 ? 'στις νέες ομάδες' : 'στη νέα ομάδα'));
  return { state, text: 'Ρυθμίσεις: δικές μου στήλες της ' + hk + (parts.length ? ': ' + parts.join('; ') : ' (καμία αλλαγή)') };
}
