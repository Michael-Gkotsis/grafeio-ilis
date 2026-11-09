// UX γύρος 3 (22/10): ονόματα και συνέπεια, Ctrl+K, γκρι κουμπιά που λένε γιατί, σύνδεσμοι αντί για «πήγαινε στο…».
// Μόνο ψεύτικα ονόματα.
//
// Phase 0.4: the checks below that used to grep the source text (`src('screens/other.ts')` ...) now render the screen with
// the SSR harness (test/support/screens-harness.ts) and press/read it through test/support/probe.ts. Only the two
// checks that are rules about the source itself (the Ctrl+K code must not pull the Οδηγός text into the first load;
// a disabled button that waits for a missing field must say why) scan the source, path-independently
// (test/support/source-scan.ts).
import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { hkaiCounts, postsOf } from '../src/shared/rules';
import { hkaiChecks } from '../src/shared/preflight';
import { GUIDE_TITLES } from '../src/renderer/guideTopic';
import { GUIDE } from '../src/renderer/guideText';
import { fakeState } from './fixtures';
import * as H from './support/screens-harness';
import { startSession, type Session } from './support/probe';
import { buttonLabelled, buttonsOf, flat, textOfHtml, textsIn } from './support/html';
import { componentTag, definersOf, readSources, rendererEntry, staticClosure } from './support/source-scan';
import { loadWorld, renderCase as renderCaseOf, type BehaviourWorld } from './support/behaviour';
import { HK } from '../src/shared/unit';
import { Button, Dialog } from '../src/renderer/ui';
import { GoLink } from '../src/renderer/common';
import { CommandPalette } from '../src/renderer/screens/other';
import { GuardScreen, RulesDialog } from '../src/renderer/screens/guard';
import { PeopleScreen } from '../src/renderer/screens/people';
import { TemplatesScreen } from '../src/renderer/screens/settings';
import { HkHeadFields } from '../src/renderer/screens/hkrows';
import { pendingNow, useLeaveAsk, usePending } from '../src/renderer/pending';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReactProbe(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));

let bw: BehaviourWorld;
let world: H.World;
beforeAll(async () => { bw = await loadWorld(); world = bw.world; });
let session: Session | null = null;
afterEach(() => { session?.stop(); session = null; });
const renderCase = (name: string): string => renderCaseOf(bw, name);


const D = '2026-10-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'u' + ++n }).state;
const noCadre = (s: AppState): AppState => ({ ...s, cadreList: [], settings: { ...s.settings, cadre: Object.fromEntries(Object.keys(s.settings.cadre).map(k => [k, 0])) } });
const warns = (s: AppState) => hkaiChecks(s, D).filter(c => /Δεν υπάρχουν στελέχη/.test(c.text));

describe('ΗΚΑΙ: στελέχη (Π6)', () => {
  it('χωρίς στελέχη πουθενά: μία προειδοποίηση, με σύνδεσμο στα Στελέχη', () => {
    const w = warns(noCadre(fakeState(10)));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ level: 'warn', go: 'cadre' });
  });
  it('με στελέχη στην καρτέλα Στελέχη: καμία προειδοποίηση', () => {
    const s = run(noCadre(fakeState(10)), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΔΟΚΙΜΟΣ' } });
    expect(warns(s)).toEqual([]);
  });
  it('με αριθμούς ανά βαθμό (χωρίς ονόματα): καμία προειδοποίηση', () => {
    const s = noCadre(fakeState(10));
    expect(warns({ ...s, settings: { ...s.settings, cadre: { ...s.settings.cadre, Λοχίες: 2 } } })).toEqual([]);
  });
  it('η δύναμη χωρίζεται σε στρατιώτες και στελέχη', () => {
    const s = run(noCadre(fakeState(10)), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΔΟΚΙΜΟΣ' } });
    const h = hkaiCounts(s, D);
    expect(h.cadreN).toBe(1);
    expect(h.soldiers + h.cadreN).toBe(h.total);
    expect(h.soldiers).toBe(s.people.filter(p => p.active).length);
  });
});

const optionTitles = (out: string): string[] =>
  [...flat(out).matchAll(/<li[^>]*role="option"[^>]*><div><b>([^<]*)<\/b><\/div><\/li>/g)].map(m => m[1]);
const paletteOf = (query = ''): string => {
  session = startSession(() => H.renderIn(world, 'home', {}, createElement(CommandPalette as never, { onClose: () => {} })));
  const first = session.render();
  if (!query) return first;
  session.seedState(v => v === '', query);   // the palette's own text field is the first empty-string state
  return session.render();
};

describe('Ctrl+K βρίσκει οθόνες, ενέργειες, Ρυθμίσεις και Οδηγό (Μ8)', () => {
  it('οι τίτλοι του Οδηγού για την αναζήτηση ταιριάζουν με τον Οδηγό', () => {
    expect(GUIDE_TITLES).toEqual(GUIDE.map(t => [t.id, t.title]));
  });
  it('όσα έλειπαν είναι πια μέσα', () => {
    const titles = optionTitles(paletteOf());
    for (const t of ['Στελέχη', 'Οπλισμός', 'Νέος στρατιώτης', 'Γρήγορη εισαγωγή', 'Κανόνες υπηρεσιών', 'Εκτός δύναμης', 'Εκτύπωση', 'Γράμματα Excel', 'Υπογραφές', 'Πρότυπα εφαρμογής', 'Ρυθμίσεις › Σ.Ι.', 'Ρυθμίσεις › Αργίες'])
      expect(titles.some(x => x.startsWith(t) || x.includes('› ' + t)), t).toBe(true);
    // every topic of the Οδηγός is an entry (the old check only saw that the source mapped GUIDE_TITLES)
    expect(titles.filter(x => x.startsWith('Οδηγός: '))).toEqual(GUIDE_TITLES.map(([, t]) => 'Οδηγός: ' + t.replace(/ΗΚΑΙ/g, HK())));
  });
  it('«εκτ» βρίσκει κάτι (πριν: «Δεν βρέθηκε τίποτα»)', () => {
    const titles = optionTitles(paletteOf('εκτ'));
    expect(titles.length).toBeGreaterThanOrEqual(2);
    expect(titles.some(x => x.startsWith('Εκτύπωση'))).toBe(true);
  });
  it('οι παράμετροι που στέλνει ανοίγουν το σωστό σημείο', () => {
    const open = (view: string, comp: unknown, params: Record<string, unknown>) => {
      const sets: unknown[] = [];
      session?.stop();
      session = startSession(() => H.renderIn(world, view, params, createElement(comp as never), {}, { set: (p: unknown) => sets.push(p) }));
      const before = session.render();
      session.flushEffects();
      return { before, after: session.render(), sets };
    };
    const selectedTab = (out: string) => flat(out).match(/role="tab" aria-selected="true">([^<]*)</)?.[1];
    for (const [gopen, tab] of [['check', 'Έλεγχος υπηρεσιών'], ['who', 'Ποιος κάνει τι'], ['skips', 'Εξαιρέσεις']] as const) {
      const r = open('guard', GuardScreen, { gopen });
      expect(selectedTab(r.before)?.startsWith('Θέσεις'), gopen).toBe(true);   // «Θέσεις (n)»
      expect(selectedTab(r.after)?.startsWith(tab), gopen).toBe(true);
      expect(r.sets, gopen).toContainEqual({ gopen: undefined });   // the param is consumed, so Back does not reopen it
    }
    const rules = open('guard', GuardScreen, { gopen: 'rules' });
    expect(textsIn(rules.before, 'h2')).not.toContain('Κανόνες υπηρεσιών');
    expect(textsIn(rules.after, 'h2')).toContain('Κανόνες υπηρεσιών');
    const titleOf = (name: string) => textsIn(renderCase(name), 'h2')[0];
    const one = open('people', PeopleScreen, { quickAdd: 'one' }), many = open('people', PeopleScreen, { quickAdd: 'many' });
    expect(textsIn(one.before, 'h2')).not.toContain(titleOf('people-NewPersonDialog'));
    expect(textsIn(one.after, 'h2')).toContain(titleOf('people-NewPersonDialog'));
    expect(textsIn(many.after, 'h2')).toContain(titleOf('quickAdd-QuickAddDialog'));
    expect(many.sets).toContainEqual({ quickAdd: undefined });
  });
  it('ο Οδηγός φορτώνει μόνο όταν ανοίξει: το πρώτο φόρτωμα της εφαρμογής δεν περιέχει το κείμενό του', () => {
    // A rule about imports, so it reads source: every file the renderer loads before the first screen (static imports
    // from the page's entry module; lazy `import()` screens are not followed), including Ctrl+K and the app shell.
    const loaded = [...staticClosure(rendererEntry())].map(f => f.replace(/\\/g, '/'));
    expect(loaded.some(f => /\/guideTopic\.tsx?$/.test(f))).toBe(true);   // Ctrl+K reads the titles from here: the scan is not vacuous
    expect(loaded.filter(f => /\/guideText\.tsx?$/.test(f))).toEqual([]);
  });
});

describe('γκρι κουμπιά λένε γιατί (Μ5)', () => {
  const buttonHtml = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(Button as never, props, 'Αποθήκευση'));
  it('το Button δείχνει τον λόγο στη συμβουλή όσο είναι γκρι', () => {
    const grey = buttonHtml({ disabled: true, why: 'Λείπει: Όνομα' });
    expect(grey).toContain('disabled=""'); expect(grey).toContain('data-tip="Λείπει: Όνομα"'); expect(grey).toContain('aria-description="Λείπει: Όνομα"');
    expect(buttonHtml({ disabled: false, why: 'Λείπει: Όνομα' })).not.toContain('data-tip');   // ready: no reason shown
    expect(buttonHtml({ disabled: true })).not.toContain('data-tip');
  });
  it('Νέος στρατιώτης, Αίτηση, Αυτόματη συμπλήρωση και Νέα υπηρεσία', () => {
    const person = renderCase('people-NewPersonDialog');
    for (const label of ['Προσθήκη', 'Προσθήκη και επόμενος']) {
      const b = buttonLabelled(person, label);
      expect(b.disabled, label).toBe(true); expect(b.attrs['data-tip'], label).toBe('Λείπει: Επώνυμο, Όνομα');
    }
    expect(flat(person)).toMatch(/<span class="btn-why" role="status">Λείπει: Επώνυμο, Όνομα<\/span>/);
    const request = renderCase('other-RequestDialog-new');
    expect(textOfHtml(request)).toContain('Λείπει: Στρατιώτης');
    expect(buttonsOf(request).filter(b => b.disabled).map(b => b.attrs['data-tip'])).toContain('Λείπει: Στρατιώτης');
    const service = renderCase('guard-PhaseDialog-new');
    expect(buttonLabelled(service, 'Προσθήκη').attrs['data-tip']).toBe('Λείπει: Όνομα');
    expect(textOfHtml(service)).toContain('Λείπει: Όνομα');
    // a day whose seats are all taken: the automatic fill is grey and says so
    const day = H.TOMORROW;
    const everySeat = Object.fromEntries(postsOf(world.state.settings).map(post => [post.k, world.state.people[0].id]));
    const filled = { ...world.state, guards: { ...world.state.guards, [day]: everySeat } };
    const fullWorld: H.World = { ...world, state: filled, store: { ...world.store, state: filled } };
    const full = [H.renderIn(fullWorld, 'guard', { guardDate: day }, createElement(GuardScreen as never))]
      .find(out => buttonsOf(out).some(b => b.label === 'Αυτόματη συμπλήρωση' && b.disabled));
    expect(full, 'no filled day in the snapshot state').toBeDefined();
    const fills = buttonsOf(full!).filter(b => b.label === 'Αυτόματη συμπλήρωση');
    expect(fills.map(b => b.attrs['data-tip'])).toContain('Δεν υπάρχουν κενές θέσεις');
  });
  it('όσα γκριζάρουν επειδή λείπει κάτι έχουν λόγο (όχι όσα απλώς περιμένουν να τελειώσει κάτι)', () => {
    // A rule about the source (every `disabled=` of a Button in any screen), so it scans all renderer files for both the
    // htm spelling `<${Button} ... disabled=${cond}` and the TSX one `<Button ... disabled={cond}`. A disabled state
    // exists only in some runtime state, which no single render reaches, so this cannot be a render test.
    const tags = [
      new RegExp(componentTag('Button').replace('(?=[\\s/>])', '') + '[^>]*?disabled=\\$\\{([^}]*)\\}[^>]*>', 'g'),
      /<Button\b[^>]*?disabled=\{([^}]*)\}[^>]*>/g,
    ];
    // Conditions that are not "a field is missing" and so are exempt: a position (first/last row), a running step
    // (update dialog), or a generic wrapper that passes `disabled` through. None of these files was in the old check.
    const exempt = new Set(['!!busy || disabled', 'disabled', '!canSave', '!cur', 'upper(text.trim()) === cur', 'n === 1', 'last',
      'u.step > 2', "u.checking || u.phase !== 'idle'", "u.phase !== 'idle'"]);
    const busy = /(!!?)?(busy|xb|xl|step)( \|\| )?|i === 0|i === [a-z.]+ - 1|at <= 0|at >= order\.length - 1/g;
    const buttons = readSources().flatMap(s => tags.flatMap(re => [...s.text.matchAll(re)].map(m => ({ rel: s.rel, tag: m[0], cond: m[1] }))));
    expect(buttons.length).toBeGreaterThan(50);   // the renderer has ~150 disabled buttons: never an empty scan
    const bad = buttons.filter(b => {
      const cond = b.cond.replace(busy, '').trim();
      return cond && !exempt.has(b.cond.trim()) && !/^\|\||^\(\)$/.test(cond) && !/why=|data-tip=/.test(b.tag);
    });
    expect(bad.map(b => b.rel + ': ' + b.tag)).toEqual([]);
  });
});

describe('«πήγαινε στο…» είναι σύνδεσμοι (Χ5)', () => {
  it('Κανόνες υπηρεσιών: οι βάρδιες ανοίγουν τις Ρυθμίσεις › Υπηρεσίες', () => {
    const go = vi.fn(), onClose = vi.fn();
    session = startSession(() => H.renderIn(world, 'guard', {}, createElement(RulesDialog as never, { onClose }), {}, { go }));
    const out = session.render();
    expect(buttonsOf(out).some(b => b.label === 'Ρυθμίσεις › Υπηρεσίες και αργίες › Υπηρεσίες')).toBe(false);   // on the other tab
    session.press('Ώρες');   // the shifts are explained on the third tab of the dialog
    const hours = session.render();
    const link = buttonLabelled(hours, 'Ρυθμίσεις › Υπηρεσίες και αργίες › Υπηρεσίες');
    expect(link.attrs.class).toContain('golink');   // a link, not a plain sentence
    session.press('Ρυθμίσεις › Υπηρεσίες και αργίες › Υπηρεσίες');
    expect(go).toHaveBeenCalledWith('templates', { tab: 'duty', dsub: 'blocks' });
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(go.mock.invocationCallOrder[0]);   // the dialog closes first
  });
  it('Ρυθμίσεις › Μονάδα: η κεφαλίδα των άλλων εντύπων είναι «τα τρία πεδία πιο πάνω»', () => {
    const unit = textOfHtml(H.renderIn(world, 'templates', { tab: 'unit' }, createElement(TemplatesScreen as never)));
    expect(unit).toContain('είναι τα τρία πεδία πιο πάνω.');
    // outside the Ρυθμίσεις the same card points to them instead
    const elsewhere = H.renderIn(world, 'hkai', {}, createElement(HkHeadFields as never, { value: ['', '', ''], onChange: () => {} }));
    expect(textOfHtml(elsewhere)).not.toContain('τα τρία πεδία πιο πάνω');
    expect(buttonLabelled(elsewhere, 'Ρυθμίσεις › Μονάδα και έντυπα').attrs.class).toContain('golink');
  });
  describe('μέσα σε παράθυρο ο σύνδεσμος το κλείνει πρώτα και ρωτά αν έχει αλλαγές', () => {
    const link = 'Ρυθμίσεις › Λίστες';
    const inDialog = (dirty: boolean) => {
      const go = vi.fn(), onClose = vi.fn();
      const tree = () => createElement(Dialog as never, { title: 'Τίτλος', onClose, dirty },
        createElement(GoLink as never, { view: 'templates', params: { tab: 'lists' } }, link));
      session = startSession(() => H.renderIn(world, 'guard', {}, tree(), {}, { go }));
      session.render();
      return { go, onClose, session };
    };
    it('χωρίς αλλαγές: κλείνει και πάει', () => {
      const { go, onClose, session: s } = inDialog(false);
      s.press(link);
      expect(go).toHaveBeenCalledWith('templates', { tab: 'lists' });
      expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(go.mock.invocationCallOrder[0]);
    });
    it('με αλλαγές: ρωτά πρώτα, και φεύγει μόνο αν το πεις', () => {
      const { go, onClose, session: s } = inDialog(true);
      s.press(link);
      expect(go).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
      const asked = s.render();
      expect(textOfHtml(asked)).toContain('Όσα έγραψες εδώ δεν έχουν αποθηκευτεί');
      s.press('Πίσω στη φόρμα');
      expect(go).not.toHaveBeenCalled();
      expect(textOfHtml(s.render())).not.toContain('Όσα έγραψες εδώ δεν έχουν αποθηκευτεί');
      s.press(link); s.render();
      s.press('Κλείσε χωρίς αποθήκευση');
      expect(onClose).toHaveBeenCalledTimes(1); expect(go).toHaveBeenCalledWith('templates', { tab: 'lists' });
    });
  });
  it('στην ίδια οθόνη (π.χ. άλλη ενότητα των Ρυθμίσεων) ρωτά για όσα δεν αποθηκεύτηκαν', () => {
    const go = vi.fn(), discard = vi.fn();
    let asking: (() => void) | null = null;
    const PendingCard = () => { usePending(true, { label: 'Μονάδα', save: () => true, discard }); return null; };
    const Asker = () => { asking = useLeaveAsk(); return null; };
    const tree = () => createElement('div', null, createElement(PendingCard), createElement(Asker),
      createElement(GoLink as never, { view: 'templates', params: { tab: 'lists' } }, 'Ρυθμίσεις › Λίστες'));
    session = startSession(() => H.renderIn(world, 'templates', {}, tree(), {}, { go }));
    session.render(); session.flushEffects();
    expect(pendingNow().map(p => p.label)).toEqual(['Μονάδα']);
    session.press('Ρυθμίσεις › Λίστες');
    expect(go).not.toHaveBeenCalled();
    session.render();
    expect(asking).toBeTypeOf('function');   // the PendingBar would now show «Δεν αποθηκεύτηκαν οι αλλαγές»
    asking!();
    expect(go).toHaveBeenCalledWith('templates', { tab: 'lists' });
  });
  it('κανένα ορατό «στις Ρυθμίσεις › …» ως απλό κείμενο μέσα σε σημείωση', () => {
    // Source rule: a hint that mentions a Ρυθμίσεις section must be a GoLink, not text. Whether a given hint is visible
    // depends on data, so it scans every renderer file, not a list of screens.
    // The Οδηγός text itself (data, found by what it exports) is prose and is not a hint on a screen.
    const all = readSources();
    const guideText = definersOf(all, 'GUIDE');
    expect(guideText).toHaveLength(1);
    const sources = all.filter(s => !guideText.includes(s));
    const plainIn = (text: string) => text.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
      .match(/(?:field__help|(?<![.\w])note(?![\w(])|<small)[^`]*?[^>]Ρυθμίσεις › [^<]*</g) || [];
    for (const s of sources) {
      // «Αρχεία Excel › Στελέχη» (καρτέλα Προσωπικά): κείμενο και πριν το 0.4, αλλά το αρχείο δεν ήταν στη λίστα του παλιού ελέγχου
      // η Νέα ΕΣΣΟ μένει κείμενο: λέει ότι αλλάζουν και αργότερα, όχι «πήγαινε τώρα» (ο οδηγός της ΕΣΣΟ δεν πρέπει να κλείσει)
      expect(plainIn(s.text).filter(x => !/data-tip=|toast\(|αλλάζουν και μετά από|Ρυθμίσεις › Αρχεία Excel › Στελέχη/.test(x)), s.rel).toEqual([]);
    }
  });
});
