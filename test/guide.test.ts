// Οδηγός χρήσης (Michael, 21/10): κάθε σύνδεσμος πάει σε θέμα που υπάρχει, κάθε «Άνοιξε» σε οθόνη που υπάρχει,
// κάθε μενού και κάθε ενότητα των Ρυθμίσεων έχει θέμα, και η αναζήτηση βρίσκει χωρίς τόνους.
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { GUIDE, GUIDE_GROUPS } from '../src/renderer/guideText';
import { parseGuide, searchGuide } from '../src/renderer/screens/guide';
import { topicFor } from '../src/renderer/guideTopic';
import { TemplatesScreen } from '../src/renderer/screens/settings';
import * as H from './support/screens-harness';
import { captureDocumentListeners, startSession, type DocumentKeys } from './support/probe';
import { flat } from './support/html';
import { appRenderer, loadWorld, type BehaviourWorld } from './support/behaviour';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReactProbe(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));
vi.mock('react/jsx-runtime', async orig => (await import('./support/ssr-shims')).mockJsxRuntime(orig));
vi.mock('react/jsx-dev-runtime', async orig => (await import('./support/ssr-shims')).mockJsxRuntime(orig));

// Phase 0.4: the list of screens and of Ρυθμίσεις sections used to be cut out of src/renderer/app.ts and settings.ts with a
// regex. They are now discovered from the running UI: every screen the shell can open (menu, top bar, Ctrl+Shift+D) and every
// section button of Ρυθμίσεις, read from the `nav` the screens receive.
let bw: BehaviourWorld;
let views: string[] = [];
let tabs: string[] = [];
let keys: DocumentKeys | null = null;
beforeAll(async () => {
  bw = await loadWorld();
  const render = appRenderer(bw.world);
  keys = captureDocumentListeners();
  const app = startSession(render);
  try {
    app.render(); app.flushEffects();
    const viewNow = () => app.contextValue<{ view: string }>(v => typeof v.openPerson === 'function').view;
    const seen = new Set<string>([viewNow()]);
    const menu = flat(app.render()).match(/<nav class="sidenav"[^>]*>(.*?)<\/nav>/)![1];
    const labels = [...menu.matchAll(/<span class="navbtn__lbl">([^<]*)</g)].map(m => m[1]).filter(l => !/μενού|Άνοιγμα/.test(l));
    for (const label of [...labels, 'Ιστορικό ενεργειών', 'Οδηγός χρήσης']) {
      app.press(new RegExp('^' + label), { index: 0 }); app.render(); seen.add(viewNow());
    }
    keys.dispatch('keydown', { key: 'D', ctrlKey: true, shiftKey: true }); app.render(); seen.add(viewNow());   // the hidden Διάγνωση
    views = [...seen];
  } finally { app.stop(); keys.restore(); keys = null; }
  // sections of Ρυθμίσεις: the section list has one button per section; pressing one asks the screen to set {tab}
  const found = new Set<string>();
  for (const current of ['unit', 'rooms']) {
    const set = vi.fn();
    const s = startSession(() => H.renderIn(bw.world, 'templates', { tab: current }, createElement(TemplatesScreen as never), {}, { set }));
    try {
      const nav = flat(s.render()).match(/<nav class="setnav"[^>]*>(.*?)<\/nav>/)![1];
      for (const label of [...nav.matchAll(/<button[^>]*>([^<]*)</g)].map(m => m[1])) s.press(label);
      for (const [arg] of set.mock.calls) found.add((arg as { tab: string }).tab);
      found.add(current);
    } finally { s.stop(); }
  }
  tabs = [...found];
});

const ids = new Set(GUIDE.map(t => t.id));

describe('οδηγός χρήσης', () => {
  it('οι οθόνες και οι ενότητες των Ρυθμίσεων βρέθηκαν από την εφαρμογή (όχι από το κείμενο του κώδικα)', () => {
    expect(views).toEqual(expect.arrayContaining(['home', 'people', 'cadre', 'guard', 'outs', 'records', 'strength', 'hkai', 'weapons', 'reports', 'notes', 'history', 'templates', 'guide', 'diag']));
    expect(tabs.length).toBeGreaterThanOrEqual(13);
    expect(tabs).toContain('unit');
  });
  it('μοναδικά θέματα, σε ομάδα που υπάρχει', () => {
    expect(ids.size).toBe(GUIDE.length);
    const groups = GUIDE_GROUPS.map(([g]) => g);
    expect(GUIDE.filter(t => !groups.includes(t.group)).map(t => t.id)).toEqual([]);
  });
  it('οι σύνδεσμοι [[…]] πάνε σε θέμα που υπάρχει', () => {
    const bad = GUIDE.flatMap(t => [...t.body.matchAll(/\[\[([^\]|]+)/g)].map(m => m[1]).filter(id => !ids.has(id)).map(id => t.id + ' → ' + id));
    expect(bad).toEqual([]);
  });
  it('το «Άνοιξε» πάει σε οθόνη και ενότητα Ρυθμίσεων που υπάρχουν', () => {
    expect(views).toContain('guide');
    const bad = GUIDE.filter(t => t.go && (!views.includes(t.go.view) || (t.go.view === 'templates' && !tabs.includes(t.go.params?.tab || '')))).map(t => t.id);
    expect(bad).toEqual([]);
  });
  it('κάθε οθόνη και κάθε ενότητα των Ρυθμίσεων έχει θέμα (Shift+F1)', () => {
    for (const v of views.filter(v => v !== 'templates' && v !== 'guide' && v !== 'diag')) expect(ids.has(topicFor(v, {})), v).toBe(true);
    for (const tab of tabs) expect(ids.has(topicFor('templates', { tab })), tab).toBe(true);
    expect(topicFor('templates', {})).toBe('set-unit');
  });
  it('οι πίνακες έχουν ίδιο πλήθος στηλών σε κάθε γραμμή', () => {
    for (const t of GUIDE) for (const b of parseGuide(t.body)) if (b.t === 'table') {
      expect(b.rows.length, t.id).toBeGreaterThan(1);
      for (const r of b.rows) expect(r.length, t.id + ': ' + r.join(' | ')).toBe(b.rows[0].length);
    }
  });
  it('η σήμανση γίνεται κομμάτια: υπότιτλοι, βήματα, κουκκίδες, συμβουλές', () => {
    const b = parseGuide('## Τίτλος\nΜία\nγραμμή\n\n1. πρώτο\n2. δεύτερο\n- α\n- β\n> συμβουλή\n! προσοχή\n| Α | Β\n| 1 | 2');
    expect(b.map(x => x.t)).toEqual(['h', 'p', 'ol', 'ul', 'tip', 'warn', 'table']);
    expect(b[1]).toEqual({ t: 'p', text: 'Μία γραμμή' });
    // βήματα μετά από κουκκίδες συνεχίζουν την αρίθμηση
    const c = parseGuide('1. α\n2. β\n- υπο\n3. γ');
    expect(c[2]).toEqual({ t: 'ol', items: ['γ'], start: 3 });
  });
  it('αναζήτηση χωρίς τόνους και κεφαλαία, πρώτα όσα ταιριάζουν στον τίτλο', () => {
    expect(searchGuide('εξοδουχοι')[0].topic.id).toBe('outs');
    expect(searchGuide('ΑΝΤΙΓΡΑΦΟ usb').map(h => h.topic.id)).toContain('set-backup');
    expect(searchGuide('κενη θεση').length).toBeGreaterThan(0);
    expect(searchGuide('ξξξξ')).toEqual([]);
    expect(searchGuide('   ')).toEqual([]);
  });
});
