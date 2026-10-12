// Όλες οι ενέργειες του χρήστη ως καθαρές συναρτήσεις: (κατάσταση, εντολή) → νέα κατάσταση + εγγραφή ιστορικού.
// Τρέχουν στο main process· η βάση αποθηκεύει τη διαφορά και την κρατά για αναίρεση (08 §3.7).
import { addDays, dayName, dm, type ISODate } from './dates';
import { normGreek } from './text';
import { TYPES, CAP_ACC, OUT_NOTE, CADRE_ABS, PUN_KINDS, KIND_NAME, PHASE_NAME, blocksOf, postTxt, shortName, type AppState, type Baseline, type Cadre, type CadreAbs, type BlockDef, type DutyKind, type Guards, type HkaiManual, type Person, type PersonRequest, type Phase, type Rules, type Settings, type Status, type TypeKey } from './domain';
import { capBlock, dutyBlock, lastResort, swapCheck, fillDay, outBlock, personMap, planStatusChange, postBy, postOf, ruleBlock, isRecordExpiredOn, splitOut, type StatusCmd } from './rules';

export type Command =
  | { t: 'declare'; cmd: StatusCmd }
  | { t: 'outs'; date: ISODate; changes: { pid: number; from: TypeKey | null; to: TypeKey | null }[] }
  | { t: 'endStatus'; id: string }
  | { t: 'saveCadre'; cadre: Omit<Cadre, 'id' | 'active'> & { id?: string; active?: boolean } }
  | { t: 'deleteCadre'; id: string }
  | { t: 'addCadreAbs'; abs: Omit<CadreAbs, 'id'> }
  | { t: 'deleteCadreAbs'; id: string }
  | { t: 'setPunInfo'; id: string; by: string; reason: string; on: ISODate }
  | { t: 'addRequest'; req: Omit<PersonRequest, 'id'> }
  | { t: 'updateRequest'; req: PersonRequest }
  | { t: 'deleteRequest'; id: string }
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
  | { t: 'editBlock'; phase: Phase; id: string; name: string; n: number; hrs: Record<string, string>; move?: number }
  | { t: 'setBlock'; phase: Phase; id: string; patch: Partial<Pick<BlockDef, 'armed' | 'hidden'>> }
  | { t: 'autofillRange'; dates: ISODate[] }
  | { t: 'swapPosts'; date: ISODate; a: string; b: string; force?: string }
  | { t: 'importRecords'; adds: Omit<Status, 'id'>[]; updates: { id: string; patch: Partial<Status> }[]; deletes?: string[]; source: string; what: string }
  | { t: 'setPeopleFields'; changes: { pid: number; patch: Partial<Pick<Person, 'post' | 'active' | 'notes'>> }[]; source: string; what: string }
  | { t: 'importCaps'; changes: { pid: number; kind: DutyKind; reason: string | null }[]; source: string }
  | { t: 'importDuties'; guards: Guards; baseline: Record<number, Baseline>; source: string }
  | { t: 'expire' };

// Πόστο, προσκολλημένος, σημειώσεις και «σε δύναμη» μόνο όταν το αρχείο έχει πηγή γι' αυτά· ό,τι λείπει μένει όπως είναι
export interface ImportRow extends Omit<Person, 'id' | 'active' | 'post' | 'attached' | 'notes'> { active?: boolean; post?: string | null; attached?: boolean; notes?: string }

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
// «αιτείται μετάθεση.» → «μετάθεση»: η πρόταση της ΗΚΑΙ βάζει μόνη της το «αιτείται» και την τελεία
export const reqText = (t: string) => t.trim().replace(/^αιτ[εέ][ιί]ται\s+/i, '').replace(/[.\s]+$/, '').trim();
const range = (from: ISODate, to: ISODate) => (from === to ? dm(from) : dm(from) + '–' + dm(to));

export function apply(s: AppState, c: Command, ctx: Ctx): Result {
  const pm = personMap(s.people);
  switch (c.t) {
    case 'declare': {
      const { cmd } = c; const plan = planStatusChange(s, cmd, ctx.today); const t = TYPES[cmd.type];
      if (!cmd.pids.length) throw new Error('Δεν διάλεξες άτομο');
      if (cmd.to < cmd.from) throw new Error('Το «έως» είναι πριν από το «από»');
      if (plan.blocked.length) { const b = plan.blocked[0]; throw new Error(shortName(pm.get(b.pid)!) + ' δεν βγαίνει έξοδο ' + dm(b.date) + ': ' + b.reason); }
      // η ίδια δήλωση δεύτερη φορά (π.χ. διπλό κλικ): δεν γράφεται διπλή
      const twin = s.statuses.find(x => cmd.pids.includes(x.pid) && x.type === cmd.type && x.from === cmd.from && x.to === cmd.to);
      if (twin) throw new Error(shortName(pm.get(twin.pid)!) + ' έχει ήδη ' + (cmd.type === 'PUN' ? 'την ίδια ποινή' : TYPES[cmd.type].label) + ' ' + range(cmd.from, cmd.to));
      const drop = new Set(plan.cancels.map(x => x.id));
      let next: AppState = {
        ...s,
        statuses: [...s.statuses.filter(x => !drop.has(x.id)), ...plan.cancels.flatMap(x => splitOut(x, cmd.from, cmd.to, ctx.newId)), ...cmd.pids.map(pid => {
          const st: Status = { id: ctx.newId(), pid, type: cmd.type, from: cmd.from, to: cmd.to };
          if (cmd.note) st.note = cmd.note;
          if (cmd.kind) st.kind = cmd.kind;
          if (cmd.type === 'PUN') { st.kind = cmd.kind || PUN_KINDS[0]; st.pending = true; if (cmd.by?.trim()) st.by = cmd.by.trim(); if (cmd.reason?.trim()) st.reason = cmd.reason.trim(); if (cmd.on) st.on = cmd.on; }
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
      // έξοδος/ΔΝ πολλών ημερών: αλλάζει μόνο αυτή η μέρα, οι άλλες μένουν
      const hit = (x: Status) => pids.has(x.pid) && TYPES[x.type].cat === 'out' && x.from <= c.date && c.date <= x.to;
      const kept = [...s.statuses.filter(x => !hit(x)), ...s.statuses.filter(hit).flatMap(x => splitOut(x, c.date, c.date, ctx.newId))];
      const added: Status[] = c.changes.filter(x => x.to).map(x => ({ id: ctx.newId(), pid: x.pid, type: x.to!, from: c.date, to: c.date }));
      return { state: { ...s, statuses: [...kept, ...added] }, text: 'Εξοδούχοι ' + dm(c.date) + ': ' + c.changes.length + ' αλλαγές', files: ['Εξοδούχοι-Παραμένοντες', 'ΗΚΑΙ'] };
    }
    case 'saveCadre': {
      const c0 = c.cadre; const last = normGreek(c0.last || '').trim(), first = normGreek(c0.first || '').trim();
      if (!last) throw new Error('Γράψε επώνυμο');
      const old = c0.id ? s.cadreList.find(x => x.id === c0.id) : undefined;
      const x: Cadre = { id: old?.id || 's' + ctx.newId(), rank: (c0.rank || '').trim().toUpperCase(), hk: c0.hk, last, first, active: c0.active ?? old?.active ?? true };
      if (c0.phone?.trim()) x.phone = c0.phone.trim(); if (c0.role?.trim()) x.role = c0.role.trim();
      const cadreList = old ? s.cadreList.map(y => (y === old ? x : y)) : [...s.cadreList, x];
      return { state: { ...s, cadreList }, text: (old ? 'Άλλαξαν τα στοιχεία στελέχους: ' : 'Νέο στέλεχος: ') + x.rank + ' ' + x.last + ' ' + x.first, files: ['ΗΚΑΙ'] };
    }
    case 'deleteCadre': {
      const x = s.cadreList.find(y => y.id === c.id); if (!x) throw new Error('Δεν βρέθηκε το στέλεχος');
      return { state: { ...s, cadreList: s.cadreList.filter(y => y !== x), cadreAbs: s.cadreAbs.filter(a => a.cid !== x.id) }, text: 'Διαγράφηκε το στέλεχος ' + x.rank + ' ' + x.last, files: ['ΗΚΑΙ'] };
    }
    case 'addCadreAbs': {
      const x = s.cadreList.find(y => y.id === c.abs.cid); if (!x) throw new Error('Δεν βρέθηκε το στέλεχος');
      if (c.abs.to < c.abs.from) throw new Error('Το «έως» είναι πριν από το «από»');
      const clash = s.cadreAbs.find(a => a.cid === x.id && a.from <= c.abs.to && c.abs.from <= a.to);
      if (clash) throw new Error(x.last + ' έχει ήδη απουσία ' + dm(clash.from) + '–' + dm(clash.to));
      const abs: CadreAbs = { ...c.abs, id: 'a' + ctx.newId() }; if (!abs.note) delete abs.note;
      const lbl = CADRE_ABS.find(k => k[0] === abs.kind)?.[1] || abs.kind;
      return { state: { ...s, cadreAbs: [...s.cadreAbs, abs] }, text: 'Στέλεχος: ' + x.rank + ' ' + x.last + ', ' + lbl.toLowerCase() + ' ' + range(abs.from, abs.to), files: ['ΗΚΑΙ'] };
    }
    case 'deleteCadreAbs': {
      const a = s.cadreAbs.find(y => y.id === c.id); if (!a) throw new Error('Δεν βρέθηκε η απουσία');
      const x = s.cadreList.find(y => y.id === a.cid);
      return { state: { ...s, cadreAbs: s.cadreAbs.filter(y => y !== a) }, text: 'Διαγράφηκε απουσία στελέχους' + (x ? ': ' + x.rank + ' ' + x.last : ''), files: ['ΗΚΑΙ'] };
    }
    case 'addRequest': case 'updateRequest': {
      const p = pm.get(c.req.pid); if (!p) throw new Error('Δεν βρέθηκε το άτομο');
      const text = reqText(c.req.text); if (!text) throw new Error('Γράψε τι αιτείται');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.req.date || '')) throw new Error('Διάλεξε ημερομηνία για την αίτηση');
      const old = c.t === 'updateRequest' ? s.requests.find(x => x.id === c.req.id) : undefined;
      if (c.t === 'updateRequest' && !old) throw new Error('Δεν βρέθηκε η αίτηση');
      const req: PersonRequest = { id: old?.id || 'r' + ctx.newId(), pid: p.id, date: c.req.date, text };
      // διπλό κλικ στην αποθήκευση: η ίδια αίτηση δεν γράφεται δεύτερη φορά
      if (!old && s.requests.some(x => x.pid === req.pid && x.date === req.date && x.text === req.text)) throw new Error(shortName(p) + ' έχει ήδη αυτή την αίτηση στις ' + dm(req.date));
      const requests = old ? s.requests.map(x => (x === old ? req : x)) : [...s.requests, req];
      return { state: { ...s, requests }, text: (old ? 'Άλλαξε αίτηση: ' : 'Αίτηση: ') + shortName(p) + ' – ' + text + ' (' + dm(req.date) + ')', files: ['ΗΚΑΙ'] };
    }
    case 'deleteRequest': {
      const r = s.requests.find(x => x.id === c.id); if (!r) throw new Error('Δεν βρέθηκε η αίτηση');
      const p = pm.get(r.pid);
      return { state: { ...s, requests: s.requests.filter(x => x !== r) }, text: 'Διαγράφηκε αίτηση' + (p ? ': ' + shortName(p) : '') + ' – ' + r.text, files: ['ΗΚΑΙ'] };
    }
    case 'setPunInfo': {
      const st = s.statuses.find(x => x.id === c.id); if (!st || st.type !== 'PUN') throw new Error('Δεν βρέθηκε η ποινή');
      const next: Status = { ...st, on: c.on || undefined, by: c.by.trim() || undefined, reason: c.reason.trim() || undefined };
      (['on', 'by', 'reason'] as const).forEach(k => { if (next[k] === undefined) delete next[k]; });
      return { state: { ...s, statuses: s.statuses.map(x => (x === st ? next : x)) }, text: 'Στοιχεία ποινής: ' + shortName(pm.get(st.pid)!) + (next.by ? ', από ' + next.by : '') + (next.reason ? ', διότι ' + next.reason : ''), files: [] };
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
        const soft = capBlock(s, c.pid, post) || ruleBlock(s, c.date, c.pid, undefined, c.k);
        if (soft && !c.force) throw new Error(shortName(pm.get(c.pid)!) + ' δεν μπαίνει: ' + soft);
        if (soft) note = ' (παρά τον κανόνα: ' + soft + '. Αιτία: ' + c.force + ')';
        const lr = lastResort(s.statuses, c.date, c.pid, post); if (lr) note += ' (' + lr + ')';
      }
      return { state: setGuard(s, c.date, c.k, c.pid), text: 'Υπηρεσίες ' + dm(c.date) + ': ' + (c.pid ? shortName(pm.get(c.pid)!) + ' σε ' : 'κενή η θέση ') + postTxt(post) + note, files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'swapPosts': {
      const A = postBy(s, c.a), B = postBy(s, c.b); const g = s.guards[c.date] || {};
      const chk = swapCheck(s, c.date, c.a, c.b);
      if (chk.hard) throw new Error('Δεν γίνεται ανταλλαγή: ' + chk.hard);
      if (chk.soft && !c.force) throw new Error('Δεν γίνεται ανταλλαγή: ' + chk.soft);
      const pa = g[c.a], pb = g[c.b];
      const guards = { ...s.guards, [c.date]: { ...g, [c.a]: pb, [c.b]: pa } };
      return { state: { ...s, guards }, text: 'Υπηρεσίες ' + dm(c.date) + ': ανταλλαγή ' + shortName(pm.get(pa)!) + ' (' + postTxt(A!) + ') ↔ ' + shortName(pm.get(pb)!) + ' (' + postTxt(B!) + ')' + (chk.soft ? ' (παρά τον κανόνα: ' + chk.soft + '. Αιτία: ' + c.force + ')' : ''), files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'autofillRange': {
      // ΠΣΚ: μία μέρα μετά την άλλη, ώστε οι κανόνες (ανάπαυση, νούμερα, ΣΚ) να ισχύουν και ανάμεσά τους
      let st = s; const parts: string[] = []; let empty = 0; const warn: string[] = [];
      for (const d of c.dates) { const r = fillDay(st, d); st = { ...st, guards: r.guards }; parts.push(dayName(d, ctx.today).toLowerCase() + ' ' + r.n); empty += r.empty.length; warn.push(...r.warn); }
      return { state: st, text: 'Υπηρεσίες ΠΣΚ ' + range(c.dates[0], c.dates[c.dates.length - 1]) + ': αυτόματη συμπλήρωση (' + parts.join(', ') + ')' + (empty ? ', ' + empty + ' έμειναν κενές (κανείς δεν επιτρέπεται)' : '') + (warn.length ? '. Χωρίς άλλη επιλογή: ' + warn.join('· ') : ''), files: c.dates.map(d => 'Υπηρεσίες ' + dm(d)).concat('Έλεγχος υπηρεσιών') };
    }
    case 'autofill': {
      const r = fillDay(s, c.date);
      return { state: { ...s, guards: r.guards }, text: 'Υπηρεσίες ' + dm(c.date) + ': αυτόματη συμπλήρωση ' + r.n + ' θέσεων' + (r.empty.length ? ', ' + r.empty.length + ' έμειναν κενές (κανείς δεν επιτρέπεται)' : '') + (r.warn.length ? '. Χωρίς άλλη επιλογή: ' + r.warn.join('· ') : ''), files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'clearDay': {
      const guards = { ...s.guards }; delete guards[c.date];
      return { state: { ...s, guards }, text: 'Υπηρεσίες ' + dm(c.date) + ': καθαρίστηκαν όλες οι θέσεις', files: ['Υπηρεσίες ' + dm(c.date), 'Έλεγχος υπηρεσιών'] };
    }
    case 'setRules':
      return { state: { ...s, rules: c.rules }, text: 'Άλλαξαν οι κανόνες υπηρεσιών: ' + c.text, files: [] };
    case 'setCap': {
      const cur = { ...(s.caps[c.pid] || {}) }; cur[c.kind] = c.allowed ? null : 'Από τον λοχία';
      const acc: Record<string, string> = CAP_ACC as Record<string, string>;
      return { state: { ...s, caps: { ...s.caps, [c.pid]: cur } }, text: 'Δυνατότητα υπηρεσιών: ' + shortName(pm.get(c.pid)!) + (c.allowed ? ' κάνει ' : ' δεν κάνει ') + (acc[c.kind] || c.kind), files: [] };
    }
    case 'setSettings':
      return { state: { ...s, settings: { ...s.settings, ...c.settings } }, text: 'Ρυθμίσεις: ' + c.text, files: [] };
    case 'printed':
      return { state: { ...s, printed: { ...s.printed, [c.date]: c.at } }, text: 'Βγήκε ' + c.files.join(', '), files: c.files, undoable: false };
    case 'importPeople':
      return importPeople(s, c.rows, c.source, c.deactivateMissing);
    case 'importRecords': {
      // Από τα Αρχεία Excel: νέες εγγραφές και αλλαγές σε υπάρχουσες (ίδιο άτομο, ίδιο είδος, ίδια έναρξη)
      const byId = new Map(c.updates.map(u => [u.id, u.patch]));
      const adds = c.adds.filter(a => pm.has(a.pid) && TYPES[a.type] && a.from && a.to && a.to >= a.from);
      const del = new Set((c.deletes || []).filter(id => s.statuses.some(x => x.id === id)));
      if (!adds.length && !byId.size && !del.size) return { state: s, text: '', files: [] };
      const statuses = [...s.statuses.filter(x => !del.has(x.id)).map(x => (byId.has(x.id) ? { ...x, ...byId.get(x.id) } : x)), ...adds.map(a => ({ ...a, id: ctx.newId() }))];
      const parts = [adds.length && adds.length + (adds.length === 1 ? ' νέα' : ' νέες'), byId.size && byId.size + (byId.size === 1 ? ' αλλαγή' : ' αλλαγές'), del.size && del.size + (del.size === 1 ? ' σβήστηκε' : ' σβήστηκαν')].filter(Boolean).join(', ');
      return { state: { ...s, statuses }, text: 'Από Excel (' + c.source + '), ' + c.what + ': ' + parts, files: [], source: 'excel' };
    }
    case 'setPeopleFields': {
      // Από τα Αρχεία Excel (πόστα, εκτός δύναμης): μόνο αυτά τα πεδία, μόνο σε άτομα που υπάρχουν
      const by = new Map<number, Partial<Person>>();
      for (const ch of c.changes) {
        if (!pm.has(ch.pid)) continue;
        const pt: Partial<Person> = {};
        if ('post' in ch.patch) pt.post = ch.patch.post ? String(ch.patch.post) : null;
        if ('active' in ch.patch) pt.active = !!ch.patch.active;
        if ('notes' in ch.patch) pt.notes = String(ch.patch.notes ?? '');
        by.set(ch.pid, { ...(by.get(ch.pid) || {}), ...pt });
      }
      if (!by.size) return { state: s, text: '', files: [] };
      const people = s.people.map(p => (by.has(p.id) ? { ...p, ...by.get(p.id) } : p));
      return { state: { ...s, people }, text: 'Από Excel (' + c.source + '), ' + c.what + ': ' + by.size + (by.size === 1 ? ' αλλαγή' : ' αλλαγές'), files: [], source: 'excel' };
    }
    case 'importCaps': {
      const caps = { ...s.caps }; let n = 0;
      for (const ch of c.changes) {
        if (!pm.has(ch.pid) || !CAP_ACC[ch.kind]) continue;
        const cur = { ...(caps[ch.pid] || {}) };
        if (ch.reason) cur[ch.kind] = ch.reason; else delete cur[ch.kind];
        caps[ch.pid] = cur; n++;
      }
      for (const k of Object.keys(caps)) if (!Object.keys(caps[+k]).length) delete caps[+k];
      if (!n) return { state: s, text: '', files: [] };
      return { state: { ...s, caps }, text: 'Από Excel (' + c.source + '), δυνατότητα υπηρεσιών: ' + n + (n === 1 ? ' αλλαγή' : ' αλλαγές'), files: [], source: 'excel' };
    }
    case 'importDuties': {
      // μόνο μέρες χωρίς καμία υπηρεσία στην εφαρμογή (ξαναελέγχεται εδώ) και θέσεις που υπάρχουν
      const guards = { ...s.guards }; let days = 0, n = 0;
      for (const [d, g] of Object.entries(c.guards)) {
        if (Object.keys(s.guards[d] || {}).length) continue;
        const ok = Object.fromEntries(Object.entries(g).filter(([k, pid]) => pm.has(pid) && postBy(s, k)));
        if (!Object.keys(ok).length) continue;
        guards[d] = ok; days++; n += Object.keys(ok).length;
      }
      const baseline = { ...s.baseline }; let extra = 0;
      for (const [id, b] of Object.entries(c.baseline)) {
        const pid = Number(id); if (!pm.has(pid)) continue;
        const cur: Baseline = { ...(baseline[pid] || {}) };
        for (const [k, v] of Object.entries(b)) { const x = Math.max(0, Math.floor(Number(v) || 0)); if (!x) continue; (cur as Record<string, number>)[k] = ((cur as Record<string, number>)[k] || 0) + x; if (k !== 'hol') extra += x; }
        baseline[pid] = cur;
      }
      if (!n && !extra) return { state: s, text: '', files: [] };
      return { state: { ...s, guards, baseline }, text: 'Από Excel (' + c.source + '), έλεγχος υπηρεσιών: ' + (n + extra) + ' υπηρεσίες σε ' + days + (days === 1 ? ' μέρα' : ' μέρες'), files: ['Έλεγχος υπηρεσιών'], source: 'excel' };
    }
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
    case 'editBlock': {
      // Επεξεργασία υπηρεσίας: όνομα και πλήθος (μόνο στις δικές σου), ώρες ανά θέση (όσες δεν έχουν βάρδιες), σειρά
      const key = c.phase === 'spen' ? 'blocksSpen' : 'blocks';
      const list = [...blocksOf(s.settings, c.phase)]; const i = list.findIndex(x => x.id === c.id); if (i < 0) throw new Error('Δεν βρέθηκε η υπηρεσία');
      const b = list[i];
      if (c.move) {
        const j = i + c.move; if (j < 0 || j >= list.length || list[j].kind === 'ly' || b.kind === 'ly') return { state: s, text: '', files: [] };
        [list[i], list[j]] = [list[j], list[i]];
        return { state: { ...s, settings: { ...s.settings, [key]: list } }, text: 'ΦΡΟΥΡΑ ' + PHASE_NAME[c.phase] + ', ' + b.name + ': άλλαξε σειρά', files: [] };
      }
      const name = (b.custom && c.name.trim()) || b.name;
      let posts = b.posts.map(p => (p.rot == null && c.hrs[p.k] != null ? { ...p, hrs: c.hrs[p.k].trim() || 'ημέρα' } : p));
      if (b.custom) {
        const n = Math.min(10, Math.max(1, Math.floor(c.n) || 1));
        // οι θέσεις που περισσεύουν κρύβονται (όχι διαγραφή), για να μη χαθεί το ιστορικό τους
        for (let j = posts.length; j < n; j++) posts.push({ k: b.id + '_' + (j + 1), label: '', short: '', hrs: posts[0]?.hrs || 'ημέρα' });
        posts = posts.map((p, j) => ({ ...p, label: name + (n === 1 ? '' : ' ' + (j + 1) + 'ος'), short: n === 1 ? name : (j + 1) + 'ος', hidden: j >= n || undefined }));
        posts.forEach(p => { if (!p.hidden) delete p.hidden; });
      }
      list[i] = { ...b, name, posts };
      return { state: { ...s, settings: { ...s.settings, [key]: list } }, text: 'ΦΡΟΥΡΑ ' + PHASE_NAME[c.phase] + ', ' + name + ': άλλαξαν τα στοιχεία', files: [] };
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
// Το άτομο μετά την εισαγωγή: αλλάζουν μόνο τα πεδία που έφερε η γραμμή. Χωρίς «σε δύναμη» στη γραμμή (το αρχείο δεν έχει
// φύλλο ΕΚΤΟΣ), όποιος είναι στο Δυναμολόγιο ξαναμπαίνει σε δύναμη, εκτός αν τον έβγαλε φύλλο ΕΚΤΟΣ ΔΥΝΑΜΗΣ (άλλο αρχείο).
// Όποιος ξαναμπαίνει σε δύναμη χάνει τη σημείωση «Εκτός δύναμης…» που είχε γράψει η εφαρμογή.
function mergeRow(ex: Person, r: ImportRow): Person {
  const auto = ex.notes.startsWith(OUT_NOTE);
  const active = r.active ?? (ex.active || !auto);
  const next: Person = { ...ex, ...r, id: ex.id, active };
  if (active && r.notes === undefined && auto) next.notes = '';
  return next;
}
const newPerson = (r: ImportRow, id: number): Person => ({ post: null, attached: false, notes: '', ...r, id, active: r.active ?? true });
function importPeople(s: AppState, rows: ImportRow[], source: string, deactivateMissing: boolean): Result {
  const byAsm = new Map(s.people.filter(p => p.asm).map(p => [p.asm, p]));
  const byName = new Map(s.people.map(p => [personKey(p), p]));
  let nextId = s.people.reduce((a, p) => Math.max(a, p.id), 0) + 1;
  const seen = new Set<number>();
  const updated = new Map<number, Person>();
  const added: Person[] = [];
  for (const r of rows) {
    const ex = (r.asm && byAsm.get(r.asm)) || byName.get(personKey(r));
    if (ex) { seen.add(ex.id); updated.set(ex.id, mergeRow(ex, r)); }
    else added.push(newPerson(r, nextId++));
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

// Τι αλλάζει στον καθένα με μια εισαγωγή προσωπικού (για την προεπισκόπηση: «ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.: Σ.Ι Ι1 → Ι3»)
const ROSTER_FIELDS: [keyof ImportRow, string][] = [['rank', 'βαθμός'], ['spec', 'Ο/Σ'], ['last', 'επώνυμο'], ['first', 'όνομα'], ['father', 'πατρώνυμο'], ['asm', 'ΑΣΜ'],
  ['phone', 'τηλέφωνο'], ['room', 'θάλαμος'], ['si', 'Σ.Ι'], ['post', 'πόστο'], ['role', 'ρόλος'], ['dn', 'ΔΝ'], ['active', 'σε δύναμη']];
const rv = (v: unknown) => (v == null || v === '' ? '—' : v === true ? 'ναι' : v === false ? 'όχι' : String(v));
export function rosterChanges(s: AppState, rows: ImportRow[]): { changes: { who: string; what: string }[]; same: number } {
  const byAsm = new Map(s.people.filter(p => p.asm).map(p => [p.asm, p]));
  const byName = new Map(s.people.map(p => [personKey(p), p]));
  const changes: { who: string; what: string }[] = []; let same = 0;
  for (const r of rows) {
    const ex = (r.asm && byAsm.get(r.asm)) || byName.get(personKey(r)); if (!ex) continue;
    const next = mergeRow(ex, r) as unknown as Record<string, unknown>; const cur = ex as unknown as Record<string, unknown>;
    const what = ROSTER_FIELDS.filter(([k]) => (r[k] !== undefined || k === 'active') && rv(cur[k] ?? (k === 'dn' ? false : null)) !== rv(next[k] ?? (k === 'dn' ? false : null)))
      .map(([k, label]) => label + ' ' + rv(cur[k] ?? (k === 'dn' ? false : null)) + ' → ' + rv(next[k]));
    if (what.length) changes.push({ who: ex.last + ' ' + ex.first, what: what.join(', ') }); else same++;
  }
  return { changes, same };
}

export const describeDay = (d: ISODate, today: ISODate) => dayName(d, today).toLowerCase();
