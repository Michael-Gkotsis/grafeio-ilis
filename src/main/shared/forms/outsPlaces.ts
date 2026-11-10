// Where the lists of the Εξοδούχοι are in a template.
//
// Purpose: `outsPlaces` (the sheets and pieces of the outs list and the stay list) and `dropStay` (keep only the first
//   list on a sheet).
// Does NOT: write the lists.
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: a template may have the two lists on two sheets, on one sheet, or only one list; both formats find them the same
//   way (Phase 4.9a, verbatim).
// Covering test: test/outs-all.test.ts, test/outs-combos.test.ts and test/template-fuzz.test.ts.
import { type Workbook, sheetSafe, type Sheet, type XlValue } from '../excel/xlsx';
import { mapOuts, textCells, tnorm } from '../../tplmap';
import type { OutsLoc } from './types';

/**
 * Where each list is: a sheet (the one the user chose, else the one with the name or title of the list), and its piece
 * of it if the sheet has both. Without a sheet of the stay: a copy of the sheet of the outs.
 */
export async function outsPlaces(
  wb: Workbook,
  want: { outs?: string; stay?: string },
  place: string,
  stayName = 'ΠΑΡΑΜΕΝΟΝΤΕΣ',
): Promise<[OutsLoc, OutsLoc]> {
  const names = wb.sheetNames();
  const info = new Map<string, { vals: XlValue[][]; cs: ReturnType<typeof textCells>; list: boolean }>();
  for (const n of names) {
    const vals = await wb.values(n, 200, 40);
    const ws = await wb.sheet(n);
    info.set(n, { vals, cs: textCells(vals), list: !!mapOuts(vals, ws.merges(), place) });
  }
  const titled = (re: RegExp) =>
    names.find((n) => re.test(tnorm(n))) || names.find((n) => info.get(n)!.cs.some((x) => re.test(x.t) && x.r < 40));
  const outs =
    (want.outs && wb.hasSheet(want.outs) ? want.outs : null) ||
    titled(/^ΕΞΟΔΟΥΧ/) ||
    names.find((n) => info.get(n)!.list) ||
    names[0];
  let stay =
    (want.stay && wb.hasSheet(want.stay) ? want.stay : null) ||
    names.find((n) => /^ΠΑΡΑΜΕΝ/.test(tnorm(n))) ||
    names.find((n) => n !== outs && info.get(n)!.cs.some((x) => /^ΠΑΡΑΜΕΝΟΝΤΕΣ/.test(x.t)));
  const end = 2000;
  if (!stay && info.get(outs)!.cs.some((x) => /^ΠΑΡΑΜΕΝΟΝΤΕΣ/.test(x.t))) stay = outs;
  if (!stay) stay = names.find((n) => n !== outs && info.get(n)!.list && !/^ΕΞΟΔΟΥΧ/.test(tnorm(n)));
  if (!stay) {
    stay = sheetSafe(stayName);
    let i = 2;
    while (wb.hasSheet(stay)) stay = sheetSafe(stayName + ' ' + i++);
    await wb.cloneSheet(outs, stay);
    return [
      { sheet: outs, from: 1, to: end },
      { sheet: stay, from: 1, to: end, rename: true },
    ];
  }
  if (stay !== outs)
    return [
      { sheet: outs, from: 1, to: end },
      { sheet: stay, from: 1, to: end },
    ];
  // both lists on the same sheet: they split at the title of the second
  const cs = info.get(outs)!.cs;
  const t1 = cs.find((x) => /^ΕΞΟΔΟΥΧ/.test(x.t))?.r ?? 1,
    t2 = cs.find((x) => /^ΠΑΡΑΜΕΝΟΝΤΕΣ/.test(x.t))!.r;
  return t1 < t2
    ? [
        { sheet: outs, from: 1, to: t2 - 1 },
        { sheet: outs, from: t2, to: end },
      ]
    : [
        { sheet: outs, from: t1, to: end },
        { sheet: outs, from: 1, to: t1 - 1 },
      ];
}

/**
 * The sheet keeps only its first list (ΕΞΟΔΟΥΧΟΙ): the second (Παραμένοντες), when it is on the same sheet, goes from
 * its title up to the place (the place and the signatures stay).
 */
export async function dropStay(wb: Workbook, ws: Sheet, loc: OutsLoc, stay: OutsLoc, place: string) {
  const v0 = await wb.values(loc.sheet, 2000, 40);
  const ms = mapOuts(v0, ws.merges(), place, stay.from, stay.to);
  const a = ms ? (ms.title?.r ?? ms.hr) : stay.from,
    b = ms?.place ? ms.place.r - 1 : stay.from === 1 ? stay.to : ws.lastRow();
  for (let r = b; r >= a; r--) if (!ws.deleteRow(r, wb)) ws.dropCells(r);
  loc.from = 1;
  loc.to = 2000;
}
