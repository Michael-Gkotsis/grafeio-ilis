// HTML snapshots of every renderer screen and of every tab that the app selects through nav params.
//
// Purpose: the net for the Feature-Sliced/TSX rewrite. A structural PR must render IDENTICAL HTML, so this test must
//   pass WITHOUT `-u`. A diff here means the markup (text, class names, attributes, order) of a screen changed.
// Does NOT: click, run effects or measure layout (react-dom/server renders the first render only: data that a screen
//   loads in an effect, e.g. reports list or Diagnostics numbers, shows its loading state). Local-useState tabs and
//   dialogs opened by a click are listed in test/__snapshots__/screens/COVERAGE.md and belong to the browser DOM
//   snapshot (PR 0.3b).
// Data: bench/state.ts with 12 soldiers, 60 days of history up to 2026-11-09, clock frozen at 2026-11-09 11:00 Athens.
// Files: test/__snapshots__/screens/screen-*.html and tab-*.html, one per screen/tab (written by vitest).
//
// How to update:
//   - Structural PR (move to TSX / folders): never use -u. If this fails, fix the PR, not the snapshot.
//   - UI redesign PR: `npx vitest run test/screens-main.test.ts -u`, review `git diff test/__snapshots__/screens`, and
//     say in the PR description that the screen HTML changed on purpose.
//   - First run in a new checkout: files exist in git, nothing to do.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import * as H from './support/screens-harness';
import { CadreScreen } from '../src/renderer/screens/cadre';
import { DiagScreen } from '../src/renderer/screens/diag';
import { GuardScreen, OutsScreen } from '../src/renderer/screens/guard';
import { HkaiScreen, HistoryScreen, RecordsScreen, StrengthScreen } from '../src/renderer/screens/other';
import { TodayScreen } from '../src/renderer/screens/today';
import { NotesScreen } from '../src/renderer/screens/notes';
import { PeopleScreen } from '../src/renderer/screens/people';
import { ReportsScreen } from '../src/renderer/screens/reports';
import { SkipsView } from '../src/renderer/screens/skips';
import { WeaponsScreen } from '../src/renderer/screens/weapons';
import { WhoDoes } from '../src/renderer/screens/whodoes';
import { FORM_PARAM } from '../src/shared/repPage';
import { NOTE_FILTERS } from '../src/shared/notes';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReact(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));

type Params = Record<string, unknown>;
interface Case { name: string; view: string; comp: ComponentType<never>; params?: Params; props?: object }

// Settings sections and Guide topics are in test/screens-settings-guide.test.ts.
const SCREENS: Case[] = [
  { name: 'home', view: 'home', comp: TodayScreen },
  { name: 'people', view: 'people', comp: PeopleScreen },
  { name: 'cadre', view: 'cadre', comp: CadreScreen },
  { name: 'guard', view: 'guard', comp: GuardScreen },
  { name: 'outs', view: 'outs', comp: OutsScreen },
  { name: 'records', view: 'records', comp: RecordsScreen },
  { name: 'strength', view: 'strength', comp: StrengthScreen },
  { name: 'hkai', view: 'hkai', comp: HkaiScreen },
  { name: 'weapons', view: 'weapons', comp: WeaponsScreen },
  { name: 'reports', view: 'reports', comp: ReportsScreen },
  { name: 'notes', view: 'notes', comp: NotesScreen },
  { name: 'history', view: 'history', comp: HistoryScreen },
  { name: 'diag', view: 'diag', comp: DiagScreen },
];

// A tab is selected by a nav param (the same key the app writes with nav.set). The default tab is the screen snapshot.
type Comp = ComponentType<never>;
/** One case per value of a nav param: `name--value`. */
const byParam = (name: string, view: string, comp: Comp, key: string, values: string[], extra: Params = {}): Case[] =>
  values.map(value => ({ name: name + '--' + value, view, comp, params: { ...extra, [key]: value } }));
const NOTE_KEYS = NOTE_FILTERS.map(([filter]) => filter).filter(filter => filter !== 'all');

const TABS: Case[] = [
  { name: 'people--imer', view: 'people', comp: PeopleScreen, params: { ptab: 'imer' } },
  ...byParam('cadre', 'cadre', CadreScreen, 'filter', ['kol', 'apo', 'inactive']),
  { name: 'guard--date-today', view: 'guard', comp: GuardScreen, params: { guardDate: H.TODAY } },
  { name: 'guard--skips', view: 'guard', comp: SkipsView as Comp, props: {} },
  { name: 'guard--whodoes', view: 'guard', comp: WhoDoes as Comp, props: { date: H.TOMORROW } },
  ...byParam('records', 'records', RecordsScreen, 'recTab', ['changes', 'expired', 'notes']),
  ...byParam('strength', 'strength', StrengthScreen, 'svCat', ['present', 'kol', 'away']),
  ...byParam('hkai', 'hkai', HkaiScreen, 'hkTab', ['pun', 'leave', 'req', 'hd']),
  ...byParam('hkai--pun', 'hkai', HkaiScreen, 'punTab', ['expired', 'allpun'], { hkTab: 'pun' }),
  { name: 'hkai--leave-back', view: 'hkai', comp: HkaiScreen, params: { hkTab: 'leave', leaveTab: 'back' } },
  { name: 'weapons--moves', view: 'weapons', comp: WeaponsScreen, params: { wtab: 'moves' } },
  ...byParam('weapons--moves', 'weapons', WeaponsScreen, 'wmoves', ['day', 'all'], { wtab: 'moves' }),
  { name: 'reports--templates', view: 'reports', comp: ReportsScreen, params: { repTab: 'tpls' } },
  ...byParam('notes', 'notes', NotesScreen, 'nfilter', NOTE_KEYS),
];

let world: H.World;
beforeAll(async () => {
  H.quietKnownWarnings();
  H.installBrowserStubs();
  H.freezeClock();
  world = await H.makeWorld();
});

const render = (c: Case) =>
  H.renderIn(world, c.view, c.params ?? {}, createElement(c.comp as ComponentType<object>, c.props ?? {}));

describe('screen HTML snapshots', () => {
  it.each(SCREENS)('screen $name', async c => {
    await expect(render(c)).toMatchFileSnapshot(H.snapPath('screen', c.name));
  });
});

describe('app shell HTML snapshots (menu, top bar, bottom bar; Home inside)', () => {
  it('shell with the full menu', async () => {
    await expect(H.renderApp(world)).toMatchFileSnapshot(H.snapPath('screen', 'shell-full'));
  });
  it('shell with the narrow menu (Ρυθμίσεις › Εμφάνιση › Μενού: στενό)', async () => {
    await expect(H.renderApp(world, { nav: 'rail' })).toMatchFileSnapshot(H.snapPath('screen', 'shell-rail'));
  });
});

describe('tab HTML snapshots (selected by nav params)', () => {
  it.each(TABS)('tab $name', async c => {
    await expect(render(c)).toMatchFileSnapshot(H.snapPath('tab', c.name));
  });

  it('a form page of the Έντυπα screen is selected by the repForm param', async () => {
    const form = createElement(ReportsScreen as ComponentType<object>);
    const out = H.renderIn(world, 'reports', { [FORM_PARAM]: {} }, form);
    await expect(out).toMatchFileSnapshot(H.snapPath('tab', 'reports--form-new'));
  });
});
