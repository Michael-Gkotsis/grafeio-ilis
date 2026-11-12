// Διόρθωση και διαγραφή ιατρικού/ποινής που μπήκε λάθος (UX Π2, 22/10) και οι φόρμες που δεν χάνονται σιωπηλά (Π1, Π3).
// Μόνο ψεύτικα ονόματα.
//
// Phase 0.4: the second describe used to grep the screens' source ("usePending(" counted per file, `dirty=${` counted per
// file ...). It now renders each screen/dialog with the SSR harness, presses and types through test/support/probe.ts and
// asserts what the user would see or what the app would do (a pending card is registered, a dialog asks, a command is run).
import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { cloneElement, createElement } from 'react';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Status } from '../src/shared/domain';
import { outBlock, statusesOn } from '../src/shared/rules';
import { fakeState } from './fixtures';
import * as H from './support/screens-harness';
import { captureDocumentListeners, settle, startSession, type DocumentKeys, type Session } from './support/probe';
import { buttonsOf, textOfHtml, textsIn } from './support/html';
import { appRenderer, caseNamed, elementOf, loadWorld, pendingFixtures, withState, type BehaviourWorld } from './support/behaviour';
import { pendingNow } from '../src/renderer/pending';
import { HkaiScreen } from '../src/renderer/screens/other';
import { StatusesPage } from '../src/renderer/pages/statuses';
import { PersonSheet } from '../src/renderer/screens/people';
import { TemplatesScreen } from '../src/renderer/screens/settings';
import { GuardScreen } from '../src/renderer/screens/guard';
import { postsOf } from '../src/shared/rules';
import { ReportsScreen } from '../src/renderer/screens/reports';
import { newForm } from '../src/shared/repPage';

const TODAY = '2026-10-14';
let seq = 0;
const ctx = (): Ctx => ({ today: TODAY, newId: () => 'f' + ++seq });
const run = (s: AppState, c: Command) => apply(s, c, ctx());
const with1 = (st: Status): AppState => ({ ...fakeState(10), statuses: [st] });
const ey: Status = { id: 's1', pid: 1, type: 'EY', from: '2026-10-13', to: '2026-10-15', note: 'ΓΙΑΤΡΟΣ' };
const pun: Status = { id: 'p1', pid: 2, type: 'PUN', from: '2026-10-14', to: '2026-10-17', kind: 'Κράτηση', by: 'ΛΧΙΑ ΔΟΚΙΜΙΟ', reason: 'ΑΡΓΗΣΕ', on: '2026-10-13' };

describe('διόρθωση (replaceStatus)', () => {
  it('αλλάζει τις ημερομηνίες: η παλιά φεύγει, μένει μία καταχώρηση', () => {
    const r = run(with1(ey), { t: 'replaceStatus', id: 's1', cmds: [{ type: 'EY', pids: [1], from: '2026-10-13', to: '2026-10-20', note: 'ΓΙΑΤΡΟΣ' }] });
    expect(r.state.statuses).toHaveLength(1);
    expect(r.state.statuses[0]).toMatchObject({ pid: 1, type: 'EY', from: '2026-10-13', to: '2026-10-20', note: 'ΓΙΑΤΡΟΣ' });
    expect(r.state.statuses[0].id).not.toBe('s1');
    expect(r.text).toMatch(/^Διόρθωση: .*\(ήταν ΕΥ 13\/10–15\/10\)$/);
  });
  it('ίδια στοιχεία: δεν θεωρείται διπλή δήλωση του εαυτού της', () => {
    const r = run(with1(ey), { t: 'replaceStatus', id: 's1', cmds: [{ type: 'EY', pids: [1], from: ey.from, to: ey.to }] });
    expect(r.state.statuses).toHaveLength(1);
  });
  it('άλλο ιατρικό ή άλλος άνθρωπος (μπήκε σε λάθος)', () => {
    const r = run(with1(ey), { t: 'replaceStatus', id: 's1', cmds: [{ type: 'EA', pids: [3], from: ey.from, to: ey.to }] }).state;
    expect(r.statuses.map(x => [x.pid, x.type])).toEqual([[3, 'EA']]);
    expect(statusesOn(r.statuses, 1, TODAY)).toEqual([]);
  });
  it('ποινή: κρατά ποιος τιμώρησε, λόγο και ημερομηνία τιμωρίας', () => {
    const r = run(with1(pun), { t: 'replaceStatus', id: 'p1', cmds: [{ type: 'PUN', pids: [2], from: '2026-10-14', to: '2026-10-15', kind: 'Κράτηση', by: pun.by, reason: pun.reason, on: pun.on }] }).state;
    expect(r.statuses).toHaveLength(1);
    expect(r.statuses[0]).toMatchObject({ type: 'PUN', to: '2026-10-15', by: 'ΛΧΙΑ ΔΟΚΙΜΙΟ', reason: 'ΑΡΓΗΣΕ', on: '2026-10-13' });
  });
  it('ίδιοι έλεγχοι με τη δήλωση: «έως» πριν από «από» δεν γίνεται και η παλιά μένει', () => {
    const s = with1(ey);
    expect(() => run(s, { t: 'replaceStatus', id: 's1', cmds: [{ type: 'EY', pids: [1], from: '2026-10-15', to: '2026-10-13' }] })).toThrow('πριν από');
    expect(s.statuses).toEqual([ey]);
  });
  it('μόνο ιατρικά, ποινές και άδειες (Λ9: οι άδειες διορθώνονται, η έξοδος όχι)', () => {
    const out: Status = { id: 'o1', pid: 1, type: 'OUT', from: TODAY, to: '2026-10-18' };
    expect(() => run(with1(out), { t: 'replaceStatus', id: 'o1', cmds: [{ type: 'OUT', pids: [1], from: TODAY, to: '2026-10-16' }] })).toThrow('μόνο ιατρικά, ποινές και άδειες');
    const lv: Status = { id: 'l1', pid: 1, type: 'LEAVE', from: TODAY, to: '2026-10-18', kind: 'Κανονική' };
    const r = run(with1(lv), { t: 'replaceStatus', id: 'l1', cmds: [{ type: 'LEAVE', pids: [1], from: TODAY, to: '2026-10-16', kind: 'Ειδική' }] }).state;
    expect(r.statuses).toHaveLength(1); expect(r.statuses[0]).toMatchObject({ type: 'LEAVE', to: '2026-10-16', kind: 'Ειδική' });
  });
});

describe('διαγραφή (deleteStatus)', () => {
  it('φεύγει ολόκληρη, και οι περασμένες μέρες', () => {
    const s = with1(pun);
    expect(outBlock(s, TODAY, 2)).toBeTruthy();
    const r = run(s, { t: 'deleteStatus', id: 'p1' });
    expect(r.state.statuses).toEqual([]);
    expect(r.text).toMatch(/^Διαγράφηκε \(μπήκε λάθος\): ποινή 14\/10–17\/10 του /);
    expect(outBlock(r.state, TODAY, 2)).toBeNull();
  });
});


vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReactProbe(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));
vi.mock('react/jsx-runtime', async orig => (await import('./support/ssr-shims')).mockJsxRuntime(orig));
vi.mock('react/jsx-dev-runtime', async orig => (await import('./support/ssr-shims')).mockJsxRuntime(orig));

let bw: BehaviourWorld;
let session: Session | null = null;
let keys: DocumentKeys | null = null;
beforeAll(async () => { bw = await loadWorld(); });
afterEach(() => { session?.stop(); session = null; keys?.restore(); keys = null; });

const h2 = (out: string) => textsIn(out, 'h2');
const h1 = (out: string) => textsIn(out, 'h1')[0];
type El = ReturnType<typeof createElement>;
/** A probe session on `element` rendered inside the app providers; `nav` replaces Nav callbacks with spies. */
const start = (view: string, params: Record<string, unknown>, element: () => El, nav: Record<string, unknown> = {}, world = bw.world): Session => {
  session?.stop();
  session = startSession(() => H.renderIn(world, view, params, element(), {}, nav));
  return session;
};
const screen = (comp: unknown, props: object = {}) => () => createElement(comp as never, props);

describe('οθόνες: τίποτα δεν χάνεται σιωπηλά', () => {
  it('Ιατρικά, Ποινές και καρτέλα στρατιώτη έχουν «Διόρθωση…»', () => {
    // each place lists statuses with a «Διόρθωση…» button that opens the fix dialog (titled «Διόρθωση»)
    const places: [string, string, Record<string, unknown>, () => El, string[]][] = [
      ['Ιατρικά', 'records', {}, screen(StatusesPage), []],
      ['Ποινές', 'records', { stTab: 'pun', punTab: 'allpun' }, screen(StatusesPage), []],
      ['καρτέλα στρατιώτη', 'people', {}, () => createElement(PersonSheet as never, { pid: bw.rows.leaveStarted.pid, onClose: () => {}, onMove: () => {} }), ['Ιστορικό']],
    ];
    for (const [where, view, params, element, tabs] of places) {
      const s = start(view, params, element);
      s.render();
      for (const tab of tabs) { s.press(new RegExp('^' + tab)); s.render(); }
      expect(h2(s.render()), where).not.toContain('Διόρθωση');
      s.press('Διόρθωση…', { index: 0 });
      expect(h2(s.render()), where).toContain('Διόρθωση');
    }
  });
  it('η διόρθωση αποθηκεύεται ως replaceStatus και η διαγραφή ως deleteStatus', async () => {
    const st = bw.rows.sickness, pun = bw.rows.punishment;
    const run = vi.fn(async () => null);
    const world = withState(bw.world, bw.world.state, { run });
    const del = start('records', {}, () => cloneElement(elementOf(bw, 'people-StatusFixDialog'), { st: pun }), {}, world);
    del.render();
    del.press('Διαγραφή (μπήκε λάθος)…');
    expect(h2(del.render())).toContain('Διαγραφή: μπήκε λάθος;');   // asks first
    expect(run).not.toHaveBeenCalled();
    del.press(/^Ναι, διάγραψέ/);
    await settle();
    expect(run).toHaveBeenCalledWith({ t: 'deleteStatus', id: pun.id }, false);
    run.mockClear();
    const fix = start('records', {}, () => cloneElement(elementOf(bw, 'people-DeclareStatusDialog-step3-dates'),
      { initial: { replace: st.id, pids: [st.pid], type: st.type, kind: st.kind, from: st.from, to: st.to } }), {}, world);
    fix.render();
    fix.press('Συνέχεια: Τι θα αλλάξει');
    expect(textOfHtml(fix.render())).toContain('έχει ήδη');   // the sickness overlaps another status: it warns once ...
    fix.press('Συνέχεια: Τι θα αλλάξει');   // ... and goes on when pressed again
    expect(h2(fix.render())).toContain('Τι θα αλλάξει');
    fix.press('Αποθήκευση');
    await settle();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ t: 'replaceStatus', id: st.id }), false);
  });
  describe('κάρτες με «Αποθήκευση» δηλώνουν τις αλλαγές τους (μπάρα + ερώτηση πριν φύγεις)', () => {
    /** Type into every text field of a screen, one at a time, and collect which cards registered an unsaved change. */
    const pendingAfterTyping = (view: string, params: Record<string, unknown>, comp: unknown, world = bw.world, prep?: (s: Session) => void) => {
      const labels = new Set<string>();
      const count = (() => { const s = start(view, params, screen(comp), {}, world); s.render(); prep?.(s); s.render(); return s.textFields(); })();
      for (let i = 0; i < count; i++) {
        const s = start(view, params, screen(comp), {}, world);
        s.render(); prep?.(s); s.render(); s.type('7' + i, i); s.render(); s.flushEffects();
        pendingNow().forEach(p => labels.add(p.label));
        s.stop();
      }
      return [...labels];
    };
    it('Ρυθμίσεις: Μονάδα και έντυπα, Υπογραφές (≥3 με τα Γράμματα Excel)', () => {
      // U11a: the signatures card moved from `unit` to its own section `sigs`
      expect(pendingAfterTyping('templates', { tab: 'unit' }, TemplatesScreen)).toEqual(expect.arrayContaining(['Μονάδα και έντυπα']));
      expect(pendingAfterTyping('templates', { tab: 'sigs' }, TemplatesScreen)).toEqual(expect.arrayContaining(['Υπογραφές']));
      const s = start('templates', { tab: 'excel' }, screen(TemplatesScreen));
      s.render();
      expect(pendingNow()).toEqual([]);   // nothing changed yet: no card is pending
      s.press('Β', { index: 0 }); s.render(); s.flushEffects();   // bold on the first part of the sheet
      expect(pendingNow().map(p => p.label)).toEqual(['Γράμματα Excel']);
    });
    it('Θάλαμοι και ουλαμοί, Τίτλος και λογότυπο', () => {
      expect(pendingAfterTyping('templates', { tab: 'rooms' }, TemplatesScreen)).toContain('Θάλαμοι και ουλαμοί');
      // U11a: the title and logo card moved from `look` to its own section `brand`
      expect(pendingAfterTyping('templates', { tab: 'brand' }, TemplatesScreen)).toContain('Τίτλος και λογότυπο');
    });
    it('ΗΚΑΙ: κεφαλίδα, στοιχεία της μέρας, Στελέχη ανά βαθμό', () => {
      const labels = pendingAfterTyping('hkai', {}, HkaiScreen);
      expect(labels).toContain('Κεφαλίδα της ΗΚΑΙ');
      expect(labels.some(l => /^Στοιχεία της ΗΚΑΙ /.test(l))).toBe(true);
      const noCadre = withState(bw.world, { ...bw.world.state, cadreList: [] });
      expect(pendingAfterTyping('hkai', {}, HkaiScreen, noCadre, s => { if (s.handlers('onClick', 'Άλλαξε').length) s.press('Άλλαξε'); })).toContain('Στελέχη ανά βαθμό');
    });
    it('η εφαρμογή ρωτά πριν αλλάξει οθόνη', () => {
      const fx = pendingFixtures();
      const render = appRenderer(bw.world, createElement(fx.PendingCard));
      keys = captureDocumentListeners();
      session = startSession(render);
      expect(h1(session.render())).toBe('Σήμερα');
      session.flushEffects();
      session.press('Δυναμολόγιο', { index: 0 });
      const asked = session.render();
      expect(h1(asked)).toBe('Σήμερα');   // did not leave
      expect(textOfHtml(asked)).toContain('Δεν αποθηκεύτηκαν οι αλλαγές');
      session.press('Πέτα τις αλλαγές');
      expect(fx.discard).toHaveBeenCalled();
      expect(h1(session.render())).toBe('Δυναμολόγιο');
    });
    it('οι Ρυθμίσεις ρωτούν πριν αλλάξει ενότητα, η ΗΚΑΙ πριν αλλάξει μέρα', () => {
      for (const [view, params, comp, label, expected] of [
        ['templates', {}, TemplatesScreen, 'Λίστες και κωδικοί', { tab: 'lists' }],
        ['hkai', {}, HkaiScreen, /αύριο/, { hkaiDate: H.TOMORROW }],
      ] as const) {
        const fx = pendingFixtures();
        const set = vi.fn();
        const s = start(view, params, () => createElement('div', null, createElement(fx.PendingCard), createElement(fx.Asker), createElement(comp as never)), { set });
        s.render(); s.flushEffects();
        s.press(label, { index: 0 }); s.render();
        expect(set, view).not.toHaveBeenCalled();   // asks first
        fx.asking()!();
        expect(set, view).toHaveBeenCalledWith(expected);
        s.stop();
      }
    });
  });
  describe('φόρμες πολλών βημάτων ρωτούν πριν κλείσουν με Esc/✕', () => {
    // [form that starts clean, form that already holds something unsaved or null to type into the first field]
    const FORMS: [string, string | null][] = [
      ['people-EditPersonDialog', null], ['guard-PhaseDialog-new', null], ['guard-AddBlockDialog', null],
      ['cadre-CadreDialog-new', null], ['cadre-StatusDialog', null],
      // the declare form is "unsaved" as soon as somebody is chosen (step 3 starts with one)
      ['people-DeclareStatusDialog-step1-person', 'people-DeclareStatusDialog-step3-dates'],
    ];
    const open = (name: string, onClose: () => void) => {
      const c = caseNamed(name);
      keys = captureDocumentListeners();
      return start(c.view ?? 'home', c.params ?? {}, () => cloneElement(c.build(bw.world, bw.rows), { onClose }));
    };
    it.each(FORMS)('%s: Esc και ✕ ρωτούν όταν γράφτηκε κάτι, αλλιώς κλείνουν', (clean, withData) => {
      // untouched: Esc closes at once
      const closed = vi.fn();
      const fresh = open(clean, closed);
      fresh.render(); fresh.flushEffects();
      keys!.dispatch('keydown', { key: 'Escape' });
      expect(closed, 'untouched').toHaveBeenCalledTimes(1);
      fresh.stop(); keys!.restore();
      // something written: Esc asks, and so does ✕
      for (const how of ['Esc', '✕']) {
        const onClose = vi.fn();
        const s = open(withData ?? clean, onClose);
        s.render();
        if (!withData) { s.type('Δοκιμή'); s.render(); }
        s.flushEffects();
        if (how === 'Esc') keys!.dispatch('keydown', { key: 'Escape' }); else s.press('Κλείσιμο');
        expect(onClose, how).not.toHaveBeenCalled();
        expect(h2(s.render()), how).toContain('Να κλείσει χωρίς αποθήκευση;');
        s.press('Πίσω στη φόρμα');
        expect(h2(s.render()), how).not.toContain('Να κλείσει χωρίς αποθήκευση;');
        s.stop(); keys!.restore();
      }
    });
    it('η σελίδα δημιουργίας εντύπου σημαίνει τις αλλαγές της (data-dirty)', () => {
      const s = start('reports', newForm({}), screen(ReportsScreen));
      s.render(); s.flushEffects();   // the page takes its starting snapshot in an effect
      const fresh = s.render();
      expect(fresh).toContain('class="rep-page"');
      expect(fresh).not.toContain('data-dirty');
      s.type('Νέο όνομα', 'Όνομα εντύπου'); s.render();
      expect(s.render()).toContain('data-dirty="true"');
    });
    it('ο Esc κλείνει μόνο το πάνω πάνω παράθυρο και το tryClose του Dialog είναι ο χειριστής του', () => {
      // useEscape(tryClose): with a dirty dialog on top of a clean one, Esc asks in the top one and closes nothing
      const top = vi.fn(), under = vi.fn();
      keys = captureDocumentListeners();
      const c = caseNamed('guard-PhaseDialog-new');
      const s = start('guard', {}, () => createElement('div', null,
        cloneElement(c.build(bw.world, bw.rows), { onClose: under }), cloneElement(c.build(bw.world, bw.rows), { onClose: top })));
      s.render(); s.type('x', 1); s.render(); s.flushEffects();
      keys.dispatch('keydown', { key: 'Escape' });
      expect(top).not.toHaveBeenCalled(); expect(under).not.toHaveBeenCalled();
      expect(h2(s.render()).filter(t => t === 'Να κλείσει χωρίς αποθήκευση;')).toHaveLength(1);
    });
  });
  it('«Άδειασε τη μέρα» ρωτά πρώτα', async () => {
    const day = H.TOMORROW;
    const everySeat = Object.fromEntries(postsOf(bw.world.state.settings).map(post => [post.k, bw.world.state.people[0].id]));
    const run = vi.fn(async () => null);
    const world = withState(bw.world, { ...bw.world.state, guards: { ...bw.world.state.guards, [day]: everySeat } }, { run });
    const s = start('guard', { guardDate: day }, screen(GuardScreen), {}, world);
    expect(buttonsOf(s.render()).map(b => b.label)).not.toContain('Καθάρισε');
    s.press(/^Άδειασε τη μέρα/);
    expect(run).not.toHaveBeenCalled();   // a click only asks
    expect(h2(s.render()).some(t => t.startsWith('Να αδειάσει η '))).toBe(true);
    s.press('Όχι');
    expect(h2(s.render()).some(t => t.startsWith('Να αδειάσει η '))).toBe(false);
    s.press(/^Άδειασε τη μέρα/); s.render();
    s.press('Ναι, άδειασέ τη');
    await settle();
    expect(run).toHaveBeenCalledWith({ t: 'clearDay', date: day }, false);
  });
});
