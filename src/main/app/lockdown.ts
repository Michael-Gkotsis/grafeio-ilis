// Session lockdown: no network and no permissions for the app's own pages.
//
// Purpose: `lockdown()` denies every permission request, blocks every request that is not a local file (packaged app
//   only), and hardens every web contents that is created (no webview, no navigation, no new windows).
// Does NOT: create the window (app/window.ts), decide when it runs (app/boot.ts calls it once, after the menu), nor
//   read `store`.
// Owner layer: main (architecture), `app/`.
// Why: moved verbatim out of main.ts (Phase 4 boot). The app is offline by design (research §4.3): anything that is
//   not a local file must not load, even if a bug or a crafted Excel file produced a link.
// Covering test: none of its own (Electron API); the behaviour is covered by the boot drive in the PR report and by
//   test/architecture.test.ts for the layer rules.
import { app, session } from 'electron';
import { DEV } from './paths';

/**
 * Installs the permission handlers, the request filter and the web-contents hardening on the default session.
 * Call once, after `app.whenReady()`. Side effect: registers an `app.on('web-contents-created')` listener.
 * The request filter is skipped in dev (`!DEV`), where the Vite server is a remote origin.
 */
export function lockdown() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  if (!DEV) ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|devtools|data|blob):/i.test(d.url) }));
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (ev) => ev.preventDefault());
    wc.on('will-navigate', (ev) => ev.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}
