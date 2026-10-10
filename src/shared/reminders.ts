// Υπενθυμίσεις του «Σήμερα» (έρευνα §4.2 και 11): αντίγραφο σε USB, τι άλλαξε από το προηγούμενο άνοιγμα
import { daysBetween, type ISODate } from './dates';
import type { AuditEntry } from './domain';

export const USB_DAYS = 7;
/** Μέρες από το τελευταίο αντίγραφο σε USB (null = ποτέ). */
export const usbAge = (last: string | null, today: ISODate): number | null => (last ? daysBetween(last, today) - 1 : null);
export const usbDue = (last: string | null, today: ISODate): boolean => { const a = usbAge(last, today); return a == null || a > USB_DAYS; };
/** Ενέργειες μετά το προηγούμενο άνοιγμα και ως το τωρινό (όσες έγιναν τώρα τις ξέρει ήδη ο χρήστης). */
export const newsSince = (audit: AuditEntry[], seenUntil: number, sessionStart: number): AuditEntry[] =>
  audit.filter(e => e.id > seenUntil && e.id <= sessionStart && !e.undone);
