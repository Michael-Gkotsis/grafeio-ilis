// Όλες οι ενέργειες του χρήστη ως καθαρές συναρτήσεις: (κατάσταση, εντολή) → νέα κατάσταση + εγγραφή ιστορικού.
// Τρέχουν στο main process· η βάση αποθηκεύει τη διαφορά και την κρατά για αναίρεση (08 §3.7).
import { addDays, dayName, dm, type ISODate } from './dates';
import { normGreek } from './text';
import { TYPES, PUN_KINDS, KIND_NAME, PHASE_NAME, blocksOf, postTxt, shortName, type AppState, type Baseline, type BlockDef, type DutyKind, type HkaiManual, type Person, type Phase, type Rules, type Settings, type Status, type TypeKey } from './domain';
import { capBlock, dutyBlock, fillDay, outBlock, personMap, planStatusChange, postBy, postOf, ruleBlock, isRecordExpiredOn, type StatusCmd } from './rules';

export type Command =
  | { t: 'declare'; cmd: StatusCmd }
  | { t: 'outs'; date: ISODate; changes: { pid: number; from: TypeKey | null; to: TypeKey | null }[] }
  | { t: 'endStatus'; id: string }
  | { t: 'deleteStatus'; id: string }
  | { t: 'approvePun'; id: string }
  | { t: 'assign'; date: ISODate; k: string; pid: number | null; force?: string }
  | { t: 'autofill'; date: ISODate }
  | { t: 'clearDay'; date: ISODate }
  | { t: 'setRules'; rules: Rules; text: string }
  | { t: 'setCap'; pid: number; kind: DutyKind; allowed: boolean }
  | { t: 'setSettings'; settings: Partial<Settings>; text: string }
  | { t: 'printed'; date: ISODate; at: string; files: string[] }
  | { t: 'importPeople'; rows: ImportRow[]; source: string; deactivateMissing: boolean }
  | { t: 'updatePerson'; person: Person }
  | { t: 'setBaseline'; pid: number; baseline: Baseline }
  | { t: 'setHkaiManual'; date: ISODate; manual: HkaiManual }
  | { t: 'setPhase'; phase: Phase }
  | { t: 'addBlock'; phase: Phase; name: string; kind: DutyKind; armed: boolean; n: number; hrs: string }
  | { t: 'setBlock'; phase: Phase; id: string; patch: Partial<Pick<BlockDef, 'armed' | 'hidden'>> }
  | { t: 'expire' };

export interface ImportRow extends Omit<Person, 'id' | 'active'> { active?: boolean }

export interface Ctx { today: ISODate; newId: () => string }
export interface Result { state: AppState; text: string; files: string[]; source?: 'app' | 'auto' | 'import' | 'excel'; undoable?: boolean; extra?: string[] }

const who = (s: AppState, pids: number[]) => {
  const pm = personMap(s.people);
  return pids.length === 1 ? shortName(pm.get(pids[0])!) : pids.length + ' άτομα';
};
const setGuard = (s: AppState, date: ISODate, k: string, pid: number | null): AppState => {
  const g = { ...(s.guards[date] || {}) };
  if (pid) g[k] = pid; else delete g[k];
  return { ...s, guards: { ...s.guards, [date]: g } };
};
const range = (from: ISODate, to: ISODate) => (from === to ? dm(from) : dm(from) + '–' + dm(to));

export function apply(s: AppState, c: Command, ctx: Ctx): Result {
  const pm = personMap(s.people);
  switch (c.t) {
    case 'declare': {
      const { cmd } = c; const plan = planStatusChange(s, cmd); const t = TYPES[cmd.type];
      if (!cmd.pids.length) throw new Error('Δεν διάλεξες άτομο');
      if (cmd.to < cmd.from) throw new Error('Το «έως» είναι πριν από το «από»');
      if (plan.blocked.length) { const b = plan.blocked[0]; throw new Error(shortName(pm.get(b.pid)!) + ' δεν βγαίνει έξοδο ' + dm(b.date) + ': ' + b.reason); }
      const drop = new Set(plan.cancels.map(x => x.id));
      let next: AppState = {
        ...s,
        statuses: [...s.statuses.filter(x => !drop.has(x.id)), ...cmd.pids.map(pid => {
          const st: Status = { id: ctx.newId(), pid, type: cmd.type, from: cmd.from, to: cmd.to };
          if (cmd.note) st.note = cmd.note;
          if (cmd.kind) st.kind = cmd.kind;
          if (cmd.type === 'PUN') { st.kind = cmd.kind || PUN_KINDS[0]; st.pending = true; }
          return st;
        })]
      };
      plan.conflicts.forEach(x => { next = setGuard(next, x.date, x.k, null); });
      const verb = cmd.type === 'PUN' ? 'Αιτείται ποινή (' + (cmd.kind || PUN_KINDS[0]).toLowerCase() + ')' : 'Δηλώθηκε ' + t.label;
      return { state: next, text: verb + ' ' + range(cmd.from, cmd.to) + ': ' + who(s, cmd.pids), files: plan.files.map(f => f.fn) };
    }
    case 'outs': {
      // Κ-Ε1…Κ-Ε3: ο ίδιος έλεγχος και εδώ, όχι μόνο στην οθόνη
      for (const x of c.changes) if (x.to) {
        const r = outBlock(s, c.date, x.pid);
        if (r) throw new Error(shortName(pm.get(x.pid)!) + ' δεν βγαίνει έξοδο: ' + r);
      }
      const pids = new Set(c.changes.map(x => x.pid));
      const kept = s.statuses.filter(x => !(pids.has(x.pid) && TYPES[x.type].cat === 'out' && x.from <= c.date && c.date <= x.to));
      const added: Status[] = c.changes.filter(x => x.to).map(x => ({ id: ctx.newId(), pid: x.pid, type: x.to!, from: c.date, to: c.date }));
      return { state: { ...s, statuses: [...kept, ...added] }, text: 'Εξοδούχοι ' + dm(c.date) + ': ' + c.changes.length + ' αλλαγές', files: ['Εξοδούχοι-Παραμένοντες', 'ΗΚΑΙ'] };
    }
    case 'endStatus': {
      const st = s.statuses.find(x => x.id === c.id); if (!st) throw new Error('Δεν βρέθηκε η καταχώρηση');
      const y = addDays(ctx.today, -1);
      const statuses = st.from > y ? s.statuses.filter(x => x !== st) : s.statuses.map(x => (x === st ? { ...x, to: y } : x));
      return { state: { ...s, statuses }, text: 'Τέλος από σήμερα: ' + (st.type === 'PUN' ? 'ποινή' : TYPES[st.type].label) + ' του ' + shortName(pm.get(st.pid)!), files: [st.type === 'PUN' ? 'Ποινές' : 'Ιατρικά'] };
    }
    case 'deleteStatus': {
      const st = s.statuses.find(x => x.id === c.id); if (!st) throw new Error('Δεν βρέθηκε η καταχώρηση');
      return { state: { ...s, statuses: s.statuses.filter(x => x !== st) }, text: 'Διαγράφηκε: ' + (st.type === 'PUN' ? 'ποινή' : TYPES[st.type].label) + ' ' + range(st.from, st.to) + ' του ' + shortName(pm.get(st.pid)!), files: [] };
    }
    case 'approvePun': {
      const st = s.statuses.find(x => x.id === c.id); if (!st) throw new Error('Δεν βρέθηκε η ποινή');
      return { state: { ...s, statuses: s.statuses.map(x => (x === st ? { ...x, pending: false } : x)) }, text: 'Εγκρίθηκε από τον Διοικητή η ποινή (' + (st.kind || 'ποινή').toLowerCase() + ') του ' + shortName(pm.get(st.pid)!), files: ['ΗΚΑΙ', 'Ποινές'] };
    }
    case 'assign': {
      const post = postBy(s, c.k); if (!post) throw new Error('Άγνωστη θέση');
      // Κ-Υ1, Κ-Υ3 και «ήδη σε άλλη θέση» δεν παρακάμπτονται ποτέ· ανάπαυση, ΣΚ και δυνατότητα μόνο με αιτιολογία (ερ. 13)
      let note = '';
      if (c.pid) {
        if (!pm.get(c.pid)?.active) throw new Error('Το άτομο είναι εκτός δύναμης');
        const hard = dutyBlock(s.statuses, c.date, c.pid, post) || (postOf(s, c.date, c.pid, c.k) ? 'Ήδη ' + postTxt(postOf(s, c.date, c.pid, c.k)!) : null);
        if (hard) throw new Error(shortName(pm.get(c.pid)!) + ' δεν μπαίνει: ' + hard);
        const soft = capBlock(s, c.pid, post) || ruleBlock(s, c.date, c.pid);
        if (soft && !c.force) throw new Error(shortName(pm.get(c.pid)!) + ' δεν μπαίνει: ' + soft);
        if (soft) note = ' (παρά τον κανόνα: ' + soft + '. Αιτία: ' + c.force + ')';
      }
      return { state: setGuard(s, c.date, c.k, c.pid), text: 'Υπηρεσίες ' + dm(c.date) + ': ' + (c.pid ? shortName(pm.get(c.pid)!) + ' σε ' : 'κενή η θέση ') + postTxt(post) + note, files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'autofill': {
      const r = fillDay(s, c.date);
      return { state: { ...s, guards: r.guards }, text: 'Υπηρεσίες ' + dm(c.date) + ': αυτόματη συμπλήρωση ' + r.n + ' θέσεων' + (r.empty.length ? ', ' + r.empty.length + ' έμειναν κενές (κανείς δεν επιτρέπεται)' : ''), files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'clearDay': {
      const guards = { ...s.guards }; delete guards[c.date];
      return { state: { ...s, guards }, text: 'Υπηρεσίες ' + dm(c.date) + ': καθαρίστηκαν όλες οι θέσεις', files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'setRules':
      return { state: { ...s, rules: c.rules }, text: 'Άλλαξαν οι κανόνες υπηρεσιών: ' + c.text, files: [] };
    case 'setCap': {
      const cur = { ...(s.caps[c.pid] || {}) }; cur[c.kind] = c.allowed ? null : 'Από τον λοχία';
      const acc: Record<string, string> = { th: 'θαλαμοφύλακα', op: 'οπλοφύλακα', mg: 'μαγειρεία', sk: 'σκοπιά' };
      return { state: { ...s, caps: { ...s.caps, [c.pid]: cur } }, text: 'Δυνατότητα υπηρεσιών: ' + shortName(pm.get(c.pid)!) + (c.allowed ? ' κάνει ' : ' δεν κάνει ') + (acc[c.kind] || c.kind), files: [] };
    }
    case 'setSettings':
      return { state: { ...s, settings: { ...s.settings, ...c.settings } }, text: 'Ρυθμίσεις: ' + c.text, files: [] };
    case 'printed':
      return { state: { ...s, printed: { ...s.printed, [c.date]: c.at } }, text: 'Βγήκε ' + c.files.join(', '), files: c.files, undoable: false };
    case 'importPeople':
      return importPeople(s, c.rows, c.source, c.deactivateMissing);
    case 'updatePerson': {
      if (!pm.has(c.person.id)) throw new Error('Δεν βρέθηκε το άτομο');
      return { state: { ...s, people: s.people.map(p => (p.id === c.person.id ? c.person : p)) }, text: 'Άλλαξαν τα στοιχεία: ' + shortName(c.person), files: [] };
    }
    case 'setBaseline': {
      const p = pm.get(c.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      const clean: Baseline = {}; let any = false;
      for (const [k, n] of Object.entries(c.baseline)) { const v = Math.max(0, Math.floor(Number(n) || 0)); if (v) { (clean as Record<string, number>)[k] = v; any = true; } }
      const baseline = { ...s.baseline }; if (any) baseline[c.pid] = clean; else delete baseline[c.pid];
      const txt = Object.entries(clean).map(([k, n]) => (k === 'hol' ? 'αργίες' : KIND_NAME[k as DutyKind] || k) + ' ' + n).join(', ') || 'καμία';
      return { state: { ...s, baseline }, text: 'Προηγούμενες υπηρεσίες ' + shortName(p) + ': ' + txt, files: ['Έλεγχος υπηρεσιών'] };
    }
    case 'setHkaiManual': {
      const hkaiManual = { ...s.hkaiManual, [c.date]: c.manual };
      return { state: { ...s, hkaiManual }, text: 'ΗΚΑΙ ' + dm(c.date) + ': χειροκίνητα στοιχεία', files: ['ΗΚΑΙ'] };
    }
    case 'setPhase':
      if (c.phase === s.settings.phase) return { state: s, text: '', files: [] };
      return { state: { ...s, settings: { ...s.settings, phase: c.phase } }, text: 'Έντυπο υπηρεσιών: ΦΡΟΥΡΑ ' + PHASE_NAME[c.phase], files: [] };
    case 'addBlock': {
      const name = c.name.trim(); if (!name) throw new Error('Γράψε όνομα για τη νέα υπηρεσία');
      const n = Math.min(10, Math.max(1, Math.floor(c.n) || 1));
      const id = 'x' + ctx.newId().replace(/[^a-z0-9]/gi, '').slice(0, 8);
      const short = (i: number) => (n === 1 ? name : (i + 1) + 'ος');
      const b: BlockDef = { id, kind: c.kind, name, armed: c.armed, custom: true, posts: Array.from({ length: n }, (_, i) => ({ k: id + '_' + (i + 1), label: name + (n === 1 ? '' : ' ' + (i + 1) + 'ος'), short: short(i), hrs: c.hrs.trim() || 'ημέρα' })) };
      const key = c.phase === 'spen' ? 'blocksSpen' : 'blocks';
      return { state: { ...s, settings: { ...s.settings, [key]: [...blocksOf(s.settings, c.phase), b] } }, text: 'Νέα υπηρεσία στη ΦΡΟΥΡΑ ' + PHASE_NAME[c.phase] + ': ' + name + ' (' + n + (n === 1 ? ' άτομο' : ' άτομα') + (c.armed ? ', ένοπλη' : '') + ')', files: [] };
    }
    case 'setBlock': {
      const key = c.phase === 'spen' ? 'blocksSpen' : 'blocks';
      const list = blocksOf(s.settings, c.phase); const b = list.find(x => x.id === c.id); if (!b) throw new Error('Δεν βρέθηκε η υπηρεσία');
      const what = c.patch.hidden != null ? (c.patch.hidden ? 'αφαιρέθηκε' : 'ξαναμπήκε') : c.patch.armed != null ? (c.patch.armed ? 'ένοπλη' : 'άοπλη') : 'άλλαξε';
      return { state: { ...s, settings: { ...s.settings, [key]: list.map(x => (x.id === c.id ? { ...x, ...c.patch } : x)) } }, text: 'ΦΡΟΥΡΑ ' + PHASE_NAME[c.phase] + ', ' + b.name + ': ' + what, files: [] };
    }
    case 'expire': {
      // Τα ιατρικά και οι ποινές που έληξαν χθες «αφαιρούνται» (Κ-04, Κ-10): δεν αλλάζει κάτι στα δεδομένα,
      // γράφεται μόνο στο ιστορικό ώστε ο χρήστης να το δει.
      const ex = s.statuses.filter(x => isRecordExpiredOn(x, ctx.today) && !x.pending);
      return {
        state: s, source: 'auto', undoable: false, files: [],
        text: ex.length ? 'Έληξαν και αφαιρέθηκαν ' + ex.length + ' καταχωρήσεις' : '',
        extra: ex.map(x => 'Έληξε: ' + (x.type === 'PUN' ? 'ποινή (' + (x.kind || '').toLowerCase() + ')' : TYPES[x.type].label) + ' του ' + shortName(pm.get(x.pid)!) + ' (έως ' + dm(x.to) + ')')
      };
    }
  }
}

// Εισαγωγή/ενημέρωση από το Δυναμολόγιο: ταίριασμα με ΑΣΜ, αλλιώς με ονοματεπώνυμο + πατρώνυμο.
export const personKey = (p: { last: string; first: string; father: string }) => normGreek(p.last + '|' + p.first + '|' + p.father);
function importPeople(s: AppState, rows: ImportRow[], source: string, deactivateMissing: boolean): Result {
  const byAsm = new Map(s.people.filter(p => p.asm).map(p => [p.asm, p]));
  const byName = new Map(s.people.map(p => [personKey(p), p]));
  let nextId = s.people.reduce((a, p) => Math.max(a, p.id), 0) + 1;
  const seen = new Set<number>();
  const updated = new Map<number, Person>();
  const added: Person[] = [];
  for (const r of rows) {
    const ex = (r.asm && byAsm.get(r.asm)) || byName.get(personKey(r));
    if (ex) { seen.add(ex.id); updated.set(ex.id, { ...ex, ...r, id: ex.id, active: r.active ?? true }); }
    else added.push({ ...r, id: nextId++, active: r.active ?? true });
  }
  // Όσοι λείπουν από το νέο Δυναμολόγιο: αν δεν έχουν καμία καταχώρηση ή υπηρεσία σβήνονται (π.χ. λάθος γραμμές
  // παλιάς εισαγωγής), αλλιώς γίνονται «εκτός δύναμης» για να μείνει το ιστορικό τους.
  const used = new Set<number>(s.statuses.map(x => x.pid));
  Object.values(s.guards).forEach(g => Object.values(g).forEach(id => used.add(id)));
  let deact = 0, removed = 0;
  const people = s.people.flatMap(p => {
    const u = updated.get(p.id); if (u) return [u];
    if (deactivateMissing && !used.has(p.id)) { removed++; return []; }
    if (deactivateMissing && p.active) { deact++; return [{ ...p, active: false }]; }
    return [p];
  }).concat(added);
  const caps = { ...s.caps }; for (const k of Object.keys(caps)) if (!people.some(p => p.id === +k)) delete caps[+k];
  const parts = [added.length + ' νέα', updated.size + ' ενημερώθηκαν'].concat(deact ? [deact + ' εκτός δύναμης'] : [], removed ? [removed + ' αφαιρέθηκαν'] : []);
  return { state: { ...s, people, caps }, text: 'Εισαγωγή από ' + source + ': ' + parts.join(', '), files: [source], source: 'import' };
}

export const describeDay = (d: ISODate, today: ISODate) => dayName(d, today).toLowerCase();
