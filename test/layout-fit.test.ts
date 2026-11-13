// UX 22/10 (Π4, Π5, Μ6, Μ9, Χ2, Χ3): ό,τι χρειάζεται φαίνεται σε 1366×698 και σε 1024, χωρίς κομμένα κείμενα.
//
// Phase 0.4: this file used to read app.ts, other.ts, cadre.ts, people.ts and styles.css as text. It now renders the screens
// and the app shell with the 0.3a harness and asserts on the markup, and reads the CSS through test/support/css.ts (any
// file, @media aware). What a server render cannot show (real pixel sizes, truncation by width) is covered by the browser
// tool of Phase 0.3b (`styles-diff`, 1024 px): this test pins the markup and the CSS rules that produce the fit.
import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { siShort } from '../src/shared/si';
import { GUIDE } from '../src/renderer/guideText';
import { topicFor } from '../src/renderer/guideTopic';
import { CadreScreen } from '../src/renderer/screens/cadre';
import { HkaiScreen } from '../src/renderer/screens/other';
import { PeopleScreen } from '../src/renderer/screens/people';
import * as H from './support/screens-harness';
import { captureDocumentListeners, startSession, type DocumentKeys, type Session } from './support/probe';
import { buttonsOf, textsIn } from './support/html';
import { appRenderer, loadWorld, type BehaviourWorld } from './support/behaviour';
import { readStyles, type CssRule } from './support/css';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReactProbe(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));
vi.mock('react/jsx-runtime', async orig => (await import('./support/ssr-shims')).mockJsxRuntime(orig));
vi.mock('react/jsx-dev-runtime', async orig => (await import('./support/ssr-shims')).mockJsxRuntime(orig));

let bw: BehaviourWorld;
let session: Session | null = null;
let keys: DocumentKeys | null = null;
beforeAll(async () => { bw = await loadWorld(); });
afterEach(() => { session?.stop(); session = null; keys?.restore(); keys = null; });

const rules = readStyles();
/** Declarations of the rules whose selector list contains `selector`; `media` picks rules inside a matching @media, none: outside any. */
const declsOf = (selector: string, media?: RegExp): CssRule['decls'][] => rules
  .filter(r => r.selectors.includes(selector) && (media ? r.at.some(a => media.test(a)) : !r.at.some(a => a.startsWith('@media'))))
  .map(r => r.decls);
const flatten = (html: string) => html.split('\n').map(l => l.trim()).join('');

describe('διάταξη', () => {
  it('ΗΚΑΙ: Excel, Εκτύπωση και Υπογραφές στην κεφαλίδα, όχι κάτω από την προεπισκόπηση', () => {
    const out = H.renderIn(bw.world, 'hkai', {}, createElement(HkaiScreen as never));
    const html = flatten(out);
    const head = html.indexOf('<div class="page-head">'), body = html.indexOf('<div class="hkai__grid">');
    expect(head).toBeGreaterThan(0); expect(body).toBeGreaterThan(head);
    const header = html.slice(head, body);
    expect(header).toContain('ΗΚΑΙ της 09/11/2026');
    // the three actions are inside the page header (before the content), and each exists exactly once on the screen
    const labels = ['Βγάλε το Excel', 'Εκτύπωση', 'Υπογραφές…'];
    const all = buttonsOf(out).map(b => b.label);
    for (const label of labels) {
      expect(buttonsOf(header).map(b => b.label), label).toContain(label);
      expect(all.filter(l => l === label), label).toHaveLength(1);
    }
    expect(header.indexOf('page-head__acts')).toBeGreaterThan(0);
  });
  it('μενού: ο Οδηγός και το Ιστορικό βγήκαν (? και «⋯»), μπήκαν οι Σημειώσεις· κουμπιά 34 px ώστε να χωρά σε 1366×698 χωρίς κύλιση', () => {
    const out = H.renderApp(bw.world, { nav: 'rail' });
    const html = flatten(out);
    const nav = /<nav class="sidenav"[^>]*>(.*?)<\/nav>/.exec(html)![1];
    const items = [...nav.matchAll(/<button[^>]*class="navbtn"[^>]*aria-label="([^"]*)"/g)].map(m => m[1].replace(/ \(\d+\)$/, ''));
    expect(items).toContain('Σημειώσεις'); expect(items).not.toContain('Οδηγός'); expect(items).not.toContain('Ιστορικό');
    expect(items.at(-1)).toBe('Ρυθμίσεις');   // Ρυθμίσεις is the last screen, pushed to the bottom
    expect(html).toContain('aria-label="Περισσότερα"');       // U4: the history is an item of the «⋯» menu of the top bar
    expect(html).toContain('aria-label="Οδηγός χρήσης"');     // and the guide the «?» button
    const nMenu = items.length;
    // one column: padding 16 + 3 headings (12 + 14 + 4) + the gap before Notes 12 + Settings block 8 + fold button 34 + 1 px gaps
    const fit = (rowHeight: number) => nMenu * rowHeight + 16 + 3 * 30 + 12 + 8 + 34 + nMenu;
    expect(fit(34)).toBeLessThanOrEqual(698 - 44);   // the PC with a task bar: 698 high, 44 of them the top bar
    expect(html).toContain('class="shell is-rail"');
    expect(declsOf('.navbtn').some(d => d.height === 'var(--h-row)')).toBe(true);   // compact density shrinks it through the token
  });
  it('F1 = Οδηγός, Shift+F1 = Υπόμνημα, και το Υπόμνημα είναι θέμα του Οδηγού', () => {
    const open = () => {
      const render = appRenderer(bw.world);
      keys = captureDocumentListeners();
      session = startSession(render);
      session.render(); session.flushEffects();
      return session;
    };
    const viewOf = (s: Session) => s.contextValue<{ view: string; params: Record<string, unknown> }>(v => typeof v.openPerson === 'function');
    const shift = open();
    expect(textsIn(shift.render(), 'h2')).not.toContain('Υπόμνημα κωδικών');
    keys!.dispatch('keydown', { key: 'F1', shiftKey: true });
    expect(textsIn(shift.render(), 'h2')).toContain('Υπόμνημα κωδικών');   // the legend opens over the screen ...
    expect(viewOf(shift).view).toBe('home');                                // ... and the screen does not change
    shift.stop(); keys!.restore();
    const guide = open();
    expect(viewOf(guide).view).toBe('home');
    keys!.dispatch('keydown', { key: 'F1' });
    guide.render(); guide.flushEffects(); guide.render();
    expect(viewOf(guide)).toMatchObject({ view: 'guide', params: { topic: topicFor('home', {}) } });   // the guide, at the topic of the screen
    const lg = GUIDE.find(t => t.id === 'legend')!;
    expect(GUIDE[0]).toBe(lg);
    expect(lg.body).toMatch(/\| \*\*ΕΥ\*\* \|/);
  });
  it('υπότιτλοι ολόκληροι, όχι κομμένοι με «…»', () => {
    // the rule exists (so the check is not about a class nobody styles) and never truncates ...
    const subs = declsOf('.page-head__sub');
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.filter(d => /ellipsis/.test(d['text-overflow'] ?? ''))).toEqual([]);
    expect(rules.filter(r => r.selectors.some(s => /\.page-head__sub\b/.test(s)) && /ellipsis/.test(r.decls['text-overflow'] ?? ''))).toEqual([]);
    // ... and the screen puts the whole sentence in the markup
    const out = H.renderIn(bw.world, 'hkai', {}, createElement(HkaiScreen as never));
    expect(flatten(out)).toContain('<p class="page-head__sub">Βγαίνει μόνη της· κάθε αριθμός ανοίγει τα ονόματα.</p>');
  });
  it('Στελέχη: «Κατάσταση…» αντί για σκέτο «+»', () => {
    const out = H.renderIn(bw.world, 'cadre', {}, createElement(CadreScreen as never));
    const labels = buttonsOf(out).map(b => b.label);
    expect(labels).toContain('Κατάσταση…');
    expect(labels).not.toContain('+');
  });
  it('Δυναμολόγιο σε στενή οθόνη: χωρίς Πατρώνυμο και Τηλέφωνο', () => {
    const render = () => H.renderIn(bw.world, 'people', {}, createElement(PeopleScreen as never));
    const wide = render();
    expect(wide).toContain('Πατρώνυμο'); expect(wide).toContain('Τηλέφωνο');
    // the same screen when the window matches (max-width: 1279px): the columns go away, the rest stay
    const saved = (globalThis as unknown as { matchMedia: unknown }).matchMedia;
    const asked: string[] = [];
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = (query: string) => {
      asked.push(query);
      return { matches: query === '(max-width: 1279px)', media: query, addEventListener: () => {}, removeEventListener: () => {} };
    };
    try {
      const narrow = render();
      expect(asked).toContain('(max-width: 1279px)');
      expect(narrow).not.toContain('Πατρώνυμο'); expect(narrow).not.toContain('Τηλέφωνο');
      expect(narrow).toContain('Θάλ.');
    } finally { (globalThis as unknown as { matchMedia: unknown }).matchMedia = saved; }
  });
  it('Σ.Ι. σύντομα σε στενές στήλες', () => {
    expect(siShort('Ι3 ΧΩΡΙΣ ΟΠΛΟ')).toBe('Ι3 άοπλος');
    expect(siShort('Ι3 ΜΕ ΟΠΛΟ ΟΡΘΟΠΑΙΔΙΚΟ')).toBe('Ι3 ένοπλος ΟΡΘΟΠΑΙΔΙΚΟ');
    expect(siShort('Ι1')).toBe('Ι1');
  });
});
