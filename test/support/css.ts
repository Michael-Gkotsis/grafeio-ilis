// Read the renderer's stylesheets as rules and resolve colour tokens per theme, for tests about CSS.
//
// Purpose: contrast.test.ts, layout-fit.test.ts and others read "the CSS" without naming the file. Today there is one
//   src/renderer/styles.css; the UI redesign splits it into `@layer` files next to components and a token file
//   (shared/ui/tokens.css) whose values are `var(--p-...)` chains. The helper reads EVERY .css under src/renderer
//   recursively, follows `@import`, and resolves `var()` chains (with fallbacks) so both layouts give the same answers.
// Does NOT: implement the cascade (specificity, @layer order: a later declaration wins), evaluate calc(), or understand
//   colour functions other than hex and rgb(). A token that does not resolve to a colour is simply absent, and the test
//   that needs it fails with "λείπει" (missing), never silently passes.
// Owner layer: test support only. Covering test: test/support/css.test.ts.
// Why: the old contrast test did `indexOf(':root{')` on one file, which finds nothing after the split.
import fs from 'fs';
import path from 'path';
import { RENDERER_DIR } from './source-scan';

/** One style rule: its selectors, the at-rules around it (`@media (...)`, `@layer x`) and its declarations. */
export interface CssRule { selectors: string[]; at: string[]; decls: Record<string, string> }

const GROUP_AT = /^@(media|supports|layer|container|scope)\b/;
const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Rules of one stylesheet text. Declarations of rules inside `@media`/`@supports`/`@layer` blocks carry the at-rule in `at`. */
export function parseCss(text: string): CssRule[] {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  const at: string[] = [];
  let i = 0, start = 0;
  // end of the block that opens at `open` (a `{`), skipping nested braces and quoted strings
  const close = (open: number): number => {
    let depth = 0, quote = '';
    for (let k = open; k < src.length; k++) {
      const c = src[k];
      if (quote) { if (c === quote && src[k - 1] !== '\\') quote = ''; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return k;
    }
    return src.length;
  };
  // hot path: a hand-written scanner, the stylesheet is 1.6k lines and this runs in tests only
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === ';') { start = i + 1; continue; }   // @import / @layer a, b; / stray statements
    if (c === '}') { at.pop(); start = i + 1; continue; }   // end of a group at-rule
    if (c !== '{') continue;
    const prelude = collapse(src.slice(start, i));
    const end = close(i);
    if (prelude.startsWith('@') && GROUP_AT.test(prelude)) { at.push(prelude); start = i + 1; continue; }
    if (!prelude.startsWith('@')) {
      const decls = Object.fromEntries(src.slice(i + 1, end).split(';').flatMap(d => {
        const at2 = d.indexOf(':');
        return at2 < 0 ? [] : [[d.slice(0, at2).trim(), collapse(d.slice(at2 + 1))] as [string, string]];
      }).filter(([k]) => k));
      rules.push({ selectors: prelude.split(',').map(collapse), at: [...at], decls });
    }
    i = end; start = end + 1;   // @font-face / @keyframes: skipped as a whole
  }
  return rules;
}

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

/** `@import "x.css"`, `@import url(x.css) layer(a)`: the specifiers, in order. */
export const importsOf = (text: string): string[] =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?/g)].map(m => m[1]);

/**
 * Rules of the given stylesheet files with their `@import`s inlined where they appear (an imported file's rules come first,
 * each file once). `read` is injectable so the helper can be tested on inline CSS.
 */
export function loadRules(files: string[], read: (file: string) => string | undefined = f => fs.readFileSync(f, 'utf8')): CssRule[] {
  const seen = new Set<string>();
  const load = (file: string): CssRule[] => {
    const key = path.normalize(file);
    if (seen.has(key)) return [];
    seen.add(key);
    const text = read(key);
    if (text === undefined) throw new Error('CSS file not found: ' + key);
    const nested = importsOf(text).filter(s => !/^(https?:)?\/\//.test(s)).flatMap(s => load(path.resolve(path.dirname(key), s)));
    return [...nested, ...parseCss(text)];
  };
  return files.flatMap(load);
}

/** Every .css under `dir` (default src/renderer), recursively. Throws when there is none: a CSS rule must never pass on nothing. */
export function readStyles(dir: string = RENDERER_DIR): CssRule[] {
  const files = walk(dir).filter(f => f.endsWith('.css'));
  if (!files.length) throw new Error('no .css files under ' + dir);
  return loadRules(files);
}

/** Selector text without spaces, for matching `:root[data-theme="dark"]` however it is written. */
const norm = (sel: string): string => sel.replace(/\s+/g, '').replace(/\[data-theme=(["']?)dark\1\]/, '[data-theme="dark"]').replace(/\[data-theme=(["']?)light\1\]/, '[data-theme="light"]');
const ROOT = new Set([':root', 'html', ':root:root']);
const DARK_SEL = new Set([':root[data-theme="dark"]', 'html[data-theme="dark"]', '[data-theme="dark"]']);
const AUTO_SEL = new Set([':root:not([data-theme="light"])', 'html:not([data-theme="light"])']);
const isDarkMedia = (at: string[]) => at.some(a => /prefers-color-scheme:\s*dark/.test(a));
// only layers and supports around a rule keep it "unconditional"; media (width, print, ...) does not define a theme
const plain = (at: string[]) => at.every(a => /^@(layer|supports)\b/.test(a));

const customProps = (decls: Record<string, string>): [string, string][] => Object.entries(decls).filter(([k]) => k.startsWith('--'));

/**
 * Raw (unresolved) custom properties of a theme, later declarations winning.
 *  - light: `:root { ... }` outside any media query;
 *  - dark: light plus `:root[data-theme="dark"] { ... }` (what the «Σκοτεινό» setting applies);
 *  - auto-dark: light plus `@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ ... } }` («Όπως τα Windows»).
 */
export function rawTokens(rules: CssRule[], theme: 'light' | 'dark' | 'auto-dark'): Map<string, string> {
  const pick = (r: CssRule): boolean => {
    const sels = r.selectors.map(norm);
    if (sels.some(s => ROOT.has(s)) && plain(r.at)) return true;
    if (theme === 'dark') return sels.some(s => DARK_SEL.has(s)) && plain(r.at);
    if (theme === 'auto-dark') return sels.some(s => AUTO_SEL.has(s)) && isDarkMedia(r.at);
    return false;
  };
  return new Map(rules.filter(pick).flatMap(r => customProps(r.decls)));
}

/** Index of the `)` that closes the `(` at `open`. */
const closing = (s: string, open: number): number => {
  let depth = 0;
  for (let k = open; k < s.length; k++) { if (s[k] === '(') depth++; else if (s[k] === ')' && --depth === 0) return k; }
  return -1;
};

/**
 * Replace every `var(--name, fallback)` in `value` by the value of `--name` in `vars` (itself resolved), or by the
 * resolved fallback. Returns null when a variable has neither value or the chain loops.
 */
export function resolveVars(value: string, vars: ReadonlyMap<string, string>, trail: string[] = []): string | null {
  const at = value.indexOf('var(');
  if (at < 0) return value.trim();
  const end = closing(value, at + 3);
  if (end < 0) return null;
  const inner = value.slice(at + 4, end);
  let comma = -1, depth = 0;
  for (let k = 0; k < inner.length && comma < 0; k++) {
    if (inner[k] === '(') depth++; else if (inner[k] === ')') depth--; else if (inner[k] === ',' && depth === 0) comma = k;
  }
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  const fallback = comma < 0 ? undefined : inner.slice(comma + 1).trim();
  const own = vars.get(name);
  const mid = own !== undefined && !trail.includes(name) ? resolveVars(own, vars, [...trail, name]) : fallback !== undefined ? resolveVars(fallback, vars, trail) : null;
  if (mid === null) return null;
  return resolveVars(value.slice(0, at) + mid + value.slice(end + 1), vars, trail);
}

/** `#rgb`, `#rrggbb`, `rgb(r, g, b)` or `rgb(r g b)` as `#rrggbb` (lower case); null for anything else (alpha, oklch, names). */
export function toHex(colour: string): string | null {
  const c = colour.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return '#' + [...c.slice(1)].map(d => d + d).join('');
  const rgb = /^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)$/.exec(c);
  return rgb ? '#' + [rgb[1], rgb[2], rgb[3]].map(n => Math.min(255, +n).toString(16).padStart(2, '0')).join('') : null;
}

/** Colour tokens of a theme by name without the dashes (`card`, `muted-fg`): every custom property that resolves to a hex colour. */
export function colourTokens(rules: CssRule[], theme: 'light' | 'dark' | 'auto-dark'): Record<string, string> {
  // the dark themes inherit what they do not override: a `var(--p-white)` in light resolves against the dark `--p-white`
  const vars = new Map([...(theme === 'light' ? [] : rawTokens(rules, 'light')), ...rawTokens(rules, theme)]);
  return Object.fromEntries([...vars.keys()].flatMap(k => {
    const hex = toHex(resolveVars(vars.get(k)!, vars) ?? '');
    return hex ? [[k.slice(2), hex] as [string, string]] : [];
  }));
}
