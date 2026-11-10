// Fills the Εξοδούχοι in the "Όλη η δύναμη" format (two sheets).
//
// Purpose: `fillOutsAll` (finds the sheets, copies or renames them, builds the lines and signs).
// Does NOT: build the lines (outsAllLines.ts) or write one sheet (outsAllSheet.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: called by fillOuts when the setting asks for the whole force; it moved verbatim from src/main/exports.ts (Phase
//   4.9a).
// Covering test: test/outs-all.test.ts and the golden hashes of `npm run bench:golden`.
import { dmy, type ISODate } from '../../../shared/dates';
import type { AppState } from '../../../shared/domain';
import { dayBook } from '../../../shared/outsDay';
import { type Workbook, sheetSafe } from '../excel/xlsx';
import { mapOuts } from '../../tplmap';
import { outsSig2Of, sigsFor, sigsPage2, type Sig } from '../../../shared/sigs';
import { blockOf } from '../../layout';
import type { ExportResult, SheetPart, OutsLoc } from './types';
import { signSheets } from './sign';
import { outsPlaces, dropStay } from './outsPlaces';
import { DYN, allLines } from './outsAllLines';
import { allSheet } from './outsAllSheet';

/**
 * Fills the Εξοδούχοι in the "Όλη η δύναμη" format (two sheets): finds the sheets (the outs sheet; the stay sheet that
 * becomes "ΔΥΝΑΜΗ", or a copy of the outs sheet), builds the lines (allLines), writes them (allSheet) and signs. When
 * the headings of the list are not found nothing is written and a warning is returned.
 */
export async function fillOutsAll(
  wb: Workbook,
  s: AppState,
  d: ISODate,
  want: { outs?: string; stay?: string },
  sigs: Sig[] | null | undefined,
  warnings: string[],
): Promise<ExportResult> {
  const place = s.settings.place;
  const [loc, stay0] = await outsPlaces(wb, want, place, DYN);
  const name = 'ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ ' + dmy(d).replace(/\//g, '-') + '.xlsx';
  const freeName = () => {
    let n = sheetSafe(DYN),
      i = 2;
    while (wb.hasSheet(n)) n = sheetSafe(DYN + ' ' + i++);
    return n;
  };
  const mapOf = async (l: OutsLoc) => {
    const ws = await wb.sheet(l.sheet);
    return mapOuts(await wb.values(l.sheet, 2000, 40), ws.merges(), place, l.from, l.to);
  };
  if (!(await mapOf(loc))) {
    warnings.push(
      'Στο φύλλο «' +
        loc.sheet +
        '» δεν βρέθηκαν οι επικεφαλίδες της λίστας (ΒΑΘΜΟΣ, ΕΠΩΝΥΜΟ, ΟΝΟΜΑ…): η ΔΥΝΑΜΗ δεν γράφτηκε',
    );
    return { name, data: await wb.save(), warnings, sheet: loc.sheet };
  }
  // sheet 2: the sheet of the Παραμένοντες of the template (renamed ΔΥΝΑΜΗ); if it cannot be read, or if the two lists
  // are on the same sheet, a copy of the sheet of the outs (before anything changes)
  let loc2: OutsLoc;
  const same = stay0.sheet === loc.sheet;
  const stayLoc = { ...stay0 };
  if (same) {
    const nm = freeName();
    await wb.cloneSheet(loc.sheet, nm);
    loc2 = { ...loc, sheet: nm };
  } else if (!(await mapOf(stay0))) {
    await wb.dropSheet(stay0.sheet);
    const nm = freeName();
    await wb.cloneSheet(loc.sheet, nm);
    loc2 = { sheet: nm, from: 1, to: 2000 };
    warnings.push(
      'Στο φύλλο «' +
        stay0.sheet +
        '» δεν βρέθηκαν οι επικεφαλίδες της λίστας: η ΔΥΝΑΜΗ γράφεται σε αντίγραφο του φύλλου «' +
        loc.sheet +
        '»',
    );
  } else {
    loc2 = { ...stay0 };
    if (loc2.sheet !== DYN && !wb.hasSheet(DYN)) loc2.sheet = wb.renameSheet(loc2.sheet, DYN);
  }
  if (same) {
    await dropStay(wb, await wb.sheet(loc.sheet), loc, stayLoc, place);
    await dropStay(wb, await wb.sheet(loc2.sheet), loc2, { ...stayLoc, sheet: loc2.sheet }, place);
  }
  const book = dayBook(s, d);
  const [L1, L2] = allLines(s, d, book);
  const p1 = await allSheet(wb, s, d, loc, L1),
    p2 = await allSheet(wb, s, d, loc2, L2);
  if (!p1) return { name, data: await wb.save(), warnings, sheet: loc.sheet };
  if (!p2)
    warnings.push('Στο φύλλο «' + loc2.sheet + '» δεν βρέθηκαν οι επικεφαλίδες της λίστας: η ΔΥΝΑΜΗ δεν γράφτηκε');
  const part = (p: NonNullable<typeof p1>, key: string, sg?: SheetPart['sigs']): SheetPart => ({
    ws: p.ws,
    key,
    sigs: sg,
    more: [blockOf(p.ws, 'head', p.headRefs), blockOf(p.ws, 'date', p.dateRef ? [p.dateRef] : [])],
  });
  // signatures: sheet 1 with the form's; sheet 2 with the same, none or its own (Settings > Υπογραφές > Εξοδούχοι)
  const mode = outsSig2Of(s.settings);
  const g2 =
    mode === 'none'
      ? { sigs: [] as Sig[], def: [] as Sig[] }
      : mode === 'own'
        ? (() => {
            const l = sigsFor(s.settings, sigsPage2(s.settings));
            return { sigs: l, def: l };
          })()
        : undefined;
  const parts: SheetPart[] = [part(p1, 'outs')];
  if (p2) parts.push(part(p2, 'stay', g2));
  const layout = await signSheets(wb, parts, s, 'outs', sigs, warnings);
  return {
    name,
    data: await wb.save(),
    warnings,
    layout,
    sheet: loc.sheet,
    ...(p2 ? { sheets: [loc.sheet, loc2.sheet] } : {}),
  };
}
