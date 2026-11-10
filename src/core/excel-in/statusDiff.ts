// Excel ↔ app: what changed in the statuses since the last read or write.
//
// Purpose: `diffStatuses` (the candidates against the statuses of the app: add, change, keep, removed in the Excel),
//   the identity of a record (`identity`, `statusId`, `candId`) and `recVal` / `baseOf` (the `base` that tells who
//   changed a record).
// Does NOT: read the Excel (statusesIn.ts), write it (writePlan.ts) or save the result (the commands in
//   src/shared/commands.ts do).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/people, core/statuses,
//   core/excel-in/statusesIn.
// Why: the app and the Excel are both edited by people: a record changed in only one of them passes to the other, a
//   record changed in both is shown as a conflict, and a row deleted in the Excel is told from a row the app never
//   wrote (`synced`). Nothing is lost without the user seeing it.
// Covering tests: test/sources.test.ts, test/write-group.test.ts, test/note-only-excel.test.ts,
//   test/open-ended.test.ts, test/multi-med.test.ts.
import type { ISODate } from '../lib/dates';
import { normGreek } from '../lib/text';
import { fullName } from '../model/person';
import { PUN_KINDS, TYPES, type Status, type TypeKey } from '../model/status';
import type { AppState } from '../model/state';
import { medNote, medNoteXl } from '../people/kinds';
import { timeNames } from '../statuses/hours';
import type { SourceBinding } from '../model/bindings';
import { type StatusKind, KIND, TIME_KINDS } from './fields';
import { type Cand, vk, DEFAULT_TYPE, type ParseOut } from './statusesIn';

/**
 * The identity of a record for the comparison Excel ↔ app: person, kind group and start date. For medical the kind
 * too, because the same person can have both ΕΑ and ΕΟ (or «ΕΛ ΑΡΒ») on the same day in separate rows.
 */
export const identity = (pid: number, kind: StatusKind, from: ISODate, sub = '') =>
  pid + '|' + kind + '|' + from + (sub ? '|' + sub : '');
/** The part of the identity that tells records of one day apart: the kind for medical, nothing otherwise. */
export const subOf = (kind: StatusKind, text: string) => (kind === 'medical' ? vk(text) : '');
/** The identity of a status of the app. */
export const statusId = (kind: StatusKind, x: Status) =>
  identity(x.pid, kind, x.from, subOf(kind, x.kind || TYPES[x.type].label));
/** The identity of a candidate read from the Excel, for the person `pid`. */
const candId = (kind: StatusKind, pid: number, c: Cand) =>
  identity(pid, kind, c.from, subOf(kind, c.raw || TYPES[c.type || DEFAULT_TYPE[kind]].label));
/**
 * A record as the Excel writes and reads it: it shows what changed in the app since the last read or write (base), so
 * that at the read the ones changed on both sides are told apart.
 * No end: «open» instead of a date, so the daily extension does not count as a change in the app. The hours of a leave
 * come at the end only when they exist: without hours the value stays the same as in older versions; the same for the
 * direction of a leave.
 */
export const recVal = (
  x: Pick<Status, 'to' | 'type' | 'kind' | 'note' | 'by' | 'reason' | 'open' | 'fromTime' | 'toTime' | 'dest'>,
) =>
  [
    x.open ? 'open' : x.to,
    x.type,
    x.kind || '',
    x.note || '',
    x.by || '',
    x.reason || '',
    ...(x.fromTime || x.toTime || x.dest ? [x.fromTime || '', x.toTime || ''] : []),
    ...(x.dest ? [x.dest] : []),
  ].join('\u0001');
/** The `recVal` of the records of the app whose identities are in `keys`, stored as `base` after a read or a write. */
export function baseOf(kind: StatusKind, s: AppState, keys: string[]): Record<string, string> {
  const want = new Set(keys);
  const out: Record<string, string> = {};
  const types = KIND[kind].types!;
  for (const x of s.statuses)
    if (types.includes(x.type)) {
      const id = statusId(kind, x);
      if (want.has(id)) out[id] = recVal(x);
    }
  return out;
}
const sameText = (a: string | undefined, b: string | undefined) => normGreek(a || '') === normGreek(b || '');
const appText = (x: Status) =>
  'έως ' +
  x.to.slice(8) +
  '/' +
  x.to.slice(5, 7) +
  (x.kind ? ', ' + x.kind : '') +
  (x.note ? ', «' + x.note + '»' : '');
/**
 * One change to an existing status: `patch`, who it is about, `what` changed (text for the user) and, when the app
 * changed it too, `conflict` with what the app has.
 */
export interface DiffUpdate {
  id: string;
  patch: Partial<Status>;
  who: string;
  what: string;
  conflict?: string;
} // conflict: what the app has (changed there too)
/**
 * The result of `diffStatuses`: `add`, `update`, unchanged `same`, rows not matched to a person (`unmatched`) or
 * repeated (`dup`), records only in the app (`appOnly`), the identities read (`keys`), records deleted in the Excel
 * (`removed`) and ones changed only in the app (`kept`).
 */
export interface Diff {
  add: Omit<Status, 'id'>[];
  update: DiffUpdate[];
  same: number;
  unmatched: Cand[];
  dup: Cand[];
  appOnly: Status[];
  keys: string[];
  removed: Status[]; // were in the Excel at the previous read/write and were deleted there
  kept: string[]; // changed only in the app (the Excel has what it had): they stay and are written to the Excel
}
/**
 * Compares the candidates read from the Excel with the statuses of the app and says what to add, change or leave.
 * `choices`: row → person, for the rows that did not match alone (null = skip).
 * `synced`: the records the Excel had at the previous read/write. Those missing now were deleted there; if a new row
 * of the same person stands in their place, it is the same record with another start date.
 * `base`: the records as they were at the last read/write (`recVal` per identity).
 * `today`: with «Μόνο όσες ισχύουν» the expired ones are neither «of the app, missing from the Excel» (they are not
 * written there) nor «deleted from the Excel» (the app deletes them itself; they stay in the app as history).
 */
export function diffStatuses(
  kind: StatusKind,
  s: AppState,
  parsed: ParseOut,
  b: SourceBinding,
  choices: Record<number, number | null> = {},
  synced: string[] = [],
  base: Record<string, string> = {},
  today?: ISODate,
): Diff {
  const changedInApp = (x: Status) => {
    const v = base[statusId(kind, x)];
    return v != null && v !== recVal(x);
  };
  const types = KIND[kind].types!;
  const mine = s.statuses.filter((x) => types.includes(x.type));
  const idx = new Map(mine.map((x) => [statusId(kind, x), x]));
  const d: Diff = {
    add: [],
    update: [],
    same: 0,
    unmatched: [],
    dup: [],
    appOnly: [],
    keys: [],
    removed: [],
    kept: [],
  };
  const seen = new Set<string>();
  const pm = new Map(s.people.map((p) => [p.id, p]));
  const has = (k: string) => b.cols[k] != null;
  // Did the Excel change this record since the last read/write? What has no column counts as it was.
  const cols = {
    to: has('to'),
    type: has('kind') || has('where'),
    kind: has('kind') || has('where'),
    note: has('note'),
    by: has('by'),
    reason: has('reason'),
    fromTime: has('tout'),
    toTime: has('tin'),
    dest: has('dest'),
  };
  const excelMoved = (cur: Status, patch: Partial<Status>) => {
    const v = base[statusId(kind, cur)];
    if (v == null) return true;
    const [to, type, k, note, by, reason, fromTime = '', toTime = '', dest = ''] = v.split('\u0001');
    const was: Record<keyof typeof cols, string> = { to, type, kind: k, note, by, reason, fromTime, toTime, dest };
    const now = { ...was };
    for (const f of Object.keys(cols) as (keyof typeof cols)[])
      if (cols[f])
        now[f] = String(((f === 'fromTime' || f === 'toTime') && f in patch ? patch[f] : (patch[f] ?? cur[f])) ?? '');
    if (cols.to) {
      const open = 'open' in patch ? patch.open : cur.open;
      now.to = open ? 'open' : String(patch.to ?? cur.to);
    }
    return recVal({ ...now, type: now.type as TypeKey, open: now.to === 'open' }) !== v;
  };
  for (const c of parsed.cands) {
    const pid = c.pid ?? (c.r in choices ? choices[c.r] : null);
    if (pid == null) {
      if (!(c.r in choices)) d.unmatched.push(c);
      continue;
    }
    const id = candId(kind, pid, c);
    if (seen.has(id)) {
      d.dup.push(c);
      continue;
    }
    seen.add(id);
    d.keys.push(id);
    const type = c.type || DEFAULT_TYPE[kind];
    const cur = idx.get(id);
    if (!cur) {
      const st: Omit<Status, 'id'> = { pid, type, from: c.from, to: c.to };
      if (c.noEnd && has('to')) st.open = true; // without a «έως» column it is not «no end»: it stays one day, as before
      if (c.kind) st.kind = c.kind;
      if (c.note) st.note = c.note;
      if (c.fromTime) st.fromTime = c.fromTime;
      if (c.toTime) st.toTime = c.toTime;
      if (c.dest) st.dest = c.dest;
      if (kind === 'punish') {
        st.kind = c.kind || PUN_KINDS[0];
        if (c.by) st.by = c.by;
        if (c.reason) st.reason = c.reason;
      }
      d.add.push(st);
      continue;
    }
    // only what exists as a column in the Excel changes; what does not exist stays as it is in the app
    const patch: Partial<Status> = {};
    const what: string[] = [];
    // empty «έως» in the Excel on a record that had an end: from now on no end (the app does not write a date again)
    if (has('to') && c.noEnd && !cur.open) {
      patch.open = true;
      what.push('χωρίς λήξη');
    }
    if (has('to') && !c.noEnd && (cur.to !== c.to || cur.open)) {
      patch.to = c.to;
      if (cur.open) patch.open = false;
      what.push('έως ' + c.to.slice(8) + '/' + c.to.slice(5, 7));
    }
    if ((has('kind') || has('where')) && c.raw && cur.type !== type) {
      patch.type = type;
      what.push(TYPES[type].label);
    }
    // the app writes capitals to the Excel: the same text as long as the letters match (ignoring case and accents)
    if ((has('kind') || has('where')) && c.kind && !sameText(c.kind, cur.kind)) {
      patch.kind = c.kind;
      what.push(c.kind);
    }
    if (has('note') && !sameText(c.note, cur.note)) {
      patch.note = c.note || '';
      what.push('παρατηρήσεις');
    }
    const tn = timeNames(type),
      timed = TIME_KINDS.includes(kind);
    if (timed && has('tout') && (c.fromTime || '') !== (cur.fromTime || '')) {
      patch.fromTime = c.fromTime || '';
      what.push(c.fromTime ? tn.from + ' ' + c.fromTime : 'χωρίς ώρα ' + tn.fromG);
    }
    if (timed && has('tin') && !c.noEnd && (c.toTime || '') !== (cur.toTime || '')) {
      patch.toTime = c.toTime || '';
      what.push(c.toTime ? tn.to + ' ' + c.toTime : 'χωρίς ώρα ' + tn.toG);
    }
    if (kind === 'leave' && has('dest') && !sameText(c.dest, cur.dest)) {
      patch.dest = c.dest || '';
      what.push(c.dest ? 'κατεύθυνση ' + c.dest : 'χωρίς κατεύθυνση');
    }
    if (kind === 'punish' && has('by') && c.by && !sameText(c.by, cur.by)) {
      patch.by = c.by;
      what.push('ποιος την επέβαλε');
    }
    if (kind === 'punish' && has('reason') && c.reason && !sameText(c.reason, cur.reason)) {
      patch.reason = c.reason;
      what.push('αιτία');
    }
    if (cur.pending && kind === 'punish') {
      patch.pending = false;
      what.push('εγκρίθηκε');
    }
    const who = pm.get(pid) ? fullName(pm.get(pid)!) : c.who;
    if (what.length && changedInApp(cur) && !excelMoved(cur, patch)) {
      // you changed it only in the app: it is kept (and written to the Excel); the approval of a punishment passes
      d.kept.push(cur.id);
      if (patch.pending === false) d.update.push({ id: cur.id, patch: { pending: false }, who, what: 'εγκρίθηκε' });
      else d.same++;
    } else if (what.length)
      d.update.push({
        id: cur.id,
        patch,
        who,
        what: what.join(', '),
        ...(changedInApp(cur) ? { conflict: appText(cur) } : {}),
      });
    else d.same++;
  }
  // «Μόνο σημείωση» without «στο Excel» (Michael, 4/11): not written there, so not «missing»/«deleted»; read if present
  const lists = s.settings.lists;
  d.appOnly = mine.filter(
    (x) =>
      !seen.has(statusId(kind, x)) &&
      !(today && b.scope === 'active' && x.to < today) &&
      !(medNote(x, lists) && !medNoteXl(x, lists)),
  );
  const was = new Set(synced);
  const gone = d.appOnly.filter((x) => was.has(statusId(kind, x)));
  if (gone.length) {
    d.appOnly = d.appOnly.filter((x) => !gone.includes(x));
    const days = (a: { from: string; to: string }, c: { from: string; to: string }) =>
      Math.max(0, Math.min(Date.parse(a.to), Date.parse(c.to)) - Math.max(Date.parse(a.from), Date.parse(c.from)));
    for (const x of gone) {
      // the same record with another «από»: a new row of the same person (same kind for medical), the nearest one.
      // Only if the days overlap or are at most 1 day apart; otherwise it is another record (one deleted, one written)
      const sub = subOf(kind, x.kind || TYPES[x.type].label);
      const gap = (a: { from: string; to: string }) =>
        Math.max(Date.parse(a.from) - Date.parse(x.to), Date.parse(x.from) - Date.parse(a.to));
      const near = d.add
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.pid === x.pid && subOf(kind, a.kind || TYPES[a.type].label) === sub && gap(a) <= 86400000)
        .sort(
          (p, q) =>
            days(q.a, x) - days(p.a, x) ||
            Math.abs(Date.parse(p.a.from) - Date.parse(x.from)) - Math.abs(Date.parse(q.a.from) - Date.parse(x.from)),
        )[0];
      if (!near) {
        // a row that did not match a person may be this one: it is not deleted until the user chooses
        if (!d.unmatched.some((c) => c.from === x.from || c.cands.some((p) => p.id === x.pid))) d.removed.push(x);
        else d.appOnly.push(x);
        continue;
      }
      d.add.splice(near.i, 1);
      const a = near.a;
      const patch: Partial<Status> = { from: a.from, to: a.to };
      const what = ['από ' + a.from.slice(8) + '/' + a.from.slice(5, 7)];
      if (!!a.open !== !!x.open) patch.open = !!a.open;
      if (a.open && !x.open) what.push('χωρίς λήξη');
      else if (!a.open && (a.to !== x.to || x.open)) what.push('έως ' + a.to.slice(8) + '/' + a.to.slice(5, 7));
      if (a.type !== x.type) {
        patch.type = a.type;
        what.push(TYPES[a.type].label);
      }
      // as above: remarks pass as they are into the new row, even empty (otherwise the old one would stay)
      for (const k of ['kind', 'by', 'reason'] as const) if (a[k] && a[k] !== x[k]) patch[k] = a[k];
      if (has('note') && (a.note || '') !== (x.note || '')) patch.note = a.note || '';
      if (has('tout') && (a.fromTime || '') !== (x.fromTime || '')) patch.fromTime = a.fromTime || '';
      if (has('tin') && (a.toTime || '') !== (x.toTime || '')) patch.toTime = a.toTime || '';
      if (kind === 'leave' && has('dest') && (a.dest || '') !== (x.dest || '')) patch.dest = a.dest || '';
      if (x.pending && kind === 'punish') {
        patch.pending = false;
        what.push('εγκρίθηκε');
      }
      d.update.push({
        id: x.id,
        patch,
        who: pm.get(x.pid) ? fullName(pm.get(x.pid)!) : '',
        what: what.join(', '),
        ...(changedInApp(x) ? { conflict: appText(x) } : {}),
      });
    }
  }
  return d;
}
