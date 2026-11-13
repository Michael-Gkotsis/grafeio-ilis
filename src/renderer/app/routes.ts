// Route registry: which screens exist, their menu name and icon, and the order of every menu.
// Purpose: one typed table `ScreenId -> { id, name, icon, component }` plus the menu lists the shell and the shortcuts
//   (Alt+1 … Alt+9, Alt+0) read.
// Does NOT: render anything, keep route state (useRouter.ts does) or know about params (screenId.ts).
// Owner layer: renderer/app (architecture). Why: this table replaces `SCREENS: Record<string, [string, any, any]>`;
//   a wrong id in a menu list or a missing screen now fails `tsc`.
// Covering test: test/ux-names.test.ts (menu names), test/screens-main.test.ts, test/guide.test.ts (screen list).
import type { ComponentType, ReactNode } from 'react';
import { FORM_PARAM } from '../../shared/repPage';
import { HK } from '../../shared/unit';
import { Icon } from '../ui';
import { TodayScreen } from '../pages/today';
import { StrengthScreen } from '../pages/strength';
import { HkaiScreen } from '../pages/hkai';
import { HistoryScreen } from '../pages/history';
import { HdTab } from '../widgets/hd';
import { StatusesPage } from '../pages/statuses';
import { CadreScreen } from '../pages/cadre';
import { PeopleScreen } from '../pages/people';
import { GuardScreen } from '../screens/guard';
import { OutsScreen } from '../pages/outs';
import { NotesScreen } from '../pages/notes';
import { WeaponsScreen } from '../screens/weapons';
import { SCREEN_SOURCES } from './loaders';
import { SCREEN_IDS, type ScreenId } from './screenId';

export { SCREEN_IDS };
export type { Route, RouteParams, ScreenId } from './screenId';

// Settings, Diagnostics, Reports and the Guide load when you open them (and earlier, when prefetch.ts finds the app
// idle): less code to read when the app starts. See loaders.ts for the measured reason the others stay eager.
const lazyScreen = (id: keyof typeof SCREEN_SOURCES): ComponentType => SCREEN_SOURCES[id].component;

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
  records: { name: 'Καταστάσεις', icon: Icon.med, component: StatusesPage },
  strength: { name: 'Δύναμη', icon: Icon.strength, component: StrengthScreen },
  hkai: { name: 'ΗΚΑΙ', icon: Icon.file, component: HkaiScreen },
  weapons: { name: 'Οπλισμός', icon: Icon.weapon, component: WeaponsScreen },
  reports: { name: 'Έντυπα', icon: Icon.print, component: lazyScreen('reports') },
  hd: { name: 'Ημερήσια Διαταγή', icon: Icon.notes, component: HdTab },
  notes: { name: 'Σημειώσεις', icon: Icon.notes, component: NotesScreen },
  history: { name: 'Ιστορικό', icon: Icon.history, component: HistoryScreen },
  templates: { name: 'Ρυθμίσεις', icon: Icon.gear, component: lazyScreen('templates') },
  guide: { name: 'Οδηγός', icon: Icon.help, component: lazyScreen('guide') },
  // hidden: Ctrl+Shift+D or the search box
  diag: { name: 'Διάγνωση', icon: Icon.gear, component: lazyScreen('diag') },
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

/** One block of the side menu: a small heading (empty for the unlabelled block) and its screens in visual order. */
export interface NavGroup {
  label: string;
  items: readonly ScreenId[];
}

// The Guide has «?» top right and F1; History, Legend and Back live in the «⋯» menu of the top bar.
/**
 * Side menu, top block, in the order they are drawn. The visual order is NOT the Alt+digit order ({@link NAV_ALL}).
 * @decision Michael 9/11: groups ΗΜΕΡΑ · ΑΝΘΡΩΠΟΙ · ΧΑΡΤΙΑ ΚΑΙ ΥΛΙΚΟ, then Notes alone (direction B).
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  { label: 'ΗΜΕΡΑ', items: ['home', 'guard', 'outs', 'strength', 'hkai'] },
  { label: 'ΑΝΘΡΩΠΟΙ', items: ['people', 'cadre', 'records'] },
  { label: 'ΧΑΡΤΙΑ ΚΑΙ ΥΛΙΚΟ', items: ['reports', 'hd', 'weapons'] },
  { label: '', items: ['notes'] },
];
/** Every screen of the top block of the side menu, flat. */
export const NAV_MAIN: readonly ScreenId[] = NAV_GROUPS.flatMap((g) => g.items);
/** Side menu, block pushed to the bottom. */
export const NAV_MORE: readonly ScreenId[] = ['templates'];

/**
 * Alt+1 … Alt+9 open these nine screens in this order, Alt+0 opens Settings. Reports have Ctrl+E; Notes come from the
 * menu and a new note with Ctrl+Shift+N.
 * @decision Michael 9/11: frozen literal. The shortcuts must not follow the visual order of {@link NAV_GROUPS}.
 * @see test/shell-nav.test.ts
 */
export const NAV_ALL: readonly ScreenId[] = [
  'home',
  'people',
  'cadre',
  'guard',
  'outs',
  'records',
  'strength',
  'hkai',
  'weapons',
  'templates',
];

/**
 * Screens with tabs that always open on the first tab when entered from the menu.
 * @decision Michael 18/10: Reports open on the list, not on a form-creation page (`FORM_PARAM`).
 * @decision U5: «Καταστάσεις» opens on its first tab (Ιατρικά) from the menu; ΗΚΑΙ has no tabs any more.
 */
export const MENU_TAB: Partial<Record<ScreenId, string>> = { records: 'stTab', reports: FORM_PARAM };

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
  'hd',
  'notes',
  'history',
  'templates',
  'guide',
];
