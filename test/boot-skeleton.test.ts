// Startup skeleton (PR U2): index.html holds the app frame and boot-prefs.js sets the same <html> attributes as
// prefs.ts before the first paint.
//
// Purpose: lock that the skeleton and the script tag exist, and that boot-prefs.js agrees with prefs.ts/app.ts for
//   every theme/density/nav combination, survives broken JSON or throwing storage, and never writes storage.
// Does NOT: render React. boot-prefs.js runs in a node:vm sandbox with a fake document and localStorage (no jsdom).
import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';
import { describe, expect, it } from 'vitest';
import { applyPrefs, DEFAULT_PREFS, loadPrefs, type Prefs } from '../src/renderer/prefs';

const root = join(__dirname, '..');
const INDEX = readFileSync(join(root, 'src/renderer/index.html'), 'utf8');
const BENCH_INDEX = readFileSync(join(root, 'bench/ui/index.html'), 'utf8');
const SCRIPT = readFileSync(join(root, 'src/renderer/public/boot-prefs.js'), 'utf8');

type Store = Record<string, string>;
interface Env {
  attrs: Record<string, string>;
  writes: string[];
}

/** Runs `code` against a fake page: `store` is localStorage (or a throwing one), `width` is window.innerWidth. */
function fakePage(store: Store | 'throws', width: number, code: string): Env {
  const env: Env = { attrs: {}, writes: [] };
  const localStorage = {
    getItem: (k: string) => {
      if (store === 'throws') throw new Error('locked');
      return k in store ? store[k] : null;
    },
    setItem: (k: string) => {
      env.writes.push('set ' + k);
    },
    removeItem: (k: string) => {
      env.writes.push('remove ' + k);
    },
    clear: () => {
      env.writes.push('clear');
    },
  };
  const documentElement = {
    setAttribute: (k: string, v: unknown) => {
      env.attrs[k] = String(v);
    },
    removeAttribute: (k: string) => {
      delete env.attrs[k];
    },
    getAttribute: (k: string) => env.attrs[k] ?? null,
  };
  runInNewContext(code, { localStorage, document: { documentElement }, window: { innerWidth: width } });
  return env;
}

/** What the real app ends up with on <html> for the same storage: prefs.ts applyPrefs + app.ts rail rule. */
function reactAttrs(store: Store, width: number): Record<string, string> {
  const g = globalThis as unknown as Record<string, unknown>;
  const attrs: Record<string, string> = {};
  const memory: Store = { ...store };
  const saved = { localStorage: g.localStorage, document: g.document };
  g.localStorage = {
    getItem: (k: string) => (k in memory ? memory[k] : null),
    setItem: (k: string, v: string) => {
      memory[k] = v;
    },
    removeItem: (k: string) => {
      delete memory[k];
    },
  };
  g.document = {
    documentElement: {
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
      removeAttribute: (k: string) => {
        delete attrs[k];
      },
    },
  };
  try {
    const prefs = loadPrefs();
    applyPrefs(prefs);
    const rail = prefs.nav === 'auto' ? width < 1500 : prefs.nav === 'rail';
    if (rail) attrs['data-boot-nav'] = 'rail';
  } finally {
    g.localStorage = saved.localStorage;
    g.document = saved.document;
  }
  return attrs;
}

describe('index.html skeleton', () => {
  it('has the frame and the loading text, no title text, and no old boot div', () => {
    for (const html of [INDEX, BENCH_INDEX]) {
      expect(html).toContain('class="shell boot-shell"');
      expect(html).toContain('<header class="topbar">');
      expect(html).toContain('<nav class="sidenav"');
      expect(html).toContain('<main class="main boot-shell__main">Φόρτωση…</main>');
      // the title follows the user's rank or a custom brand (core/model/brand.ts), unknown before JS runs: no text
      expect(html).toContain('<div class="boot-shell__logo"></div><span></span>');
      expect(html).not.toContain('<div class="boot">');
    }
  });
  it('loads boot-prefs.js as a classic script in <head>, before the module, and keeps the CSP', () => {
    for (const html of [INDEX, BENCH_INDEX]) {
      const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
      expect(head).toContain('<script src="./boot-prefs.js"></script>');
      expect(html.indexOf('boot-prefs.js')).toBeLessThan(html.indexOf('type="module"'));
    }
    expect(INDEX).toContain(
      `content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:"`,
    );
    expect(INDEX).not.toMatch(/<script(?![^>]*\bsrc=)/);
  });
  it('uses the same skeleton markup in the app and in the bench page', () => {
    const body = (h: string) =>
      h.slice(h.indexOf('<div id="root">'), h.indexOf('</div></div>', h.indexOf('<div id="root">')));
    expect(body(BENCH_INDEX)).toBe(body(INDEX));
  });
});

describe('boot-prefs.js', () => {
  const themes: Prefs['theme'][] = ['auto', 'light', 'dark'];
  const densities: Prefs['density'][] = ['normal', 'compact'];
  const navs: Prefs['nav'][] = ['auto', 'full', 'rail'];
  const cases = themes.flatMap((theme) => densities.flatMap((density) => navs.map((nav) => ({ theme, density, nav }))));

  it.each(cases)('sets what prefs.ts sets: %o', (p) => {
    for (const width of [1280, 1499, 1500, 1920]) {
      const store = { 'grafeio.prefs': JSON.stringify({ ...DEFAULT_PREFS, ...p }) };
      const env = fakePage(store, width, SCRIPT);
      expect(env.attrs).toEqual(reactAttrs(store, width));
      expect(env.writes).toEqual([]);
    }
  });
  it('matches the defaults with empty storage, broken JSON and non-object JSON', () => {
    for (const raw of [undefined, '{broken', 'null', '5', '"x"', '[]', '{}']) {
      const store: Store = raw === undefined ? {} : { 'grafeio.prefs': raw };
      const env = fakePage(store, 1400, SCRIPT);
      expect(env.attrs).toEqual({ 'data-density': 'normal', 'data-boot-nav': 'rail' });
      expect(env.attrs).toEqual(reactAttrs(store, 1400));
      expect(env.writes).toEqual([]);
    }
  });
  it('does not throw and falls back to defaults when storage throws', () => {
    const env = fakePage('throws', 1920, SCRIPT);
    expect(env.attrs).toEqual({ 'data-density': 'normal' });
    expect(env.writes).toEqual([]);
  });
  it('follows the old grafeio.nav key only while nav is auto, and never removes it', () => {
    for (const [old, prefs] of [
      ['rail', {}],
      ['full', {}],
      ['rail', { nav: 'full' }],
      ['full', { nav: 'rail' }],
    ] as const) {
      const store: Store = { 'grafeio.nav': old, 'grafeio.prefs': JSON.stringify(prefs) };
      const env = fakePage(store, 1920, SCRIPT);
      expect(env.attrs).toEqual(reactAttrs(store, 1920));
      expect(env.writes).toEqual([]);
    }
  });
  it('never calls a storage write in its source', () => {
    expect(SCRIPT).not.toMatch(/setItem|removeItem|clear\(|sessionStorage|indexedDB/);
  });
});
