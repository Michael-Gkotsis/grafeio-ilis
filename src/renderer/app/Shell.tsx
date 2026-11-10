// The layout of the app: top bar, side menu, the current screen, phone bar and the layers above them.
// Purpose: `Shell` wires route, overlays, preferences, shortcuts and update state together and provides `PrefsCtx`,
//   `NavCtx` and the export context to every screen.
// Does NOT: own the store (Root), implement navigation (useRouter.ts), the keys (useShortcuts.ts) or any markup of the
//   bars and menus (TopBar.tsx, SideNav.tsx, Overlays.tsx).
// Owner layer: renderer/app. Why: it was 150 lines of hooks and markup in app.ts. Every hook is called in the same
//   order as before the split and every child re-renders with Shell, so screens refresh at the same moments.
// Covering test: test/screens-main.test.ts (shell markup), the behaviour tests (clicks and keys through App).
import { Suspense, useCallback, useEffect } from 'react';
import { appTitle } from '../../shared/brand';
import { ErrorBoundary } from '../errorBoundary';
import { ExportProvider } from '../common';
import { PrefsCtx } from '../prefs';
import { cx } from '../ui';
import { useUpd, useUpdDialog } from '../update';
import { Overlays } from './Overlays';
import { PendingBar } from './PendingBar';
import { BottomNav, SideNav, navItem, type NavMenu } from './SideNav';
import { TopBar } from './TopBar';
import { usePrefsState } from './hooks';
import { NavCtx } from './nav';
import { SCREENS } from './routes';
import { useStore } from './store';
import { useNavValue } from './useNavValue';
import { useOverlays } from './useOverlays';
import { useRouter } from './useRouter';
import { useShellInfo } from './useShellInfo';
import { useShortcuts } from './useShortcuts';

/** The shell. Must render inside `StoreCtx` (Root) and the toast provider. */
export function Shell() {
  const { state, today, undo } = useStore();
  const info = useShellInfo();
  const overlays = useOverlays();
  const prefsV = usePrefsState();
  const { rail } = prefsV;
  const toggleRail = useCallback(() => prefsV.set('nav', rail ? 'full' : 'rail'), [prefsV.set, rail]);
  const router = useRouter({ guard: overlays.guard, closeAll: overlays.closeAll, today });
  const { route, back, go, goBack, help } = router;
  const nav = useNavValue(router, overlays, state);
  useShortcuts({ undo, go, goBack, help, toggleRail, overlays });
  const Screen = SCREENS[route.view].component;
  const upd = useUpd();
  const [updOpen, setUpdOpen] = useUpdDialog(upd);
  // The title (Settings › Appearance) also shows in the window's title bar.
  const title = appTitle(state.settings);
  useEffect(() => {
    document.title = title;
  }, [title]);
  const menu: NavMenu = { view: route.view, badges: info.badges, go: (v) => go(v) };
  return (
    <PrefsCtx.Provider value={prefsV}>
      <NavCtx.Provider value={nav}>
        <ExportProvider>
          <div className={cx('shell', rail && 'is-rail')}>
            <TopBar
              backTo={back.length ? back[back.length - 1].view : undefined}
              goBack={goBack}
              help={help}
              title={title}
              essos={info.essos}
              hm={info.hm}
              clockTip={info.clockTip}
              lastUndo={info.lastUndo}
              upd={upd}
              onOpenUpdate={() => setUpdOpen(true)}
              onOpenLegend={() => overlays.setOver('legend')}
              onOpenPalette={() => overlays.setOver('palette')}
            />
            <SideNav menu={menu} rail={rail} toggleRail={toggleRail} />
            <main className="main">
              <ErrorBoundary key={route.view}>
                <Suspense fallback={<div className="empty">Φόρτωση…</div>}>
                  <Screen />
                </Suspense>
              </ErrorBoundary>
              <PendingBar />
            </main>
          </div>
          <BottomNav menu={menu} onMore={() => overlays.setLayer({ kind: 'more' })} />
          <Overlays
            overlays={overlays}
            renderNavItem={(v) => navItem(v, false, menu)}
            upd={upd}
            updOpen={updOpen}
            setUpdOpen={setUpdOpen}
          />
        </ExportProvider>
      </NavCtx.Provider>
    </PrefsCtx.Provider>
  );
}
