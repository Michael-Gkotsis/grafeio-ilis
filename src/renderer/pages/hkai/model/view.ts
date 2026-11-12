// Pure rules of the «ΗΚΑΙ» screen: the columns with their names, the cadre order, the hand-written numbers of a day
// and the vehicle and «Προβλέπονται» fields of the sections card.
// Purpose: `hkaiSources`, `cadreInColumn`, `hkaiFileName`, `cadreTotal`, `manualOf`, `withCell`, `usedCells`,
//   `manualLabel`, `officerNames`, `cadreByRank`, `vehicleOf`, `parseCount`, `withProvided`, `HK_TEXT_FIELDS`,
//   `HK_ACC_FIELDS`, `VEHICLE_FIELDS`, for the screen, its cards and the test.
// Does NOT: render anything, touch React, read the store or run commands (model/use*.ts do).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6) so it is testable without a
//   render.
// Covering test: test/hkai-view.test.ts.
import type { AppState, Cadre, HkaiManual, HkaiSettings, HkVehicle } from '../../../../shared/domain';
import { HK_A, HK_K, HK_MANUAL, type hkaiCounts } from '../../../../shared/rules';
import { dm } from '../../../../shared/dates';
import { rankTxt } from '../../../../shared/ranks';
import { HK, hkRowLabel } from '../../../../shared/unit';

/** The ΗΚΑΙ count of one day. */
export type HkaiDay = ReturnType<typeof hkaiCounts>;

/**
 * What the ΗΚΑΙ does not know by itself: numbers per rank and the texts of the back page, for one day.
 * [key, label, placeholder]; `off` is the duty officer and has a list of suggestions.
 */
export const HK_TEXT_FIELDS: [string, string, string][] = [
  ['egr', '1. Εγγραφές (επιπλέον, μετά από όσους μπήκαν στη δύναμη)', ''],
  ['dia', '2. Διαγραφές (επιπλέον, μετά από όσους βγήκαν εκτός δύναμης)', ''],
  ['lv', '3. Άδειες (ελεύθερο κείμενο, μετά τις αριθμημένες)', ''],
  ['ait', '5. Αιτήσεις (ελεύθερο κείμενο, μετά τις αριθμημένες)', ''],
  ['loi', '6. Λοιπά', ''],
  ['off', 'Αξιωματικός υπηρεσίας', 'π.χ. ΑΝΘΛΓΟΣ …'],
];

/** The three accident fields of the back page: [key, label]. */
export const HK_ACC_FIELDS: [string, string][] = [
  ['accT', 'Ζημιές σε οχήματα: ολικές'],
  ['accP', 'Ζημιές σε οχήματα: μερικές'],
  ['accM', 'Σε άνδρες'],
];

/** The numeric vehicle fields of the sections card: [key, label]. */
export const VEHICLE_FIELDS: [keyof HkVehicle, string][] = [
  ['prov', 'Προβλέπονται'],
  ['kin', 'Σε κίνηση'],
  ['maint', 'Για συντήρηση'],
  ['dmg', 'Λόγω βλάβης ή ατυχήματος'],
];

/** The columns that have soldiers or cadre in them: [key, short name, full name], soldiers' columns first. */
export function hkaiSources(h: HkaiDay) {
  return [...HK_K, ...HK_A].filter(([k]) => h.cols[k].length || h.cadre[k]?.length);
}

/** The cadre of column `k`, in the order of the «Στελέχη» tab (`order`: id to position). */
export function cadreInColumn(h: HkaiDay, k: string, order: Map<string, number>): Cadre[] {
  return [...(h.cadre[k] || [])].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** The file name the preview shows, e.g. `ΗΚΑΙ 10.11.xlsx`; `date` is an ISODate. */
export function hkaiFileName(date: string): string {
  return HK() + ' ' + dm(date).replace('/', '.') + '.' + date.slice(2, 4) + '.xlsx';
}

/** How many cadre members there are: the active ones in the list, else the sum of the counts per rank in Settings. */
export function cadreTotal(state: Pick<AppState, 'cadreList' | 'settings'>): number {
  return (
    state.cadreList.filter((c) => c.active).length ||
    Object.values(state.settings.cadre).reduce((a, b) => a + (b || 0), 0)
  );
}

/** Active cadre per row label, in first-seen order, for the line «Λοχίες 2 · …». */
export function cadreByRank(list: Cadre[]): Map<string, number> {
  const by = new Map<string, number>();
  for (const x of list) by.set(hkRowLabel(x.hk), (by.get(hkRowLabel(x.hk)) || 0) + 1);
  return by;
}

/**
 * The hand-written part of a day, without `lv` (3. ΑΔΕΙΕΣ yes/no): that one changes from the day's switch, not from
 * the Save button of the card.
 */
export const manualOf = (x?: HkaiManual): HkaiManual => ({ cells: x?.cells || {}, text: x?.text || {} });

/** `m` with the number `v` set in row `r`, column `k`; `0` removes the number, an empty row is removed too. */
export function withCell(m: HkaiManual, r: string, k: string, v: number): HkaiManual {
  const row = { ...(m.cells[r] || {}) };
  if (v) row[k] = v;
  else delete row[k];
  const cells = { ...m.cells, [r]: row };
  if (!Object.keys(row).length) delete cells[r];
  return { ...m, cells };
}

/** Every number written so far, one entry per row and column. */
export function usedCells(m: HkaiManual) {
  return Object.entries(m.cells).flatMap(([r, row]) => Object.entries(row).map(([k, v]) => ({ r, k, v })));
}

/** Label of a hand-written column; the key itself when unknown. */
export const manualLabel = (k: string): string => HK_MANUAL.find((x) => x[0] === k)?.[1] || k;

/** The names offered for «Αξιωματικός υπηρεσίας»: every active cadre member, e.g. `ΑΝΘΛΓΟΣ Παπαδόπουλος Νίκος`. */
export function officerNames(state: Pick<AppState, 'cadreList'>): string[] {
  return state.cadreList.filter((c) => c.active).map((c) => (rankTxt(c) + ' ' + c.last + ' ' + c.first).trim());
}

/** The vehicle line of the settings; the type defaults to `1/4 τόνων`. */
export const vehicleOf = (cur: HkaiSettings): HkVehicle => ({ type: '1/4 τόνων', ...(cur.veh || {}) });

/** A number field: empty text is `undefined`, anything else a whole number >= 0 (bad text is 0). */
export const parseCount = (v: string): number | undefined => (v.trim() === '' ? undefined : Math.max(0, +v || 0));

/** `prov` with the number `n` for row `r`; `undefined` or `0` removes the row. */
export function withProvided(prov: Record<string, number>, r: string, n: number | undefined): Record<string, number> {
  const next = { ...prov };
  if (n) next[r] = n;
  else delete next[r];
  return next;
}
