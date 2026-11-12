// The pure text helpers of the «Σήμερα» page (pages/today/model/view.ts): sub-title, end rows, κωλυόμενοι texts.
import { describe, expect, it } from 'vitest';
import {
  endRows,
  kolBadge,
  kolBadgeTip,
  kolNote,
  newsDay,
  recordWhat,
  todaySub,
  untilText,
} from '../src/renderer/pages/today/model/view';
import type { Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

// Only the fields these helpers read.
const st = (o: Partial<Status>) =>
  ({ id: 1, pid: 1, type: 'EY', from: '2026-03-10', to: '2026-03-12', ...o }) as Status;
const lists = fakeState(2).settings.lists;

describe('today page view', () => {
  it('writes the sub-title for none, one and many tasks, with the duty start only when seats are empty', () => {
    const none = todaySub('2026-03-10', 0, 3, '08:00');
    expect(none).toBe('Ημερήσια κατάσταση Τρίτης 10/03/2026. Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.');
    expect(todaySub('2026-03-10', 1, 0, '08:00')).toMatch(/\. 1 πράγμα θέλει εσένα\.$/);
    expect(todaySub('2026-03-10', 2, 1, '08:00')).toMatch(/\. 2 πράγματα θέλουν εσένα\. Το πρώτο πριν τις 08:00\.$/);
  });

  it('orders the ending rows: expired, today, tomorrow, and gives a tip only to expired and today', () => {
    const [a, b, c] = [st({ id: 1 } as never), st({ id: 2 } as never), st({ id: 3 } as never)];
    const rows = endRows({ expired: [a], ending: [b], endTom: [c], nRec: 3 }, (s) => 'tip' + s.id);
    expect(rows.map((r) => [r.s.id, r.when, r.tip])).toEqual([
      [1, 'έληξε χθες, αφαιρέθηκε αυτόματα', 'Από σήμερα δεν ισχύει· γράφτηκε στο Ιστορικό'],
      [2, 'λήγει σήμερα', 'tip2'],
      [3, 'λήγει αύριο', ''],
    ]);
  });

  it('shows when a status ends, with or without a time, or no end', () => {
    expect(untilText(st({ open: true }))).toBe('χωρίς λήξη');
    expect(untilText(st({}))).toBe('έως 12/03');
    expect(untilText(st({ toTime: '08:30' }))).toBe('έως 12/03 08:30');
  });

  it('writes the note of a prevented person by status type', () => {
    expect(kolNote(st({ type: 'STEP', note: 'x' }), lists)).toMatch(/ · x$/);
    expect(kolNote(st({ type: 'KOL' }), lists)).toBe('Κωλυόμενος');
    expect(kolNote(st({ type: 'KOL', note: 'ΣΤΕΠ' }), lists)).toBe('ΣΤΕΠ');
  });

  it('writes the κωλυόμενοι badge and its tip for stay-present, column and no-column cases', () => {
    expect(kolBadge(false, 'x')).toBe('παρών');
    expect(kolBadge(true, '-')).toMatch(/^εκτός /);
    expect(kolBadge(true, undefined)).toMatch(/^εκτός /);
    expect(kolBadgeTip(false, '-')).toMatch(/^Μένει στους παρόντες/);
    expect(kolBadgeTip(true, '-')).toMatch(/^Αφαιρείται από τους παρόντες· δεν μετρά σε στήλη/);
  });

  it('labels a penalty with its kind and anything else with the status label', () => {
    expect(recordWhat(st({ type: 'PUN', kind: 'x' as never }), lists)).toMatch(/^ποινή \(/);
    expect(recordWhat(st({ type: 'EY' }), lists)).not.toMatch(/^ποινή/);
  });

  it('leaves the news day empty for today and writes weekday and date for other days', () => {
    expect(newsDay('2026-03-10', '2026-03-10')).toBe('');
    expect(newsDay('2026-03-09', '2026-03-10')).toMatch(/ 09\/03 $/);
  });
});
