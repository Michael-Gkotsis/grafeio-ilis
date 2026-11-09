// In-page capture of the styles-diff tool (bench/ui/styles-diff.mjs).
//
// Purpose: turn the page's current state into plain data: a normalised DOM text, and for every element its path, its
//   full computed style and its bounding box (rounded to 1 px).
// Does NOT: compare, decide what is "expected", or change the page (only finishes running animations, see settle()).
// Why: structural PRs must not change what the user sees; SSR snapshots cannot see CSS, click-opened dialogs or
//   effect-loaded data, a real browser can.
// Volatile bits: none are removed. Time is frozen and the data seeded; `<script>` tags are skipped (build hashes).
// Output shape: { dom: string[], props: string[], styles: string[], els: [{ p, c, s, b, ps? }] } where `styles[i]`
//   is the values of `props` joined by "\n", `s` indexes it (one string per distinct style, so output stays small).
// Run: not run directly; imported by styles-walk.mjs.

/** Runs in the page. Serialised by Playwright, so it must stay self-contained (no imports, no closures). */
export function capturePage() {
  const SKIP = new Set(['SCRIPT']);
  const attrText = el => [...el.attributes].map(a => ` ${a.name}="${a.value}"`).join('');
  // live form state is not an attribute: add it so a changed default value or checked box still shows up
  const liveText = el => (el.matches('input,select,textarea') ? ` [value=${JSON.stringify(el.value)}${'checked' in el ? ' checked=' + el.checked : ''}]` : '');
  const dom = [];
  const walk = (node, depth) => {
    const pad = ' '.repeat(depth);
    if (node.nodeType === 3) { const t = node.nodeValue.replace(/\s+/g, ' ').trim(); if (t) dom.push(pad + '"' + t + '"'); return; }
    if (node.nodeType !== 1 || SKIP.has(node.tagName)) return;
    dom.push(pad + '<' + node.tagName.toLowerCase() + attrText(node) + liveText(node) + '>');
    [...node.childNodes].map(c => walk(c, depth + 1));
  };
  walk(document.body, 0);

  const intern = new Map(), styles = [];
  let props = null;
  const styleIndex = cs => {
    if (!props) props = [...cs].sort();   // sorted: custom properties (--x) come in hash order otherwise
    const key = props.map(p => cs.getPropertyValue(p)).join('\n');
    if (!intern.has(key)) { intern.set(key, styles.length); styles.push(key); }
    return intern.get(key);
  };
  const pathOf = el => {
    const parts = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      parts.push(e.tagName.toLowerCase() + ':' + (e === document.body ? 'body' : 1 + [...e.parentElement.children].indexOf(e)));
    }
    return 'html>' + parts.reverse().join('>');
  };
  const pseudo = (el, which) => {
    const cs = getComputedStyle(el, which);
    return cs.content && cs.content !== 'none' && cs.content !== 'normal' ? styleIndex(cs) : -1;
  };
  const els = [document.documentElement, ...document.body.querySelectorAll('*')].filter(e => !SKIP.has(e.tagName)).map(el => {
    const r = el.getBoundingClientRect();
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return {
      p: el === document.documentElement ? 'html' : pathOf(el), c: cls, s: styleIndex(getComputedStyle(el)),
      b: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      ps: [pseudo(el, '::before'), pseudo(el, '::after')]
    };
  });
  return { dom, props, styles, els };
}

/**
 * Brings the page to a still image: jumps every running animation/transition to its end (an endless one to its
 * start), then waits two frames. No CSS is injected, so `transition`/`animation` values are still compared as written.
 * (The app also sets `animation: none` under prefers-reduced-motion, which the walk turns on.)
 */
export async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finish = () => document.getAnimations().map(a => { try { a.finish(); } catch { a.pause(); a.currentTime = 0; } });
    finish();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    finish();
  });
}
