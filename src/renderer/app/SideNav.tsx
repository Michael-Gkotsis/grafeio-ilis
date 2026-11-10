// The menus: the side menu (wide or rail), the phone bottom bar and the menu button both of them use.
// Purpose: `navItem`, `SideNav` and `BottomNav` draw the entries of routes.ts with badges and shortcut hints.
// Does NOT: own the badge numbers (useShellInfo.ts), decide the route (useRouter.ts) or bind Alt+1 … Alt+0
//   (shortcuts.ts); the hint text only repeats them.
// Owner layer: renderer/app. Why: three menus shared one local function inside Shell.
// Covering test: test/screens-main.test.ts (shell snapshots), test/guide.test.ts (walks every menu entry).
import { Badge, Icon } from '../ui';
import { MOBILE_MAIN, MOBILE_MORE, NAV_ALL, NAV_MAIN, NAV_MORE, SCREENS, screenName } from './routes';
import type { ScreenId } from './screenId';

/** Numbers shown on menu entries. */
export interface NavBadges {
  /** Empty guard posts tomorrow. */
  guard: number;
  /** Requests waiting for an answer. */
  hkai: number;
  /** Note reminders that are due. */
  notes: number;
}

/** What a menu entry needs from the shell. */
export interface NavMenu {
  view: ScreenId;
  badges: NavBadges;
  go: (view: ScreenId) => void;
}

/**
 * One side-menu button.
 * @param v - screen id
 * @param inRail - narrow menu: the label moves into a tooltip and the badge into the aria-label
 * @param menu - the current view, the badge numbers and the navigation
 */
export function navItem(v: ScreenId, inRail: boolean, menu: NavMenu) {
  const { icon } = SCREENS[v];
  const label = screenName(v);
  const n = v === 'guard' ? menu.badges.guard : v === 'hkai' ? menu.badges.hkai : v === 'notes' ? menu.badges.notes : 0;
  const what = v === 'guard' ? 'κενές θέσεις αύριο' : v === 'notes' ? 'υπενθυμίσεις σημειώσεων' : 'αιτήσεις περιμένουν';
  const tip =
    v === 'guard'
      ? 'Κενές θέσεις στις υπηρεσίες αύριο'
      : v === 'notes'
        ? 'Υπενθυμίσεις σημειώσεων που έφτασαν'
        : 'Αιτήσεις που περιμένουν απάντηση';
  const ix = NAV_ALL.indexOf(v);
  const key = ix < 0 || ix > 9 ? '' : String((ix + 1) % 10);
  const kb = key ? ' (Alt+' + key + ')' : v === 'reports' ? ' (Ctrl+E)' : v === 'guide' ? ' (F1)' : '';
  return (
    <button
      key={v}
      type="button"
      className="navbtn"
      aria-current={menu.view === v ? 'page' : undefined}
      aria-label={inRail ? label + (n > 0 ? ' (' + n + ')' : '') : undefined}
      aria-keyshortcuts={key ? 'Alt+' + key : undefined}
      data-tip={inRail ? label + (n > 0 ? ': ' + n + ' ' + what : '') + kb : undefined}
      data-tip-side={inRail ? 'right' : undefined}
      title={inRail ? undefined : label + kb}
      onClick={() => menu.go(v)}
    >
      {icon}
      <span className="navbtn__lbl">{label}</span>
      {n > 0 && (
        <Badge
          tone={v === 'guard' || v === 'notes' ? 'bad' : 'warn'}
          data-tip={inRail ? undefined : tip}
          data-tip-side="left"
        >
          {n}
        </Badge>
      )}
    </button>
  );
}

interface SideNavProps {
  menu: NavMenu;
  rail: boolean;
  toggleRail: () => void;
}

/** The side menu. The last button folds it to a rail (Ctrl+B). */
export function SideNav({ menu, rail, toggleRail }: SideNavProps) {
  return (
    <nav className="sidenav" aria-label="Κύριο μενού">
      {NAV_MAIN.map((v) => navItem(v, rail, menu))}
      <div className="sidenav__sep" />
      {NAV_MORE.map((v) => navItem(v, rail, menu))}
      <button
        type="button"
        className="navbtn sidenav__toggle"
        aria-expanded={!rail}
        aria-label={rail ? 'Άνοιγμα μενού' : undefined}
        data-tip={rail ? 'Άνοιγμα μενού (Ctrl+B)' : 'Στενό μενού, για περισσότερο χώρο (Ctrl+B)'}
        data-tip-side={rail ? 'right' : undefined}
        onClick={toggleRail}
      >
        {rail ? Icon.expand : Icon.collapse}
        <span className="navbtn__lbl">{rail ? 'Άνοιγμα' : 'Σύμπτυξη μενού'}</span>
      </button>
    </nav>
  );
}

/** Phone bottom bar: four screens and «Άλλα», which opens the sheet with the rest. */
export function BottomNav({ menu, onMore }: { menu: NavMenu; onMore: () => void }) {
  return (
    <nav className="bottomnav" aria-label="Κύριο μενού">
      {MOBILE_MAIN.map((v) => (
        <button key={v} type="button" aria-current={menu.view === v ? 'page' : undefined} onClick={() => menu.go(v)}>
          {SCREENS[v].icon}
          {screenName(v)}
          {v === 'guard' && menu.badges.guard > 0 && <span className="dot">{menu.badges.guard}</span>}
        </button>
      ))}
      <button type="button" aria-current={MOBILE_MORE.includes(menu.view) ? 'page' : undefined} onClick={onMore}>
        {Icon.more}Άλλα
      </button>
    </nav>
  );
}
