// The pure rules of the «Στελέχη» screen (pages/cadre/model/view.ts): status map, counts, rows, subtitle, labels, order.
import { describe, expect, it } from 'vitest';
import {
  GRID,
  activeParts,
  cadreStatusMap,
  cadreSub,
  countsPerFilter,
  dateLabel,
  exportToastText,
  filterRows,
  reorderIds,
} from '../src/renderer/pages/cadre/model/view';
import { apply, type Command } from '../src/shared/commands';
import { orderedCadre } from '../src/shared/cadre';
import { dayName, dm } from '../src/shared/dates';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-12';
const ctx = {
  today: D,
  newId: (() => {
    let i = 0;
    return () => 'n' + ++i;
  })(),
};
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const withCadres = (): AppState => {
  let s = fakeState(5);
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΛΟΧΙΑΔΗΣ', first: 'ΒΗΤΑΣ' } });
  s = run(s, {
    t: 'saveCadre',
    cadre: { rank: 'ΑΝΘΛΓΟΣ', hk: 'Ανθυπίλαρχοι-Ανθλγοι', last: 'ΑΝΘΥΠΑΚΗΣ', first: 'ΓΑΜΜΑΣ' },
  });
  const off = s.cadreList.find((c) => c.last === 'ΑΝΘΥΠΑΚΗΣ');
  return run(s, { t: 'saveCadre', cadre: { ...off!, active: false } });
};

describe('cadre page view', () => {
  const s = withCadres();
  const all = orderedCadre(s.cadreList);

  it('maps every member to a status (present = undefined) and counts every filter', () => {
    const stOf = cadreStatusMap(all, s, D);
    expect([...stOf.keys()]).toEqual(all.map((c) => c.id));
    const counts = countsPerFilter(all, stOf);
    expect(counts.all).toBe(1);
    expect(counts.inactive).toBe(1);
  });

  it('filters rows by filter and by search text (accents ignored)', () => {
    const stOf = cadreStatusMap(all, s, D);
    expect(filterRows(all, 'all', stOf, '').map((c) => c.last)).toEqual(['ΛΟΧΙΑΔΗΣ']);
    expect(filterRows(all, 'inactive', stOf, '').map((c) => c.last)).toEqual(['ΑΝΘΥΠΑΚΗΣ']);
    expect(filterRows(all, 'all', stOf, 'λοχιαδ')).toHaveLength(1);
    expect(filterRows(all, 'all', stOf, 'zzz')).toHaveLength(0);
  });

  it('writes the subtitle with and without a day label, and without members', () => {
    const counts = { all: 3, kol: 1, apo: 2 };
    const tail = '. Σύρε μια γραμμή για τη σειρά της ιεραρχίας.';
    expect(cadreSub(3, counts, '')).toBe('Δυναμικό στελεχών: 3 · κωλυόμενοι 1 · απόντες 2 σήμερα' + tail);
    expect(cadreSub(3, counts, 'Αύριο 13/10')).toBe(
      'Δυναμικό στελεχών: 3 · κωλυόμενοι 1 · απόντες 2 (αύριο 13/10)' + tail,
    );
    expect(cadreSub(0, {}, '')).toBe('Δυναμικό στελεχών: 0' + tail);
  });

  it('labels a day other than today and leaves today empty', () => {
    expect(dateLabel(D, D)).toBe('');
    expect(dateLabel('2026-10-13', D)).toBe(dayName('2026-10-13', D) + ' ' + dm('2026-10-13'));
  });

  it('lists the active filter parts only when they are on', () => {
    expect(activeParts('all', '', '  ')).toEqual([false, '', '']);
    expect(activeParts('inactive', 'Αύριο 13/10', ' ab ')).toEqual(['Εκτός δύναμης', 'Αύριο 13/10', '«ab»']);
  });

  it('words the export toast with the file name, the inactive note and the day', () => {
    expect(exportToastText('C:\\x\\Στελέχη.xlsx', true, D, D)).toBe(
      'Βγήκε Στελέχη.xlsx: στελέχη, καταστάσεις, εκτός δύναμης, για σήμερα.',
    );
    expect(exportToastText('/tmp/a.xlsx', false, '2026-10-13', D)).toBe(
      'Βγήκε a.xlsx: στελέχη, καταστάσεις, για ' + dayName('2026-10-13', D).toLowerCase() + ' 13/10.',
    );
  });

  it('moves one id in front of or behind another in the whole list', () => {
    const l = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    expect(reorderIds(l, 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderIds(l, 'd', 'b', false)).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderIds(l, 'b', 'a', false)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('keeps the grid string the column widths were measured for', () => {
    expect(GRID.split(' ')).toHaveLength(11);
  });
});
