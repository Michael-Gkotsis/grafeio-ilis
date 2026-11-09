// Browser session kit of the styles-diff tool (bench/ui/styles-diff.mjs): page setup and small UI helpers.
//
// Purpose: open the bench UI in a deterministic browser context (frozen clock, fixed viewport, reduced motion, theme
//   set the way the app stores it) and give the walk a few helpers (nav, tab, click, open a dialog, capture).
// Does NOT: know which screens exist (that is styles-walk.mjs) or compare anything (styles-report.mjs).
// Why: both sides of the diff must run the very same steps; helpers never branch on the side being tested.
// Determinism: clock fixed at CLOCK (timers still run), timezone Europe/Athens, locale el-GR, seeded state.json,
//   `prefers-reduced-motion: reduce` (the app then sets animation/transition to none), animations finished before
//   each capture, mouse parked in the corner. Fonts: the app ships none (system "Segoe UI, Tahoma, Arial"), so both
//   sides use the same fallback of the machine they run on.
// Run: not run directly; imported by styles-diff.mjs.
import { capturePage, settle } from './styles-capture.mjs';

/** The frozen "now" (the seed's end date, local Athens time). */
export const CLOCK = '2026-06-10T10:30:00+03:00';

/** Overrides of the mock API that only create states which are otherwise unreachable in the browser mock. */
const API_HOOKS = `(() => {
  let real;
  Object.defineProperty(window, 'api', { configurable: true, get: () => real, set: v => {
    // an update with a previous version, so the card shows «Επιστροφή στην …» (UpdatesCard dialog)
    // the browser mock refuses to read the roster Excel; a fixed preview opens the «Ανάγνωση προσωπικού» dialog
    const preview = { ok: true, token: 't', file: 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx', total: 62, active: 60, added: 2, updated: 1, missing: 1, warnings: ['Δοκιμή'],
      essos: '2026 Γ΄', skipped: ['ΣΥΝΟΛΟ'], declared: 62, found: 62, suspicious: [], changes: [{ who: 'ΔΟΚΙΜΙΟΣ Α.', what: 'Τηλέφωνο' }], same: 59 };
    real = { ...v, updInfo: async () => ({ ...(await v.updInfo()), prev: '0.1.231' }), srcPeople: async () => preview };
  } });
})();`;

export async function openContext(browser, { width, height, theme }) {
  const context = await browser.newContext({
    viewport: { width, height }, timezoneId: 'Europe/Athens', locale: 'el-GR', reducedMotion: 'reduce', colorScheme: theme
  });
  const prefs = JSON.stringify({ theme, density: 'normal', nav: 'auto', xlZoom: 'fit', rankNames: true });
  await context.addInitScript(`try { localStorage.setItem('grafeio.prefs', ${JSON.stringify(prefs)}); } catch {}`);
  await context.addInitScript(API_HOOKS);
  return context;
}

/** One browsing session: collects captures in `out` (label -> capture | { skipped }) and page errors in `errors`. */
export class Session {
  constructor(context, url, group, out, errors) {
    Object.assign(this, { context, url, group, out, errors, page: null });
  }

  async start() {
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(4000);   // a button that is not there must fail fast, not after 30 s
    this.page.on('pageerror', e => this.errors.push(`${this.group}: ${e}`));
    await this.page.clock.setFixedTime(new Date(CLOCK));
    await this.page.goto(this.url);
    await this.page.waitForSelector('.main h1');
  }

  async stop() { await this.page.close(); }

  navButtons() { return this.page.locator('.sidenav .navbtn:not(.sidenav__toggle)'); }

  /**
   * Opens a screen by its label: side nav (the aria-label is the same in the narrow rail), or at phone width the
   * bottom bar, or its «Άλλα» sheet.
   */
  async nav(label) {
    const p = this.page;
    if (await p.locator('.sidenav').isVisible()) {
      const all = await this.navButtons().evaluateAll(els => els.map(e => e.querySelector('.navbtn__lbl')?.textContent || ''));
      const i = all.findIndex(t => t.startsWith(label));
      if (i < 0) throw new Error(`no nav entry "${label}"`);
      await this.navButtons().nth(i).click();
    } else {
      const bar = p.locator('.bottomnav button').filter({ hasText: label });
      if (await bar.count()) await bar.first().click();
      else {
        await p.locator('.bottomnav button').filter({ hasText: 'Άλλα' }).click();
        await p.locator('.morelist .navbtn').filter({ hasText: label }).first().click();
      }
    }
    await this.quiet();
  }

  /** Clicks a top-bar icon button by its aria-label (Ιστορικό ενεργειών, Οδηγός χρήσης…). */
  async top(ariaLabel) {
    await this.page.locator(`[aria-label^="${ariaLabel}"]`).first().click();
    await this.quiet();
  }

  async tab(text, scope = '.main') {
    await this.page.locator(`${scope} [role=tab]`).filter({ hasText: new RegExp('^' + text) }).first().click();
    await this.quiet();
  }

  /** Clicks the first visible button (or link/summary) of `scope` whose text contains `text`. */
  async click(text, scope = '.main') {
    await this.page.locator(`${scope} :is(button, a, summary, [role=button], [role=tab])`).filter({ hasText: text }).first().click({ timeout: 4000 });
    await this.quiet();
  }

  async clickOn(selector, nth = 0) {
    await this.page.locator(selector).nth(nth).click({ timeout: 4000 });
    await this.quiet();
  }

  /**
   * Closes whatever dialog or sheet is open: Escape as the user would; a dialog with unsaved input answers with a
   * «close without saving» question, which is answered with its discard button (Escape there would only stay).
   */
  async closeLayers() {
    const p = this.page;
    for (let i = 0; i < 6 && (await p.locator('.ui-overlay, .ui-sheet').count()) > 0; i++) {
      const discard = p.locator('.ui-dialog[role=alertdialog] button').filter({ hasText: /^Κλείσε χωρίς/ });
      if (await discard.count()) await discard.first().click();
      else await p.keyboard.press('Escape');
      await this.quiet();
    }
  }

  /**
   * Scrolls the screen (`.main`) and every virtual list (`.vlist`) back to the top before a capture. Why: a click
   * auto-scrolls its target into view, and under CPU contention (two parallel walks) whether it had to scroll
   * differs between runs, so a later state was captured with the list some rows down («Οπλισμός › Όπλα»: 5 rows of
   * 46 px, zebra swapped). The walk never scrolls on purpose, and both sides get the same reset, so the diff stays
   * valid. The scroll event lets VirtualList recompute its first row; quiet() then waits for that render.
   */
  async resetScroll() {
    await this.page.evaluate(() => {
      for (const el of document.querySelectorAll('.main, .vlist')) {
        if (!el.scrollTop) continue;
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll'));
      }
    });
  }

  /** Waits until the page has stopped changing (no DOM mutation for 80 ms, at most 2 s), so slow machines agree. */
  async quiet() {
    await this.page.evaluate(() => new Promise(resolve => {
      let t = setTimeout(done, 80); const stop = setTimeout(done, 2000);
      const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 80); });
      mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      function done() { mo.disconnect(); clearTimeout(t); clearTimeout(stop); resolve(); }
    }));
  }

  /** Captures the current state under `label`; a repeated label is an error (labels are the keys of the diff). */
  async snap(label) {
    const key = `${this.group} › ${label}`;
    if (this.out[key]) throw new Error(`duplicate state "${key}"`);
    const t = Date.now();
    await this.page.mouse.move(0, 0);
    await this.resetScroll();
    await this.quiet();
    await settle(this.page);
    const t1 = Date.now();
    this.out[key] = await this.page.evaluate(capturePage);
    if (process.env.STYLES_DEBUG) console.log(`  ${key}: settle ${t1 - t} ms, capture ${Date.now() - t1} ms, ${this.out[key].els.length} elements`);
  }

  /**
   * Runs `steps` (opens something), captures it, then closes layers. A step that fails is recorded as
   * { skipped } so both sides can be compared (and the report lists what could not be opened).
   */
  async state(label, steps, { close = true } = {}) {
    const key = `${this.group} › ${label}`;
    try { await steps(); await this.snap(label); }
    catch (e) { this.out[key] = { skipped: String(e.message || e).split('\n')[0] }; }
    if (close) await this.closeLayers();
  }

  /** Like state(), for a dialog (or `sheet: true`): waits for `.ui-dialog` first, so a click that opened nothing counts as a failure. */
  async dialog(label, open, { close = true, sheet = false } = {}) {
    await this.state(label, async () => {
      await open();
      await this.page.waitForSelector(sheet ? '.ui-sheet' : '.ui-dialog', { timeout: 3000 });
      await this.quiet();
    }, { close });
  }
}
