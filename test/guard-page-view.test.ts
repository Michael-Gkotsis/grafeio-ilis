// The pure rules of the «Υπηρεσίες» page (pages/guard/model/*): week hours, rules draft, tabs, next empty seat, skips.
import { describe, expect, it } from 'vitest';
import {
  afWhyOf,
  blockNames,
  checkLayout,
  chg,
  guardTabs,
  matchesQuery,
  monLbl,
  moveKey,
  nDays,
  nextEmptyKey,
  orderToSave,
  ownOf,
  ppl,
  pskOf,
  skipBadge,
  skipCount,
  splitSkips,
  toggleRot,
  weekDraft,
  weekIssue,
  weekToSave,
  when,
  WEEK_ORDER,
  type WeekDraft,
} from '../src/renderer/pages/guard';
import type { Person, Skip } from '../src/shared/domain';
import { DEFAULT_NUM_ROTS, DEFAULT_STRICT_ORDER } from '../src/core/model/dutyRules';

const person = (id: number, over: Partial<Person> = {}): Person =>
  ({ id, last: 'Λ' + id, first: 'Α', ...over }) as Person;
const skip = (from: string, to: string): Skip => ({ id: 's' + from, from, to }) as Skip;

describe('pages/guard view: week hours', () => {
  const ok = (): WeekDraft => weekDraft({ week: undefined } as never);

  it('lists the seven days, Monday first and Sunday last', () => {
    expect(WEEK_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(Object.keys(ok()).map(Number).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('accepts the default hours and saves them in the HH:MM form', () => {
    expect(weekIssue(ok())).toBe('');
    expect(Object.keys(weekToSave(ok()))).toHaveLength(7);
  });

  it('names the first wrong day', () => {
    const d = ok();
    d[1] = { ...d[1], out: '25:99' };
    expect(weekIssue(d)).toMatch(/μια ώρα δεν είναι σωστή/);
  });

  it('refuses outs that return before they leave', () => {
    const d = ok();
    d[2] = { ...d[2], out: '20:00', backOut: '19:00' };
    expect(weekIssue(d)).toMatch(/οι εξοδούχοι πρέπει να γυρνούν μετά/);
  });
});

describe('pages/guard view: rules draft', () => {
  it('toggles a rotation number and keeps the list sorted', () => {
    expect(toggleRot([0, 2], 1)).toEqual([0, 1, 2]);
    expect(toggleRot([0, 1, 2], 1)).toEqual([0, 2]);
  });

  it('never lets the list become empty and drops the default', () => {
    expect(toggleRot([1], 1)).toBeNull();
    expect(
      toggleRot([...DEFAULT_NUM_ROTS].slice(0, -1), DEFAULT_NUM_ROTS[DEFAULT_NUM_ROTS.length - 1]),
    ).toBeUndefined();
  });

  it('saves the strict order only when it is not the default', () => {
    expect(orderToSave([...DEFAULT_STRICT_ORDER])).toBeUndefined();
    expect(orderToSave([...DEFAULT_STRICT_ORDER].reverse())).toEqual([...DEFAULT_STRICT_ORDER].reverse());
  });

  it('moves a key without touching the input', () => {
    const o = ['a', 'b', 'c'];
    expect(moveKey(o, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveKey(o, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(o).toEqual(['a', 'b', 'c']);
  });

  it('counts in Greek', () => {
    expect(chg(0)).toBe('όπως η προεπιλογή');
    expect(chg(1)).toBe('1 αλλαγή');
    expect(chg(3)).toBe('3 αλλαγές');
    expect(ppl(1)).toBe('1 άτομο');
    expect(ppl(2)).toBe('2 άτομα');
  });
});

describe('pages/guard view: the screen', () => {
  it('labels the tabs with their counts and adds Excel on a narrow screen', () => {
    expect(guardTabs(0, 0, false).map((t) => t.label)).toEqual([
      'Θέσεις',
      'Έλεγχος υπηρεσιών',
      'Ποιος κάνει τι',
      'Εξαιρέσεις',
    ]);
    const m = guardTabs(3, 2, true);
    expect(m.map((t) => t.label)).toEqual(['Θέσεις (3)', 'Έλεγχος', 'Ποιος κάνει τι', 'Εξαιρέσεις (2)', 'Excel']);
    expect(m[4].value).toBe('xl');
  });

  it('explains the grey auto-fill button', () => {
    expect(afWhyOf(true, 5, 5)).toMatch(/Ξεκλείδωσε/);
    expect(afWhyOf(false, 0, 5)).toMatch(/Δυναμολόγιο/);
    expect(afWhyOf(false, 5, 0)).toMatch(/κενές θέσεις/);
    expect(afWhyOf(false, 5, 5)).toBe('');
  });

  it('gives the weekend only for Friday, Saturday and Sunday', () => {
    expect(pskOf('2026-11-13')).toHaveLength(3);
    expect(pskOf('2026-11-15')).toHaveLength(3);
    expect(pskOf('2026-11-10')).toBeNull();
  });

  it('counts the exceptions that are in force or come', () => {
    const people = [
      person(1, { skips: [skip('2026-11-01', '2026-11-02'), skip('2026-11-10', '2026-11-12')] }),
      person(2),
    ];
    expect(skipCount(people, '2026-11-10')).toBe(1);
  });

  it('writes the names of a closed block', () => {
    const pm = new Map([
      [1, person(1)],
      [2, person(2)],
    ]);
    const ps = [{ k: 'a' }, { k: 'b' }, { k: 'c' }] as never;
    expect(blockNames(ps, { a: 1, c: 2 }, pm)).toMatch(/,/);
    expect(blockNames(ps, {}, pm)).toBe('');
  });

  it('walks to the next empty seat after the current one, wrapping round', () => {
    const blocks = [{ id: 'b1' }, { id: 'b2', hidden: true }] as never;
    const posts = [
      { k: 'x1', block: 'b1' },
      { k: 'x2', block: 'b1' },
      { k: 'x3', block: 'b1' },
      { k: 'h1', block: 'b2' },
    ] as never;
    expect(nextEmptyKey(blocks, posts, { x1: 1, x2: null, x3: null }, 'x1', () => false)).toBe('x2');
    expect(nextEmptyKey(blocks, posts, { x1: null, x2: 1, x3: 2 }, 'x3', () => false)).toBe('x1');
    expect(nextEmptyKey(blocks, posts, { x1: 1, x2: 2, x3: 3 }, null, () => true)).toBe('');
    expect(nextEmptyKey(blocks, posts, {}, null, (k) => k === 'x3')).toBe('x3');
  });
});

describe('pages/guard view: check, who does, exceptions', () => {
  it('names the months', () => {
    expect(monLbl('2026-11')).toMatch(/2026$/);
  });

  it('lays the check columns out with a minimum width', () => {
    const l = checkLayout(['Θ', 'Μ']);
    expect(l.cols).toContain('px');
    expect(l.min).toBeGreaterThan(0);
  });

  it('matches a search by name without accents', () => {
    const p = person(1, { last: 'ΠΑΠΑΔΟΠΟΥΛΟΣ', first: 'ΝΙΚΟΣ', room: 3 });
    expect(matchesQuery(p, 'παπαδοπ')).toBe(true);
    expect(matchesQuery(p, 'νικοσ παπα')).toBe(true);
    expect(matchesQuery(p, 'Θ3')).toBe(true);
    expect(matchesQuery(p, 'ζζζ')).toBe(false);
    expect(matchesQuery(p, '  ')).toBe(true);
  });

  it('sees what the sergeant set by hand', () => {
    expect(ownOf({}, person(1))).toBe(false);
    expect(ownOf({ 1: { th: 'off' } } as never, person(1))).toBe(true);
    expect(ownOf({}, person(1, { offDays: [1] }))).toBe(true);
  });

  it('writes and counts an exception', () => {
    const k = skip('2026-11-13', '2026-11-15');
    expect(when(k)).toContain('→');
    expect(when(skip('2026-11-13', '2026-11-13'))).not.toContain('→');
    expect(nDays(k)).toBe(3);
  });

  it('splits exceptions into now, next and past (latest past first)', () => {
    const items = [
      { p: person(1), k: skip('2026-11-01', '2026-11-02') },
      { p: person(1), k: skip('2026-11-05', '2026-11-06') },
      { p: person(2), k: skip('2026-11-09', '2026-11-11') },
      { p: person(3), k: skip('2026-11-20', '2026-11-21') },
    ];
    const s = splitSkips(items, '2026-11-10');
    expect(s.now.map((x) => x.p.id)).toEqual([2]);
    expect(s.next.map((x) => x.p.id)).toEqual([3]);
    expect(s.past.map((x) => x.k.from)).toEqual(['2026-11-05', '2026-11-01']);
  });

  it('badges the groups', () => {
    expect(skipBadge('warn', '2026-11-10', '2026-11-10')).toBe('ισχύει');
    expect(skipBadge('info', '2026-11-11', '2026-11-10')).toBe('αύριο');
    expect(skipBadge('info', '2026-11-20', '2026-11-10')).toMatch(/^σε \d+ μέρες$/);
    expect(skipBadge('muted', '2026-11-01', '2026-11-10')).toBe('πέρασε');
  });
});
