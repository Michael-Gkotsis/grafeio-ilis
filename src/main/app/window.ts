// The main window.
//
// Purpose: `createWindow()` builds the one BrowserWindow, loads the renderer into it and keeps `state.win` current.
// Does NOT: open the database, register IPC handlers or schedule anything (app/boot.ts does, before and after this
//   call); it never decides whether the app starts.
// Owner layer: main (architecture), `app/`.
// Why: moved verbatim out of main.ts (Phase 4 boot). `__dirname` is the bundle folder (`dist/main`) because esbuild
//   bundles main into one file, so the `..` paths to `renderer/` and `preload/` are unchanged by the move.
// Covering test: none of its own (Electron API); covered by the boot drive in the PR report and by
//   test/architecture.test.ts for the layer rules.
import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { DEV } from './paths';
import { setWin, win } from './state';

/**
 * Creates the main window (hidden until `ready-to-show`, then maximized), loads the renderer (the Vite URL in dev
 * when `VITE_URL` is set, otherwise `renderer/index.html`) and stores it with `setWin`; `closed` clears it again.
 * The renderer is sandboxed: no node integration, context isolation on, and every navigation or new window is denied.
 */
export function createWindow() {
  const icon = path.join(__dirname, '..', 'renderer', 'icon.png'); // taskbar logo (may be missing in dev)
  setWin(
    new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 980,
      minHeight: 600,
      show: false,
      title: 'Γραφείο Λοχία',
      backgroundColor: '#f4f5f0',
      ...(fs.existsSync(icon) ? { icon } : {}),
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    }),
  );
  win!.once('ready-to-show', () => {
    win!.maximize();
    win!.show();
  });
  // no navigation and no new window towards the outside
  win!.webContents.on('will-navigate', (e) => e.preventDefault());
  win!.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (DEV && process.env.VITE_URL) win!.loadURL(process.env.VITE_URL);
  else win!.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win!.on('closed', () => {
    setWin(null);
  });
}
