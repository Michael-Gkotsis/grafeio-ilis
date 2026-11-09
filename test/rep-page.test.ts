// Έντυπα › σελίδα δημιουργίας (Φάση 2): δείγμα ανά πίνακα στην προεπισκόπηση, σελίδες, διαδρομή. Το δείγμα δεν φτάνει ποτέ στο βγάλσιμο.
//
// Phase 0.4: "Σελίδα δημιουργίας: σύνδεση με την εφαρμογή" used to grep reports.ts and app.ts for `usePending(dirty,`,
// `<${DiscardAsk}`, `reports: FORM_PARAM` ...; it now opens the page (and the whole app) with the SSR harness and presses.
// The main-process wiring test stays a source scan (ipcMain handlers cannot be called), but over all of src/main.
import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { createElement } from 'react';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport, previewReport } from '../src/main/reports';
import { defaultPick, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { FORM_PARAM, autoName, PV_MAX, PV_PAGES, PV_SAMPLES, PV_SAMPLE_DEF, clampPage, cutSample, editForm, formOpen, formSnap, getSample, isFormDirty, newForm, noForm, pageText, sampleName, sampleLabel, setSample, shownPages } from '../src/shared/repPage';
import { fakeState } from './fixtures';
import * as H from './support/screens-harness';
import { captureDocumentListeners, settle, startSession, type DocumentKeys, type Session } from './support/probe';
import { textOfHtml, textsIn } from './support/html';
import { readSources, SRC_DIR } from './support/source-scan';
import { appRenderer, loadWorld, withState, type BehaviourWorld } from './support/behaviour';
import { pendingNow } from '../src/renderer/pending';
import { ReportsScreen } from '../src/renderer/screens/reports';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReactProbe(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));

let bw: BehaviourWorld;
let session: Session | null = null;
let keys: DocumentKeys | null = null;
beforeAll(async () => { bw = await loadWorld(); });
afterEach(() => { session?.stop(); session = null; keys?.restore(); keys = null; });

const D = '2026-10-19';
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const two = (): BuildOpts => ({
  title: 'ΔΥΝΑΜΟΛΟΓΙΟ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray',
  cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }],
  more: [{ id: 't2', title: 'ΔΕΥΤΕΡΟΣ ΠΙΝΑΚΑΣ', kind: 'people', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }] }]
});
async function setup(n = 130) {
  const s = fakeState(n); const o = two(); const b = await buildTemplate(o, 'people');
  const r = withBuilt(rep({}), b, o); r.more = r.more!.map(t => ({ ...t, pick: defaultPick() }));
  return { s, b, r, ids: s.people.map(p => p.id) };
}
const pgs = (html: string) => (html.match(/class="pg"/g) || []).length;

describe('Δείγμα προεπισκόπησης', () => {
  it('καθαρή λογική: κόψιμο, ετικέτα, μνήμη ανά έντυπο', () => {
    expect(PV_SAMPLES).toEqual([5, 10, 20, 0]); expect(sampleName(0)).toBe('Όλοι'); expect(sampleName(5)).toBe('5');
    expect(cutSample([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([1, 2, 3, 4, 5]); expect(cutSample([1, 2], 5)).toEqual([1, 2]);
    expect(cutSample(Array.from({ length: PV_MAX + 50 }, (_, i) => i), 0).length).toBe(PV_MAX);
    expect(sampleLabel({ shown: 5, total: 130 })).toBe('Δείγμα: 5 από 130'); expect(sampleLabel({ shown: 7, total: 7 })).toBe(''); expect(sampleLabel()).toBe('');
    expect(getSample('x1')).toBe(PV_SAMPLE_DEF); setSample('x1', 20); expect(getSample('x1')).toBe(20); expect(getSample('x2')).toBe(PV_SAMPLE_DEF);
  });

  it('κάθε πίνακας δείχνει ως Ν άτομα και ο δεύτερος φαίνεται στην 1η σελίδα· counts «5 από 130» ανά πίνακα', async () => {
    const { s, b, r, ids } = await setup();
    const before = JSON.stringify(r);
    // όπως ήταν πριν: 130 γραμμές στον 1ο, ο 2ος πίνακας δεν φαίνεται στην 1η σελίδα
    const old = await previewReport(b.data, s, r, ids, D);
    expect(old.html).not.toContain('ΔΕΥΤΕΡΟΣ ΠΙΝΑΚΑΣ'); expect(old.pages).toBeGreaterThan(1); expect(old.counts).toBeUndefined();
    const pv = await previewReport(b.data, s, r, ids, D, PV_PAGES, 5);
    expect(pv.counts).toEqual([{ shown: 5, total: 130 }, { shown: 5, total: 130 }]);
    expect(pv.html).toContain('ΔΕΥΤΕΡΟΣ ΠΙΝΑΚΑΣ'); expect(pv.pages).toBe(1);
    const p20 = await previewReport(b.data, s, r, ids, D, PV_PAGES, 20);
    expect(p20.counts).toEqual([{ shown: 20, total: 130 }, { shown: 20, total: 130 }]);
    expect(JSON.stringify(r)).toBe(before);   // το έντυπο δεν αλλάζει (το δείγμα δεν μπαίνει σε αυτό)
  });

  it('«Όλοι»: όλοι οι πίνακες, σε πολλές σελίδες που φαίνονται όλες· λιγότεροι από το δείγμα: όλοι', async () => {
    const { s, b, r, ids } = await setup();
    const all = await previewReport(b.data, s, r, ids, D, PV_PAGES, 0);
    expect(all.counts).toEqual([{ shown: 130, total: 130 }, { shown: 130, total: 130 }]);
    expect(all.pages).toBeGreaterThan(2); expect(pgs(all.html)).toBe(shownPages(all.pages));
    const few = await setup(3);
    const pv = await previewReport(few.b.data, few.s, few.r, few.ids, D, PV_PAGES, 10);
    expect(pv.counts).toEqual([{ shown: 3, total: 3 }, { shown: 3, total: 3 }]);
  });

  it('το δείγμα δεν φτάνει στο έντυπο που βγαίνει: fillReport χωρίς pv έχει όλους και όλους τους πίνακες', async () => {
    const { s, b, r, ids } = await setup();
    await previewReport(b.data, s, r, ids, D, PV_PAGES, 5);   // προεπισκόπηση πριν
    const out = await fillReport(b.data, s, r, ids, D);       // όπως το καλεί το rep:run (χωρίς 7ο όρισμα)
    expect(out.counts).toBeUndefined();
    const ws = await (await Workbook.open(out.data)).sheet(0);
    expect(ws.get('A8')).toBe('1'); expect(ws.get('A137')).toBe('130'); expect(ws.get('A138')).toBeNull();
    // ο 2ος πίνακας κάτω από τους 130: επικεφαλίδες και οι 130 γραμμές του
    const title = Array.from({ length: 30 }, (_, i) => 139 + i).find(i => ws.get('A' + i) === 'ΔΕΥΤΕΡΟΣ ΠΙΝΑΚΑΣ'); expect(title).toBeDefined();
    expect(ws.get('A' + (title! + 2))).toBe('1'); expect(ws.get('A' + (title! + 131))).toBe('130'); expect(ws.get('A' + (title! + 132))).toBeNull();
  });

  // Genuine source rule (not behaviour): the handlers live inside Electron's ipcMain, which no test can call. So the scan
  // walks all of src/main (wherever the rewrite moves the handlers) and finds them by their channel name.
  it('στον main το δείγμα μπαίνει μόνο στο rep:preview, όχι στο rep:run ούτε στις αυτόματες ενημερώσεις', () => {
    const files = readSources(path.join(SRC_DIR, 'main'), 5);
    const body = (name: string) => files.flatMap(f => {
      // whitespace-tolerant: the formatter may break the call after `(`
      const i = f.text.search(new RegExp("ipcMain\\.handle\\(\\s*'" + name + "'"));
      if (i < 0) return [];
      const j = f.text.indexOf('ipcMain.handle(', i + 10);
      return [f.text.slice(i, j < 0 ? undefined : j)];
    });
    expect(body('rep:preview')).toHaveLength(1); expect(body('rep:run')).toHaveLength(1);
    expect(body('rep:preview')[0]).toMatch(/sample/); expect(body('rep:run')[0]).not.toMatch(/sample|PV_/);
    // every other code line that names `sample` is the engine itself (the file that declares PvOpts) or hands it to
    // previewReport / previewBuilt; comments may mention it anywhere
    const engine = files.filter(f => /export interface PvOpts\b/.test(f.text));
    expect(engine).toHaveLength(1);
    const stray = files.filter(f => f !== engine[0]).flatMap(f => {
      const handler = body('rep:preview')[0];
      return f.text.split('\n').filter(l => /\bsample\b/.test(l) && !/^\s*\/\//.test(l) && !/previewReport|previewBuilt/.test(l) && !handler.includes(l.trim()));
    });
    expect(stray).toEqual([]);
    // the export's fillReport (worker side) takes exactly the 5 arguments, so no sample can reach it
    const w = files.filter(f => /fillReport: \(tpl, r, ids, d, o\) => fillReport\(buf\(tpl\), state, r, ids, d, o\)/.test(f.text));
    expect(w).toHaveLength(1);
  });
});

describe('Σελίδες προεπισκόπησης', () => {
  it('Σελίδα Ν από Μ και πλοήγηση ‹ ›', () => {
    expect(pageText(1, 5)).toBe('Σελίδα 1 από 5'); expect(pageText(9, 5)).toBe('Σελίδα 5 από 5');
    expect(clampPage(0, 5)).toBe(1); expect(clampPage(6, 5)).toBe(5); expect(clampPage(3, 0)).toBe(1);
    expect(shownPages(40)).toBe(PV_PAGES); expect(shownPages(3)).toBe(3); expect(clampPage(30, 40)).toBe(PV_PAGES);
  });
});

describe('Διαδρομή της σελίδας δημιουργίας', () => {
  const reports = [rep({ id: 'a' }), rep({ id: 'b' })];
  it('χωρίς param: κανένα (η λίστα)· νέο έντυπο με επιλογές εκκίνησης· αλλαγή ενός υπάρχοντος', () => {
    expect(formOpen({}, reports)).toBeNull(); expect(formOpen({ [FORM_PARAM]: undefined }, reports)).toBeNull(); expect(formOpen(noForm(), reports)).toBeNull();
    const n = formOpen(newForm({ start: 'build', preset: 'p1' }), reports)!;
    expect(n.arg).toEqual({ start: 'build', preset: 'p1' }); expect(n.r).toBeUndefined();
    const e = formOpen(editForm('b'), reports)!; expect(e.r).toBe(reports[1]); expect(e.key).toBe('b');
  });
  it('έντυπο που δεν υπάρχει πια: όχι σελίδα· άκυρες τιμές αγνοούνται· δεύτερο «Νέο έντυπο» έχει άλλο κλειδί', () => {
    expect(formOpen(editForm('zzz'), reports)).toBeNull();
    expect(formOpen({ [FORM_PARAM]: { start: 'hack', preset: 5, tpl: 't' } }, reports)!.arg).toEqual({ tpl: 't' });
    expect(formOpen({ [FORM_PARAM]: 'x' }, reports)).toBeNull();
    const a = formOpen({ [FORM_PARAM]: { n: 1 } }, reports)!, b = formOpen({ [FORM_PARAM]: { n: 2 } }, reports)!; expect(a.key).not.toBe(b.key);
  });
});

describe('Σελίδα δημιουργίας: σύνδεση με την εφαρμογή', () => {
  const h2 = (out: string) => textsIn(out, 'h2');
  const NAME = 'Όνομα εντύπου';
  /** The report page (ReportsScreen on a new-form route) in the app providers; `nav` replaces Nav callbacks. */
  const openPage = (world = bw.world, nav: Record<string, unknown> = {}, start: Parameters<typeof newForm>[0] = {}): Session => {
    session?.stop(); keys?.restore();
    keys = captureDocumentListeners();
    session = startSession(() => H.renderIn(world, 'reports', newForm(start), createElement(ReportsScreen as never), {}, nav));
    session.render(); session.flushEffects();
    return session;
  };
  const refresh = (s: Session): string => { s.render(); s.flushEffects(); return s.render(); };

  it('δεν είναι πια παράθυρο· μη αποθηκευμένες αλλαγές ρωτούν σε πίσω, Esc και αλλαγή οθόνης', () => {
    const s = openPage();
    const page = s.render();
    expect(page).toContain('class="rep-page"');
    expect(page).not.toContain('role="dialog"'); expect(page).not.toContain('role="alertdialog"');   // a page, not a dialog
    // nothing written: back and Esc leave at once (onClose = back to the list)
    const left = vi.fn();
    const clean = openPage(bw.world, { go: left });
    clean.press('← Έντυπα');
    expect(h2(clean.render())).not.toContain('Να κλείσει χωρίς αποθήκευση;');
    // something written: the page registers an unsaved change (its own ask, no bottom bar) ...
    const dirty = openPage();
    dirty.type('ΚΑΤΑΣΤΑΣΗ ΔΟΚΙΜΗ', NAME); refresh(dirty);
    expect(dirty.render()).toContain('data-dirty="true"');
    expect(pendingNow().map(p => [p.label, p.bar])).toEqual([['Έντυπο «ΚΑΤΑΣΤΑΣΗ ΔΟΚΙΜΗ»', false]]);
    // ... and back, Esc ask first, then «Πίσω στη φόρμα» keeps the page
    for (const how of ['back', 'Esc']) {
      if (how === 'back') dirty.press('← Έντυπα'); else keys!.dispatch('keydown', { key: 'Escape' });
      expect(h2(dirty.render()), how).toContain('Να κλείσει χωρίς αποθήκευση;');
      dirty.press('Πίσω στη φόρμα');
      expect(h2(dirty.render()), how).not.toContain('Να κλείσει χωρίς αποθήκευση;');
      expect(dirty.render(), how).toContain('class="rep-page"');
    }
  });

  it('αλλαγή οθόνης και πάτημα «Έντυπα» στο μενού: ρωτά όταν υπάρχουν αλλαγές, αλλιώς πάει στη λίστα', async () => {
    const open = async () => {
      session?.stop(); keys?.restore();
      const render = appRenderer(bw.world);
      keys = captureDocumentListeners();
      session = startSession(render);
      session.render(); session.flushEffects();
      const nav = session.contextValue<Record<string, (...a: unknown[]) => void>>(v => typeof v.openPerson === 'function');
      nav.go('reports', newForm({}));
      refresh(session);
      await settle(); await settle();   // the screen is a lazy chunk: the first render shows «Φόρτωση…», the next one the page
      refresh(session);
      return session;
    };
    const menu = (s: Session, label: string) => s.press(new RegExp('^' + label), { index: 0 });
    // clean page: the menu entry «Έντυπα» shows the list (no page), without asking
    const clean = await open();
    expect(clean.render()).toContain('class="rep-page"');
    menu(clean, 'Έντυπα'); const list = refresh(clean);
    expect(list).not.toContain('class="rep-page"'); expect(textOfHtml(list)).not.toContain('Δεν αποθηκεύτηκαν οι αλλαγές');
    // written page: both the menu entry and another screen ask (alertdialog of the app), «Μείνε εδώ» keeps the page
    for (const target of ['Έντυπα', 'Οπλισμός']) {
      const s = await open();
      s.type('ΚΑΤΑΣΤΑΣΗ ΔΟΚΙΜΗ', NAME); refresh(s);
      menu(s, target); const asked = refresh(s);
      expect(asked, target).toContain('role="alertdialog"');
      expect(h2(asked), target).toContain('Δεν αποθηκεύτηκαν οι αλλαγές');
      expect(asked, target).toContain('class="rep-page"');
      s.press('Μείνε εδώ');
      expect(s.render(), target).not.toContain('role="alertdialog"');
      expect(s.render(), target).toContain('class="rep-page"');
    }
    // «Πέτα τις αλλαγές» closes the page and goes where the user pressed
    const s = await open();
    s.type('ΚΑΤΑΣΤΑΣΗ ΔΟΚΙΜΗ', NAME); refresh(s);
    menu(s, 'Έντυπα'); refresh(s);
    s.press('Πέτα τις αλλαγές'); await settle();
    expect(refresh(s)).not.toContain('class="rep-page"');
  });

  it('το δείγμα και η σελίδα μένουν έξω από το έντυπο που αποθηκεύεται', async () => {
    const run = vi.fn(async () => null);
    const s = openPage(withState(bw.world, bw.world.state, { run }), {}, { start: 'build', preset: 'onomastiki' });
    s.type('ΚΑΤΑΣΤΑΣΗ ΔΟΚΙΜΗ', NAME); refresh(s);
    s.press('Αποθήκευση'); await settle();
    expect(run).toHaveBeenCalledTimes(1);
    const [cmd] = run.mock.calls[0] as unknown as [{ t: string; settings: { reports: Record<string, unknown>[] } }];
    expect(cmd.t).toBe('setSettings');
    const saved = cmd.settings.reports.find(r => r.name === 'ΚΑΤΑΣΤΑΣΗ ΔΟΚΙΜΗ')!;
    expect(saved).toBeDefined();
    // the preview's sample size / page and the PV_* constants never become fields of the saved report
    const keysOf = (o: unknown): string[] => (o && typeof o === 'object')
      ? Object.entries(o).flatMap(([k, v]) => [k, ...keysOf(v)]) : [];
    expect(keysOf(cmd).filter(k => /^(sample|page|pg|pv)$/i.test(k) || k.startsWith('PV_'))).toEqual([]);
  });
});

describe('σελίδα δημιουργίας: μη αποθηκευμένες αλλαγές', () => {
  const sg = { sergeant: '', commander: '' };
  const snap = (r: Report, build: BuildOpts | null = null, mode: string | null = null) => formSnap(r, build, mode, sg);
  it('νέο έντυπο: η αφετηρία είναι η αρχική κατάσταση και η πλοήγηση στα βήματα δεν αλλάζει το στιγμιότυπο', () => {
    const r = rep({ id: 'n1', name: '' }); const base = snap(r);
    // βήμα, δείγμα και σελίδα δεν είναι ορίσματα του formSnap: όσα βήματα κι αν πατηθούν, το στιγμιότυπο μένει ίδιο
    expect(isFormDirty(base, snap({ ...r }))).toBe(false);
  });
  it('διαδρομή με προεπιλογή: ό,τι μπαίνει πριν την αφετηρία δεν είναι αλλαγή· αλλαγή πεδίου μετά είναι', () => {
    const b = two(); const r = rep({ id: 'n2', name: 'ΔΥΝΑΜΟΛΟΓΙΟ' });
    const base = snap(r, b, 'build');
    expect(isFormDirty(base, snap({ ...r }, JSON.parse(JSON.stringify(b)), 'build'))).toBe(false);
    expect(isFormDirty(base, snap({ ...r, name: 'ΔΥΝΑΜΟΛΟΓΙΟ Α' }, b, 'build'))).toBe(true);
    expect(isFormDirty(base, snap(r, { ...b, title: 'Άλλος τίτλος' }, 'build'))).toBe(true);
  });
  it('χωρίς αφετηρία (αρχικοποίηση σε εξέλιξη) ή την ώρα της αποθήκευσης δεν είναι αλλαγή', () => {
    const r = rep({ id: 'n3' });
    expect(isFormDirty(null, snap({ ...r, name: 'x' }))).toBe(false);
    expect(isFormDirty(snap(r), snap({ ...r, name: 'x' }), true)).toBe(false);
  });
  it('υπάρχον έντυπο χωρίς αλλαγή δεν είναι αλλαγμένο, με αλλαγή είναι', () => {
    const r = rep({ id: 'e1' }); const base = snap(r, null, 'upload');
    expect(isFormDirty(base, snap({ ...r }, null, 'upload'))).toBe(false);
    expect(isFormDirty(base, snap({ ...r, name: 'Αλλαγμένο' }, null, 'upload'))).toBe(true);
  });
});

describe('Όνομα εντύπου όταν δεν γράφτηκε (Michael, 29/10: «δεν μου αποθήκευσε»)', () => {
  it('παίρνει τον τίτλο, αλλιώς «Έντυπο»', () => {
    expect(autoName('  ΚΑΤΑΣΤΑΣΗ   ΘΑΛΑΜΟΥ ')).toBe('ΚΑΤΑΣΤΑΣΗ ΘΑΛΑΜΟΥ');
    expect(autoName('')).toBe('Έντυπο'); expect(autoName(undefined)).toBe('Έντυπο'); expect(autoName('   ')).toBe('Έντυπο');
  });
});
