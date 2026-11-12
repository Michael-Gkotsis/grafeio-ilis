// Pure rules of the «Αντίγραφα ασφαλείας» card: the texts and the list shown.
// Purpose: `backupsView` helpers for `BackupsCard` and their test.
// Does NOT: render anything, touch React or call the main process (model/useBackups.ts does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4) so the rules are
//   testable without a render.
// @decision research §4.2: before a restore the current database is kept as a backup; a copy on a USB stick every
//   `USB_DAYS` days, because the automatic backups are on the same disk.
// Covering test: test/settings-backups-view.test.ts.
import type { BackupInfo } from '../../../../shared/api';
import { dmy, dow, type ISODate } from '../../../../shared/dates';
import { usbDue } from '../../../../shared/reminders';

/** How many backups the list shows (newest first, as the main process sends them). */
export const BACKUPS_SHOWN = 15;

/** One text node: the start of the card's first paragraph, up to the space before «αντίγραφο σε USB». */
export const AUTO_NOTE =
  'Αυτόματα: ένα κάθε μέρα και πριν από κάθε εισαγωγή, στον φάκελο data\\backups. Επειδή είναι στον ίδιο δίσκο, ' +
  'πάρε και ';

/** One text node: after the USB days, up to the line break the htm text had before «Τελευταίο σε USB». */
export const USB_LEAD = ' μέρες.\n      Τελευταίο σε USB: ';

/** The day of the last USB copy («Τρ 11/11/2026»), or «ποτέ». */
export const lastUsbText = (lastUsb: string | null): string => (lastUsb ? dow(lastUsb) + ' ' + dmy(lastUsb) : 'ποτέ');

/** The class of that day: red when a copy is due. */
export const lastUsbClass = (lastUsb: string | null, today: ISODate): string =>
  usbDue(lastUsb, today) ? 'txt-bad' : '';

/** The backups the list shows. */
export const shownBackups = (list: BackupInfo[]): BackupInfo[] => list.slice(0, BACKUPS_SHOWN);

/** The size in KB, rounded. */
export const sizeKb = (b: BackupInfo): number => Math.round(b.size / 1024);

/** The subtitle of the restore dialog: the day and the label. */
export const restoreSubtitle = (b: BackupInfo): string => dmy(b.day) + ' · ' + b.label;
