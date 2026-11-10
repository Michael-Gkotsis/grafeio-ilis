// Fills the Εξοδούχοι / Παραμένοντες (specimen 10).
//
// Purpose: `fillOuts`, the form with the outs list and the stay list.
// Does NOT: write the "Όλη η δύναμη" format (outsAll.ts, outsAllSheet.ts); it only hands over to it.
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: it moved verbatim from src/main/exports.ts (Phase 4.9a). `fillOuts` is longer than 80 lines and stays one
//   function in this PR.
// Covering test: test/outs-snapshot.test.ts, test/outs-combos.test.ts, test/outs-fmt.test.ts and the golden hashes of
//   `npm run bench:golden`.
import { dmy, type ISODate } from '../../../shared/dates';
import { isOutsAll, fatherTxt, fullName, type AppState, type Person } from '../../../shared/domain';
import { rankTxt } from '../../../shared/ranks';
import { Workbook, unesc, type Sheet } from '../excel/xlsx';
import { outsAndStay } from '../../../shared/outsStay';
import { mapOuts } from '../../tplmap';
import type { Sig } from '../../../shared/sigs';
import { blockOf } from '../../layout';
import type { ExportResult, SheetPart, OutsLoc } from './types';
import { who, titleDate, withDate, refOf, headCells, unitWords } from './common';
import { signSheets } from './sign';
import { outsNote } from './outsNote';
import { outsPlaces } from './outsPlaces';
import { fillOutsAll } from './outsAll';

/**
 * Fills the Εξοδούχοι / Παραμένοντες (specimen 10) for day `d`. `sheets`: the sheets of the outs and of the stay in the
 * template (Αρχεία Excel); every column from its heading (tplmap.ts). In the "Όλη η δύναμη" format it hands over to
 * fillOutsAll.
 */
export async function fillOuts(
  tpl: Buffer,
  s: AppState,
  d: ISODate,
  sheets: { outs?: string; stay?: string } = {},
  sigs?: Sig[] | null,
): Promise<ExportResult> {
  const wb = await Workbook.open(tpl);
  wb.widen = true;
  await unitWords(wb, s);
  const warnings: string[] = [];
  if (isOutsAll(s.settings)) return fillOutsAll(wb, s, d, sheets, sigs, warnings);
  const marks: { ws: Sheet; key: string; refs: { head: string[]; date: string[] } }[] = [];
  const { outs, stay } = outsAndStay(s, d);
  const locs = await outsPlaces(wb, sheets, s.settings.place);
  const lists: { title: string; list: { p: Person; note: string }[]; at: OutsLoc; key: string }[] = [
    {
      title: 'ΕΞΟΔΟΥΧΟΙ',
      list: outs.map((x) => ({ p: x.p, note: outsNote(s, d, x.p.id, x.st) })),
      at: locs[0],
      key: 'outs',
    },
    { title: 'ΠΑΡΑΜΕΝΟΝΤΕΣ', list: stay, at: locs[1], key: 'stay' },
  ];
  // bottom to top: the rows inserted in a list do not move the ones not written yet
  for (const { title, list, at: loc, key } of [...lists].sort((a, b) =>
    a.at.sheet === b.at.sheet ? b.at.from - a.at.from : 0,
  )) {
    const ws = await wb.sheet(loc.sheet);
    const vals = await wb.values(loc.sheet, 2000, 40);
    const m = mapOuts(vals, ws.merges(), s.settings.place, loc.from, loc.to);
    if (!m) {
      warnings.push(
        'Στο φύλλο «' +
          loc.sheet +
          '» δεν βρέθηκαν οι επικεφαλίδες της λίστας (ΒΑΘΜΟΣ, ΕΠΩΝΥΜΟ, ΟΝΟΜΑ…): οι ' +
          title +
          ' δεν γράφτηκαν',
      );
      continue;
    }
    const raw = (c: { r: number; c: number }) => String(vals[c.r - 1]?.[c.c - 1] ?? '');
    const head = headCells(m.head, m.title?.r ?? m.hr, (r, c) => vals[r - 1]?.[c - 1] != null);
    s.settings.unit.forEach((u, i) => {
      const h = head[i];
      if (h && (i < m.head.length || u)) ws.set(refOf(h.c, h.r), u);
    });
    if (m.title) {
      const t = loc.rename ? raw(m.title).replace(/ΕΞΟΔΟΥΧΟΙ/i, title) : raw(m.title);
      ws.set(refOf(m.title.c, m.title.r), withDate(t, titleDate(d, false), 'ΤΗΣ'));
    }
    // ready rows: those with the format of the first, up to before the place/date (one empty row before stays)
    const cols = Object.values(m.cols);
    const c0 = Math.min(...cols);
    const s0 = ws.style(refOf(c0, m.first));
    const stop = m.place ? m.place.r - 1 : loc.to;
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
    const n = list.length;
    if (n > ready) {
      ws.insertRows(m.first + ready - 1, n - ready, m.first + ready - 1, wb);
      // whatever was marked lower on the same sheet (heading, date of the list below) goes down with it
      const mv = (x: string) =>
        x.replace(/(\d+)$/, (_q, rr: string) => String(+rr > m.first + ready - 1 ? +rr + n - ready : +rr));
      for (const k of marks)
        if (k.ws === ws) {
          k.refs.head = k.refs.head.map(mv);
          k.refs.date = k.refs.date.map(mv);
        }
      // the numbering =ROW()-k of the list below (on the same sheet) stays 1, 2, 3... after it went down
      if (loc.to < 2000)
        for (const x of [...ws.cells()].filter((y) => y.r > loc.to + n - ready)) {
          const ref = refOf(x.c, x.r);
          const f = /^ROW\(\)\s*-\s*(\d+)$/.exec(unesc(ws.formula(ref) || ''));
          if (f) ws.setFormula(ref, 'ROW()-' + (+f[1] + n - ready));
        }
      if (m.cols.aa != null) ws.chainAa(m.cols.aa, m.first + ready - 1, n - ready);
    }
    const C = m.cols;
    list.forEach(({ p, note }, i) => {
      const r = m.first + i;
      const set = (k: string, v: string | number | null | undefined) => {
        const c = C[k];
        if (c != null && !ws.hasFormula(refOf(c, r))) ws.set(refOf(c, r), v ?? '');
      };
      set('aa', i + 1);
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
      set('note', note);
    });
    const extra = Math.max(0, n - ready);
    const dateRef = m.place ? refOf(m.place.c, m.place.r + extra) : null;
    if (dateRef) ws.set(dateRef, s.settings.place + ', ' + dmy(d).replace(/\//g, '-'));
    const headRefs = head
      .slice(0, Math.max(m.head.length, s.settings.unit.filter(Boolean).length))
      .map((h) => refOf(h.c, h.r));
    const had = marks.find((x) => x.ws === ws);
    if (had) {
      had.refs.head.push(...headRefs);
      if (dateRef) had.refs.date.push(dateRef);
      had.key = key;
    } else marks.push({ ws, key, refs: { head: headRefs, date: dateRef ? [dateRef] : [] } });
  }
  // a sheet with both lists: one heading and one date for the move (of the first list / of the last)
  const done: SheetPart[] = marks.map((x) => ({
    ws: x.ws,
    key: x.key,
    more: [blockOf(x.ws, 'head', x.refs.head), blockOf(x.ws, 'date', x.refs.date.slice(0, 1))],
  }));
  const layout = await signSheets(wb, done, s, 'outs', sigs, warnings);
  return {
    name: 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx',
    data: await wb.save(),
    warnings,
    layout,
    sheet: locs[0].sheet,
  };
}
