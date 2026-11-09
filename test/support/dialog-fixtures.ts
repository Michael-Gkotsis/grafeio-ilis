// Fixtures for the dialog HTML snapshots (test/screens-dialogs-*.test.ts): picks the rows from the shared snapshot
// state that a dialog needs as props (a started leave, a future leave, a penalty, an open weapon move, ...).
//
// Purpose: keep the two dialog test files short and make the choice of rows explicit and deterministic.
// Does NOT: invent data. Every row comes from snapshotState() (bench/state.ts + harness additions), so a change of
//   that data changes the snapshots; that is intended.
// Covering test: test/screens-dialogs-shell.test.ts, test/screens-dialogs-forms.test.ts.
import { createElement, type ComponentType, type ReactElement } from 'react';
import type { World } from './screens-harness';
import { TODAY, TOMORROW } from './screens-harness';
import { addDays } from '../../src/shared/dates';
import { armedRows, type ArmRow } from '../../src/shared/armed';
import { returnsOn } from '../../src/shared/returns';
import { activePeople } from '../../src/shared/rules';
import type { Cadre, Note, Person, Status, WeaponMove } from '../../src/shared/domain';
import type { Back } from '../../src/shared/returns';
import type { SourceBook, UpdInfo } from '../../src/shared/api';

/** `createElement` for a component whose props type is not worth spelling out in a test. */
export const el = (comp: unknown, props: object = {}): ReactElement =>
  createElement(comp as ComponentType<object>, props);

const first = <T>(items: T[], what: string): T => {
  const item = items[0];
  if (item === undefined) throw new Error('snapshot state has no ' + what);
  return item;
};

/**
 * The snapshot state has no armed duties (bench/state.ts uses unarmed posts), so armedRows() is empty; this row has
 * the shape the DutyFixDialog reads (minutes from the cycle start of 2026-11-09).
 */
const armedRowFallback = (who: number): ArmRow => ({
  id: TODAY + '|sk|1', day: TODAY, post: 'sk', n: 1, last: 1, mode: 'own', who, owner: who,
  label: 'Σκοπός 3ης σκοπιάς (α)',
  reason: 'ΥΠΗΡΕΣΙΑ ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ (Α)', from: 840, to: 960, out: 825, in: 975, autoOut: 825, autoIn: 975,
  take: false, give: false,
});

export interface Rows {
  person: Person; cadre: Cadre; note: Note; leaveStarted: Status; leaveFuture: Status; punishment: Status;
  sickness: Status; book: SourceBook; openMove: WeaponMove; back: Back; armed: ReturnType<typeof armedRows>[number];
}

/** Rows used as props. Deterministic: the first match in the (deterministic) snapshot state. */
export function pickRows(world: World, book: SourceBook): Rows {
  const { state } = world;
  const started = state.statuses.filter(s => s.type === 'LEAVE' && s.from < TODAY && s.to > TODAY);
  const leaveStarted = first(started, 'started leave');
  const future: Status = { ...leaveStarted, id: 'future-leave', from: TOMORROW, to: addDays(TODAY, 3) };
  const armedAround = [-3, -2, -1, 0, 1, 2, 3, 4].flatMap(d => armedRows(state, addDays(TODAY, d)));
  return {
    person: first(activePeople(state), 'person'),
    cadre: first(state.cadreList, 'cadre'),
    note: first(state.notes, 'note'),
    leaveStarted, leaveFuture: future,
    punishment: first(state.statuses.filter(s => s.type === 'PUN'), 'penalty'),
    sickness: first(state.statuses.filter(s => s.type === 'SICK'), 'sickness'),
    book,
    openMove: first(state.weaponLog.filter(m => !m.inDay), 'open weapon move'),
    back: first(returnsOn(state, TODAY), 'return'),
    armed: armedAround[0] ?? armedRowFallback(first(activePeople(state), 'person').id),
  };
}

/** UpdInfo as the main process reports it; `over` selects one of the four UpdateDialog branches. */
export const updInfo = (over: Partial<UpdInfo>): UpdInfo => ({
  version: '0.1.232', canApply: true, auto: true, lastCheck: 0, lastOk: true, lastError: '', checking: false,
  avail: { version: '0.1.240', date: '2026-11-04', size: 17825792, notes: ['Νέα οθόνη', 'Διορθώσεις'], setup: false },
  offer: true, phase: 'idle', step: 0, got: 0, total: 0, backup: '', error: '', target: '0.1.240', readyVersion: '',
  prev: '0.1.230', releases: 'https://example.invalid/releases', ...over,
} as UpdInfo);
