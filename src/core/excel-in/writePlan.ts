// Writing the statuses of the app into the Ίλη's Excel (punishments, medical, hospital, ΣΤΕΠ, leave, ΔΝ).
//
// Purpose: `planWrite` (cells to set, rows to clear, rows to insert for one status kind), `fieldValue` (the value of
//   a column for a status), `wanted` (the records that belong in the file) and `newHeader`.
// Does NOT: write the file (src/main/sources.ts applies the plan with src/main/xlsx.ts) or compare the two sides
//   (statusDiff.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/people, core/statuses,
//   core/excel-in/statusDiff, core/excel-in/tableRows.
// Why: the Excel is the sergeant's; the app writes only what it must: a cell is set only when it differs, a row the
//   app does not know is never touched, and a row the app wrote earlier is cleared only when its record was deleted.
// Covering tests: test/sources.test.ts, test/write-group.test.ts, test/insert-rows.test.ts,
//   test/note-only-excel.test.ts.
import type { ISODate } from '../lib/dates';
import { collator, upper } from '../lib/text';
import { fatherTxt, fullName, type Person } from '../model/person';
import { TYPES, type Status } from '../model/status';
import type { AppState } from '../model/state';
import type { CellValue, RawSheet } from './roster';
import { medNote, medNoteXl } from '../people/kinds';
import { cellTime } from '../statuses/hours';
import type { SourceBinding, ListKind } from '../model/bindings';
import { cellText, parseDate } from './cellText';
import { type StatusKind, KIND, TIME_FIELDS, fieldsOf } from './fields';
import { makeMatcher } from './peopleMatch';
import { statusId, identity, subOf } from './statusDiff';
import { typeOfValue, DEFAULT_TYPE } from './statusesIn';
import { tableRows } from './tableRows';
import { type WritePlan, same, sideBy, noRoomTxt, type WVal, rankCell, nameCell, num } from './writeCells';

/**
 * The value of a field for a status of the app (`st`, of the person `p`), as it is written in the cell of the column
 * `k`.
 */
export function fieldValue(
  k: string,
  kind: StatusKind,
  st: Status,
  p: Person | undefined,
  b?: { cols: Record<string, number> },
): WVal {
  switch (k) {
    case 'rank':
      return p ? rankCell(p, b) : null;
    case 'origin':
      return p?.origin || null;
    case 'spec':
      return p?.spec || null;
    case 'last':
      return p?.last || null;
    case 'first':
      return p ? p.first + (b && b.cols.father == null && b.cols.name == null ? fatherTxt(p) : '') || null : null;
    case 'name':
      return p ? nameCell(p, b) : null;
    case 'father':
      return p?.father || null;
    case 'asm':
      return p?.asm ? num(p.asm) : null;
    case 'phone':
      return p?.phone ? num(p.phone) : null;
    case 'room':
      return p?.room ?? null;
    case 'from':
      return { date: st.from };
    case 'to':
      return st.open ? null : { date: st.to };
    case 'days':
      return st.open ? null : st.days || Math.round((Date.parse(st.to) - Date.parse(st.from)) / 86400000) + 1; // deprivation of out: the days of the punishment
    case 'kind':
      return kind === 'medical'
        ? st.kind || TYPES[st.type].label
        : kind === 'leave'
          ? st.kind || (st.type === 'HON' ? 'ΤΙΜΗΤΙΚΗ' : 'ΚΑΝΟΝΙΚΗ')
          : kind === 'punish'
            ? st.kind
              ? upper(st.kind)
              : null
            : st.kind || null;
    case 'where':
      return st.kind || (st.type === 'SICK' ? 'ΑΝ.ΑΔ' : 'ΝΟΣΟΚΟΜΕΙΟ');
    case 'note':
      return st.note || null;
    case 'tout':
      return st.fromTime || null;
    case 'tin':
      return st.open ? null : st.toTime || null;
    case 'dest':
      return st.dest || null;
    case 'by':
      return st.by || null;
    case 'reason':
      return st.reason || null;
    default:
      return null;
  }
}
/**
 * The records of the app that belong to this Excel: of the kind, of a known person, approved, and (with the scope
 * «active») not expired; the ones kept only as a note are left out. Sorted by start date, then by surname.
 */
export function wanted(kind: StatusKind, s: AppState, b: SourceBinding, today: ISODate): Status[] {
  const types = KIND[kind].types!;
  const pm = new Map(s.people.map((p) => [p.id, p]));
  // a punishment still being requested is not «punished»: it goes into the Excel when it is approved
  const lists = s.settings.lists;
  return s.statuses
    .filter(
      (x) =>
        types.includes(x.type) &&
        pm.has(x.pid) &&
        !x.pending &&
        (b.scope !== 'active' || x.to >= today) &&
        !(medNote(x, lists) && !medNoteXl(x, lists)),
    )
    .sort((a, b2) => a.from.localeCompare(b2.from) || collator.compare(pm.get(a.pid)!.last, pm.get(b2.pid)!.last));
}
/** A new table: the headers (and the title above) when the header row is empty; an empty list otherwise. */
export function newHeader(
  kind: ListKind,
  rows: CellValue[][],
  b: SourceBinding,
  title = KIND[kind].title,
): WritePlan['header'] {
  if ((rows[b.header] || []).some((v) => cellText(v))) return [];
  const defs = fieldsOf(kind);
  const out: WritePlan['header'] = [];
  for (const [k, c] of Object.entries(b.cols)) out.push({ r: b.header, c, v: defs.find((f) => f.k === k)?.head || k });
  if (b.header > 0 && !(rows[b.header - 1] || []).some((v) => cellText(v)))
    out.push({ r: b.header - 1, c: Math.min(...Object.values(b.cols)), v: title, title: true });
  return out;
}
/**
 * What changes on the sheet so that it has what the app has. It does not touch rows it does not know (written by hand
 * and not yet in the app): only the ones that match a record of the app or that the app wrote earlier (`synced`).
 */
export function planWrite(
  kind: StatusKind,
  sheet: RawSheet | null,
  b: SourceBinding,
  s: AppState,
  synced: string[],
  today: ISODate,
): WritePlan {
  const plan: WritePlan = {
    sets: [],
    insert: null,
    header: [],
    keys: [],
    added: 0,
    changed: 0,
    cleared: 0,
    foreign: 0,
  };
  const pm = new Map(s.people.map((p) => [p.id, p]));
  const want = wanted(kind, s, b, today);
  const rows = sheet?.rows || [];
  const fields = Object.keys(b.cols).filter((k) => k !== 'aa');
  plan.header = newHeader(kind, rows, b);
  const scan = sheet
    ? tableRows(sheet, b.header, b.cols)
    : { records: [], free: [], end: b.header, open: true, width: [0, 0] as [number, number], partial: [] };
  const match = makeMatcher(s.people);
  const byId = new Map(want.map((x) => [statusId(kind, x), x]));
  // «Μόνο σημείωση» without «στο Excel»: a row written by hand stays, it is not cleared as «written by the app»
  const quiet = new Set(
    s.statuses
      .filter(
        (x) => KIND[kind].types!.includes(x.type) && medNote(x, s.settings.lists) && !medNoteXl(x, s.settings.lists),
      )
      .map((x) => statusId(kind, x)),
  );
  const syncedSet = new Set(synced);
  const placed = new Set<string>();
  const hold = new Set<number>();
  const free = [...scan.free];
  const clearRow = (r: number) => {
    const row = rows[r] || [];
    for (let c = scan.width[0]; c <= scan.width[1]; c++)
      if (c !== b.cols.aa && cellText(row[c]) !== '') plan.sets.push({ r, c, v: null });
  };
  for (const { r, v } of scan.records) {
    const m = match(v);
    const from = parseDate(v.from);
    const raw = cellText(v.kind);
    const type = typeOfValue(kind, raw, b.values, s.settings.lists) || DEFAULT_TYPE[kind];
    const idOf = (pid: number) => identity(pid, kind, from!, subOf(kind, raw || TYPES[type].label));
    let id = m.pid != null && from ? idOf(m.pid) : null;
    // namesakes: the row is of the one who has a record with the same start. If more than one has it, we do not know
    // whose it is: it is not written, and it does not come in again as new for any of them
    if (m.alts && from) {
      const hits = m.alts.map((p) => idOf(p.id)).filter((x) => byId.has(x) && !placed.has(x));
      if (hits.length > 1) {
        hits.forEach((x) => {
          placed.add(x);
          plan.keys.push(x);
        });
        (plan.ambiguous = plan.ambiguous || []).push(r);
        continue;
      }
      if (hits.length === 1) id = hits[0];
      else id = m.alts.map((p) => idOf(p.id)).find((x) => syncedSet.has(x) && !byId.has(x)) || id;
      // several active and none has a record with this start: the row is one of theirs, we do not know whose
      if (m.pid == null && !id) {
        m.alts.forEach((p) => hold.add(p.id));
        (plan.ambiguous = plan.ambiguous || []).push(r);
        continue;
      }
    }
    const st = id ? byId.get(id) : undefined;
    if (st && !placed.has(id!)) {
      placed.add(id!);
      plan.keys.push(id!);
      let ch = false;
      for (const k of fields) {
        if (['rank', 'origin', 'spec', 'last', 'first', 'name', 'father', 'asm', 'phone', 'room'].includes(k)) continue; // the details of the person are kept by the Excel
        if (st.open && (k === 'to' || k === 'days' || k === 'tin')) continue; // no end: the app does not touch the «έως» of the Excel
        const val = fieldValue(k, kind, st, pm.get(st.pid), b);
        if (TIME_FIELDS.includes(k) ? cellTime(v[k]) !== val : !same(v[k], val)) {
          plan.sets.push({ r, c: b.cols[k], v: val });
          ch = true;
        }
      }
      if (ch) plan.changed++;
    } else if (id && syncedSet.has(id) && !byId.has(id) && !quiet.has(id)) {
      clearRow(r);
      free.push(r);
      plan.cleared++;
    } // it was written by the app and was deleted
    else plan.foreign++;
  }
  free.sort((a, c) => a - c);
  const fresh = want.filter((x) => !placed.has(statusId(kind, x)) && !hold.has(x.pid));
  const put = (r: number, st: Status) => {
    for (const k of fields) {
      const val = fieldValue(k, kind, st, pm.get(st.pid), b);
      if (val != null) plan.sets.push({ r, c: b.cols[k], v: val });
    }
  };
  // Α/Α: the serial number in the rows that do not have it
  const aa = (r: number, n: number) => {
    if (b.cols.aa != null && cellText((rows[r] || [])[b.cols.aa]) === '') plan.sets.push({ r, c: b.cols.aa, v: n });
  };
  let n = scan.records.length - plan.cleared;
  let i = 0;
  for (; i < fresh.length && i < free.length; i++) {
    put(free[i], fresh[i]);
    aa(free[i], ++n);
    plan.keys.push(statusId(kind, fresh[i]));
  }
  const rest = fresh.slice(i);
  const after = Math.max(scan.end, b.header);
  if (rest.length && sideBy(sheet, b, after))
    plan.warn = [
      noRoomTxt(
        b.sheet,
        rest.map((st) => (pm.get(st.pid) ? fullName(pm.get(st.pid)!) : '?')),
      ),
    ];
  else if (rest.length) {
    const tpl = scan.records.length
      ? scan.records[scan.records.length - 1].r
      : scan.free.length
        ? scan.free[0]
        : b.header;
    plan.insert = { after, n: rest.length, tpl };
    rest.forEach((st, j) => {
      const r = after + 1 + j;
      put(r, st);
      if (b.cols.aa != null) plan.sets.push({ r, c: b.cols.aa, v: ++n });
      plan.keys.push(statusId(kind, st));
    });
  }
  plan.added = fresh.length - (plan.warn ? rest.length : 0);
  return plan;
}
