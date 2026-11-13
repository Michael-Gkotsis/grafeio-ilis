// The walk of the styles-diff tool: which states are captured (bench/ui/styles-diff.mjs).
//
// Purpose: list GROUPS, one per screen (and per risky dialog flow), each a function that drives a Session through the
//   screen, its tabs, its filters and the dialogs/sheets that open only after a click: the 18 sites that SSR cannot
//   reach (test/__snapshots__/screens/COVERAGE.md) plus the local-state tabs (person/cadre sheet tabs, ΗΚΑΙ
//   Μπροστά/Πίσω, Υπηρεσίες Έλεγχος).
// Does NOT: capture or compare (styles-kit.mjs, styles-report.mjs). It never clicks a confirm button (the seeded state
//   is not saved to); the few groups that change local draft state (empty a day, tick all outs) are separate groups,
//   and every group starts from a fresh page load.
// Why: a state that is not walked is a state a structural or CSS PR can break unseen. Selectors are class names and
//   visible Greek texts from the source (no test ids exist). When a text changes, the state appears as "could not be
//   opened" in the report instead of failing silently, and the diff flags it if only one side could open it.
// Filters: «segments» = every `[aria-pressed]` button of `.main` (segmented controls, chips, date bars) is clicked once;
//   at most MAX_SEG (3) per control, and the per-row ΕΝΤΟΣ/ΕΚΤΟΣ switches of the weapons list are left out.
// Run: not run directly; imported by styles-diff.mjs.

const MAX_SEG = 3;

/** Clicks each tab of the FIRST tablist inside `scope`, capturing after each (labels carry seeded counts). `close: false` keeps a sheet open. */
async function tabs(S, scope = '.main', prefix = 'tab', close = true) {
  const list = S.page.locator(`${scope} [role=tablist]`).first();
  const labels = (await list.locator('[role=tab]').allTextContents()).map(t => t.trim());
  for (const [i, label] of labels.entries()) {
    await S.state(`${prefix} ${i + 1} ${label}`, () => list.locator('[role=tab]').nth(i).click(), { close });
  }
}

/**
 * Clicks every unpressed `[aria-pressed]` button of `.main` once (max MAX_SEG per control) and captures it; the
 * originally pressed sibling is clicked again afterwards so the next one starts from the default.
 */
async function segments(S, prefix = 'filter') {
  const sel = '.main [aria-pressed]:not(.wstate__sw)';
  const plan = await S.page.locator(sel).evaluateAll((els, max) => {
    const seen = new Map();
    return els.map((e, k) => {
      const nth = (seen.set(e.parentElement, (seen.get(e.parentElement) || 0) + 1), seen.get(e.parentElement));
      const home = [...e.parentElement.children].find(c => c.getAttribute('aria-pressed') === 'true');
      return { k, ok: e.getAttribute('aria-pressed') !== 'true' && nth <= max, label: e.textContent.trim().slice(0, 24), home: els.indexOf(home) };
    }).filter(x => x.ok);
  }, MAX_SEG);
  for (const { k, label, home } of plan) {
    await S.state(`${prefix} ${k} ${label}`, () => S.clickOn(sel, k), { close: false });
    if (home >= 0) await S.clickOn(sel, home).catch(() => {});
  }
}

const screen = (name, extra, flags = {}) => ({
  name, ...flags,
  run: async S => { await S.nav(name); await S.snap('screen'); if (extra) await extra(S); }
});

// a table row on desktop widths, a card (`.pcard`) at phone width
const firstRow = S => S.page.locator('.ptable--roster .ptable__row, .pcard').first().click();
const withRow = (S, label) => S.dialog(label, () => firstRow(S), { sheet: true, close: false });

// ---------------------------------------------------------------------------------------------- screens

const people = screen('Δυναμολόγιο', async S => {
  await segments(S);
  await withRow(S, 'person sheet');
  await tabs(S, '.ui-sheet', 'sheet tab', false);
  await S.closeLayers();
  await S.dialog('declare status step 4 (Τι θα αλλάξει)', async () => {
    await S.click(/^\+ (Δήλωσε )?κατάσταση/i);   // the label is shortened at narrower widths
    await S.page.locator('.ui-dialog input[role=combobox]').fill('ΔΟΚΙΜΙΟΣ Β');
    await S.page.locator('.picker__list li[role=option]').first().click();
    await S.page.locator('.ui-dialog__head h2').click();   // closes the picker list that covers the footer
    await S.click('Συνέχεια', '.ui-dialog');
    await S.page.locator('.stpick__opt').filter({ hasText: 'Κανονική' }).first().click();
    await S.click('Συνέχεια', '.ui-dialog');
  });
  await tabs(S);
}, { phone: true });

const cadre = screen('Στελέχη', async S => {
  await withRow(S, 'cadre sheet');
  await tabs(S, '.ui-sheet', 'sheet tab', false);
  await S.dialog('cadre delete dialog', async () => { await S.tab('Στοιχεία', '.ui-sheet'); await S.click('Διαγραφή στελέχους', '.ui-sheet'); });
  await S.closeLayers();
});

const guard = screen('Υπηρεσίες', async S => {
  await segments(S);
  await S.dialog('preview dialog (Προεπισκόπηση)', () => S.click('Προεπισκόπηση'));
  await tabs(S);
  await S.state('check: list', () => S.tab('Έλεγχος'));
  await segments(S, 'check filter');
}, { phone: true });

const guardClear = {
  name: 'Υπηρεσίες (άδεια μέρα)',
  run: async S => {
    await S.nav('Υπηρεσίες');
    await S.dialog('clear-day question', () => S.click('Άδειασε τη μέρα'));
    await S.click('Άδειασε τη μέρα');
    await S.page.locator('.ui-dialog button').filter({ hasText: /^Ναι/ }).click();
    await S.quiet();
    await S.snap('emptied day');
    const pick = async (q, n = 0) => {
      await S.page.locator('.post.is-empty .picker input').nth(n).fill(q);
      await S.page.locator('.picker__list li[role=option]').first().click();
    };
    await S.dialog('force dialog: not allowed', () => pick('ΔΟΚΙΜΙΟΣ Α'));
    await pick('ΔΟΚΙΜΙΟΣ Β');
    await S.dialog('force dialog: already in another seat', () => pick('ΔΟΚΙΜΙΟΣ Β'));
  }
};

const guardWho = {
  name: 'Υπηρεσίες (ποιος κάνει τι)',
  run: async S => {
    await S.nav('Υπηρεσίες'); await S.tab('Ποιος κάνει τι');
    await S.dialog('who-does question', () => S.page.locator('.whod__cell.is-auto:not(.is-on)').first().click());
  }
};

const guardExport = {
  name: 'Υπηρεσίες (έλεγχος πριν το Excel)',
  run: async S => { await S.nav('Υπηρεσίες'); await S.dialog('export gate', () => S.click('Βγάλε το Excel')); }
};

const outs = screen('Εξοδούχοι', segments);
const outsSave = {
  name: 'Εξοδούχοι (αποθήκευση)',
  run: async S => {
    await S.nav('Εξοδούχοι');
    await S.dialog('save plan (Τι θα αλλάξει)', async () => { await S.click('Όλοι όσοι μπορούν'); await S.click('Αποθήκευση'); });
  }
};

// U5: «Ιατρικά» became the first tab of «Καταστάσεις». The walk runs on both sides of the diff, so it opens the menu
// entry the build has and keeps the group and state names stable.
const navOneOf = async (S, labels) => {
  for (const label of labels) {
    if (await S.navButtons().evaluateAll((els, l) => els.some(e => (e.querySelector('.navbtn__lbl')?.textContent || '').startsWith(l)), label)) return S.nav(label);
  }
  return S.nav(labels[0]);
};
// U5: Ποινές, Άδειες, Αιτήσεις were tabs of the ΗΚΑΙ; now they are tabs of «Καταστάσεις». Click the tab where it is.
const statusTab = async (S, label, opts) => {
  if (!(await S.page.locator('.main [role=tab]').filter({ hasText: new RegExp('^' + label) }).count())) await S.nav('Καταστάσεις');
  return S.state('tab ' + opts.n + ' ' + label, () => S.tab(label), opts.flags);
};

const medical = {
  name: 'Ιατρικά',
  run: async S => {
    await navOneOf(S, ['Καταστάσεις', 'Ιατρικά']); await S.snap('screen');
    await segments(S);
    await S.state('back to Τώρα', () => S.click('Τώρα'), { close: false });
    await S.dialog('end earlier (Λήξη νωρίτερα)', () => S.click('Λήξη νωρίτερα'));
  }
};

const strength = screen('Δύναμη', segments);

const hkai = {
  name: 'ΗΚΑΙ',
  phone: true,
  run: async S => {
    await S.nav('ΗΚΑΙ'); await S.snap('screen');
    // the base build still has the ΗΚΑΙ tab; U5 removed the tabs
    if (await S.page.locator('.main [role=tab]').filter({ hasText: /^ΗΚΑΙ/ }).count()) {
      await S.state('tab 1 ΗΚΑΙ', () => S.tab('ΗΚΑΙ'), { close: false });
    }
    await tabs(S, '.main .toolbar', 'side');
    await S.dialog('rows dialog (Γραμμές και ονόματα)', () => S.click('Γραμμές και ονόματα'));
    await statusTab(S, 'Ποινές', { n: 2, flags: { close: false } });
    await segments(S);
    await S.dialog('punishment fix', () => S.click('Διόρθωση…'), { close: false });
    await S.dialog('punishment fix: delete step', () => S.click('Διαγραφή (μπήκε λάθος)', '.ui-dialog'));
    await statusTab(S, 'Άδειες', { n: 3 });
    await statusTab(S, 'Αιτήσεις', { n: 4 });
    if (await S.page.locator('.main [role=tab]').filter({ hasText: /^Ημερήσια Διαταγή/ }).count()) {
      await S.state('tab 5 Ημερήσια Διαταγή', () => S.tab('Ημερήσια Διαταγή'), { close: false });
    } else {
      await S.nav('Ημερήσια Διαταγή'); await S.state('tab 5 Ημερήσια Διαταγή', async () => {}, { close: false });
    }
    await S.dialog('hd preview', () => S.click('Προεπισκόπηση'));
  }
};

const weapons = screen('Οπλισμός', async S => { await segments(S); await tabs(S); });
const weaponsAsk = {
  name: 'Οπλισμός (όπλο ήδη χρεωμένο)',
  run: async S => {
    await S.nav('Οπλισμός');
    await S.dialog('weapon already assigned', async () => {
      const input = S.page.locator('.ptable--weapons input[aria-label^="Αριθμός όπλου"]').first();
      await input.fill('4810000'); await input.press('Enter');
    });
  }
};

const forms = screen('Έντυπα', tabs);
const notes = screen('Σημειώσεις', segments);

// U11a: «Ρυθμίσεις» has 7 groups (`.settings__nav`) with the sections as tabs (`.settings__tabs`); before, a flat list of
// 13 sections (`.setnav`). The walk keeps the old section labels as state names and reaches each one in both layouts,
// so base and current states pair up and the differences are the moved markup only.
const SETTINGS = ':is(.setnav, .settings__nav)';
const GROUP_OF = new Map([
  ...['Μονάδα και έντυπα', 'Τίτλος και λογότυπο', 'Θάλαμοι και ουλαμοί', 'ΕΣΣΟ'].map(l => [l, 'Η μονάδα μου']),
  ['Υπηρεσίες και αργίες', 'Υπηρεσίες'],
  ['Γραμμές και ονόματα ΗΚΑΙ', 'Έξοδοι και ΗΚΑΙ'],
  ['Λίστες', 'Λίστες και κωδικοί'],
  ...['Εισαγωγή Δυναμολογίου', 'Αρχεία Excel', 'Πρότυπα εφαρμογής', 'Γράμματα Excel'].map(l => [l, 'Αρχεία Excel']),
  ['Υπογραφές', 'Χαρτιά: υπογραφές και θέσεις'],
  ...['Εμφάνιση', 'Ώρα και ζώνη ώρας', 'Αντίγραφα ασφαλείας', 'Ενημερώσεις'].map(l => [l, 'Αυτό το PC']),
]);
const OLD_SECTIONS = ['Μονάδα και έντυπα', 'Θάλαμοι και ουλαμοί', 'Υπηρεσίες και αργίες', 'Λίστες', 'Εισαγωγή Δυναμολογίου', 'Αρχεία Excel',
  'Πρότυπα εφαρμογής', 'Γράμματα Excel', 'Εμφάνιση', 'Ώρα και ζώνη ώρας', 'ΕΣΣΟ', 'Αντίγραφα ασφαλείας', 'Ενημερώσεις'];
const isGrouped = S => S.page.locator('.settings__nav').count().then(n => n > 0);
const openSection = async (S, section) => {
  if (!(await isGrouped(S))) { await S.click(section, SETTINGS); return; }
  await S.page.locator('.settings__navitem').filter({ hasText: new RegExp(`^${GROUP_OF.get(section)}$`) }).click({ timeout: 4000 });
  await S.quiet();
  const tab = S.page.locator('.settings__tabs [role=tab]').filter({ hasText: new RegExp(`^${section}$`) });
  if (await tab.count()) { await tab.click({ timeout: 4000 }); await S.quiet(); }
};
const settings = {
  name: 'Ρυθμίσεις',
  run: async S => {
    await S.nav('Ρυθμίσεις'); await S.snap('screen');
    for (const [i, label] of OLD_SECTIONS.entries()) await S.state(`section ${i + 1} ${label}`, () => openSection(S, label), { close: false });
    if (await isGrouped(S)) {
      for (const [i, label] of ['Τίτλος και λογότυπο', 'Γραμμές και ονόματα ΗΚΑΙ', 'Υπογραφές'].entries()) {
        await S.state(`new section ${i + 1} ${label}`, () => openSection(S, label), { close: false });
      }
    }
    // U11b: the search box (only the current tree has it): results with marks, and the «nothing found» line
    const search = S.page.locator('.settings__search');
    if (await search.count()) {
      for (const word of ['υπογραφ', 'κανον', 'ψψψψ']) {
        await S.state(`search ${word}`, async () => { await search.fill(word); await S.quiet(); }, { close: false });
      }
      await search.fill('');
    }
  }
};
const settingsGo = async (S, section) => { await S.nav('Ρυθμίσεις'); await openSection(S, section); };
const settingsBackups = {
  name: 'Ρυθμίσεις (αντίγραφα)',
  run: async S => {
    await settingsGo(S, 'Αντίγραφα ασφαλείας');
    await S.dialog('restore backup', () => S.page.locator('.main button').filter({ hasText: /^Επαναφορά/ }).first().click());
  }
};
const settingsUpdates = {
  name: 'Ρυθμίσεις (ενημερώσεις)',
  run: async S => { await settingsGo(S, 'Ενημερώσεις'); await S.dialog('rollback to previous version', () => S.click('Επιστροφή στην')); }
};
const settingsFiles = {
  name: 'Ρυθμίσεις (ανάγνωση προσωπικού)',
  run: async S => {
    await settingsGo(S, 'Αρχεία Excel');
    await S.dialog('read roster from Excel', async () => {
      await S.page.locator('.srcrow, li').filter({ hasText: 'Προσωπικό (Δυναμολόγιο)' }).locator('button').filter({ hasText: 'Διάλεξε Excel' }).first().click();
      await S.page.waitForSelector('.ui-dialog');
      await S.click('Αποθήκευση και ανάγνωση', '.ui-dialog');
      await S.page.waitForFunction(() => document.querySelector('.ui-dialog h2')?.textContent.startsWith('Ανάγνωση'));
    });
  }
};
const settingsPending = {
  name: 'Ρυθμίσεις (μη αποθηκευμένα)',
  run: async S => {
    await settingsGo(S, 'Μονάδα και έντυπα');
    await S.page.locator('.main input.ui-input').first().fill('ΔΟΚΙΜΗ');
    await S.state('pending bar', () => S.page.waitForSelector('.pendbar'), { close: false });
    await S.dialog('leave question', () => S.nav('Σήμερα'));
  }
};

// S3 of the «Ρυθμίσεις» move: the service-block dialogs (features/duty-blocks), opened from «Υπηρεσίες» and from
// Ρυθμίσεις › Υπηρεσίες και αργίες › Υπηρεσίες: «Νέα υπηρεσία», «Επεξεργασία», «Νέο έντυπο υπηρεσιών», «Όνομα»
const PHASE_SELECT = 'button[aria-label="Έντυπο υπηρεσιών"]';
const pickPhase = async (S, label) => {
  await S.page.locator(PHASE_SELECT).first().click();
  await S.page.locator('[role=option]').filter({ hasText: label }).first().click();
  await S.quiet();
};
const fillIn = async (S, selector, value) => { await S.page.locator(selector).fill(value); await S.quiet(); };
const newBlockFilled = async S => {
  await fillIn(S, '#nb-n', 'Πύλη'); await fillIn(S, '#nb-c', '3'); await fillIn(S, '#nb-p', '2');
  await S.page.locator('.ui-dialog input[type=checkbox]').first().check(); await S.quiet();
};
const dutyBlocks = {
  name: 'Υπηρεσίες και Ρυθμίσεις (φόρμες υπηρεσιών)',
  run: async S => {
    await S.nav('Υπηρεσίες');
    await S.dialog('guard: new block', () => S.click('+ Νέα υπηρεσία'));
    await S.dialog('guard: new block (3 numbers x 2 people, armed)', async () => { await S.click('+ Νέα υπηρεσία'); await newBlockFilled(S); });
    await S.dialog('guard: new block (30 x 10, over the template boxes)', async () => {
      await S.click('+ Νέα υπηρεσία'); await fillIn(S, '#nb-n', 'Μεγάλη'); await fillIn(S, '#nb-c', '99'); await fillIn(S, '#nb-p', '99');
    });
    await S.dialog('guard: new phase', () => pickPhase(S, 'Νέο έντυπο υπηρεσιών'));
    await S.dialog('guard: new phase (typed)', async () => { await pickPhase(S, 'Νέο έντυπο υπηρεσιών'); await fillIn(S, '#ph-n', 'ΑΣΚΗΣΗ'); });
    await settingsGo(S, 'Υπηρεσίες και αργίες');
    await S.snap('settings: services');
    await S.dialog('settings: new block', () => S.click('+ Νέα υπηρεσία στη ΦΡΟΥΡΑ'));
    await S.dialog('settings: new block (3 numbers x 2 people, armed)', async () => { await S.click('+ Νέα υπηρεσία στη ΦΡΟΥΡΑ'); await newBlockFilled(S); });
    // the button of the Λ/Υ row is hidden, so the walk starts at the second «Επεξεργασία»
    for (const nth of [1, 2, 3]) {
      await S.dialog(`settings: edit block ${nth + 1}`, () => S.page.locator('.main button').filter({ hasText: /^Επεξεργασία$/ }).nth(nth).click());
    }
    await S.dialog('settings: edit block 2 (typed)', async () => {
      await S.page.locator('.main button').filter({ hasText: /^Επεξεργασία$/ }).nth(1).click();
      await fillIn(S, '#eb-n', 'Άλλο όνομα'); await fillIn(S, '#eb-c', '2');
    });
    await S.dialog('settings: new phase', () => pickPhase(S, 'Νέο έντυπο υπηρεσιών'));
    await S.state('settings: own phase added', async () => {
      await pickPhase(S, 'Νέο έντυπο υπηρεσιών'); await fillIn(S, '#ph-n', 'ΑΣΚΗΣΗ');
      await S.click('Προσθήκη', '.ui-dialog'); await S.quiet();
    }, { close: false });
    await S.dialog('settings: rename phase', () => S.click('Μετονομασία…'));
    await S.dialog('settings: rename phase (empty)', async () => { await S.click('Μετονομασία…'); await fillIn(S, '#ph-n', ''); });
  }
};

// S2 of the «Ρυθμίσεις» move: the «Αρχεία Excel» dialogs and the ΕΣΣΟ cards, wizard and restore question
const settingsSourcesEsso = {
  name: 'Ρυθμίσεις (αρχεία Excel, ΕΣΣΟ)',
  run: async S => {
    await settingsGo(S, 'Αρχεία Excel');
    await S.snap('files');
    for (const label of ['Κελιά…', 'Φύλλα…', 'Εισαγωγή νέου Excel…']) {
      await S.dialog(`files: ${label}`, () => S.click(label));
    }
    await settingsGo(S, 'ΕΣΣΟ');
    await S.snap('esso');
    await S.dialog('esso: new ΕΣΣΟ wizard', () => S.click('Νέα ΕΣΣΟ…'));
    await S.dialog('esso: restore question', () => S.click('Επαναφορά'));
  }
};

// S1 of the «Ρυθμίσεις» move: the Λίστες (some lists), Θάλαμοι, Σ.Ι. and Καταστάσεις tables and Τίτλος cards
const settingsCards = {
  name: 'Ρυθμίσεις (λίστες, θάλαμοι, πίνακες)',
  run: async S => {
    await settingsGo(S, 'Λίστες');
    for (const list of ['Ιατρικά', 'Είδη ποινής', 'Είδη άδειας', 'Καταστάσεις στελεχών', 'Λόγοι εξόδου όπλου']) {
      await S.state(`list ${list}`, async () => {
        await S.page.locator('button[aria-label="Ποια λίστα"]').click();
        await S.page.locator('[role=option]').filter({ hasText: new RegExp(`^${list}$`) }).first().click();
      }, { close: false });
    }
    await settingsGo(S, 'Θάλαμοι και ουλαμοί');
    await S.snap('rooms');
    await settingsGo(S, 'Υπηρεσίες και αργίες');
    await S.state('duty sub-tab Σ.Ι.', () => S.click('Σ.Ι.', '.main .ui-seg'), { close: false });
    await S.state('duty sub-tab Καταστάσεις', () => S.click('Καταστάσεις', '.main .ui-seg'), { close: false });
    // the logo choice moved from «Εμφάνιση» to its own section «Τίτλος και λογότυπο» (U11a)
    await settingsGo(S, (await isGrouped(S)) ? 'Τίτλος και λογότυπο' : 'Εμφάνιση');
    await S.state('brand: a logo choice', () => S.page.locator('.main .ui-chip').nth(1).click(), { close: false });
  }
};

// U9: the seeded browser state has an empty log; a saved outs plan gives it one entry, and undoing it gives the «Αναιρέθηκε» row
const history = {
  name: 'Ιστορικό',
  run: async S => {
    await S.nav('Σήμερα'); await S.state('history', () => S.top('Ιστορικό ενεργειών'), { close: false });
    await S.nav('Εξοδούχοι'); await S.click('Όλοι όσοι μπορούν'); await S.click('Αποθήκευση'); await S.click('Αποθήκευση', '.ui-dialog');
    await S.state('history (with entries)', () => S.top('Ιστορικό ενεργειών'), { close: false });
    await S.state('history (undone)', () => S.click('Αναίρεση', '.history__table, .log'), { close: false });
  }
};
const guide = { name: 'Οδηγός', run: async S => { await S.nav('Σήμερα'); await S.state('guide', () => S.top('Οδηγός χρήσης'), { close: false }); } };

// hidden screen: only Ctrl+Shift+D or the search box opens it; waits for main's first diag() answer
const diag = {
  name: 'Διάγνωση',
  run: async S => {
    await S.nav('Σήμερα');
    const open = async () => {
      await S.page.keyboard.press('Control+Shift+D');
      await S.page.waitForSelector('.main .kv');
    };
    await S.state('diag', open, { close: false });
  }
};

const more = {
  name: 'Άλλα (phone)', phoneOnly: true,
  run: async S => { await S.dialog('more sheet (Άλλα)', () => S.page.locator('.bottomnav button').filter({ hasText: 'Άλλα' }).click(), { sheet: true }); }
};

// «Σήμερα»: the day-forms dialog and a person opened from the away list
const today = screen('Σήμερα', async S => {
  await S.dialog('day forms dialog (Έντυπα ημέρας)', () => S.click('Έντυπα ημέρας'));
  await S.dialog('person sheet from a name', () => S.page.locator('.main button.linkish').first().click(), { sheet: true });
}, { phone: true });

export const GROUPS = [
  today, people, cadre, guard, guardClear, guardWho, guardExport, outs, outsSave, medical, strength,
  hkai, weapons, weaponsAsk, forms, notes, settings, settingsBackups, settingsUpdates, settingsFiles, settingsPending, settingsCards, settingsSourcesEsso, dutyBlocks, history, guide,
  diag, more
];
