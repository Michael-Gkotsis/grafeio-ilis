// Writes one sheet of the Εξοδούχοι "Όλη η δύναμη" into the table of the template.
//
// Purpose: `allSheet` (rows, styles, merges, heights, heading of the unit, place and date of one sheet).
// Does NOT: decide the lines (outsAllLines.ts) or pick the sheets (outsPlaces.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: it moved verbatim from src/main/exports.ts (Phase 4.9a). `allSheet` is longer than 80 lines and stays one
//   function in this PR.
// Covering test: test/outs-all.test.ts and the golden hashes of `npm run bench:golden`.
import { dmy, type ISODate } from '../../../shared/dates';
import { retNote, retTxt } from '../../../shared/returns';
import { outNoteOf, withNote } from '../../../shared/weekend';
import { norm } from '../../../shared/text';
import { fatherTxt, fullName, type AppState } from '../../../shared/domain';
import { live, rankTxt, statusLbl } from '../../../shared/ranks';
import { outMinOn, statusesFrom } from '../../../shared/rules';
import type { DayRow } from '../../../shared/outsDay';
import type { Workbook, Sheet } from '../excel/xlsx';
import { stayNote } from '../../../shared/outsStay';
import { mapOuts } from '../../tplmap';
import { statNoOut } from '../../../shared/stat';
import type { OutsLoc, AllLine } from './types';
import { who, refOf, headCells } from './common';
import { outsNote } from './outsNote';

/**
 * One sheet of the "Όλη η δύναμη": the lines `L` in the table of the template (`loc`), with the heading of the unit and
 * the place/date. Returns null when the headings of the table are not found.
 */
export async function allSheet(
  wb: Workbook,
  s: AppState,
  d: ISODate,
  loc: OutsLoc,
  L: AllLine[],
): Promise<{ ws: Sheet; headRefs: string[]; dateRef: string | null } | null> {
  const ws = await wb.sheet(loc.sheet);
  const vals = await wb.values(loc.sheet, 2000, 40);
  const m = mapOuts(vals, ws.merges(), s.settings.place, loc.from, loc.to);
  if (!m) return null;
  // the title, tables and heading of the template. Columns: its own and, on the right, ΓΥΡΝΑ (in Γ: ΓΙΑΤΙ ΜΕΝΕΙ)
  const raw = (c: { r: number; c: number }) => String(vals[c.r - 1]?.[c.c - 1] ?? '');
  const head = headCells(m.head, m.title?.r ?? m.hr, (r, c) => vals[r - 1]?.[c - 1] != null);
  const C = m.cols;
  const cols = Object.values(C);
  const c0 = Math.min(...cols);
  const tmg = m.title ? ws.mergeAt(refOf(m.title.c, m.title.r)) : null;
  const cLast = Math.max(...cols, tmg?.c2 ?? 0),
    cWhen = cLast + 1;
  // the heading of the unit above the last column goes above the new last one (right edge of the table)
  head.forEach((h) => {
    if (h.c === cLast) {
      const st = ws.style(refOf(h.c, h.r));
      ws.set(refOf(h.c, h.r), null);
      h.c = cWhen;
      if (st != null) ws.setStyle(refOf(h.c, h.r), st);
    }
  });
  s.settings.unit.forEach((u, i) => {
    const h = head[i];
    if (h && (i < m.head.length || u)) ws.set(refOf(h.c, h.r), u);
  });
  // row format from the template, before anything changes
  const look = (r: number) => {
    const o: Record<number, number | null> = {};
    for (let c = c0; c <= cLast; c++) o[c] = ws.style(refOf(c, r));
    return o;
  };
  const hts = {
    head: ws.rowHeight(m.hr),
    data: ws.rowHeight(m.first),
    title: m.title ? ws.rowHeight(m.title.r) : ws.rowHeight(m.hr),
  };
  const sTitle = look(m.title ? m.title.r : m.hr),
    sHead = look(m.hr),
    sData = look(m.first);
  const heads: Record<number, string> = {};
  for (let c = c0; c <= cLast; c++) if (vals[m.hr - 1]?.[c - 1] != null) heads[c] = raw({ r: m.hr, c });
  // new column: format of the neighbouring middle column (the template's last may have a border on one side only)
  const mid = (st: Record<number, number | null>) => (cLast > c0 ? st[cLast - 1] : st[cLast]) ?? st[cLast];
  type Look = Record<number, number | null>;
  const wide = (st: Look): Look => ({ ...st, [cWhen]: mid(st) ?? null });
  // the right border of the title goes to the new last column
  const wideTitle = (st: Look): Look => ({ ...st, [cLast]: mid(st) ?? st[cLast], [cWhen]: st[cLast] });
  const grey = async (st: Look): Promise<Look> => {
    const o = { ...st };
    for (const c of Object.keys(o).map(Number)) if (o[c] != null) o[c] = await wb.grayed(o[c]!);
    return o;
  };
  const left = async (st: Look): Promise<Look> => {
    const o = { ...st };
    for (const c of Object.keys(o).map(Number)) if (o[c] != null) o[c] = await wb.like(o[c]!, { h: 'left' });
    return o;
  };
  const S = {
    title: wideTitle(sTitle),
    banner: await grey(wideTitle(sTitle)),
    info: await left(wide(sData)),
    head: wide(sHead),
    row: wide(sData),
  };
  // ready rows of the first table (those with the format of the first, up to before the place)
  const stop = m.place ? m.place.r - 1 : loc.to;
  const s0 = ws.style(refOf(c0, m.first));
  let ready = 1;
  while (
    m.first + ready < stop &&
    ws.style(refOf(c0, m.first + ready)) === s0 &&
    s0 != null &&
    !cols.some((c) => {
      const x = ws.raw(refOf(c, m.first + ready));
      return x && x.inner && !x.inner.includes('<f');
    })
  )
    ready++;
  // lines: title (added above the heading if missing), those before the first heading, the first list, the rest
  const up = m.title ? 0 : 1;
  if (up) ws.insertRows(m.hr - 1, 1, m.hr, wb);
  const titleRow = m.title ? m.title.r : m.hr,
    H = m.hr + up,
    F = m.first + up;
  const h0 = L.findIndex((x) => x.k === 'head'),
    pre = h0 - 1;
  if (pre > 0) ws.insertRows(titleRow, pre, H, wb);
  const F2 = F + pre;
  let R0 = 0;
  while (L[h0 + 1 + R0]?.k === 'row') R0++;
  let gone = 0;
  for (let r = F2 + ready - 1; r >= F2 + R0; r--) {
    if (!ws.deleteRow(r, wb)) break;
    gone++;
  }
  const eff = Math.max(R0, ready - gone),
    n0 = eff - (ready - gone);
  if (n0 > 0) ws.insertRows(F2 + ready - gone - 1, n0, F2 + ready - gone - 1, wb);
  const e0 = F2 + eff - 1,
    E = L.length - (h0 + 1 + R0);
  ws.insertRows(e0, E, e0, wb);
  const placeRow = m.place ? m.place.r + up + pre - gone + n0 + E : 0;
  const rowOf = (i: number) => (i <= h0 + R0 ? titleRow + i : e0 + (i - h0 - R0));
  const put = (r: number, st: Look) => {
    for (let c = c0; c <= cWhen; c++) if (st[c] != null) ws.setStyle(refOf(c, r), st[c]!);
  };
  const titleC = m.title ? m.title.c : c0;
  if (tmg) ws.removeMerge(tmg);
  // Remarks: status (leave, ΔΝ, out) in the words of the other formats, the day's remark, the office's ΠΡΟΣΟΧΗ. In Γ
  // (not Γ4) statuses that do not cut the out (ΕΑ, ΕΟ...) are no "why he stays" (Michael, 2/11): they go here
  const stayOf = (x: DayRow) => statusesFrom(live(s), x.p.id, d, outMinOn(s, d));
  const notWhy = (x: DayRow) =>
    x.g[0] === 'G' && x.g !== 'G4'
      ? stayOf(x)
          .filter((y) => !statNoOut(y, s.settings.lists))
          .map((y) => statusLbl(y, s.settings.lists))
      : [];
  const noteOf = (x: DayRow) =>
    [
      x.lv
        ? x.st
          ? statusLbl(x.lv, s.settings.lists)
          : norm(withNote(statusLbl(x.lv, s.settings.lists), outNoteOf(s, d, x.p.id)))
        : '',
      x.st ? outsNote(s, d, x.p.id, x.st, false) : '',
      ...new Set(notWhy(x)),
      x.warn || '',
    ]
      .filter(Boolean)
      .join(', ');
  // ΓΥΡΝΑ (Α, Β): as "Ποιοι γυρίζουν και πότε"; ΓΙΑΤΙ ΜΕΝΕΙ (Γ): service with hours, penalty, ΣΤΕΠ..., or return (Γ4)
  const whyOf = (x: DayRow) =>
    x.g[0] !== 'G'
      ? x.r
        ? retTxt(x.r)
        : ''
      : x.g === 'G4'
        ? x.r
          ? retNote(x.r)
          : ''
        : stayNote(
            s,
            d,
            x.p,
            stayOf(x).filter((y) => statNoOut(y, s.settings.lists)),
            true,
          );
  // Δ: ΠΟΤΕ in the first columns, ΠΛΗΘΟΣ in the column of the room, Α/Α in the rest
  const cPl = C.room != null && C.room > c0 + 1 && C.room < cLast ? C.room : Math.max(c0 + 1, cLast - 1);
  const span = (r: number, a: number, b: number) => {
    if (b > a) ws.addMerge(refOf(a, r) + ':' + refOf(b, r));
  };
  L.forEach((ln, i) => {
    const r = rowOf(i);
    ws.dropCells(r);
    if (ln.k === 'gap') {
      ws.setRowHeight(r, 12);
      return;
    }
    if (ln.k === 'title' || ln.k === 'sub' || ln.k === 'banner') {
      const bn = ln.k === 'banner',
        c = bn ? c0 : titleC;
      ws.setRowHeight(r, hts.title);
      put(r, bn ? S.banner : S.title);
      ws.set(refOf(c, r), ln.text);
      if (bn || tmg || titleC === c0) span(r, bn ? c0 : Math.min(tmg?.c1 ?? c0, c), cWhen);
    } else if (ln.k === 'info') {
      ws.setRowHeight(r, hts.data);
      put(r, S.info);
      ws.set(refOf(c0, r), ln.text);
      span(r, c0, cWhen);
    } else if (ln.k === 'head') {
      ws.setRowHeight(r, hts.head);
      put(r, S.head);
      for (const c of Object.keys(heads).map(Number)) ws.set(refOf(c, r), heads[c]);
      ws.set(refOf(cWhen, r), ln.why ? 'ΓΙΑΤΙ ΜΕΝΕΙ' : 'ΓΥΡΝΑ');
    } else if (ln.k === 'dhead' || ln.k === 'drow') {
      const dh = ln.k === 'dhead';
      ws.setRowHeight(r, dh ? hts.head : hts.data);
      const st = (c: number) => (dh ? S.head : c === cPl ? S.row : S.info)[c];
      for (let c = c0; c <= cWhen; c++) if (st(c) != null) ws.setStyle(refOf(c, r), st(c)!);
      const t = dh ? ['ΠΟΤΕ', 'ΠΛΗΘΟΣ', 'Α/Α'] : ln.cols!;
      ws.set(refOf(c0, r), t[0]);
      ws.set(refOf(cPl, r), t[1]);
      ws.set(refOf(cPl + 1, r), t[2]);
      span(r, c0, cPl - 1);
      span(r, cPl + 1, cWhen);
    } else {
      ws.setRowHeight(r, hts.data);
      put(r, S.row);
      const x = ln.x;
      if (!x) {
        const c = C.name ?? C.who ?? C.last;
        if (c != null) ws.set(refOf(c, r), '—');
        return;
      }
      const p = x.p;
      const set = (key: string, v: string | number | null | undefined) => {
        const c = C[key];
        if (c != null) ws.set(refOf(c, r), v ?? '');
      };
      set('aa', ln.no);
      set('rank', rankTxt(p));
      set('spec', p.spec);
      set('last', p.last);
      set('first', p.first + (C.father != null ? '' : fatherTxt(p)));
      set('father', p.father);
      set('name', fullName(p));
      set('who', who(p));
      set('room', p.room ?? '');
      set('phone', p.phone);
      set('asm', p.asm);
      set('si', p.si);
      set('note', noteOf(x));
      ws.set(refOf(cWhen, r), whyOf(x));
    }
  });
  // the rows of the template that are left over in the first table: empty, with the format of the row
  for (let r = F2 + R0; r <= e0; r++) {
    ws.dropCells(r);
    ws.setRowHeight(r, hts.data);
    put(r, S.row);
  }
  // width of the new column (it widens more as needed on save), print one page wide, and the print area
  if (ws.colWidth(cWhen) < 38) ws.setColWidth(cWhen, 38);
  ws.fitTall();
  wb.printWidenTo(loc.sheet, cWhen);
  wb.limitTables(ws, e0); // the Excel table of the template stays the first one
  const dateRef = m.place ? refOf(m.place.c, placeRow) : null;
  if (dateRef) ws.set(dateRef, s.settings.place + ', ' + dmy(d).replace(/\//g, '-'));
  const headRefs = head
    .slice(0, Math.max(m.head.length, s.settings.unit.filter(Boolean).length))
    .map((h) => refOf(h.c, h.r));
  return { ws, headRefs, dateRef };
}
