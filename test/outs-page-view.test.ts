// The pure rules of the «Εξοδούχοι» page (pages/outs/model/view.ts): choices, saved and draft maps, changes, filters.
import { describe, expect, it } from 'vitest';
import {
  OUT_OPTS,
  OUT_OPTS_SAT,
  countOf,
  filterOutRows,
  mergeDraft,
  noteChangesOf,
  outDaysOf,
  outDiffs,
  pendingDays,
  roomsTxt,
  savedOuts,
  toChanges,
  valLbl,
  valTone,
  weekendSunPids,
  withChoice,
  type AwayMap,
  type OutDraft,
} from '../src/renderer/pages/outs';
import type { Person, Status } from '../src/shared/domain';

const st = (o: Partial<Status> & { pid: number; type: Status['type'] }): Status =>
  ({ id: 's' + o.pid, from: '2026-11-14', to: '2026-11-14', ...o }) as Status;
const person = (id: number, room: number, last: string, active = true): Person =>
  ({ id, room, last, first: 'Α', active }) as Person;

describe('pages/outs view', () => {
  it('offers Μένει / Έξοδος / ΔΝ, and «ΔΝ ΣΚ» only on Saturday', () => {
    expect(OUT_OPTS.map((o) => o.value)).toEqual(['', 'OUT', 'DN']);
    expect(OUT_OPTS_SAT.map((o) => o.value)).toEqual(['', 'OUT', 'DN', 'DNSK']);
  });

  it('labels and tones: «ΔΝ ΣΚ» looks like ΔΝ, away replaces «Μένει»', () => {
    expect(valLbl('DNSK')).toBe('ΔΝ ΣΚ');
    expect(valLbl(null)).toBe('Μένει');
    expect(valLbl('OUT')).toBe('Εξοδούχος');
    expect(valTone('DNSK')).toBe(valTone('DN'));
  });

  it('writes consecutive rooms as a range and others as a list', () => {
    expect(roomsTxt([1, 2, 3, 4])).toBe('1–4');
    expect(roomsTxt([1, 3, 5])).toBe('1, 3, 5');
    expect(roomsTxt([1, 2])).toBe('1, 2');
  });

  it('lists today, tomorrow and the next Saturday and Sunday once, sorted', () => {
    expect(outDaysOf('2026-11-09', '2026-11-10')).toEqual(['2026-11-09', '2026-11-10', '2026-11-14', '2026-11-15']);
    expect(outDaysOf('2026-11-14', '2026-11-15')).toEqual(['2026-11-14', '2026-11-15']);
  });

  it('reads the stored outs of a day; weekend ΔΝ shows as «ΔΝ ΣΚ» only on Saturday', () => {
    const ss = [
      st({ pid: 1, type: 'OUT' }),
      st({ pid: 2, type: 'DN', kind: 'ΣΚ', to: '2026-11-15' }),
      st({ pid: 3, type: 'LEAVE' }),
      st({ pid: 4, type: 'OUT', from: '2026-11-20', to: '2026-11-20' }),
    ];
    expect(savedOuts(ss, '2026-11-14', true)).toEqual({ 1: 'OUT', 2: 'DNSK' });
    expect(savedOuts(ss, '2026-11-15', false)).toEqual({ 2: 'DN' });
    expect([...weekendSunPids(ss, '2026-11-15', false)]).toEqual([2]);
    expect([...weekendSunPids(ss, '2026-11-14', true)]).toEqual([]);
  });

  it('keeps what the user changed when the stored map changes elsewhere', () => {
    const old: OutDraft = { 1: 'OUT', 2: 'DN' };
    const saved: OutDraft = { 1: 'OUT', 2: 'DN', 3: 'OUT' };
    // user dropped 2 and added 4; 3 came from outside
    expect(mergeDraft({ 1: 'OUT', 4: 'DN' }, saved, old)).toEqual({ 1: 'OUT', 3: 'OUT', 4: 'DN' });
    // someone else changed 1: that wins over the draft
    expect(mergeDraft({ 1: 'OUT', 2: 'DN' }, { 1: 'DN', 2: 'DN' }, old)).toEqual({ 1: 'DN', 2: 'DN' });
  });

  it('sets and clears one choice without touching the old draft', () => {
    const d: OutDraft = { 1: 'OUT' };
    expect(withChoice(d, 2, 'DN')).toEqual({ 1: 'OUT', 2: 'DN' });
    expect(withChoice(d, 1, null)).toEqual({});
    expect(d).toEqual({ 1: 'OUT' });
  });

  it('finds the changes and writes «ΔΝ ΣΚ» as ΔΝ with wk', () => {
    const people = [person(1, 1, 'Α'), person(2, 1, 'Β'), person(3, 2, 'Γ')];
    const diffs = outDiffs(people, { 1: 'OUT' }, { 2: 'DNSK', 3: 'DN' });
    expect(diffs).toEqual([
      { pid: 1, from: 'OUT', to: null },
      { pid: 2, from: null, to: 'DNSK' },
      { pid: 3, from: null, to: 'DN' },
    ]);
    expect(toChanges(diffs)).toEqual([
      { pid: 1, from: 'OUT', to: null },
      { pid: 2, from: null, to: 'DN', wk: true },
      { pid: 3, from: null, to: 'DN' },
    ]);
  });

  it('compares notes trimmed against the stored ones', () => {
    expect(noteChangesOf({ 1: ' x ', 2: '' }, { 2: 'old', 3: 'same' })).toEqual([
      { pid: 1, note: 'x' },
      { pid: 2, note: '' },
      { pid: 3, note: '' },
    ]);
    expect(noteChangesOf({ 1: 'a ' }, { 1: 'a' })).toEqual([]);
  });

  it('filters by room and chip, and sorts by room then name unless searching', () => {
    const found = [person(1, 2, 'Β'), person(2, 1, 'Γ'), person(3, 1, 'Α'), person(4, 3, 'Δ', false)];
    const aways: AwayMap = new Map([[3, { st: st({ pid: 3, type: 'LEAVE' }), note: 'n' }]]);
    const f = {
      filter: 'all',
      room: null,
      sort: 'room',
      dq: '',
      reasons: { 2: 'ΕΥ' },
      aways,
      draft: { 1: 'OUT' } as OutDraft,
    };
    expect(filterOutRows(found, f).map((p) => p.id)).toEqual([3, 2, 1]);
    expect(filterOutRows(found, { ...f, sort: 'name' }).map((p) => p.id)).toEqual([1, 2, 3]);
    expect(filterOutRows(found, { ...f, dq: 'x' }).map((p) => p.id)).toEqual([1, 2, 3]);
    expect(filterOutRows(found, { ...f, filter: 'can' }).map((p) => p.id)).toEqual([1]);
    expect(filterOutRows(found, { ...f, filter: 'cant' }).map((p) => p.id)).toEqual([3, 2]);
    expect(filterOutRows(found, { ...f, filter: 'sel' }).map((p) => p.id)).toEqual([1]);
    expect(filterOutRows(found, { ...f, room: 1 }).map((p) => p.id)).toEqual([3, 2]);
  });

  it('counts a choice and groups undeclared return days', () => {
    expect(countOf({ 1: 'OUT', 2: 'OUT', 3: 'DN' }, 'OUT')).toBe(2);
    const backs = [
      { p: person(1, 1, 'Α'), r: { day: 'd1', pending: true } },
      { p: person(2, 1, 'Β'), r: { day: 'd1', pending: true } },
      { p: person(3, 1, 'Γ'), r: { day: 'd2' } },
    ] as unknown as Parameters<typeof pendingDays>[0];
    expect(pendingDays(backs, (p) => p.last)).toEqual([['d1', ['Α', 'Β']]]);
  });
});
