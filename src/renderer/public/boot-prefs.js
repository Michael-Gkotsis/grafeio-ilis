/*
 * Reads the display prefs before the first paint so the static skeleton in index.html has the right theme.
 *
 * Does NOT: write storage (the key grafeio.prefs is a frozen contract, prefs.ts owns every write), run any app code
 *   or throw. Any problem leaves the defaults, the same as prefs.ts does.
 * Why a plain file: CSP is script-src 'self', so no inline script; plain ES2017 (no bundler) runs before the CSS.
 * Mirrors: prefs.ts (loadPrefs/applyPrefs: data-theme, data-density, old key grafeio.nav) and app.ts
 *   (usePrefsState: nav 'auto' is the rail below 1500 px). Covering test: test/boot-skeleton.test.ts.
 */
(() => {
  let theme = 'auto',
    density = 'normal',
    nav = 'auto';
  try {
    const raw = localStorage.getItem('grafeio.prefs');
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object') {
      if ('theme' in p) theme = p.theme;
      if ('density' in p) density = p.density;
      if ('nav' in p) nav = p.nav;
    }
    // old menu key, read only (prefs.ts moves it into the prefs on mount)
    const old = localStorage.getItem('grafeio.nav');
    if (old && nav === 'auto') nav = old === 'rail' ? 'rail' : 'full';
  } catch (_e) {
    /* unreadable storage: defaults */
  }
  const root = document.documentElement;
  if (theme !== 'auto') root.setAttribute('data-theme', theme);
  root.setAttribute('data-density', density);
  const rail = nav === 'auto' ? window.innerWidth < 1500 : nav === 'rail';
  if (rail) root.setAttribute('data-boot-nav', 'rail');
})();
