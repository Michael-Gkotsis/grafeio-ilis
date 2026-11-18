// Υπενθυμίσεις του «Σήμερα» (έρευνα §4.2 και 11): αντίγραφο σε USB, τι άλλαξε από το προηγούμενο άνοιγμα
import { daysBetween, type ISODate } from './dates';
import type { AppState, AuditEntry, CadreService } from './domain';
import { assetCfgOf, maintState, registry, type AssetRow } from './assets';
import { vehMaint } from './vehicles';
import { dutyCfgOf, runsOn } from './cadreDuty';

export const USB_DAYS = 7;
/** Μέρες από το τελευταίο αντίγραφο σε USB (null = ποτέ). */
export const usbAge = (last: string | null, today: ISODate): number | null => (last ? daysBetween(last, today) - 1 : null);
export const usbDue = (last: string | null, today: ISODate): boolean => { const a = usbAge(last, today); return a == null || a > USB_DAYS; };
/** Ενέργειες μετά το προηγούμενο άνοιγμα και ως το τωρινό (όσες έγιναν τώρα τις ξέρει ήδη ο χρήστης). */
export const newsSince = (audit: AuditEntry[], seenUntil: number, sessionStart: number): AuditEntry[] =>
  audit.filter(e => e.id > seenUntil && e.id <= sessionStart && !e.undone);

/** Συντήρηση που έληξε ή λήγει σύντομα (ASSET_WARN_DAYS ή η ρύθμιση του μητρώου): η ίδια λογική με το φίλτρο «Συντήρηση σε N μέρες» του Μητρώου και των Οχημάτων (τα οχήματα και με χιλιόμετρα). */
export function maintDueRows(s: Pick<AppState, 'people' | 'cadreList' | 'assets' | 'settings'>, today: ISODate): { row: AssetRow; overdue: boolean }[] {
  const warn = assetCfgOf(s.settings).warnDays; const out: { row: AssetRow; overdue: boolean }[] = [];
  for (const r of registry(s)) {
    const m = r.cat?.kind === 'vehicle' ? vehMaint(r.a, r.cat, today, warn).st : maintState(r.a, today, warn);
    if (m === 'soon' || m === 'overdue') out.push({ row: r, overdue: m === 'overdue' });
  }
  return out;
}
/** Υπηρεσίες του προγράμματος στελεχών που τρέχουν τη μέρα d και δεν έχουν κανέναν. Κενό αν δεν έχουν οριστεί υπηρεσίες (το πρόγραμμα δεν χρησιμοποιείται). */
export function cadreDutyGaps(s: Pick<AppState, 'settings' | 'cadreDuties'>, d: ISODate): CadreService[] {
  const out: CadreService[] = [];
  for (const g of dutyCfgOf(s.settings).groups) for (const v of g.services) if (runsOn(v, d) && !(s.cadreDuties || []).some(x => x.date === d && x.svc === v.id)) out.push(v);
  return out;
}
