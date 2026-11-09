// Reminders of «Σήμερα»: the USB copy and what changed since the last time the app was opened.
//
// Purpose: `usbAge` / `usbDue` (days since the last copy to a USB stick, due after `USB_DAYS`) and `newsSince`
//   (the audit entries between the previous opening and this one).
// Does NOT: read the audit log or the clock itself (callers pass them), or show anything.
// Owner layer: core/notes (no fs, no Electron, no React).
// Why: both reminders are pure functions of dates and the audit list, so they are tested without the screen.
// Covering tests: test/cases.test.ts.
import { daysBetween, type ISODate } from '../lib/dates';
import type { AuditEntry } from '../model/state';

/** After how many days without a USB copy the reminder is due (research §4.2 and 11). */
export const USB_DAYS = 7;
/** Days since the last USB copy (null = never). */
export const usbAge = (last: string | null, today: ISODate): number | null =>
  last ? daysBetween(last, today) - 1 : null;
/** True when there was never a USB copy or the last one is older than `USB_DAYS`. */
export const usbDue = (last: string | null, today: ISODate): boolean => {
  const a = usbAge(last, today);
  return a == null || a > USB_DAYS;
};
/** Actions after the previous opening and up to the current one (the user already knows those made just now). */
export const newsSince = (audit: AuditEntry[], seenUntil: number, sessionStart: number): AuditEntry[] =>
  audit.filter((e) => e.id > seenUntil && e.id <= sessionStart && !e.undone);
