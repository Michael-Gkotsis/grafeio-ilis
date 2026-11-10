// Route registry: which screens exist, their menu name and icon, and the order of every menu.
// Purpose: one typed table `ScreenId -> { id, name, icon, component }` plus the menu lists the shell and the shortcuts
//   (Alt+1 … Alt+9, Alt+0) read.
// Does NOT: render anything, keep route state (useRouter.ts does) or know about params (screenId.ts).
// Owner layer: renderer/app (architecture). Why: this table replaces `SCREENS: Record<string, [string, any, any]>`;
//   a wrong id in a menu list or a missing screen now fails `tsc`.
// Covering test: test/ux-names.test.ts (menu names), test/screens-main.test.ts, test/guide.test.ts (screen list).
import { lazy, type ComponentType, type ReactNode } from 'react';
import { FORM_PARAM } from '../../shared/repPage';
import { HK } from '../../shared/unit';
import { Icon } from '../ui';
import { TodayScreen, RecordsScreen, StrengthScreen, HkaiScreen, HistoryScreen } from '../screens/other';
import { CadreScreen } from '../screens/cadre';
import { PeopleScreen } from '../screens/people';
import { GuardScreen, OutsScreen } from '../screens/guard';
import { NotesScreen } from '../screens/notes';
import { WeaponsScreen } from '../screens/weapons';
import { SCREEN_IDS, type ScreenId } from './screenId';

export { SCREEN_IDS };
export type { Route, RouteParams, ScreenId } from './screenId';

// Settings, Diagnostics, Reports and the Guide load when you open them: less code to read when the app starts.
const TemplatesScreen = lazy(() => import('../screens/settings').then((m) => ({ default: m.TemplatesScreen })));
const DiagScreen = lazy(() => import('../screens/diag').then((m) => ({ default: m.DiagScreen })));
const ReportsScreen = lazy(() => import('../screens/reports').then((m) => ({ default: m.ReportsScreen })));
const GuideScreen = lazy(() => import('../screens/guide').then((m) => ({ default: m.GuideScreen })));

/** One row of the registry. `name` is the menu text; `hkai` is shown through {@link screenName} (ΗΚΑΙ or ΗΚΑΛ). */
export interface ScreenEntry {
  id: ScreenId;
  name: string;
  icon: ReactNode;
  component: ComponentType;
}

/** Keyed by `ScreenId`, so a missing or misspelled key is a compile error. The id is added below. */
const TABLE: Record<ScreenId, Omit<ScreenEntry, 'id'>> = {
  home: { name: 'Σήμερα', icon: Icon.home, component: TodayScreen },
  people: { name: 'Δυναμολόγιο', icon: Icon.people, component: PeopleScreen },
  cadre: { name: 'Στελέχη', icon: Icon.cadre, component: CadreScreen },
  guard: { name: 'Υπηρεσίες', icon: Icon.guard, component: GuardScreen },
  outs: { name: 'Εξοδούχοι', icon: Icon.out, component: OutsScreen },
  records: { name: 'Ιατρικά', icon: Icon.med, component: RecordsScreen },
  strength: { name: 'Δύναμη', icon: Icon.strength, component: StrengthScreen },
  hkai: { name: 'ΗΚΑΙ', icon: Icon.file, component: HkaiScreen },
  weapons: { name: 'Οπλισμός', icon: Icon.weapon, component: WeaponsScreen },
  reports: { name: 'Έντυπα', icon: Icon.print, component: ReportsScreen },
  notes: { name: 'Σημειώσεις', icon: Icon.notes, component: NotesScreen },
  history: { name: 'Ιστορικό', icon: Icon.history, component: HistoryScreen },
  templates: { name: 'Ρυθμίσεις', icon: Icon.gear, component: TemplatesScreen },
  guide: { name: 'Οδηγός', icon: Icon.help, component: GuideScreen },
  // hidden: Ctrl+Shift+D or the search box
  diag: { name: 'Διάγνωση', icon: Icon.gear, component: DiagScreen },
};

/** Every screen by id. */
export const SCREENS = Object.fromEntries(SCREEN_IDS.map((id) => [id, { id, ...TABLE[id] }])) as Record<
  ScreenId,
  ScreenEntry
>;

/**
 * The name shown in the menu. ΗΚΑΙ is called ΗΚΑΛ in a company (Settings › Unit and forms), so it is read when
 * drawn.
 * @param view - screen id
 */
export const screenName = (view: ScreenId): string => (view === 'hkai' ? HK() : SCREENS[view].name);

// The Guide has «?» top right and F1; History has a button top right (the menu fits 1366×768 with Notes too).
/** Side menu, top block. */
export const NAV_MAIN: readonly ScreenId[] = [
  'home',
  'people',
  'cadre',
  'guard',
  'outs',
  'records',
  'strength',
  'hkai',
  'weapons',
  'reports',
  'notes',
];
/** Side menu, block under the separator. */
export const NAV_MORE: readonly ScreenId[] = ['templates'];

/**
 * Alt+1 … Alt+9 open the first nine of the main menu in this order, Alt+0 opens Settings. Reports have Ctrl+E; Notes
 * come from the menu and a new note with Ctrl+Shift+N.
 */
export const NAV_ALL: readonly ScreenId[] = [...NAV_MAIN.slice(0, 9), 'templates'];

/**
 * Screens with tabs that always open on the first tab when entered from the menu.
 * @decision Michael 18/10: ΗΚΑΙ opens on its default tab from the ΗΚΑΙ menu entry; Reports open on the list, not on a
 *   form-creation page (`FORM_PARAM`).
 */
export const MENU_TAB: Partial<Record<ScreenId, string>> = { hkai: 'hkTab', reports: FORM_PARAM };

/** Phone bottom bar. */
export const MOBILE_MAIN: readonly ScreenId[] = ['home', 'people', 'guard', 'outs'];
/** Phone «Άλλα» sheet. */
export const MOBILE_MORE: readonly ScreenId[] = [
  'cadre',
  'records',
  'strength',
  'hkai',
  'weapons',
  'reports',
  'notes',
  'history',
  'templates',
  'guide',
];
