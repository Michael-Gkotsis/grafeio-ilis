// Δυναμολόγιο ΑΛΛΗΣ μονάδας: εγγραφή πίσω στο αρχείο της (ό,τι διαβάζει το rosterUnit.ts). Κανόνες:
//   - γράφονται μόνο οι στήλες που αντιστοιχίστηκαν, μόνο σε γραμμές ατόμων που ταιριάζουν, και μόνο όσα άλλαξαν στην εφαρμογή από την τελευταία ανάγνωση
//   - ένα κελί γράφεται μόνο αν έχει ακόμα ό,τι είχε διαβάσει η εφαρμογή (ή είναι κενό)· αλλιώς έχει δικό σου κείμενο και μένει (αναφέρεται)
//   - κανένα σβήσιμο γραμμής, καμία νέα γραμμή στη μέση: ο νέος στρατιώτης μπαίνει στην επόμενη κενή αριθμημένη γραμμή του πίνακα, αλλιώς αναφέρεται
//   - οι λίστες απόντων / παρόντων ξαναγεμίζουν μόνο αν τις τσέκαρε ο χρήστης και μόνο στις γραμμές στρατιωτών που ήδη έχουν· τα σύνολα (τύποι) δεν αγγίζονται
import { normGreek } from './text';
import { phraseKey } from './lexicon';
import { fullName, type AppState, type Person } from './domain';
import { absenceOfPerson } from './absence';
import { cellText, makeMatcher, personVals, planSource, tableRows, same, type FullPlan, type ListKind, type PersonSnap, type SourceBinding, type SyncMeta, type WVal } from './sources';
import type { RawSheet } from './roster';
import type { ISODate } from './dates';
import { ROLES, baseRank, guessSub, guessStatus, lexOf, readOwnRoster, resolveCols, rosterProfileOf, subNames, type OwnRead } from './rosterUnit';
import { personKey } from './commands';
import type { RosterProfile } from './tplStore';

const KEYS = ['rank', 'spec', 'last', 'first', 'father', 'asm', 'phone', 'room', 'sub', 'remarks', 'essos', 'si'] as const;
void ROLES;
export interface OtherSet { sheet: string; r: number; c: number; v: WVal }
export type OwnPlan = FullPlan & { other?: OtherSet[]; conflicts?: string[] };

// ο βαθμός όπως τον γράφει η μονάδα: με το όπλο σε παρένθεση όταν το αρχείο δεν έχει στήλη Ο/Σ
const rankCellOf = (v: PersonSnap, b: SourceBinding, had: string) => {
  const base = v.rank || ''; if (b.cols.spec != null) return base;
  return /\([^)]*\)\s*$/.test(had) || v.spec ? base + (v.spec ? ' (' + v.spec + ')' : '') : base;
};
// Οι κωδικοί ΙΛΗ και οι λέξεις ΚΑΤΑΣΤΑΣΗ όπως τους γράφει η μονάδα (πρώτο κελί που τους έχει)
function spellings(sheet: RawSheet, col: number | undefined, recs: number[]): Map<string, string> {
  const m = new Map<string, string>(); if (col == null) return m;
  for (const r of recs) { const t = cellText((sheet.rows[r] || [])[col]); const k = phraseKey(t); if (k && !m.has(k)) m.set(k, t); }
  return m;
}

export function ownSnap(sheet: RawSheet, b: SourceBinding, people: Person[]): Record<number, PersonSnap> {
  const match = makeMatcher(people); const out: Record<number, PersonSnap> = {};
  for (const { v } of tableRows(sheet, b.header, b.cols).records) { const m = match(v); if (m.pid == null || out[m.pid]) continue; const p = people.find(x => x.id === m.pid)!; out[m.pid] = personVals(p, b); }
  return out;
}

export function planOwnWrite(sheet: RawSheet, b: SourceBinding, s: AppState, meta: SyncMeta | undefined, today: ISODate, others: RawSheet[] = []): OwnPlan {
  const psnap: Record<number, PersonSnap> = Object.fromEntries(s.people.map(p => [p.id, personVals(p)]));
  const ros = rosterProfileOf(s.settings)?.ros as RosterProfile | undefined;
  const plan: OwnPlan = { sets: [], insert: null, inserts: [], deletes: [], header: [], keys: [], added: 0, changed: 0, cleared: 0, foreign: 0, notFound: [], snap: { ...(meta?.snap || {}) }, psnap, fresh: [], gone: [], grow: null, other: [], conflicts: [] };
  const lex = lexOf(s.settings); const names = subNames(s.settings);
  const scan = tableRows(sheet, b.header, b.cols);
  const recRows = scan.records.map(x => x.r);
  const subSp = spellings(sheet, b.cols.sub, recRows);
  const subCode = new Map<string, string>();     // όνομα Λόχου/Ίλας → κωδικός της μονάδας
  for (const [k, t] of subSp) { const pick = ros?.subs[k]; const g = guessSub(t, names); const v = pick !== undefined ? pick : g.state === 'sure' ? g.value : ''; if (v && v !== 'ignore' && !subCode.has(v)) subCode.set(v, t); }
  const codeName = (t: string) => { const k = phraseKey(t); const pick = ros?.subs[k]; const g = guessSub(t, names); return pick !== undefined ? pick : g.state === 'sure' ? g.value : ''; };
  const match = makeMatcher(s.people); const pm = new Map(s.people.map(p => [p.id, p]));
  const rowOf = new Map<number, number>();      // pid -> γραμμή
  for (const { r, v } of scan.records) { const m = match(v); if (m.pid != null && !m.alts && !rowOf.has(m.pid)) rowOf.set(m.pid, r); }
  const cellOf = (r: number, k: string) => (b.cols[k] == null ? '' : cellText((sheet.rows[r] || [])[b.cols[k]]));
  // τιμή κελιού που αντιστοιχεί στην παλιά τιμή της εφαρμογής (ή κενό)
  const holds = (k: string, r: number, old: PersonSnap): boolean => {
    const t = cellOf(r, k); if (t === '') return true;
    if (k === 'rank') return phraseKey(baseRank(t)) === phraseKey(old.rank || '') || lex.match(baseRank(t), { kinds: ['rank'] }).concept === lex.match(old.rank || '', { kinds: ['rank'] }).concept && lex.match(old.rank || '', { kinds: ['rank'] }).concept != null;
    if (k === 'sub') return codeName(t) === (old.sub || '') || normGreek(codeName(t)) === normGreek(old.sub || '');
    if (k === 'asm' || k === 'phone') return t.replace(/\s/g, '') === (old[k] || '');
    return normGreek(t) === normGreek(old[k] || '');
  };
  const val = (k: string, cur: PersonSnap, had: string): WVal => {
    if (k === 'rank') return rankCellOf(cur, b, had) || null;
    if (k === 'sub') return cur.sub ? subCode.get(names.find(n => normGreek(n) === normGreek(cur.sub)) || cur.sub) ?? null : null;
    if (k === 'room') return cur.room ? Number(cur.room) : null;
    if (k === 'asm' || k === 'phone') return cur[k] ? (/^[1-9]\d{0,14}$/.test(cur[k]) ? Number(cur[k]) : cur[k]) : null;
    return cur[k] ? cur[k] : null;
  };
  for (const p of s.people) {
    const old = plan.snap![p.id]; if (!old) continue;
    const cur = personVals(p, b); const r = rowOf.get(p.id);
    const keys = KEYS.filter(k => b.cols[k] != null && k !== 'spec' || (k === 'spec' && b.cols.spec != null)).filter(k => (cur[k] || '') !== (old[k] || '') && (cur[k] !== '' || k === 'remarks'));
    const rankSpec = b.cols.spec == null && b.cols.rank != null && cur.spec !== old.spec && !keys.includes('rank');
    if (rankSpec) keys.push('rank');
    if (!keys.length) { plan.snap![p.id] = cur; continue; }
    if (r == null) { plan.notFound.push(fullName(p)); continue; }
    let ok = true; let ch = false;
    for (const k of keys) {
      if (k === 'sub' && cur.sub && !subCode.has(names.find(n => normGreek(n) === normGreek(cur.sub)) || cur.sub)) { plan.conflicts!.push(fullName(p) + ': η ΙΛΗ «' + cur.sub + '» δεν έχει κωδικό στο αρχείο, δεν γράφτηκε'); ok = false; continue; }
      if (!holds(k, r, k === 'rank' ? { ...old, rank: old.rank } : old)) { plan.conflicts!.push(fullName(p) + ': το κελί «' + (b.cols[k] != null ? cellOf(r, k) : '') + '» έχει δικό σου κείμενο, δεν γράφτηκε'); ok = false; continue; }
      const had = cellOf(r, k); const v = val(k, cur, had);
      if (!same((sheet.rows[r] || [])[b.cols[k]], v)) { plan.sets.push({ r, c: b.cols[k], v }); ch = true; }
    }
    if (ch) plan.changed++;
    if (ok) plan.snap![p.id] = cur;
  }
  // νέοι από την εφαρμογή: επόμενη κενή αριθμημένη γραμμή του πίνακα (ποτέ νέα γραμμή στη μέση ή σβήσιμο)
  const lastRec = recRows.length ? recRows[recRows.length - 1] : b.header;
  const free = scan.free.filter(r => r > lastRec); const takenFree = new Set<number>();
  const inSheet = (p: Person) => rowOf.has(p.id) || scan.records.some(x => { const m = match(x.v); return m.pid === p.id; });
  const fresh = s.people.filter(p => p.added && p.active && !plan.snap![p.id]).sort((a, c) => a.last.localeCompare(c.last, 'el') || a.first.localeCompare(c.first, 'el'));
  const lost: string[] = [];
  for (const p of fresh) {
    if (inSheet(p)) { plan.snap![p.id] = personVals(p, b); plan.keys.push(String(p.id)); continue; }
    const r = free.find(x => !takenFree.has(x));
    if (r == null) { lost.push(fullName(p)); continue; }
    takenFree.add(r); const cur = personVals(p, b);
    for (const k of KEYS) if (b.cols[k] != null && cur[k]) {
      if (k === 'sub' && !val('sub', cur, '')) { plan.conflicts!.push(fullName(p) + ': η ΙΛΗ «' + cur.sub + '» δεν έχει κωδικό στο αρχείο, δεν γράφτηκε'); continue; }
      plan.sets.push({ r, c: b.cols[k], v: val(k, cur, '') });
    }
    if (b.cols.name != null) plan.sets.push({ r, c: b.cols.name, v: p.last + ' ' + p.first });
    if (b.cols.aa != null && cellText((sheet.rows[r] || [])[b.cols.aa]) === '') plan.sets.push({ r, c: b.cols.aa, v: recRows.length + takenFree.size });
    plan.snap![p.id] = cur; plan.keys.push(String(p.id)); plan.fresh!.push(p.id); plan.added++;
  }
  if (lost.length) plan.warn = ['Δεν υπάρχει κενή αριθμημένη γραμμή στο φύλλο «' + b.sheet + '» για: ' + lost.join(', ') + '. Προσθέστε γραμμές με το χέρι· η εφαρμογή δεν βάζει γραμμές στη μέση ούτε σβήνει.'];
  // όσα έγραψε στο παρελθόν η εφαρμογή και δεν υπάρχουν πια: η γραμμή μένει (αναφέρεται, δεν σβήνεται)
  const goneN = [...new Set((meta?.keys || []).map(Number))].filter(id => !pm.has(id)).length;
  if (goneN) plan.warn = [...(plan.warn || []), goneN + ' γραμμές που είχε βάλει η εφαρμογή δεν υπάρχουν πια στην εφαρμογή· μένουν στο αρχείο, σβήστε τις με το χέρι αν θέλετε.'];
  plan.foreign = scan.records.filter(x => match(x.v).pid == null).length;
  // λίστες απόντων / παρόντων (μόνο όσες τσέκαρε ο χρήστης): κατάσταση και ΙΛΗ των στρατιωτών που ήδη έχουν γραμμή
  if (ros && ros.refill.length) derived(plan, sheet, b, s, ros, today, others, subSp, lex);
  if (plan.conflicts!.length) plan.warn = [...(plan.warn || []), ...plan.conflicts!.slice(0, 8), ...(plan.conflicts!.length > 8 ? ['… και ' + (plan.conflicts!.length - 8) + ' ακόμα'] : [])];
  return plan;
}

function derived(plan: OwnPlan, master: RawSheet, b: SourceBinding, s: AppState, ros: RosterProfile, today: ISODate, others: RawSheet[], subSp: Map<string, string>, lex: ReturnType<typeof lexOf>) {
  // λέξεις ΚΑΤΑΣΤΑΣΗ της μονάδας: μετρά η λέξη όπως γράφεται στον κύριο κατάλογο
  const rm = resolveCols(master, ros, lex); const sc = rm?.byRole.status;
  const sp = new Map<string, string>(); const wordVal = new Map<string, string>();
  if (sc != null && rm) for (let r = rm.reg.headerRows[1] + 1; r < master.rows.length; r++) {
    const t = cellText((master.rows[r] || [])[sc]); const k = phraseKey(t); if (!k) continue;
    if (!sp.has(k)) { sp.set(k, t); const pick = ros.status[k]; const g = guessStatus(t, lex); wordVal.set(k, pick !== undefined ? pick : g.state === 'sure' ? g.value : ''); }
  }
  const wordFor = (reason: string): string | null => { for (const [k, v] of wordVal) if (v && v !== 'ignore' && v !== 'present' && normGreek(lex.label(v) || v.replace(/^own:/, '')) === normGreek(reason)) return sp.get(k)!; return null; };
  const presentWord = (() => { for (const [k, v] of wordVal) if (v === 'present') return sp.get(k)!; return null; })();
  const names = subNames(s.settings);
  const subCode = new Map<string, string>(); for (const [k, t] of subSp) { const pick = ros.subs[k]; const g = guessSub(t, names); const v = pick !== undefined ? pick : g.state === 'sure' ? g.value : ''; if (v && v !== 'ignore' && !subCode.has(v)) subCode.set(v, t); }
  const moves: string[] = [];
  for (const name of ros.refill) {
    const sh = others.find(x => x.name === name); const role = ros.roles[name]; if (!sh || (role !== 'abs' && role !== 'pres')) continue;
    const rd: OwnRead = readOwnRoster(sh, { settings: s.settings, people: s.people, ros: { ...ros, sheet: name }, lex }); if (!rd.found) continue;
    const match = makeMatcher(s.people);
    for (const x of rd.persons) {
      if (x.kind !== 'soldier') continue;
      const m = match({ last: x.last, first: x.first, father: x.father, asm: rd.cols.asm != null ? (sh.rows[x.r] || [])[rd.cols.asm] ?? null : null } as never);
      const p = m.pid != null ? s.people.find(q => q.id === m.pid) : undefined; if (!p || m.alts) continue;
      const ab = absenceOfPerson(s, p, today);
      if ((role === 'abs') !== ab.absent) { moves.push(fullName(p) + ' (' + name + ')'); continue; }
      const want = ab.absent ? wordFor(ab.reason) : presentWord;
      const put = (col: number | undefined, v: string | null, old: string) => {
        if (col == null || v == null) return;
        const cur = cellText((sh.rows[x.r] || [])[col]);
        if (cur === v) return;
        if (cur !== '' && phraseKey(cur) !== phraseKey(old) && !wordVal.has(phraseKey(cur)) && !subSp.has(phraseKey(cur))) { plan.conflicts!.push(fullName(p) + ' (' + name + '): το κελί έχει δικό σου κείμενο, δεν γράφτηκε'); return; }
        plan.other!.push({ sheet: name, r: x.r, c: col, v });
      };
      put(rd.cols.status, want, x.status);
      if (p.sub && rd.cols.sub != null && subCode.get(p.sub)) put(rd.cols.sub, subCode.get(p.sub)!, x.sub);
    }
  }
  if (moves.length) plan.warn = [...(plan.warn || []), moves.length + ' στρατιώτες πρέπει να αλλάξουν λίστα (απόντες / παρόντες)· δεν μετακινούνται από την εφαρμογή: ' + moves.slice(0, 5).join(', ') + (moves.length > 5 ? '…' : '')];
}

// Το ίδιο με το planSource, αλλά για αρχείο άλλης μονάδας (b.own) χρησιμοποιεί το παραπάνω
export function planSourceOwn(kind: ListKind, sheet: RawSheet | null, b: SourceBinding, s: AppState, meta: SyncMeta | undefined, today: ISODate, others: RawSheet[] = []): FullPlan {
  if (kind === 'people' && b.own && sheet) return planOwnWrite(sheet, b, s, meta, today, others);
  return planSource(kind, sheet, b, s, meta, today);
}
void personKey;
