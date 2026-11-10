// Fills the ΦΡΟΥΡΑ (services form of the day).
//
// Purpose: `fillFroura` (ΦΡΟΥΡΑ ΣΒΕΝ, specimen 01, and ΦΡΟΥΡΑ ΣΠΕΝ, photo of the clerk), `punishedOn` and `absentOn`
//   (the lists under the tables) and the private `rowsN`.
// Does NOT: sign the sheet (sign.ts) or choose the seats (frouraSeats.ts, frouraTables.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: the form takes an empty template and returns the filled file; it moved verbatim from src/main/exports.ts (Phase
//   4.9a). `fillFroura` is longer than 80 lines and stays one function in this PR.
// Covering test: test/exports.test.ts, test/shifts.test.ts, test/own-phases.test.ts, test/service-edit.test.ts and the
//   golden hashes of `npm run bench:golden`.
import { dm, dmy, type ISODate } from '../../../shared/dates';
import { norm } from '../../../shared/text';
import { backBy } from '../../../shared/hours';
import { byName } from '../../../shared/hkaiText';
import {
  TYPES,
  DEFAULT_DUTY_START,
  blocksOf,
  coversDay,
  dutyStartOf,
  frouraFile,
  hasShift,
  phaseBase,
  phaseName,
  PHASE_NAME,
  type AppState,
  type Phase,
  type Post,
  type Status,
} from '../../../shared/domain';
import { isAway } from '../../../shared/ranks';
import { seatMap, dutyMin, postBy, postsOf } from '../../../shared/rules';
import { Workbook, colName } from '../excel/xlsx';
import { absenceOf, dutyName, frouraLayout, frouraTables, lyLine, type TableCols } from '../../../shared/froura';
import { mapFroura, tnorm, type FList, type FTable, type TCell } from '../../tplmap';
import type { Sig } from '../../../shared/sigs';
import { blockOf } from '../../layout';
import type { ExportResult } from './types';
import { titleDate, withDate, refOf, headCells, sheetWith, unitWords } from './common';
import { signSheets } from './sign';
import { frouraTablesInto } from './frouraTables';
import { seatFroura, extendFroura } from './frouraSeats';

/** The penalties (status PUN, not pending) that cover day `d`: the "ΤΙΜΩΡΗΜΕΝΟΙ" of the ΦΡΟΥΡΑ. */
export function punishedOn(s: AppState, d: ISODate): Status[] {
  return s.statuses.filter((x) => x.type === 'PUN' && !x.pending && coversDay(x, d));
}

/**
 * The absentees of the services form on day `d`: leaves, sick leaves, hospital (not the outs), without anyone who is
 * back before the duty hour.
 */
export function absentOn(s: AppState, d: ISODate): Status[] {
  // absentees of the services form: leaves, sick leaves, hospital (not the outs); not anyone back by 14:00
  return s.statuses.filter(
    (x) =>
      isAway(x, s.settings.lists) &&
      TYPES[x.type].cat !== 'out' &&
      coversDay(x, d) &&
      !backBy(x, d, dutyMin(s.settings)),
  );
}

/**
 * Fills the ΦΡΟΥΡΑ form (ΣΒΕΝ: specimen 01; ΣΠΕΝ: photo of the clerk) for day `d`. `sheet`: the sheet of the template
 * (Αρχεία Excel); empty = the one with the "ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ" (or the tables). Every item is written where the
 * template has it (tplmap.ts): heading, title, Λ/Υ, Δ/Υ, tables, punished and absent.
 */
export async function fillFroura(
  tpl: Buffer,
  s: AppState,
  d: ISODate,
  phase: Phase = s.settings.phase || 'sven',
  sheet?: string,
  sigs?: Sig[] | null,
): Promise<ExportResult> {
  // the columns widen as needed: the form prints on one page (fitToPage), just a little smaller
  const wb = await Workbook.open(tpl);
  wb.widen = true;
  await unitWords(wb, s);
  const name = await sheetWith(wb, sheet, /^ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ|^ΘΑΛΑΜΟΦΥΛΑΚ|^ΦΡΟΥΡΑ/);
  const ws = await wb.sheet(name);
  const pm = seatMap(s);
  const warnings: string[] = [];
  const blocks = blocksOf(s.settings, phase);
  const ownNames: Record<string, string> = {};
  for (const b of blocks)
    if (b.custom || !['ly', 'th', 'op', 'mg', 'sk', 'tae'].includes(b.kind)) ownNames[tnorm(b.name)] = 'b:' + b.id;
  let vals = await wb.values(name, 400, 40);
  const raw = (c: TCell) => String(vals[c.r - 1]?.[c.c - 1] ?? '');
  let map = mapFroura(vals, ws.merges(), ownNames);
  const g = s.guards[d] || {};
  const posts = postsOf(s.settings);
  const custom = new Set(blocks.filter((b) => b.custom).map((b) => b.id));
  let seated = seatFroura(map, posts, custom);
  // numbers beyond the boxes of the template: the table grows downwards and is read again (Michael, 4/11)
  let stretched = new Set<string>();
  const ext = seated.over.size ? extendFroura(wb, ws, map, seated.over) : null;
  if (ext?.rows) {
    stretched = ext.stretched;
    vals = await wb.values(name, 400, 40);
    map = mapFroura(vals, ws.merges(), ownNames);
    seated = seatFroura(map, posts, custom);
  }
  const seats = seated.seats;
  // rows that get inserted (in rows of the template): down() = where a row of the template went
  const ins: { after: number; n: number }[] = [];
  const down = (r: number) => r + ins.filter((x) => x.after < r).reduce((a, x) => a + x.n, 0);
  const insert = (after: number, n: number, tpl0 = after) => {
    if (n <= 0) return;
    ws.insertRows(down(after), n, down(tpl0), wb);
    ins.push({ after, n });
  };
  // numbers with another count of shifts: in side-by-side ΩΡΕΣ tables with the same rows, rows are inserted inside the
  // box (name, Α/Α, ΠΑΡ/ΣΕΙΣ grow together) or the surplus ones are hidden; else the hours fit the rows they have
  const allNums = map.tables.flatMap((t) => t.nums);
  const rowsOf = new Map<number, { h: number; aligned: boolean; need: number | null }>();
  for (const t of map.tables)
    for (const n of t.nums) {
      if (rowsOf.has(n.r)) continue;
      const touch = allNums.filter((m) => m.r <= n.r + n.h - 1 && m.r + m.h - 1 >= n.r);
      rowsOf.set(n.r, { h: n.h, aligned: touch.every((m) => m.r === n.r && m.h === n.h), need: null });
    }
  const shiftsOwn = (id: string) =>
    dutyStartOf(s.settings) !== DEFAULT_DUTY_START || hasShift(blocks.find((b) => b.id === id)?.shift);
  // a number with no shift (slots null) in a service of the form: the hours of the template are erased, not kept
  const slotsOf = (x: Post) =>
    x.slots || (x.rot != null && hasShift(blocks.find((b) => b.id === x.block)?.shift) ? [] : null);
  for (const x of posts) {
    const st = seats.get(x.k);
    const sl = slotsOf(x);
    if (!st?.n || !st.t?.hours || !sl) continue;
    const k = rowsOf.get(st.n.r)!;
    k.need = Math.max(k.need || 1, sl.length);
  }
  const grow = [...rowsOf.entries()]
    .filter(([, k]) => k.aligned && k.need != null && k.need !== k.h)
    .sort((a, b) => a[0] - b[0]);
  for (const [r, k] of grow) if (k.need! > k.h) insert(k.h >= 2 ? r + k.h - 2 : r, k.need! - k.h);
  for (const [r, k] of grow) for (let j = k.need!; j < k.h; j++) ws.setRowHidden(down(r) + j);
  const at = (ref: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
    return m[1] + down(+m[2]);
  };
  // heading: in the cells of the template; if it has fewer rows, the rest go to the empty cells below (above the title)
  const head = headCells(map.head, map.title?.r ?? map.ly?.r ?? 0, (r, c) => ws.get(refOf(c, r)) != null);
  s.settings.unit.forEach((u, i) => {
    const h = head[i];
    if (h && (i < map.head.length || u)) ws.set(refOf(h.c, h.r), u);
  });
  if (map.title) ws.set(refOf(map.title.c, map.title.r), withDate(raw(map.title), titleDate(d, true)));
  else warnings.push('Το template δεν έχει τίτλο «ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ»: η ημερομηνία δεν γράφτηκε');
  const p = (k: string) => (g[k] ? pm.get(g[k]) : undefined);
  for (const [k, cell, l] of [
    ['ly', map.ly, 'Λ/Υ'],
    ['dy', map.dy, 'Δ/Υ'],
  ] as const) {
    if (!cell) {
      if (p(k)) warnings.push('Το template δεν έχει «' + l + ':»: ο ' + l + ' δεν γράφτηκε');
      continue;
    }
    const t = (raw(cell) || l + ':').replace(/\s+$/, '');
    const lab = t.includes(':') ? t.slice(0, t.indexOf(':') + 1) : t + ':';
    ws.set(refOf(cell.c, cell.r), lab + ' ' + (p(k) ? lyLine(p(k)!) : ''));
  }
  const pos: Record<string, string> = {};
  seats.forEach((st, k) => {
    pos[k] = st.ref;
  });
  const lay = frouraLayout(s, d, phase, pos);
  for (const k of lay.foreign) {
    const x = postBy(s, k);
    const off = x && blocks.find((b) => b.id === x.block)?.hidden;
    warnings.push(
      off
        ? 'Η υπηρεσία ' + x!.label + ' είναι ανενεργή (Ρυθμίσεις › Υπηρεσίες) και δεν γράφτηκε'
        : 'Η θέση ' + (x?.label || k) + ' δεν ανήκει στη ΦΡΟΥΡΑ ' + phaseName(s.settings, phase) + ' και δεν γράφτηκε',
    );
  }
  lay.cells.forEach((names, ref) => {
    if (names.length) ws.set(at(ref), names.join('\n'));
  });
  // hours of the numbers with shifts: in the ΩΡΕΣ column of the table, one row per shift. With the shifts of the form
  // (2 hours from 14:00) they stay as in the template, unless the template has them blank.
  const done = new Set<string>();
  for (const x of posts) {
    const st = seats.get(x.k);
    const sl = slotsOf(x);
    if (!st?.t?.hours || !st.n || !sl || done.has(st.ref)) continue;
    const k = rowsOf.get(st.n.r)!;
    const resized = k.aligned && k.need != null && k.need !== k.h;
    const blank = Array.from({ length: st.n.h }, (_, j) => ws.get(refOf(st.t!.hours!, down(st.n!.r) + j))).every(
      (v) => v == null || !String(v).trim(),
    );
    if (!shiftsOwn(x.block) && !resized && !blank && !stretched.has(st.t.hr + ':' + st.t.name)) continue;
    done.add(st.ref);
    const n = resized ? k.need! : st.n.h;
    const hs = resized || sl.length <= n ? Array.from({ length: n }, (_, j) => sl[j] || '') : rowsN(sl, n);
    hs.forEach((h, j) => ws.set(refOf(st.t!.hours!, down(st.n!.r) + j), h));
  }
  // own services with no place in the template: tables under the tables of the form, in the columns of the first two
  const firstRow = map.tables.length ? Math.min(...map.tables.map((t) => t.hr)) : 0;
  const lr = map.tables.filter((t) => t.hr === firstRow).sort((a, b) => a.name - b.name);
  const colsOf = (t: FTable): TableCols => {
    const aa = t.aa ?? Math.max(1, t.name - 1);
    const name = t.aa == null && t.name === aa ? t.name + 1 : t.name;
    const hours = t.hours ?? t.note ?? name + 1;
    return {
      aa: colName(aa),
      name: colName(name),
      hours: colName(hours),
      note: colName(t.hours == null ? hours + (t.note == null ? 0 : 1) : (t.note ?? hours + 1)),
    };
  };
  const left = lr[0] ? colsOf(lr[0]) : { aa: 'B', name: 'C', hours: 'D', note: 'E' };
  const right = lr[1] ? colsOf(lr[1]) : null;
  const look = lr[0]
    ? (() => {
        const r = down(lr[0].nums[0].r);
        return { aa: left.aa + r, name: left.name + r, hours: left.hours + r, note: left.note + r };
      })()
    : null;
  const after =
    map.bottom || Math.max(map.dy?.r || 0, map.ly?.r || 0, map.title?.r || 0, ...map.head.map((h) => h.r)) + 1;
  const tabs = frouraTables(s, lay, phase);
  const added = frouraTablesInto(wb, ws, { after: down(after), look, left, right }, tabs);
  if (added) ins.push({ after, n: added });
  // punished and absent: in the columns of their table; those that do not fit the ready rows get new ones (numbered)
  const pun = punishedOn(s, d)
    .map((x) => ({ x, p: pm.get(x.pid)! }))
    .filter((y) => y.p)
    .sort((a, b) => byName(a.p, b.p));
  const abs = absentOn(s, d)
    .map((x) => ({ x, p: pm.get(x.pid)! }))
    .filter((y) => y.p)
    .sort((a, b) => byName(a.p, b.p));
  const lists: { l: FList; rows: { name: string; kind: string; from: string; to: string; note: string }[] }[] = [];
  for (const [l, data, what] of [
    [map.pun, pun, 'ΤΙΜΩΡΗΜΕΝΟΙ'],
    [map.abs, abs, 'ΑΠΟΝΤΕΣ'],
  ] as const) {
    const rows = data.map(({ x, p: q }) => ({
      name: dutyName(q),
      kind: what === 'ΤΙΜΩΡΗΜΕΝΟΙ' ? norm(x.kind || 'Ποινή') : absenceOf(x),
      from: dm(x.from),
      to: x.open ? '' : dm(x.to),
      note: x.note || '',
    }));
    if (l) lists.push({ l, rows });
    else if (rows.length)
      warnings.push('Το template δεν έχει πίνακα «' + what + '»: ' + rows.length + ' δεν γράφτηκαν');
  }
  const byFirst = [...new Set(lists.map((x) => x.l.first))].sort((a, b) => a - b);
  for (const f of byFirst) {
    const grp = lists.filter((x) => x.l.first === f);
    const ready = Math.min(...grp.map((x) => x.l.ready));
    const need = Math.max(...grp.map((x) => x.rows.length));
    const top = down(f);
    if (need > ready) insert(f + ready - 1, need - ready);
    for (let i = 0; i < Math.max(need, ready); i++) {
      const r = top + i;
      for (const { l, rows } of grp) {
        const c = l.cols;
        const set = (cc: number | undefined, v: string | number) => {
          if (cc != null && !ws.hasFormula(refOf(cc, r))) ws.set(refOf(cc, r), v);
        };
        if (i < Math.max(need, l.ready)) set(c.aa, i + 1);
        const x = rows[i];
        if (!x) continue;
        set(c.name, x.name);
        set(c.kind, x.kind);
        set(c.from, x.from);
        set(c.to, x.to);
        set(c.note, x.note);
      }
    }
  }
  // a services form of the user: the sheet of the template ("ΦΡΟΥΡΑ ΣΒΕΝ") takes its name
  const base = phaseBase(s.settings, phase);
  const shName =
    base !== phase && name === 'ΦΡΟΥΡΑ ' + PHASE_NAME[base]
      ? wb.renameSheet(name, 'ΦΡΟΥΡΑ ' + phaseName(s.settings, phase))
      : name;
  const headRefs = head
    .slice(0, Math.max(map.head.length, s.settings.unit.filter(Boolean).length))
    .map((h) => refOf(h.c, h.r));
  const layout = await signSheets(
    wb,
    [{ ws, key: 'main', more: [blockOf(ws, 'head', headRefs)] }],
    s,
    'froura',
    sigs,
    warnings,
  );
  return {
    name: frouraFile(s.settings, phase) + dmy(d).replace(/\//g, '-') + '.xlsx',
    data: await wb.save(),
    warnings,
    layout,
    sheet: shName,
  };
}

/** Shifts in `n` rows: fewer leave blank, more are joined ("14:00-16:00 · 22:00-00:00"). */
function rowsN(sl: string[], n: number): string[] {
  if (sl.length <= n) return Array.from({ length: n }, (_, i) => sl[i] || '');
  const k = Math.ceil(sl.length / n);
  return Array.from({ length: n }, (_, i) => sl.slice(i * k, i * k + k).join(' · '));
}
