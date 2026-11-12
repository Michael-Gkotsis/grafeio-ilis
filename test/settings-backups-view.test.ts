// The pure rules of the «Αντίγραφα ασφαλείας» card (pages/settings/model/backupsView.ts).
import { describe, expect, it } from 'vitest';
import {
  AUTO_NOTE,
  BACKUPS_SHOWN,
  USB_LEAD,
  lastUsbClass,
  lastUsbText,
  restoreSubtitle,
  shownBackups,
  sizeKb,
} from '../src/renderer/pages/settings/model/backupsView';

const backup = (n: number) => ({ name: 'b' + n, day: '2026-11-09', label: 'αυτόματο', size: 2048 * n });

describe('Αντίγραφα ασφαλείας view', () => {
  it('shows the last 15 as sent, newest first', () => {
    const all = Array.from({ length: 20 }, (_, i) => backup(i + 1));
    expect(shownBackups(all)).toHaveLength(BACKUPS_SHOWN);
    expect(shownBackups(all)[0]).toBe(all[0]);
    expect(shownBackups(all.slice(0, 3))).toHaveLength(3);
  });

  it('rounds the size to KB', () => {
    expect(sizeKb(backup(3))).toBe(6);
    expect(sizeKb({ ...backup(1), size: 1500 })).toBe(1);
  });

  it('says the day of the last USB copy, or «ποτέ»', () => {
    expect(lastUsbText(null)).toBe('ποτέ');
    expect(lastUsbText('2026-11-09')).toMatch(/ 09\/11\/2026$/);
  });

  it('turns the day red when a copy is due', () => {
    expect(lastUsbClass(null, '2026-11-09')).toBe('txt-bad');
    expect(lastUsbClass('2026-11-08', '2026-11-09')).toBe('');
    expect(lastUsbClass('2026-10-01', '2026-11-09')).toBe('txt-bad');
  });

  it('titles the restore question with the day and the label', () => {
    expect(restoreSubtitle(backup(1))).toBe('09/11/2026 · αυτόματο');
  });

  it('keeps the exact text nodes of the first paragraph (backslash, line break and indent)', () => {
    expect(AUTO_NOTE).toContain('data\\backups.');
    expect(AUTO_NOTE.endsWith('πάρε και ')).toBe(true);
    expect(USB_LEAD).toBe(' μέρες.\n      Τελευταίο σε USB: ');
  });
});
