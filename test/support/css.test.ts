// Tests of the CSS helper (test/support/css.ts) on small inline stylesheets: @import, var() chains, fallbacks, themes.
// The UI redesign thread relies on these cases: a token file with `--background: var(--p-...)` must give the same colours.
import { describe, expect, it } from 'vitest';
import { colourTokens, importsOf, loadRules, parseCss, rawTokens, readStyles, resolveVars, toHex } from './css';

const FILES: Record<string, string> = {
  '/x/app.css': `@import "./tokens.css";\n@import url("base/reset.css") layer(base);\n.navbtn{min-height:48px}\n@media (max-height:700px){.navbtn{min-height:44px}}`,
  '/x/tokens.css': `/* palette */\n:root{--p-white:#ffffff;--p-ink:#101010;--p-sage:#cdd796}\n`
    + `@layer tokens{:root{--background:var(--p-white); --foreground:var(--p-ink); --primary:var(--p-sage); --ring:var(--missing,var(--p-sage)); --alias:var(--background)}}\n`
    + `:root[data-theme="dark"]{--p-white:#1c1f18;--p-ink:#f0f2ea}\n`
    + `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--p-white:#1c1f18;--p-ink:#f0f2ea}}`,
  '/x/base/reset.css': `*{box-sizing:border-box}\n@import "../tokens.css";`,
};
const rules = () => loadRules(['/x/app.css'], f => FILES[f]);

describe('CSS helper', () => {
  it('parseCss: selectors, at-rules around a rule, declarations; comments and @font-face are skipped', () => {
    const r = parseCss(`/* c */ a, b > i{color:red;--x: 1px}\n@font-face{font-family:F;src:url(a.woff)}\n@media (max-width:10px){@layer z{p{margin:0}}}`);
    expect(r).toEqual([
      { selectors: ['a', 'b > i'], at: [], decls: { color: 'red', '--x': '1px' } },
      { selectors: ['p'], at: ['@media (max-width:10px)', '@layer z'], decls: { margin: '0' } },
    ]);
  });
  it('@import: files are inlined before the rules that follow, each file once, remote ones ignored', () => {
    expect(importsOf(FILES['/x/app.css'])).toEqual(['./tokens.css', 'base/reset.css']);
    const all = rules();
    expect(all.map(r => r.selectors[0])).toEqual([':root', ':root', ':root[data-theme="dark"]', ':root:not([data-theme="light"])', '*', '.navbtn', '.navbtn']);
    expect(all.at(-1)!.at).toEqual(['@media (max-height:700px)']);
    expect(() => loadRules(['/x/none.css'], () => undefined)).toThrow('not found');
  });
  it('var() chains and fallbacks resolve per theme; the dark themes override the palette, not the semantic names', () => {
    const r = rules();
    expect(colourTokens(r, 'light')).toMatchObject({ background: '#ffffff', foreground: '#101010', primary: '#cdd796', ring: '#cdd796', alias: '#ffffff' });
    const dark = colourTokens(r, 'dark');
    expect(dark).toMatchObject({ background: '#1c1f18', foreground: '#f0f2ea', primary: '#cdd796', alias: '#1c1f18' });
    expect(colourTokens(r, 'auto-dark')).toEqual(dark);   // «Όπως τα Windows» = «Σκοτεινό»
    expect([...rawTokens(r, 'dark').keys()].sort()).toEqual(['--alias', '--background', '--foreground', '--p-ink', '--p-sage', '--p-white', '--primary', '--ring']);
  });
  it('resolveVars: fallbacks (nested), unknown names, loops', () => {
    const vars = new Map([['--a', 'var(--b)'], ['--b', '#fff'], ['--loop', 'var(--loop)'], ['--shadow', '0 1px 2px var(--b)']]);
    expect(resolveVars('var(--a)', vars)).toBe('#fff');
    expect(resolveVars('var(--nope, var(--b))', vars)).toBe('#fff');
    expect(resolveVars('var(--nope, 3px)', vars)).toBe('3px');
    expect(resolveVars('var(--nope)', vars)).toBeNull();
    expect(resolveVars('var(--loop)', vars)).toBeNull();
    expect(resolveVars('var(--shadow)', vars)).toBe('0 1px 2px #fff');
  });
  it('toHex: hex and rgb() only', () => {
    expect(toHex('#ABC')).toBe('#aabbcc'); expect(toHex('rgb(1 2 3)')).toBe('#010203'); expect(toHex('rgb(255, 0, 16)')).toBe('#ff0010');
    expect(toHex('rgba(0,0,0,.5)')).toBeNull(); expect(toHex('red')).toBeNull();
  });
  it('readStyles reads the real renderer stylesheets (never an empty set)', () => {
    const r = readStyles();
    expect(r.length).toBeGreaterThan(100);
    expect(Object.keys(colourTokens(r, 'light'))).toEqual(expect.arrayContaining(['background', 'foreground', 'card']));
  });
});
