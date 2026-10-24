// Ένοπλες υπηρεσίες ανά νούμερο (Michael, 24/10: αντικατέστησε το «όλη μέρα εκτός»). Καθαρό, υπολογίζεται την ώρα που ζητιέται: τίποτα
// δεν γράφεται, εκτός από τις διορθώσεις με το χέρι (state.dutyFix, kv «dutyFix»).
// Οι ώρες κάθε νούμερου έρχονται από τις βάρδιες της θέσης (post.slots: «κάθε τόσες ώρες» ή «δικές μου βάρδιες», domain.ts shiftSlots,
// σε λεπτά από την αρχή του κύκλου με slotSpans, rules.ts). Χωρίς βάρδιες: «ίδιες ώρες» (post.hrs) ή «όλη μέρα» = όλος ο κύκλος,
// από την αρχή υπηρεσίας (14:00) ως την ίδια ώρα την επόμενη. Πάντα με περιθώριο: το όπλο βγαίνει N′ πριν και μπαίνει N′ μετά (Κανόνες).
// Δύο τρόποι ανά υπηρεσία (BlockDef.armWeapon):
//  - «δικό του» (προεπιλογή): κάθε άτομο βγάζει το δικό του όπλο στο νούμερό του· διαδοχικά νούμερα του ίδιου ατόμου ενώνονται σε μία γραμμή.
//  - «της θέσης»: βγαίνει το όπλο του ατόμου του 1ου νούμερου (πριν το 1ο, μπαίνει μετά το τελευταίο) και περνά από χέρι σε χέρι στις αλλαγές·
//    τα όπλα των άλλων μένουν ΕΝΤΟΣ. Σε ζεύγος θέσεων την ίδια ώρα (α/β) μετρά η πρώτη.
import { addDays, daysBetween, type ISODate } from './dates';
import { everyBlock, type AppState, type BlockDef, type DutyFix, type Post, type Rules } from './domain';
import { dutyMin, postBy, postSpan, postsOf, slotSpans } from './rules';
import { upper } from './text';

export type ArmWeapon = 'own' | 'post';
export const ARM_BEFORE = 15, ARM_AFTER = 15, ARM_MAX = 240;
// Περιθώριο σε λεπτά· παλιές ρυθμίσεις χωρίς το πεδίο παίρνουν την προεπιλογή (χωρίς αλλαγή settings.rev)
const okMin = (v: unknown, def: number) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n >= 0 && n <= ARM_MAX ? Math.round(n) : def; };
export const armMargin = (r?: Pick<Rules, 'armBefore' | 'armAfter'> | null) => ({ before: okMin(r?.armBefore, ARM_BEFORE), after: okMin(r?.armAfter, ARM_AFTER) });
export const armModeOf = (b?: Pick<BlockDef, 'armWeapon'> | null): ArmWeapon => (b?.armWeapon === 'post' ? 'post' : 'own');

export type ArmState = Pick<AppState, 'guards' | 'dutyLog' | 'settings'> & Partial<Pick<AppState, 'rules' | 'dutyFix'>>;

// Μία γραμμή = ένα νούμερο ένοπλης υπηρεσίας (ή διαδοχικά ενωμένα). out/in: λεπτά από τα μεσάνυχτα της μέρας κύκλου (day), με το περιθώριο
// και τη διόρθωση· +1440 = την επόμενη μέρα, αρνητικό = την προηγούμενη. from/to: η ίδια η βάρδια.
export interface ArmRow {
  id: string;            // day|θέση|n του πρώτου νούμερου: το κλειδί της διόρθωσης
  day: ISODate; post: string; n: number; last: number;   // n..last: τα νούμερα (δείκτες βάρδιας στη θέση) που ενώθηκαν
  mode: ArmWeapon;
  who: number;           // ποιος κάνει το νούμερο (κρατά το όπλο στη γραμμή)
  owner: number;         // του οποίου το όπλο βγαίνει (μόνο διαφορετικός από τον who στο «της θέσης»)
  label: string;         // «Σκοπός 3ης σκοπιάς (α)»
  reason: string;        // «ΥΠΗΡΕΣΙΑ ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ (Α)»
  from: number; to: number; out: number; in: number; autoOut: number; autoIn: number;
  take: boolean;         // «της θέσης»: το παίρνει από τον προηγούμενο (αλλιώς από τον οπλοβαστό)
  give: boolean;         // «της θέσης»: το δίνει στον επόμενο (αλλιώς μπαίνει στον οπλοβαστό)
  next?: number;         // ο επόμενος που το παίρνει
  fix?: DutyFix;
}
export const ARM_BACK = 'ΛΗΞ ΥΠΗΡΕΣΙΑΣ';

const mod = (m: number) => ((m % 1440) + 1440) % 1440;
export const hmOf = (m: number) => String(Math.floor(mod(m) / 60)).padStart(2, '0') + ':' + String(mod(m) % 60).padStart(2, '0');
// Η μέρα (ημερολογιακή) που πέφτει το λεπτό m της μέρας κύκλου day
export const calDay = (day: ISODate, m: number): ISODate => addDays(day, Math.floor(m / 1440));
// «ΕΕΕΕ-ΜΜ-ΗΗ ΩΩ:ΛΛ» (η μορφή της διόρθωσης) και πίσω σε λεπτά από τα μεσάνυχτα της μέρας day
export const stampOf = (day: ISODate, m: number) => calDay(day, m) + ' ' + hmOf(m);
const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
export const okStamp = (v: unknown): v is string => typeof v === 'string' && STAMP.test(v) && +v.slice(11, 13) < 24 && +v.slice(14, 16) < 60;
export const stampMin = (day: ISODate, st: string) => (daysBetween(day, st.slice(0, 10)) - 1) * 1440 + +st.slice(11, 13) * 60 + +st.slice(14, 16);
const dayNo = (d: ISODate) => daysBetween('2000-01-01', d);
// «15:45–18:15»
export const armWhen = (r: Pick<ArmRow, 'out' | 'in'>) => hmOf(r.out) + '–' + hmOf(r.in);

interface Step { k: string; label: string; block: string; mode: ArmWeapon; pid: number; n: number; from: number; to: number; ord: number }
// Οι ώρες των νούμερων μιας θέσης: βάρδιες (slotSpans), αλλιώς «ίδιες ώρες» (postSpan), αλλιώς όλος ο κύκλος
function windowsOf(post: Post, cyc: number): { start: number; end: number }[] {
  const sl = slotSpans(post); if (sl.length) return sl;
  const sp = postSpan(post);
  if (sp.start != null && sp.end != null) { const sh = sp.start < cyc ? 1440 : 0; return [{ start: sp.start + sh, end: sp.end + sh }]; }
  return [{ start: cyc, end: cyc + 1440 }];
}
function stepsOf(s: ArmState, day: ISODate): Step[] {
  const cyc = dutyMin(s.settings); const blocks = everyBlock(s.settings); const out: Step[] = []; let ord = 0;
  const g = s.guards?.[day] || {};
  for (const k in g) {
    const x = postBy(s as AppState, k); if (!x?.armed || g[k] == null) continue;
    const mode = armModeOf(blocks.find(b => b.id === x.block));
    windowsOf(x, cyc).forEach((w, n) => out.push({ k, label: x.label, block: x.block, mode, pid: g[k], n, from: w.start, to: w.end, ord }));
    ord++;
  }
  // υπηρεσία χωρίς θέση (σκέτο «Σ» από Excel) σε ένοπλο είδος: όλος ο κύκλος
  const kinds = new Map(postsOf(s.settings).filter(x => x.armed).map(x => [x.kind, x] as const));
  for (const e of s.dutyLog?.[day] || []) {
    const x = kinds.get(e.kind); if (!x) continue;
    out.push({ k: '~' + e.kind + ':' + e.pid, label: (blocks.find(b => b.id === x.block)?.name || x.kind) + ' (χωρίς θέση)', block: x.block, mode: armModeOf(blocks.find(b => b.id === x.block)), pid: e.pid, n: 0, from: cyc, to: cyc + 1440, ord: ord++ });
  }
  return out;
}

interface Grp { first: Step; last: Step; who: number; out: number; in: number }
function rowOf(day: ISODate, g: Grp, o: Partial<Pick<ArmRow, 'owner' | 'take' | 'give' | 'next' | 'mode'>>, fixes: Map<string, DutyFix>): ArmRow {
  const f = g.first, id = day + '|' + f.k + '|' + f.n;
  const r: ArmRow = { id, day, post: f.k, n: f.n, last: g.last.n, mode: o.mode || 'own', who: g.who, owner: o.owner ?? g.who, label: f.label, reason: 'ΥΠΗΡΕΣΙΑ ' + upper(f.label),
    from: f.from, to: g.last.to, out: g.out, in: g.in, autoOut: g.out, autoIn: g.in, take: !!o.take, give: !!o.give, ...(o.next != null ? { next: o.next } : {}) };
  const fx = fixes.get(f.k + '|' + f.n);
  if (fx) {
    // διόρθωση που δεν βγαίνει πια λογική (η είσοδος πριν την έξοδο, αφού άλλαξαν οι υπηρεσίες) αγνοείται
    const out = okStamp(fx.out) ? stampMin(day, fx.out) : r.out, inn = okStamp(fx.in) ? stampMin(day, fx.in) : r.in;
    if (inn >= out) { r.out = out; r.in = inn; r.fix = fx; }
  }
  return r;
}
// Όλα τα νούμερα ένοπλων υπηρεσιών της μέρας κύκλου, με τη σειρά που βγαίνει το όπλο
export function armedRows(s: ArmState, day: ISODate): ArmRow[] {
  const steps = stepsOf(s, day); if (!steps.length) return [];
  const { before, after } = armMargin(s.rules);
  const fixes = new Map((s.dutyFix || []).filter(f => f.day === day).map(f => [f.post + '|' + f.n, f] as const));
  const rows: ArmRow[] = [];
  // δικό του: ανά άτομο, ενώνονται όσα νούμερα (με το περιθώριο) ακουμπούν ή πέφτουν το ένα πάνω στο άλλο
  const by = new Map<number, Step[]>();
  for (const x of steps) if (x.mode === 'own') { const l = by.get(x.pid); if (l) l.push(x); else by.set(x.pid, [x]); }
  for (const [pid, list] of by) {
    list.sort((a, b) => a.from - b.from || a.ord - b.ord);
    let cur: Grp | null = null;
    for (const x of list) {
      if (cur && x.from - before <= cur.in) { cur.last = x; cur.in = Math.max(cur.in, x.to + after); continue; }
      if (cur) rows.push(rowOf(day, cur, { mode: 'own' }, fixes));
      cur = { first: x, last: x, who: pid, out: x.from - before, in: x.to + after };
    }
    if (cur) rows.push(rowOf(day, cur, { mode: 'own' }, fixes));
  }
  // της θέσης: ανά υπηρεσία, η αλυσίδα των νούμερων με τη σειρά της ώρας· ίδιο άτομο συνεχόμενα = μία γραμμή
  const blocks = [...new Set(steps.filter(x => x.mode === 'post').map(x => x.block))];
  for (const b of blocks) {
    const list = steps.filter(x => x.mode === 'post' && x.block === b).sort((a, c) => a.from - c.from || a.ord - c.ord);
    const chain: Step[] = list.filter((x, i) => i === 0 || x.from !== list[i - 1].from);
    const gs: Grp[] = [];
    for (const x of chain) { const g = gs[gs.length - 1]; if (g && g.who === x.pid) { g.last = x; } else gs.push({ first: x, last: x, who: x.pid, out: 0, in: 0 }); }
    gs.forEach((g, i) => { g.out = i === 0 ? g.first.from - before : g.first.from; g.in = i === gs.length - 1 ? g.last.to + after : gs[i + 1].first.from; });
    gs.forEach((g, i) => rows.push(rowOf(day, g, { mode: 'post', owner: gs[0].who, take: i > 0, give: i < gs.length - 1, next: i < gs.length - 1 ? gs[i + 1].who : undefined }, fixes)));
  }
  return rows.sort((a, b) => a.out - b.out || a.id.localeCompare(b.id));
}

// Τώρα (σήμερα, hm = «ΩΩ:ΛΛ»): το νούμερο που τρέχει, το επόμενο και το προηγούμενο ανά ιδιοκτήτη του όπλου. Η μέρα κύκλου που
// ξεκίνησε χθες τρέχει ακόμα μετά τα μεσάνυχτα, και η αυριανή βγάζει το όπλο πριν ξεκινήσει ο κύκλος (περιθώριο).
export interface ArmLive { rows: ArmRow[]; cur: Map<number, ArmRow>; next: Map<number, ArmRow>; prev: Map<number, ArmRow>; holding: Map<number, ArmRow> }
export function armedLive(s: ArmState, today: ISODate, hm: string): ArmLive {
  const rows = [-1, 0, 1].flatMap(i => armedRows(s, addDays(today, i)));
  const now = dayNo(today) * 1440 + +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
  const at = (r: ArmRow, m: number) => dayNo(r.day) * 1440 + m;
  const cur = new Map<number, ArmRow>(), next = new Map<number, ArmRow>(), prev = new Map<number, ArmRow>(), holding = new Map<number, ArmRow>();
  for (const r of rows) {
    const o = at(r, r.out), i = at(r, r.in);
    if (o <= now && now < i) { const c = cur.get(r.owner); if (!c || at(c, c.out) < o) cur.set(r.owner, r); if (r.who !== r.owner) holding.set(r.who, r); }
    else if (o > now) { const c = next.get(r.owner); if (!c || at(c, c.out) > o) next.set(r.owner, r); }
    else { const c = prev.get(r.owner); if (!c || at(c, c.in) < i) prev.set(r.owner, r); }
  }
  return { rows, cur, next, prev, holding };
}
// Λεπτά από τα μεσάνυχτα της μέρας του row ως τη στιγμή today + hm (για σύγκριση με out/in)
export const nowIn = (row: Pick<ArmRow, 'day'>, today: ISODate, hm: string) => (dayNo(today) - dayNo(row.day)) * 1440 + +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
// Η γραμμή με το νούμερο που ταιριάζει σε μια διόρθωση ή id
export const rowById = (s: ArmState, id: string): ArmRow | undefined => { const d = id.slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? armedRows(s, d).find(r => r.id === id) : undefined; };
