// What the «Αρχεία Excel» alert of «Σήμερα» says.
// Purpose: `sourceAlertLines` turns the status of the files into one line per file («αρχείο: είδη · λόγος»), plus the
//   forms with an error and the «ο έλεγχος υπηρεσιών δείχνει ακόμα <μήνα>» line.
// Does NOT: use hooks or draw anything; it is a pure function of the status and the day.
// Owner layer: renderer/widgets/sources-alert. Why: moved verbatim from screens/srcStatus.ts (Phase 5.3c part 2).
// Covering test: test/screens-main.test.ts (Σήμερα), test/sources.test.ts.
import { KIND } from '../../../../core/excel-in/fields';
import type { SourceStatus } from '../../../../shared/api';
import { MONTHS, type ISODate } from '../../../../shared/dates';
import type { SourcesState } from './useSourceStatus';

/** The file name of a path (either separator). */
export const base = (f: string) => f.split(/[\\/]/).pop() || f;

/** Why a source needs attention, in words; empty when it is fine. */
const why = (x: SourceStatus) =>
  !x.exists
    ? 'δεν βρέθηκε'
    : x.remap
      ? 'περιμένει αντιστοίχιση (Στήλες…): ' + x.remap
      : x.hold
        ? 'περιμένει «Ανανέωση από Excel»'
        : x.changed
          ? 'άλλαξε εκτός εφαρμογής'
          : x.locked
            ? 'είναι ανοιχτό στο Excel, η αλλαγή περιμένει'
            : x.error || '';

/** One line per file that needs attention (empty when all is well). @param today ISODate, local time */
export function sourceAlertLines(st: SourcesState, today: ISODate): string[] {
  const files = new Map<string, Map<string, string[]>>();
  for (const x of st.sources) {
    const w = why(x);
    if (!w) continue;
    const f = files.get(x.file) || new Map<string, string[]>();
    files.set(x.file, f);
    f.set(w, [...(f.get(w) || []), KIND[x.kind].label]);
  }
  const lines: string[] = [...files].map(
    ([f, m]) => base(f) + ': ' + [...m].map(([w, ks]) => ks.join(', ') + ' · ' + w).join('; '),
  );
  for (const x of st.forms) if (x.error) lines.push(base(x.file) + ': ' + x.error);
  // έλεγχος υπηρεσιών: από την 1η του μήνα, αν το φύλλο είναι ακόμα του προηγούμενου
  const duties = st.sources.find((x) => x.kind === 'duties');
  const now = today.slice(0, 7);
  const acc = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1].replace(/ς$/, '');
  if (duties?.month && duties.month < now)
    lines.push(
      'Ο έλεγχος υπηρεσιών δείχνει ακόμα ' +
        acc(duties.month) +
        '. Πάτα «Νέος μήνας» για να μπει φύλλο για τον ' +
        acc(now) +
        ' στο ίδιο αρχείο (ή Στήλες… / Άλλο αρχείο… αν το έχεις ήδη).',
    );
  return lines;
}
