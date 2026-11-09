// Time-of-day text normalisation.
//
// Purpose: turn typed or imported times ("14", "1400", "14.00", "9:30") into the one stored form "HH:MM".
// Does NOT: parse Excel cells (src/shared/hours.ts cellTime) or know about leaves and duties.
// Owner layer: core/lib (no fs, no Electron, no React).
// Why: the duty shifts in core/model need it, and core must not import from src/shared; hours.ts re-exports it.
// Covering tests: test/leave-hours.test.ts, test/shifts.test.ts.

/**
 * «14», «1400», «14.00», «14:00», «9:30» → «14:00», «09:30». 24 and «24:00» mean midnight («00:00»).
 * @returns '' for an empty input, null for an invalid time (hour above 24, minutes above 59, «24:30»).
 */
export function normTime(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const m = /^(\d{1,2})(?:\s*[:.,]\s*(\d{2})|(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = +m[1],
    mi = +(m[2] ?? m[3] ?? 0);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return String(h === 24 ? 0 : h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}
