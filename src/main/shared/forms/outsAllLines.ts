// The lines of the two sheets of the Εξοδούχοι "Όλη η δύναμη".
//
// Purpose: `allLines` (the lines in order: title, info, sections, headings, rows, the "when they return" table), `DYN`
//   and the private `ALL_SEC` and `gName`.
// Does NOT: write the lines into the sheets (outsAllSheet.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: what is written is decided here, apart from the template; it moved verbatim from src/main/exports.ts (Phase
//   4.9a).
// Covering test: test/outs-all.test.ts and test/outs-day.test.ts.
import { addDays, dmy, weekday, DOW_GEN, type ISODate } from '../../../shared/dates';
import { dayTimes } from '../../../shared/returns';
import type { AppState } from '../../../shared/domain';
import { DAY_GROUPS, whenList, type DayGroup, type DayRow } from '../../../shared/outsDay';
import type { AllLine } from './types';

/** The titles of the three sections of the "Όλη η δύναμη". */
const ALL_SEC = { A: 'Α. ΒΓΑΙΝΟΥΝ ΣΗΜΕΡΑ', B: 'Β. ΕΙΝΑΙ ΗΔΗ ΕΞΩ', G: 'Γ. ΜΕΝΟΥΝ ΜΕΣΑ ΑΠΟΨΕ' } as const;
/** Name of the second sheet ("ΔΥΝΑΜΗ"). */
export const DYN = 'ΔΥΝΑΜΗ';
/** Name of a day group: "A1" for the group A of the dayBook with number 1 (Latin A/B/G become Greek Α/Β/Γ). */
const gName = (g: DayGroup) => ({ A: 'Α', B: 'Β', G: 'Γ' })[g[0] as 'A' | 'B' | 'G'] + g[1];

/**
 * The lines of the two sheets in order, before they go into the sheets: sheet 1 the outs (Table Α), sheet 2 the rest of
 * the force and Δ. `nums` holds the page and the Α/Α of every person.
 * @decision Michael 30/10, 31/10: two sheets (A4 portrait), every person of the force once. Sheet 1 "ΕΞΟΔΟΥΧΟΙ" (Table
 *   Α, own signatures): those who go out today, in subgroups Α1-Α3. Sheet 2 "ΔΥΝΑΜΗ": the rest of the force, Β (already
 *   out) and Γ (stay in), and Δ (when all return, with their page and Α/Α). The tables have the heading and the row
 *   format of the template and one more column on the right (ΓΥΡΝΑ; in Γ: ΓΙΑΤΙ ΜΕΝΕΙ). Who goes where: dayBook (core
 *   outsDay). Only the conscripts (like the other formats). A group with nobody is not written. The Α/Α numbering
 *   starts from 1 on every sheet.
 */
export function allLines(s: AppState, d: ISODate, book: DayRow[]): [AllLine[], AllLine[]] {
  const tm = dayTimes(s, d),
    tn = dayTimes(s, addDays(d, 1));
  const secOf = (k: 'A' | 'B' | 'G') => book.filter((x) => x.g[0] === k);
  const nums = new Map<number, { pg: number; no: number }>();
  for (const pg of [1, 2]) {
    let n = 0;
    for (const [g, k] of DAY_GROUPS)
      if ((k === 'A') === (pg === 1)) for (const x of book.filter((b) => b.g === g)) nums.set(x.p.id, { pg, no: ++n });
  }
  const day = ' ΤΗΣ ' + DOW_GEN[weekday(d)] + ' ' + dmy(d).replace(/\//g, '-');
  const summary = (L: AllLine[], k: 'A' | 'B' | 'G') => {
    const rs = secOf(k);
    if (!rs.length) return;
    L.push({
      k: 'info',
      text:
        ALL_SEC[k] +
        ' ' +
        rs.length +
        ': ' +
        DAY_GROUPS.filter((g) => g[1] === k && rs.some((x) => x.g === g[0]))
          .map((g) => g[2] + ' ' + rs.filter((x) => x.g === g[0]).length)
          .join(', '),
    });
  };
  // sections: an empty line before each section and group (not before the template's first heading, tied to its table)
  const sections = (L: AllLine[], keys: ('A' | 'B' | 'G')[], banner: boolean, none: string) => {
    const gap = () => {
      const z = L[L.length - 1].k;
      if (z === 'row' || z === 'info') L.push({ k: 'gap' });
    };
    for (const k of keys) {
      const rs = secOf(k);
      if (!rs.length) continue;
      if (banner) {
        gap();
        L.push({ k: 'banner', text: ALL_SEC[k] + ' (' + rs.length + ')' });
      }
      for (const [g, , title] of DAY_GROUPS.filter((x) => x[1] === k)) {
        const gs = rs.filter((x) => x.g === g);
        if (!gs.length) continue;
        gap();
        L.push({ k: 'sub', text: gName(g) + '. ' + title + ' (' + gs.length + ')' }, { k: 'head', why: k === 'G' });
        for (const x of gs) L.push({ k: 'row', x, no: nums.get(x.p.id)!.no, why: k === 'G' });
      }
    }
    if (!L.some((x) => x.k === 'head')) {
      gap();
      L.push({ k: 'sub', text: none + ' (0)' }, { k: 'head' }, { k: 'row' });
    }
  };
  // sheet 1: the outs (Table Α)
  const p1: AllLine[] = [{ k: 'title', text: 'ΕΞΟΔΟΥΧΟΙ' + day }];
  p1.push({
    k: 'info',
    text:
      'ΕΞΟΔΟΣ ' +
      tm.out +
      ' · ΕΠΙΣΤΡΟΦΗ ΕΞΟΔΟΥΧΩΝ ' +
      tm.backOut +
      ' · ΕΠΙΣΤΡΟΦΗ ΔΝ ' +
      tn.backDn +
      ' · ΑΥΡΙΟ ΕΚΠΑΙΔΕΥΣΗ ' +
      (tn.train ? 'ΝΑΙ' : 'ΟΧΙ'),
  });
  summary(p1, 'A');
  sections(p1, ['A'], false, 'Α. ΒΓΑΙΝΟΥΝ ΣΗΜΕΡΑ');
  // sheet 2: the rest of the force and Δ
  const p2: AllLine[] = [{ k: 'title', text: DYN + day }];
  p2.push({
    k: 'info',
    text:
      'ΔΥΝΑΜΗ ' +
      book.length +
      ' = Α ' +
      secOf('A').length +
      ' (ΕΞΟΔΟΥΧΟΙ, ΣΕΛ. 1) + Β ' +
      secOf('B').length +
      ' + Γ ' +
      secOf('G').length,
  });
  summary(p2, 'B');
  summary(p2, 'G');
  sections(p2, ['B', 'G'], true, 'Β, Γ');
  const when = whenList(book);
  if (when.length) {
    p2.push(
      { k: 'gap' },
      { k: 'banner', text: 'Δ. ΠΟΤΕ ΓΥΡΙΖΟΥΝ (' + when.reduce((a, w) => a + w.rows.length, 0) + ')' },
      { k: 'dhead' },
    );
    // Α/Α: per page, only the pages that have people ("ΣΕΛ. 1: 1, 2 · ΣΕΛ. 2: 1")
    const refs = (rows: DayRow[]) =>
      [1, 2]
        .map((pg) => {
          const ns = rows
            .map((x) => nums.get(x.p.id)!)
            .filter((n) => n.pg === pg)
            .map((n) => n.no)
            .sort((a, b) => a - b);
          return ns.length ? 'ΣΕΛ. ' + pg + ': ' + ns.join(', ') : '';
        })
        .filter(Boolean)
        .join(' · ');
    for (const w of when) p2.push({ k: 'drow', cols: [w.when, String(w.rows.length), refs(w.rows)] });
  }
  return [p1, p2];
}
