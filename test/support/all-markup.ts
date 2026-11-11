// The HTML of every screen and every dialog/sheet render case, for rules about what the app puts on the page.
//
// Purpose: "no screen uses a native <select>", "only DateField has a date input" and similar rules were source greps
//   (`readFileSync('src/renderer/...')`). They are now checked on what the screens actually render, which keeps working
//   when a screen moves to pages/<screen>/ui.tsx or from htm to TSX.
// Does NOT: click or open anything (first render only, like the 0.3a snapshots), and it covers what the 0.3a harness
//   covers: the 13 screens and the dialog cases (see test/__snapshots__/screens/COVERAGE.md for what is not rendered).
// Owner layer: test support only. Covering test: the behaviour tests that import it (dropdowns, date-time-fields).
// The test file must mock react (`mockReact`) and react-dom (`mockReactDom`) like every SSR test.
import { createElement, type ComponentType } from 'react';
import * as H from './screens-harness';
import { renderCase, type BehaviourWorld } from './behaviour';
import { SHELL_CASES } from './dialog-cases-shell';
import { FORMS_CASES } from './dialog-cases-forms';
import { CadreScreen } from '../../src/renderer/screens/cadre';
import { DiagScreen } from '../../src/renderer/screens/diag';
import { GuardScreen, OutsScreen } from '../../src/renderer/screens/guard';
import { HkaiScreen, HistoryScreen, StrengthScreen } from '../../src/renderer/screens/other';
import { StatusesPage } from '../../src/renderer/pages/statuses';
import { HdTab } from '../../src/renderer/widgets/hd';
import { TodayScreen } from '../../src/renderer/screens/today';
import { NotesScreen } from '../../src/renderer/screens/notes';
import { PeopleScreen } from '../../src/renderer/screens/people';
import { ReportsScreen } from '../../src/renderer/screens/reports';
import { WeaponsScreen } from '../../src/renderer/screens/weapons';

const SCREENS: [string, ComponentType<never>][] = [
  ['home', TodayScreen], ['people', PeopleScreen], ['cadre', CadreScreen], ['guard', GuardScreen], ['outs', OutsScreen],
  ['records', StatusesPage], ['strength', StrengthScreen], ['hkai', HkaiScreen], ['hd', HdTab], ['weapons', WeaponsScreen],
  ['reports', ReportsScreen], ['notes', NotesScreen], ['history', HistoryScreen], ['diag', DiagScreen],
];

/** `screen:<view>` and `case:<name>` with the first-render HTML. Fails when fewer than expected were rendered. */
export function renderEverything(bw: BehaviourWorld): { name: string; html: string }[] {
  const screens = SCREENS.map(([view, comp]) => ({ name: 'screen:' + view, html: H.renderIn(bw.world, view, {}, createElement(comp)) }));
  const cases = [...SHELL_CASES, ...FORMS_CASES].map(c => ({ name: 'case:' + c.name, html: renderCase(bw, c.name) }));
  const all = [...screens, ...cases];
  if (screens.length < 13 || cases.length < 50) throw new Error(`renderEverything: only ${screens.length} screens, ${cases.length} cases`);
  return all;
}
