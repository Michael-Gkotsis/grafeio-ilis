// Writing the duty check (your own monthly file).
//
// Purpose: `planDutiesWrite` (the seat code in the cell of each day for the duties of the app, deleting only what
//   the app had seen).
// Does NOT: read the grid (dutyCheckIn.ts) or build a new file (dutyCheckSheet.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/duty, core/model,
//   core/excel-in/writeCells, core/excel-in/sheetMonth, core/excel-in/peopleMatch, core/excel-in/tableRows.
// Why: the duty check is the sergeant's file: the app writes the code of the seat only where it differs, never over
//   an absence code, and never deletes a duty that did not come from the app.
// Covering tests: test/duties-import.test.ts, test/hold-duties.test.ts, test/duty-columns.test.ts.
import { type ISODate, dm } from '../lib/dates';
import type { DutyKind } from '../model/duty';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { bareOf, codeOf, readDuty, type CellDuty } from '../duty/dutyCodes';
import { isPersonRow } from './rosterColumns';
import type { RawSheet } from './roster';
import { postBy } from '../duty/posts';
import type { SourceBinding } from '../model/bindings';
import { cellText } from './cellText';
import { dutyDays } from './columns';
import { makeMatcher } from './peopleMatch';
import { bindingMonth } from './sheetMonth';
import { nameOf } from './sheetPeople';
import { tableRows } from './tableRows';
import type { SourcePlan } from './writeCells';

/**
 * Writes the duty check (your own monthly file): the seat code (Θ1α, Μ2…) in the cell of the day, for the days the app
 * has duties; for a duty without a seat the bare letter. If the sheet counts with COUNTIF(…, "Θ"), the bare letter is
 * written (otherwise its totals would come out 0) until the formulas become "Θ*". A cell that already says the right
 * seat (even with the code of the other form) is not written again. Absence codes (Κ.Α, Ε.Υ…) stay as they are.
 * Only a cell that the app had seen is deleted (`synced`: «day|person» from the previous read or write) and it no
 * longer has it: a duty of the Excel that never passed into the app is never deleted. A day with the same seat code
 * twice is not read (`planDuties`), so it is not written either. `keys`: what the app has seen after the write.
 */
export function planDutiesWrite(
  sheet: RawSheet,
  b: SourceBinding,
  s: AppState,
  today: ISODate,
  synced: string[] = [],
): SourcePlan {
  const plan: SourcePlan = {
    sets: [],
    insert: null,
    header: [],
    keys: [],
    added: 0,
    changed: 0,
    cleared: 0,
    foreign: 0,
    notFound: [],
  };
  const month = bindingMonth(sheet, b, today);
  if (!month) {
    plan.notFound.push('(δεν βρέθηκε ο μήνας στον τίτλο του φύλλου)');
    return plan;
  }
  const exact = !sheet.countif?.length;
  if (!exact)
    plan.warn = [
      'Το φύλλο μετρά με COUNTIF σκέτο γράμμα (' +
        countifTxt(sheet.countif!) +
        '): γράφεται «Θ», «Μ»… αντί για τον κωδικό της θέσης. Άλλαξε στους τύπους το "Θ" σε "Θ*" (και το "Μ" σε "Μ*", το "Σ" σε "Σ*") για να γράφονται οι κωδικοί.',
    ];
  const cols = dutyDays(sheet, b);
  const [y, m] = month.split('-').map(Number);
  const nDays = Math.min(cols.length, new Date(Date.UTC(y, m, 0)).getUTCDate());
  const seenBefore = new Set(synced);
  const dateOf = (i: number) => month + '-' + String(i + 1).padStart(2, '0');
  const seenDays = new Set(synced.map((x) => x.split('|')[0]));
  type Want = { k?: string; kind: DutyKind; code: string };
  const pm = new Map(s.people.map((p) => [p.id, p]));
  const want = new Map<number, Map<number, Want>>();
  const days: number[] = [];
  const put = (pid: number, i: number, w: Want) => {
    if (pid < 0) return;
    const x = want.get(pid) || new Map<number, Want>();
    if (!x.get(i)?.k) x.set(i, w);
    want.set(pid, x);
  };
  for (let i = 0; i < nDays; i++) {
    const d = dateOf(i);
    const g = s.guards[d] || {};
    const log = s.dutyLog?.[d] || [];
    if (!Object.keys(g).length && !log.length && !seenDays.has(d)) continue;
    days.push(i);
    for (const e of log) put(e.pid, i, { kind: e.kind, code: bareOf(undefined, e.kind) });
    for (const [k, pid] of Object.entries(g)) {
      const post = postBy(s, k);
      if (!post) continue;
      put(pid, i, { k, kind: post.kind, code: exact ? codeOf(s.settings, k, post.kind) : bareOf(k, post.kind) });
    }
  }
  if (!days.length) return plan;
  // does the cell already say what the app wants? (bare letter: the kind is enough, unless the cell says a seat the app
  // has given to someone else; seat: the same seat, and a bare letter when we write letters)
  const ok = (cur: CellDuty, w: Want, i: number, pid: number) =>
    cur.kind === w.kind &&
    (w.k
      ? cur.k === w.k || (!exact && !cur.k)
      : !cur.k || (s.guards[dateOf(i)] || {})[cur.k] == null || (s.guards[dateOf(i)] || {})[cur.k] === pid);
  const match = makeMatcher(s.people);
  const seen = new Set<number>();
  const recs = tableRows(sheet, b.header, b.cols)
    .records.filter(
      ({ v }) =>
        b.cols.last == null ||
        b.cols.first == null ||
        isPersonRow(cellText(v.last), cellText(v.first), cellText(v.father)),
    )
    .map((x) => ({ ...x, m: match(x.v) }));
  const twice = (i: number) => {
    const k = new Set<string>();
    return recs.some(({ r }) => {
      const x = readDuty(cellText((sheet.rows[r] || [])[cols[i]]), s.settings);
      if (!x || typeof x !== 'object' || !x.k) return false;
      if (k.has(x.k)) return true;
      k.add(x.k);
      return false;
    });
  };
  const bad = days.filter(twice);
  if (bad.length) {
    const ds = bad.map((i) => dm(dateOf(i)));
    plan.warn = [
      ...(plan.warn || []),
      (ds.length === 1 ? 'Στις ' + ds[0] : 'Στις ' + ds.join(', ')) +
        ' το Excel έχει τον ίδιο κωδικό θέσης δύο φορές: δεν γράφεται τίποτα εκεί μέχρι να το διορθώσεις στο Excel και να ξαναδιαβαστεί.',
    ];
    for (const i of bad) for (const x of synced) if (x.startsWith(dateOf(i) + '|')) plan.keys.push(x);
    days.splice(0, days.length, ...days.filter((i) => !bad.includes(i)));
  }
  // namesakes with a row each: we do not know whose is whose, they are not written (only one row goes to the active)
  const group = (m: { alts?: Person[] }) =>
    m.alts
      ? m.alts
          .map((p) => p.id)
          .sort((a, c) => a - c)
          .join(',')
      : '';
  const nGroup = new Map<string, number>();
  for (const { m } of recs) if (m.alts) nGroup.set(group(m), (nGroup.get(group(m)) || 0) + 1);
  let unseen = 0;
  for (const { r, m } of recs) {
    if (m.alts && (m.pid == null || nGroup.get(group(m))! > 1)) {
      m.alts.forEach((p) => seen.add(p.id));
      (plan.ambiguous = plan.ambiguous || []).push(r);
      continue;
    }
    const pid = m.pid;
    if (pid == null || seen.has(pid)) {
      plan.foreign++;
      continue;
    }
    seen.add(pid);
    const x = want.get(pid);
    let ch = false;
    for (const i of days) {
      const raw = cellText((sheet.rows[r] || [])[cols[i]]);
      const cur = readDuty(raw, s.settings);
      const wnt = x?.get(i);
      const duty = cur && typeof cur === 'object' ? cur : null;
      const key = dateOf(i) + '|' + pid;
      if (wnt) {
        plan.keys.push(key);
        if (!duty || !ok(duty, wnt, i, pid)) {
          plan.sets.push({ r, c: cols[i], v: wnt.code });
          ch = true;
        }
      } else if (duty && seenBefore.has(key)) {
        plan.sets.push({ r, c: cols[i], v: null });
        ch = true;
      } // } // the app had it and you deleted it there
      else if (duty && dateOf(i) <= today) unseen++;
    }
    if (ch) plan.changed++;
  }
  if (unseen)
    plan.warn = [
      ...(plan.warn || []),
      (unseen === 1 ? '1 υπηρεσία' : unseen + ' υπηρεσίες') +
        ' του Excel δεν είναι ακόμα στην εφαρμογή και δεν σβήνονται· πάτα «Ανανέωση από Excel» για να περάσουν.',
    ];
  for (const pid of want.keys()) if (!seen.has(pid) && pm.has(pid)) plan.notFound.push(nameOf(pm.get(pid)!));
  return plan;
}
const countifTxt = (refs: string[]) => refs.slice(0, 3).join(', ') + (refs.length > 3 ? ' κ.ά.' : '');
