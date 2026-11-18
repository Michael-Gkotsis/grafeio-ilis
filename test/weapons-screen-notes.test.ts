// Οθόνη Οπλισμού: οι σημειώσεις της γραμμής δεν σπάνε με παλιά/περίεργα δεδομένα.
// Σφάλμα 18/11 (φωτογραφίες Michael, έκδοση 11/11): «Cannot read properties of undefined (reading 'label')». Ο οπλίτης
// είχε έξοδο όπλου χωρίς είσοδο και μετά σβήστηκε ο αριθμός του: «Ένοπλη χωρίς όπλο» ζητούσε την επόμενη ένοπλη υπηρεσία, που δεν υπήρχε.
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { weaponInfo } from '../src/shared/weapons';
import type { AppState } from '../src/shared/domain';
import { notes } from '../src/renderer/screens/weapons';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-11-18', newId: () => 'w' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const D = '2026-11-18';
const html = (s: AppState, pid: number) => {
  const p = s.people.find(x => x.id === pid)!;
  const pm = new Map(s.people.map(x => [x.id, x]));
  return renderToString(React.createElement(React.Fragment, null, ...notes(p, weaponInfo(s, D), s.settings.lists, pm, s.statuses, D)));
};

describe('Οπλισμός: σημειώσεις γραμμής', () => {
  it('έξοδος όπλου χωρίς είσοδο και μετά σβήστηκε ο αριθμός: δεν σπάει, λέει «Έξοδος χωρίς όπλο»', () => {
    let s = run(fakeState(4), { t: 'setWeapons', changes: [{ pid: 1, weapon: '111' }] });
    s = run(s, { t: 'weaponOut', pids: [1], reason: 'ΕΚΠ', day: D, time: '08:00' });
    s = run(s, { t: 'setWeapons', changes: [{ pid: 1, weapon: '' }] });
    let out = '';
    expect(() => { out = html(s, 1); }).not.toThrow();
    expect(out).toContain('Έξοδος χωρίς όπλο');
    expect(out).toContain('ΕΚΠ από 18/11 08:00');
    expect(out).not.toMatch(/undefined|\[object|NaN/);
  });
  it('έξοδος παλιάς έκδοσης για άτομο χωρίς αριθμό (κίνηση με κενό όπλο): δεν σπάει', () => {
    const s = fakeState(3);
    s.weaponLog = [{ id: 'old1', pid: 2, weapon: '', reason: 'ΒΟΛΗ', outDay: '2026-11-10', outTime: '07:30' }];
    expect(() => html(s, 2)).not.toThrow();
    expect(html(s, 2)).toContain('Έξοδος χωρίς όπλο');
  });
  it('χωρίς τίποτα από αυτά: καμία σημείωση «χωρίς όπλο»', () => {
    const s = fakeState(3);
    expect(html(s, 3)).not.toMatch(/χωρίς όπλο/);
  });
});
