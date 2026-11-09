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

const medical = screen('Ιατρικά', async S => {
  await segments(S);
  await S.state('back to Τώρα', () => S.click('Τώρα'), { close: false });
  await S.dialog('end earlier (Λήξη νωρίτερα)', () => S.click('Λήξη νωρίτερα'));
});

const strength = screen('Δύναμη', segments);

const hkai = screen('ΗΚΑΙ', async S => {
  await S.state('tab 1 ΗΚΑΙ', () => S.tab('ΗΚΑΙ'), { close: false });
  await tabs(S, '.main .toolbar', 'side');
  await S.dialog('rows dialog (Γραμμές και ονόματα)', () => S.click('Γραμμές και ονόματα'));
  await S.state('tab 2 Ποινές', () => S.tab('Ποινές'), { close: false });
  await segments(S);
  await S.dialog('punishment fix', () => S.click('Διόρθωση…'), { close: false });
  await S.dialog('punishment fix: delete step', () => S.click('Διαγραφή (μπήκε λάθος)', '.ui-dialog'));
  await S.state('tab 3 Άδειες', () => S.tab('Άδειες'));
  await S.state('tab 4 Αιτήσεις', () => S.tab('Αιτήσεις'));
  await S.state('tab 5 Ημερήσια Διαταγή', () => S.tab('Ημερήσια Διαταγή'), { close: false });
  await S.dialog('hd preview', () => S.click('Προεπισκόπηση'));
}, { phone: true });

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

const SETTINGS = '.setnav';
const settings = {
  name: 'Ρυθμίσεις',
  run: async S => {
    await S.nav('Ρυθμίσεις'); await S.snap('screen');
    const labels = await S.page.locator(`${SETTINGS} button`).allTextContents();
    for (const [i, label] of labels.entries()) await S.state(`section ${i + 1} ${label}`, () => S.clickOn(`${SETTINGS} button`, i), { close: false });
  }
};
const settingsGo = async (S, section) => { await S.nav('Ρυθμίσεις'); await S.click(section, SETTINGS); await S.quiet(); };
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

const history = { name: 'Ιστορικό', run: async S => { await S.nav('Σήμερα'); await S.state('history', () => S.top('Ιστορικό ενεργειών'), { close: false }); } };
const guide = { name: 'Οδηγός', run: async S => { await S.nav('Σήμερα'); await S.state('guide', () => S.top('Οδηγός χρήσης'), { close: false }); } };

const more = {
  name: 'Άλλα (phone)', phoneOnly: true,
  run: async S => { await S.dialog('more sheet (Άλλα)', () => S.page.locator('.bottomnav button').filter({ hasText: 'Άλλα' }).click(), { sheet: true }); }
};

export const GROUPS = [
  screen('Σήμερα', null, { phone: true }), people, cadre, guard, guardClear, guardWho, guardExport, outs, outsSave, medical, strength,
  hkai, weapons, weaponsAsk, forms, notes, settings, settingsBackups, settingsUpdates, settingsFiles, settingsPending, history, guide, more
];
