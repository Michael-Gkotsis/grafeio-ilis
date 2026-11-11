// The saved draft of the quick-add table and the fixed words of its columns.
// Purpose: `loadDraft` / `saveDraft` (localStorage key `grafeio.quickAdd`, frozen format `{ rows, essos }`), `withTail`
//   (the last row stays empty), and the column labels, the columns with a list and the input modes.
// Does NOT: touch React or the store, or validate rows (src/shared/quickAdd.ts does).
// Owner layer: renderer/features/quick-add. Why: moved verbatim out of screens/quickAdd.ts.
// Covering test: test/screens-dialogs-forms.test.ts (quickAdd-QuickAddDialog), test/ux-names.test.ts.
import { CARRY, carryOf, emptyRow, isFilled, type QaKey, type QaRow } from '../../../../shared/quickAdd';

/** localStorage key of the draft. Frozen data contract: never rename. */
export const DRAFT = 'grafeio.quickAdd';

/** The header of each column. */
export const LABEL: Record<QaKey, string> = {
  rank: 'Βαθμός',
  spec: 'Ο/Σ',
  last: 'Επώνυμο *',
  first: 'Όνομα *',
  father: 'Πατρώνυμο',
  asm: 'ΑΣΜ',
  phone: 'Τηλέφωνο',
  room: 'Θάλαμος',
  si: 'Σ.Ι.',
};

/** Columns that have a list under them (a Combo): the arrows pick from the list there. */
export const LISTED: QaKey[] = ['rank', 'spec', 'room', 'si'];

/** `inputMode` of the columns that are numbers or a phone. */
export const INPUT_MODE: Partial<Record<QaKey, 'numeric' | 'tel'>> = { asm: 'numeric', phone: 'tel', room: 'numeric' };

/** The numbers 1..n (for the room list). */
export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** What was written before the dialog was closed without adding, or null when nothing useful is saved. */
export function loadDraft(): { rows: QaRow[]; essos: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    return v && Array.isArray(v.rows) && v.rows.some(isFilled)
      ? { rows: v.rows.map((r: Partial<QaRow>) => emptyRow(r)), essos: String(v.essos || '') }
      : null;
  } catch {
    return null;
  }
}

/** Saves the filled rows (or removes the draft when none is filled). Failing storage is ignored: no draft then. */
export function saveDraft(rows: QaRow[], essos: string): void {
  try {
    if (rows.some(isFilled)) localStorage.setItem(DRAFT, JSON.stringify({ rows: rows.filter(isFilled), essos }));
    else localStorage.removeItem(DRAFT);
  } catch {
    /* no draft */
  }
}

/** The last row is always empty, with the rank, Ο/Σ and room of the one above. */
export function withTail(rows: QaRow[]): QaRow[] {
  const last = rows[rows.length - 1];
  return !last ? [emptyRow({ rank: 'ΣΤΡ' })] : isFilled(last) ? [...rows, emptyRow(carryOf(last))] : rows;
}

/** Does changing this column copy the value to the empty row below? */
export const isCarried = (k: QaKey): boolean => (CARRY as string[]).includes(k);
