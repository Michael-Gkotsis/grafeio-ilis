// Writing back the sheets «ΠΟΣΤΑ», «ΕΚΤΟΣ ΔΥΝΑΜΗΣ» and «ΔΥΝΑΤΟΤΗΤΑ ΥΠΗΡΕΣΙΩΝ».
//
// Purpose: `planPostsWrite`, `planOutsideWrite` and `planCapsWrite`, all through one writer of «a table with one
//   person per row» (`planList`: cells to update, rows to add, rows to drop; namesakes are not touched).
// Does NOT: read these sheets (postsIn.ts, capsIn.ts) or write the file.
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/excel-in/writeCells,
//   core/excel-in/capsIn, core/excel-in/peopleMatch, core/excel-in/tableRows.
// Why: these lists live in the same file as the roster; the app keeps them in step with its own data without
//   disturbing rows it does not know.
// Covering tests: test/sources.test.ts, test/excel-caps.test.ts, test/excel-misc.test.ts, test/linked.test.ts.
import { collator } from '../lib/text';
import { OUT_NOTE, fullName, type Person } from '../model/person';
import type { AppState } from '../model/state';
import { isPersonRow } from './rosterColumns';
import type { CellValue, RawSheet } from './roster';
import type { SourceBinding } from '../model/bindings';
import { capKeys, capNo } from './capsIn';
import { cellText } from './cellText';
import { makeMatcher } from './peopleMatch';
import { tableRows } from './tableRows';
import { type SourcePlan, type WVal, same, sideBy, noRoomTxt } from './writeCells';
import { fieldValue } from './writePlan';

const personField = (k: string, p: Person, b: SourceBinding): WVal =>
  fieldValue(k, 'punish', { id: '', pid: p.id, type: 'PUN', from: '', to: '' }, p, b);
const PERSON_KEYS = ['rank', 'origin', 'spec', 'last', 'first', 'name', 'father', 'asm', 'phone', 'room'];
// What the app wants in a table with one person per row: upd = cells in the rows that exist, add = new rows
// (with the details of the person), drop = rows that are deleted. Rows it does not know it does not touch.
interface ListWant {
  upd: Map<number, Record<string, WVal>>;
  add: Map<number, Record<string, WVal>>;
  drop: Set<number>;
}
function planList(
  sheet: RawSheet,
  b: SourceBinding,
  s: AppState,
  w: ListWant,
  eq: (k: string, cell: CellValue, v: WVal) => boolean = (_k, cell, v) => same(cell, v),
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
  const rows = sheet.rows;
  const scan = tableRows(sheet, b.header, b.cols);
  const match = makeMatcher(s.people);
  const pm = new Map(s.people.map((p) => [p.id, p]));
  const placed = new Set<number>();
  const free = [...scan.free];
  let n = 0;
  for (const { r, v } of scan.records) {
    if (
      b.cols.last != null &&
      b.cols.first != null &&
      !isPersonRow(cellText(v.last), cellText(v.first), cellText(v.father))
    )
      continue;
    n++;
    const m = match(v);
    let pid = m.pid;
    // Namesakes: the row is of the one who belongs to this list (e.g. the only one with a post). If several belong,
    // we do not know whose it is: it is not touched, none is written again as new. If none belongs, it is deleted.
    if (m.alts) {
      const mine = m.alts.filter((p) => w.upd.has(p.id) && !w.drop.has(p.id) && !placed.has(p.id));
      if (mine.length === 1) pid = mine[0].id;
      else if (mine.length || !m.alts.every((p) => w.drop.has(p.id))) {
        m.alts.forEach((p) => placed.add(p.id));
        (plan.ambiguous = plan.ambiguous || []).push(r);
        continue;
      }
    }
    if (pid == null || placed.has(pid)) {
      plan.foreign++;
      continue;
    }
    placed.add(pid);
    if (w.drop.has(pid)) {
      const row = rows[r] || [];
      for (let c = scan.width[0]; c <= scan.width[1]; c++)
        if (c !== b.cols.aa && cellText(row[c]) !== '') plan.sets.push({ r, c, v: null });
      free.push(r);
      plan.cleared++;
      continue;
    }
    const u = w.upd.get(pid);
    if (!u) continue;
    let ch = false;
    for (const [k, val] of Object.entries(u))
      if (b.cols[k] != null && !eq(k, v[k], val)) {
        plan.sets.push({ r, c: b.cols[k], v: val });
        ch = true;
      }
    if (ch) plan.changed++;
  }
  free.sort((a, c) => a - c);
  const fresh = [...w.add.keys()]
    .filter((pid) => !placed.has(pid) && pm.has(pid))
    .sort(
      (a, c) =>
        collator.compare(pm.get(a)!.last, pm.get(c)!.last) || collator.compare(pm.get(a)!.first, pm.get(c)!.first),
    );
  const put = (r: number, pid: number) => {
    const p = pm.get(pid)!;
    const vals = w.add.get(pid)!;
    for (const [k, c] of Object.entries(b.cols)) {
      if (k === 'aa') continue;
      const val = PERSON_KEYS.includes(k) ? personField(k, p, b) : vals[k];
      if (val != null) plan.sets.push({ r, c, v: val });
    }
  };
  const aa = (r: number, i: number) => {
    if (b.cols.aa != null && cellText((rows[r] || [])[b.cols.aa]) === '') plan.sets.push({ r, c: b.cols.aa, v: i });
  };
  n -= plan.cleared;
  let i = 0;
  for (; i < fresh.length && i < free.length; i++) {
    put(free[i], fresh[i]);
    aa(free[i], ++n);
  }
  const rest = fresh.slice(i);
  const after = Math.max(scan.end, b.header);
  if (rest.length && sideBy(sheet, b, after))
    plan.warn = [
      noRoomTxt(
        b.sheet,
        rest.map((pid) => fullName(pm.get(pid)!)),
      ),
    ];
  else if (rest.length) {
    const tpl = scan.records.length
      ? scan.records[scan.records.length - 1].r
      : scan.free.length
        ? scan.free[0]
        : b.header;
    plan.insert = { after, n: rest.length, tpl };
    rest.forEach((pid, j) => {
      const r = after + 1 + j;
      put(r, pid);
      if (b.cols.aa != null) plan.sets.push({ r, c: b.cols.aa, v: ++n });
    });
  }
  plan.added = fresh.length - (plan.warn ? rest.length : 0);
  return plan;
}
/** Posts: one person per post; whoever has no post any more leaves the sheet. */
export function planPostsWrite(sheet: RawSheet, b: SourceBinding, s: AppState): SourcePlan {
  const w: ListWant = { upd: new Map(), add: new Map(), drop: new Set() };
  for (const p of s.people) {
    if (p.post) {
      w.upd.set(p.id, { post: p.post });
      if (p.active) w.add.set(p.id, { post: p.post });
    } else w.drop.add(p.id);
  }
  return planList(sheet, b, s, w);
}
/**
 * Out of strength: those who went out of strength with a reason (from the sheet or the app); whoever returned to
 * strength leaves the sheet.
 */
export function planOutsideWrite(sheet: RawSheet, b: SourceBinding, s: AppState): SourcePlan {
  const w: ListWant = { upd: new Map(), add: new Map(), drop: new Set() };
  for (const p of s.people) {
    if (!p.active && p.notes.startsWith(OUT_NOTE)) {
      const why = p.notes.slice(OUT_NOTE.length).replace(/^:\s*/, '');
      const v = { remarks: why || null };
      w.upd.set(p.id, v);
      w.add.set(p.id, v);
    } else if (p.active) w.drop.add(p.id);
  }
  return planList(sheet, b, s, w);
}
/**
 * Capability of duties: «-» where the app says «does not do it», empty where it explicitly says «does it». A new row
 * for whoever got an obstacle in the app. The automatic obstacles (post, Σ.Ι.) are not written, as in your own sheet.
 */
export function planCapsWrite(sheet: RawSheet, b: SourceBinding, s: AppState): SourcePlan {
  const w: ListWant = { upd: new Map(), add: new Map(), drop: new Set() };
  const cols = capKeys(b, s.settings);
  const active = new Set(s.people.filter((p) => p.active).map((p) => p.id));
  for (const [id, c] of Object.entries(s.caps)) {
    const pid = Number(id);
    const u: Record<string, WVal> = {};
    let no = false;
    let why = '';
    for (const k of cols)
      if (k in c) {
        u[k] = typeof c[k] === 'string' ? '-' : null;
        if (typeof c[k] === 'string') {
          no = true;
          why = why || String(c[k]);
        }
      }
    if (!Object.keys(u).length) continue;
    w.upd.set(pid, u);
    if (no && active.has(pid)) w.add.set(pid, { ...u, capnote: why.replace(/^Από Excel:?\s*/, '') || null });
  }
  return planList(sheet, b, s, w, (k, cell, v) =>
    (cols as string[]).includes(k) ? capNo(cellText(cell)) === (v === '-') : same(cell, v),
  );
}
