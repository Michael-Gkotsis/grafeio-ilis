// Personnel: corrections written back to the roster «Δυναμολόγιο».
//
// Purpose: `planPeopleWrite` (the cells that changed in the app since the last read or write, the rows of new
//   soldiers, the rows to empty or delete, the Α/Α renumbering, the ranges of the formulas that grow).
// Does NOT: write the file (src/main/sources.ts does), build a new roster (newRoster.ts) or write the ΘΑΛΑΜΟΙ sheet
//   (rooms.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/people,
//   core/excel-in/peopleSnap, core/excel-in/peopleSlot, core/excel-in/writeCells, core/excel-in/rowInsert.
// Why: the sergeant keeps one roster and the app must never replace it: a correction is written only on the row of
//   the same person (by ΑΣΜ, else name and father's name), a namesake's row is left alone, and the totals below the
//   table stay where they were.
// Covering tests: test/roster-sync.test.ts, test/new-soldier.test.ts, test/insert-rows.test.ts,
//   test/personal-excel.test.ts.
import { normGreek } from '../lib/text';
import { fullName, type Person } from '../model/person';
import type { AppState } from '../model/state';
import { isPersonRow } from './rosterColumns';
import type { RawSheet } from './roster';
import { PKEYS, type PKey } from '../people/personal';
import type { SourceBinding } from '../model/bindings';
import { cellText } from './cellText';
import { key2 } from './peopleMatch';
import { byNameCmp, slotOf } from './peopleSlot';
import { type PersonSnap, type PeoplePlan, personVals, PEOPLE_SYNC, outVal } from './peopleSnap';
import { type RowInsert, placeRows } from './rowInsert';
import { tableRows, type TableRow } from './tableRows';
import { type WVal, same, sideBy, noRoomTxt, nameCell } from './writeCells';

/**
 * Writes back to the roster what changed in the app since the last read or write (`snap`), on the row of the same
 * person.
 * Rows are not deleted: the roster stays the sergeant's list. The only exception is the «Νέος στρατιώτης» of the app:
 * he goes into a new row below the last one (`added` = the rows the app added), and if that is undone, his row is
 * emptied.
 */
export function planPeopleWrite(
  sheet: RawSheet,
  b: SourceBinding,
  s: AppState,
  snap: Record<number, PersonSnap>,
  keys: string[] = [],
): PeoplePlan {
  const plan: PeoplePlan = {
    sets: [],
    changed: 0,
    notFound: [],
    snap: { ...snap },
    inserts: [],
    deletes: [],
    added: 0,
    cleared: 0,
    keys: [],
    grow: null,
    fresh: [],
    gone: [],
  };
  const scan = tableRows(sheet, b.header, b.cols);
  const byAsm = new Map<string, TableRow>(),
    byName = new Map<string, TableRow[]>();
  for (const row of scan.records) {
    const asm = cellText(row.v.asm).replace(/\s/g, '');
    if (asm) byAsm.set(asm, row);
    const k = key2(cellText(row.v.last), cellText(row.v.first));
    const l = byName.get(k) || [];
    l.push(row);
    byName.set(k, l);
  }
  const find = (v: PersonSnap): TableRow | undefined => {
    if (v.asm && byAsm.has(v.asm)) return byAsm.get(v.asm);
    const l = byName.get(key2(v.last, v.first)) || [];
    return l.length === 1 ? l[0] : l.find((x) => normGreek(cellText(x.v.father)) === normGreek(v.father));
  };
  const orig: { r: number; c: number; v: WVal }[] = []; // in the rows of the sheet as it is now
  const pm = new Map(s.people.map((p) => [p.id, p]));
  for (const p of s.people) {
    const old = snap[p.id];
    if (!old) continue;
    const cur = personVals(p, b);
    // an empty value clears no cell, except ΔΝ, remarks (there «no» is empty) and IBAN/ΑΜΚΑ/ΑΦΜ (cleared on the card)
    const diff = PEOPLE_SYNC.filter(
      (k) =>
        b.cols[k] != null &&
        cur[k] !== (old[k] || '') &&
        (cur[k] !== '' || PKEYS.includes(k as PKey) || ((k === 'dn' || k === 'remarks' || k === 'origin') && p.active)),
    );
    if (!diff.length) continue;
    const row = find(old) || find(cur);
    if (!row) {
      plan.notFound.push(fullName(p));
      continue;
    }
    let ch = false;
    for (const k of diff) {
      const v = outVal(k, cur, p, b);
      if (!same(row.v[k], v)) {
        orig.push({ r: row.r, c: b.cols[k], v });
        ch = true;
      }
    }
    if (ch) plan.changed++;
    plan.snap[p.id] = cur;
  }
  const people = scan.records.filter(
    (x) =>
      b.cols.last == null ||
      b.cols.first == null ||
      isPersonRow(cellText(x.v.last), cellText(x.v.first), cellText(x.v.father)),
  );
  const last = people.length ? people[people.length - 1].r : b.header;
  const blank = (r: number) => !(sheet.rows[r] || []).some((v) => cellText(v));
  // a new one who was undone (no longer in the app): the row the app gave him goes (at the end of the table it is
  // only emptied, so the totals below stay where they were)
  const dels: number[] = [];
  for (const id of new Set(keys.map(Number))) {
    if (pm.has(id)) {
      plan.keys.push(String(id));
      continue;
    }
    const row = snap[id] && find(snap[id]);
    if (snap[id]) plan.gone.push(snap[id]);
    delete plan.snap[id];
    if (!row) continue;
    if (row.r === last && blank(row.r + 1)) {
      for (let c = scan.width[0]; c <= scan.width[1]; c++)
        if (c !== b.cols.aa && cellText((sheet.rows[row.r] || [])[c]) !== '') orig.push({ r: row.r, c, v: null });
    } else dels.push(row.r);
    plan.cleared++;
  }
  // new ones from the app that are not in the sheet yet
  // (the same only with the same ΑΣΜ, or the same full name and father's name with no other ΑΣΜ: not on the row of a namesake)
  const written = (v: PersonSnap) =>
    (v.asm && byAsm.get(v.asm)) ||
    (byName.get(key2(v.last, v.first)) || []).find(
      (x) => normGreek(cellText(x.v.father)) === normGreek(v.father) && (!v.asm || !cellText(x.v.asm)),
    );
  const fresh = s.people
    .filter((p) => p.added && p.active && !plan.snap[p.id])
    .filter((p) => {
      const cur = personVals(p, b);
      if (!written(cur)) return true;
      plan.snap[p.id] = cur;
      plan.keys.push(String(p.id));
      return false; // the sergeant already wrote him by hand
    })
    .sort(byNameCmp);
  // places: inside the table (in their room) or at the end
  const slots = new Map<number, { tpl: number; ps: Person[] }>();
  const atEnd: Person[] = [];
  // inside the table only if the new row does not cut a neighbouring table (else at the end, in an empty row if any)
  const side = (after: number) => sideBy(sheet, b, after);
  for (const p of fresh) {
    const x = slotOf(
      people.filter((y) => !dels.includes(y.r)),
      p,
      b.header,
    );
    if (!x || side(x.after)) {
      atEnd.push(p);
      continue;
    }
    const sl = slots.get(x.after) || { tpl: x.tpl, ps: [] };
    sl.ps.push(p);
    slots.set(x.after, sl);
  }
  // at the end: free rows below the last one; one empty row stays before what follows (totals, another table)
  const next = scan.records.find((x) => x.r > last)?.r ?? Infinity;
  const free = scan.free.filter((r) => r > last && r < next - 1).slice(0, atEnd.length);
  let rest = atEnd.slice(free.length);
  const ins: (RowInsert & { ps: Person[] })[] = [...slots].map(([after, x]) => ({
    after,
    n: x.ps.length,
    tpl: x.tpl,
    ps: x.ps,
  }));
  if (rest.length && side(free.length ? free[free.length - 1] : last)) {
    plan.warn = [noRoomTxt(b.sheet, rest.map(fullName))];
    rest = [];
  }
  if (rest.length)
    ins.push({
      after: free.length ? free[free.length - 1] : last,
      n: rest.length,
      tpl: people.length ? last : b.header,
      ps: rest,
    });
  ins.sort((x, y) => x.after - y.after);
  const { steps, fin, at } = placeRows(ins);
  plan.inserts = steps;
  // Α/Α: if the column counts 1, 2, 3… (almost everywhere), those below change number as the sergeant would change them
  const aaCol = b.cols.aa;
  const aaOf = (r: number) => {
    if (aaCol == null || sheet.fx?.has(r + ':' + aaCol)) return null;
    const t = cellText((sheet.rows[r] || [])[aaCol]);
    return /^\d+$/.test(t) ? Number(t) : null;
  };
  const seq =
    aaCol != null && people.length > 0 && people.filter((x, i) => aaOf(x.r) === i + 1).length >= people.length * 0.8;
  const newAbove = (r: number) =>
    ins.reduce((t, x) => t + (x.after < r ? x.n : 0), 0) + free.filter((f) => f < r).length;
  const delAbove = (r: number) => dels.filter((d) => d < r).length;
  if (seq)
    for (const x of people) {
      if (dels.includes(x.r)) continue;
      const a = aaOf(x.r);
      const d = newAbove(x.r) - delAbove(x.r);
      if (a != null && d) orig.push({ r: x.r, c: aaCol!, v: a + d });
    }
  plan.sets = orig.map((x) => ({ ...x, r: fin(x.r) }));
  // the details of the new ones
  let k = 0;
  const put = (r: number, p: Person, aa: number | null) => {
    const cur = personVals(p, b);
    for (const f of PEOPLE_SYNC)
      if (b.cols[f] != null && cur[f] !== '') plan.sets.push({ r, c: b.cols[f], v: outVal(f, cur, p, b) });
    if (b.cols.name != null) plan.sets.push({ r, c: b.cols.name, v: nameCell(p, b) });
    if (aa != null) plan.sets.push({ r, c: aaCol!, v: aa });
    plan.snap[p.id] = cur;
    plan.keys.push(String(p.id));
    plan.fresh.push(p.id);
    k++;
  };
  // the number of the j-th new one below row after: those above him + 1
  const aaAt = (after: number, j: number) =>
    aaCol == null
      ? null
      : seq
        ? people.filter((x) => x.r <= after && !dels.includes(x.r)).length +
          ins.reduce((t, x) => t + (x.after < after ? x.n : 0), 0) +
          free.filter((f) => f <= after).length +
          j +
          1
        : people.length + k + 1;
  const endRows: number[] = [];
  free.forEach((r, j) => {
    put(fin(r), atEnd[j], aaCol != null && cellText((sheet.rows[r] || [])[aaCol]) === '' ? aaAt(r - 1, 0) : null);
    endRows.push(fin(r));
  });
  ins.forEach((x, i) =>
    x.ps.forEach((p, j) => {
      put(at(i) + j, p, aaAt(x.after, j));
      if (x.ps === rest) endRows.push(at(i) + j);
    }),
  );
  plan.added = k;
  plan.deletes = dels.map(fin).sort((x, y) => y - x);
  const l1 = fin(last) + 1; // the last one, counted from 1
  if (people.length && endRows.length && endRows.every((r, j) => r === fin(last) + 1 + j))
    plan.grow = { from: b.header + 1, last: l1, to: l1 + endRows.length };
  return plan;
}
