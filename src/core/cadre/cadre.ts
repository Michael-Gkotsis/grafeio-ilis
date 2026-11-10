// Cadre (Στελέχη): their own sheet, apart from the Δυναμολόγιο of the soldiers.
//
// Purpose: the order of the cadre (`HK_CADRE`, `byCadreRank`, `orderedCadre`, `insertCadre`), the statuses of a cadre
//   member (`CadreStatus`, `cadreStatusOf`, `cadreStatusOn`, `cadreAbsFrom`, `cadreClash`), the filters of the screen
//   (`CadreFilter`, `cadreMatch`, `cadreSearch`), the duty officers of the ΗΚΑΙ (`dutyOfficers`, `hkOffText`) and
//   the sheets of the Excel «Δυναμικό στελεχών» (`cadreSheets`).
// Does NOT: write the Excel file (src/main does), save anything, or change the capitals (excel.ts puts them, like in
//   every Excel of the app).
// Owner layer: core/cadre (no fs, no Electron, no React); imports core/people (ranks, hkRows, kinds) and core/duty.
// Why: Michael, 17/10: the cadre has its own sheet. Their statuses are the columns of the ΗΚΑΙ (blocked or absent),
//   not the statuses of the soldiers. The same logic serves the screen and the Excel.
// Covering tests: test/cadre-tab.test.ts, test/cadre-duty.test.ts, test/cadre-excel.test.ts.
import { formText, hkRowLabel } from '../model/unit';
import { dmy, type ISODate } from '../lib/dates';
import type { AppState } from '../model/state';
import type { Cadre, CadreAbs } from '../model/cadreRecord';
import { cadreAbsOf } from '../people/kinds';
import { hkRowsOf, HK_A, HK_K, HK_NCO, HK_OFFICERS } from '../people/hkRows';
import { rankTxt } from '../people/ranks';
import type { UserLists } from '../model/lists';
import { cadreAbsOn } from '../duty/indexes';
import { collator, normGreek } from '../lib/text';
import type { RosterSheet } from '../model/rosterSheet';

/**
 * The lines of the ΗΚΑΙ where a cadre member goes: all of them except the Στρατιώτες (the NCOs up to ΟΒΑ).
 * @decision Michael 21/10: NCOs up to ΟΒΑ.
 */
export const HK_CADRE = [...HK_OFFICERS, ...HK_NCO.filter((r) => r !== 'Στρατιώτες')];
/** Order of the ΗΚΑΙ (rank), then last name, then first name. */
export const byCadreRank = (a: Cadre, b: Cadre) =>
  HK_CADRE.indexOf(a.hk) - HK_CADRE.indexOf(b.hk) ||
  collator.compare(a.last, b.last) ||
  collator.compare(a.first, b.first);
/** True when somebody has moved a cadre member by hand (`Cadre.pos` is set). */
export const isManualOrder = (list: Cadre[]) => list.some((c) => c.pos != null);
/**
 * The order of the cadre: as the user put them, otherwise (before anybody is moved) the order of the ΗΚΑΙ. The same on
 * the screen, in the Excel and in the duty officers.
 * @decision Michael 18/10: «with a manual order, based on the hierarchy».
 */
export function orderedCadre(list: Cadre[]): Cadre[] {
  const manual = isManualOrder(list);
  return [...list].sort((a, b) => (manual ? (a.pos ?? 1e9) - (b.pos ?? 1e9) : 0) || byCadreRank(a, b));
}
/** A new member in a manual order: after the last one of the same or a higher ΗΚΑΙ line; all are numbered again. */
export function insertCadre(list: Cadre[], x: Cadre): Cadre[] {
  const ord = orderedCadre(list);
  const r = HK_CADRE.indexOf(x.hk);
  let i = 0;
  ord.forEach((y, j) => {
    if (HK_CADRE.indexOf(y.hk) <= r) i = j + 1;
  });
  return [...ord.slice(0, i), x, ...ord.slice(i)].map((y, pos) => ({ ...y, pos }));
}

/** The group of the ΗΚΑΙ that a status counts in: blocked, absent, or only on the list. */
export type CadreGroup = 'kol' | 'apo' | 'list';
/** The names of the groups, as shown. */
export const GROUP_NAME: Record<CadreGroup, string> = { kol: 'Κωλυόμενος', apo: 'Απών', list: 'Μόνο στη λίστα' };
/** In which group of the ΗΚΑΙ a column counts (empty column: in none, so `list`). */
export const groupOfCol = (col: string | undefined): CadreGroup =>
  col && HK_K.some((x) => x[0] === col) ? 'kol' : col && HK_A.some((x) => x[0] === col) ? 'apo' : 'list';
/** The short heading of the column on the form (Υπηρ., Κ.Άδ.…), empty when the column is unknown. */
export const colShort = (col: string) => [...HK_K, ...HK_A].find((x) => x[0] === col)?.[1] || '';

/** A status of a cadre member with its label, its ΗΚΑΙ column and its group. */
export interface CadreStatus {
  abs: CadreAbs;
  label: string;
  col: string;
  group: CadreGroup;
}
/** The label, column and group of a cadre status (the kind is looked up in the built-in and in the user's kinds). */
export function cadreStatusOf(abs: CadreAbs, lists?: UserLists): CadreStatus {
  const k = cadreAbsOf(abs.kind, lists);
  const col = k?.[2] || '';
  return { abs, label: k?.[1] || abs.kind, col, group: groupOfCol(col) };
}
/** The status of the cadre member `cid` on day `d`, or undefined when present. */
export function cadreStatusOn(
  s: Pick<AppState, 'cadreAbs' | 'settings'>,
  cid: string,
  d: ISODate,
): CadreStatus | undefined {
  const a = cadreAbsOn(s, cid, d);
  return a && cadreStatusOf(a, s.settings.lists);
}
/** The statuses that have not ended by day `d` (the current one and the next ones), in date order. */
export const cadreAbsFrom = (s: Pick<AppState, 'cadreAbs'>, cid: string, d: ISODate) =>
  (s.cadreAbs || []).filter((a) => a.cid === cid && a.to >= d).sort((a, b) => a.from.localeCompare(b.from));
/** The statuses of the same member that overlap with `abs` (the screen asks before it writes over them). */
export const cadreClash = (
  s: Pick<AppState, 'cadreAbs'>,
  abs: { id?: string; cid: string; from: ISODate; to: ISODate },
) => (s.cadreAbs || []).filter((a) => a.id !== abs.id && a.cid === abs.cid && a.from <= abs.to && abs.from <= a.to);

/** The filters of the screen. */
export type CadreFilter = 'all' | 'kol' | 'apo' | 'inactive';
/** The filters of the screen with their labels. */
export const CADRE_FILTERS: [CadreFilter, string][] = [
  ['all', 'Όλοι'],
  ['kol', 'Κωλυόμενοι'],
  ['apo', 'Απόντες'],
  ['inactive', 'Εκτός δύναμης'],
];
/** Does the member `c` (with the status `st` of the day) pass the filter `f`? */
export function cadreMatch(f: CadreFilter, c: Cadre, st: CadreStatus | undefined): boolean {
  if (f === 'inactive') return !c.active;
  if (!c.active) return false;
  return f === 'all' || st?.group === f;
}
/**
 * ΗΚΑΙ, «Όργανα υπηρεσίας › Αξιωματικοί»: the officers (officers, warrant officers, ΔΕΑ) of the Στελέχη sheet who have
 * «Υπηρεσία εντός στρατοπέδου» on the day, in the order of the sheet, as «rank last first, …».
 */
export function dutyOfficers(s: Pick<AppState, 'cadreList' | 'cadreAbs' | 'settings'>, d: ISODate): string {
  const off = hkRowsOf(s.settings.lists).off;
  return orderedCadre(s.cadreList || [])
    .filter((c) => c.active && off.includes(c.hk) && cadreStatusOn(s, c.id, d)?.col === 'yp')
    .map((c) => [rankTxt(c), c.last, c.first].filter(Boolean).join(' '))
    .join(', ');
}
/** The text of the duty officers on the ΗΚΑΙ: what was written on the ΗΚΑΙ screen, otherwise `dutyOfficers`. */
export const hkOffText = (s: Pick<AppState, 'cadreList' | 'cadreAbs' | 'settings' | 'hkaiManual'>, d: ISODate) =>
  s.hkaiManual?.[d]?.text?.off?.trim() || dutyOfficers(s, d);
/** Search without accents: rank, Ο/Σ, name, ΑΜ, role, phone. */
export const cadreSearch = (c: Cadre, q: string) => {
  const k = normGreek(q).trim();
  return (
    !k || normGreek([c.rank, c.origin, c.spec, c.last, c.first, c.am, c.role, c.phone, c.hk].join(' ')).includes(k)
  );
};

// Excel «Δυναμικό στελεχών»: the members in force with the status of the day, all the statuses from that day on, and
// the members out of force (if there are any). The capitals are put by excel.ts, like in every Excel of the app.
/**
 * The columns, like in the Δυναμολόγιο: rank, Ο/Σ, last name, first name, ΑΜ, phone, role.
 * @decision Michael 18/10: the columns as in the Δυναμολόγιο.
 */
export const CADRE_COLS = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΑΜ', 'ΤΗΛΕΦΩΝΟ', 'ΘΕΣΗ', 'ΓΡΑΜΜΗ ΗΚΑΙ'];
/** The sheets of the Excel «Δυναμικό στελεχών» for day `d` (ΣΤΕΛΕΧΗ, ΚΑΤΑΣΤΑΣΕΙΣ and, if any, ΕΚΤΟΣ ΔΥΝΑΜΗΣ). */
export function cadreSheets(s: AppState, d: ISODate): RosterSheet[] {
  const lists = s.settings.lists;
  const all = orderedCadre(s.cadreList || []);
  const cells = (c: Cadre) => [
    rankTxt(c),
    c.spec || '',
    c.last,
    c.first,
    c.am || '',
    c.phone || '',
    c.role || '',
    hkRowLabel(c.hk, s.settings),
  ];
  const where = (st: CadreStatus) =>
    st.group === 'list' ? 'ΜΟΝΟ ΣΤΗ ΛΙΣΤΑ' : (st.group === 'kol' ? 'ΚΩΛΥΟΜΕΝΟΙ' : 'ΑΠΟΝΤΕΣ') + ' · ' + colShort(st.col);
  const active = all.filter((c) => c.active);
  const now = active.map((c, i) => {
    const st = cadreStatusOn(s, c.id, d);
    return [i + 1, ...cells(c), st ? st.label : 'ΠΑΡΩΝ', st ? dmy(st.abs.from) : '', st ? dmy(st.abs.to) : ''];
  });
  const rows: (string | number)[][] = [];
  for (const c of active)
    for (const a of cadreAbsFrom(s, c.id, d)) {
      const st = cadreStatusOf(a, lists);
      rows.push([
        rows.length + 1,
        rankTxt(c),
        c.spec || '',
        c.last,
        c.first,
        st.label,
        where(st),
        dmy(a.from),
        dmy(a.to),
        a.note || '',
      ]);
    }
  const out: RosterSheet[] = [
    {
      name: 'ΣΤΕΛΕΧΗ',
      title: 'ΔΥΝΑΜΙΚΟ ΣΤΕΛΕΧΩΝ ' + dmy(d),
      head: [...CADRE_COLS, 'ΚΑΤΑΣΤΑΣΗ', 'ΑΠΟ', 'ΕΩΣ'],
      rows: now,
    },
    {
      name: 'ΚΑΤΑΣΤΑΣΕΙΣ',
      title: 'ΚΑΤΑΣΤΑΣΕΙΣ ΣΤΕΛΕΧΩΝ ΑΠΟ ' + dmy(d),
      head: ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', 'ΚΑΤΑΣΤΑΣΗ', 'ΣΤΗΛΗ ΗΚΑΙ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΗ'],
      rows,
    },
  ];
  const off = all.filter((c) => !c.active);
  if (off.length)
    out.push({
      name: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ',
      title: 'ΣΤΕΛΕΧΗ ΕΚΤΟΣ ΔΥΝΑΜΗΣ',
      head: CADRE_COLS,
      rows: off.map((c, i) => [i + 1, ...cells(c)]),
    });
  // in a company (λόχος): «ΓΡΑΜΜΗ ΗΚΑΛ», «ΣΤΗΛΗ ΗΚΑΛ»
  return out.map((x) => ({ ...x, head: x.head.map((h) => formText(s.settings, h)) }));
}
