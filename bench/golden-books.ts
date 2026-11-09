/**
 * Golden hashes, part 2: the Excel books built from scratch by `src/main/excel.ts` (roster, ΣΥΝΟΛΙΚΟ, weapons, cadre,
 * ημερολόγιο κωλυομένων, έλεγχος υπηρεσιών, ΗΔ as Excel), the Word ΗΔ, and the form variants the app offers besides
 * the three default forms (ΦΡΟΥΡΑ ΣΠΕΝ, ΠΣΚ merges, Εξοδούχοι «Όλη η δύναμη», custom signatures).
 *
 * Purpose: give `test/golden-outputs.test.ts` a hash for each of these outputs, in the form the user receives it: the
 * book after `signMade` (signatures and layout), plus the raw book before signing.
 * What it does NOT do: it does not write any file in the user's folders, and it does not cover the write-backs into
 * the unit's own Excel files (see `bench/golden-writeback.ts`).
 * Why a copy of `MADE_FORM`: `src/main/main.ts` cannot be imported (Electron); keep the mapping in sync.
 * Covering test: test/golden-outputs.test.ts.
 */
import { addDays, pskDays, dow, dm } from '../src/shared/dates';
import { isOutsAll, type AppState } from '../src/shared/domain';
import type { Sig, SigForm } from '../src/shared/sigs';
import { cleanHd, hdAuto, hdTags, HD_SECTIONS, type HdDoc } from '../src/shared/hd';
import {
  cadreLists, dutyCheck, hdBook, imerBook, rosterLists, rosterPreview, rosterPrint, weaponsBook, type Made
} from '../src/main/excel';
import { fillFroura, fillOuts, sigsOf, signMade } from '../src/main/exports';
import { builtinTemplate, fillDocx } from '../src/main/hdDocx';
import { mergeFirstSheets, mergeSheets } from '../src/main/xlsx';
import {
  PRINT_LAYOUTS, GOLDEN_END, bookEntries, readTemplate, textHash, zipHash, type GoldenEntry
} from './golden-lib';

/** Print layouts used for the extra books: portrait default and landscape fill (cheapest pair that differs). */
const BOOK_LAYOUTS = [PRINT_LAYOUTS[0], PRINT_LAYOUTS[3]];
const ONE_LAYOUT = [PRINT_LAYOUTS[0]];

/** Signature set used for the "custom signatures" variants (the `Sig` list of the signatures dialog). */
const CUSTOM_SIGS: Sig[] = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }, { art: 'Ο', title: 'ΔΚΤΗΣ', name: 'ΥΠΟΘΕΤΙΚΟΣ ΓΙΑΝΝΗΣ' }];

/**
 * One built book: raw (`made.data`), then signed as the app does (`signMade`), then print renderings of that.
 * @param key key prefix, e.g. `made/n=60/weapons`
 * @param form signature form, same mapping as `MADE_FORM` in `src/main/main.ts`
 */
async function madeEntries(
  key: string, made: Made, state: AppState, form: SigForm, sigs?: Sig[]
): Promise<GoldenEntry[]> {
  const signed = await signMade(made.data, state, form, made.marks, sigs);
  return [
    { key: key + '/name', hash: textHash(made.name) },
    { key: key + '/raw.xlsx', hash: await zipHash(made.data) },
    { key: key + '/marks', hash: textHash(JSON.stringify(made.marks)) },
    ...(await bookEntries(key + '/signed', signed.data, BOOK_LAYOUTS)),
    { key: key + '/signed.warnings', hash: textHash(JSON.stringify(signed.warnings)) },
    { key: key + '/signed.layout', hash: textHash(JSON.stringify(signed.layout)) }
  ];
}

/** Monthly duty check, roster (all filters), ΣΥΝΟΛΙΚΟ, roster preview, cadre, weapons, ημερολόγιο κωλυομένων. */
export async function madeBookEntries(state: AppState, n: number): Promise<GoldenEntry[]> {
  const day = GOLDEN_END; const key = (name: string) => 'made/n=' + n + '/' + name;
  const entries: GoldenEntry[] = [];
  const add = async (name: string, made: Made, form: SigForm, sigs?: Sig[]) => {
    entries.push(...await madeEntries(key(name), made, state, form, sigs));
  };
  await add('duty-check', await dutyCheck(state, day.slice(0, 7)), 'check');
  await add('roster-lists', await rosterLists(state, day), 'roster');
  await add('roster-lists-custom-sigs', await rosterLists(state, day), 'roster', CUSTOM_SIGS);
  await add('roster-total', await rosterPrint(state, day), 'roster');
  await add('roster-preview', await rosterPreview(state, day), 'roster');
  await add('cadre', await cadreLists(state, day), 'cadre');
  await add('weapons', await weaponsBook(state, day), 'weapons');
  const from = addDays(day, -13);
  await add('imer-unit', await imerBook(state, { from, to: day }), 'imer');
  await add('imer-all', await imerBook(state, { from, to: day, all: true }), 'imer');
  if (n === 60) {
    // not "today": the roster keeps people who already came back from leave (`nowMin` only applies to today)
    const past = addDays(day, -9);
    await add('roster-lists-past-day', await rosterLists(state, past), 'roster');
    await add('weapons-past-day', await weaponsBook(state, past), 'weapons');
  }
  return entries;
}

/** Ημερήσια Διαταγή: built-in Word template, Word filled with the automatic and with a hand-written doc, and Excel. */
export async function hdEntries(state: AppState, n: number): Promise<GoldenEntry[]> {
  // a past day: the automatic ΗΔ lists real leaves and penalties there (tomorrow has none in the bench state)
  const day = addDays(GOLDEN_END, -6); const key = (name: string) => 'hd/n=' + n + '/' + name;
  const signatures = sigsOf(state, 'hd', undefined); const sigs = signatures.sigs ?? signatures.def;
  const manual: HdDoc = cleanHd({
    aydm: 'ΑΥΔΜ 1234', dn: 'ΥΠΟΘΕΤΙΚΟΣ ΓΙΑΝΝΗΣ', ilxos: 'ΔΟΚΙΜΑΚΗΣ ΝΙΚΟΣ',
    ax: [
      ['ΕΓΓΡΑΦΗ ΑΞΙΩΜΑΤΙΚΟΥ'], ['ΔΙΑΓΡΑΦΗ ΑΞΙΩΜΑΤΙΚΟΥ'], ['ΑΔΕΙΑ 3 ΗΜΕΡΩΝ', 'ΑΔΕΙΑ 5 ΗΜΕΡΩΝ'], [], ['ΚΑΜΙΑ ΜΕΤΑΒΟΛΗ']
    ],
    op: [['ΕΓΓΡΑΦΗ ΣΤΡ ΔΟΚΙΜΙΟΣ'], [], ['ΑΔΕΙΑ ΣΤΡ ΤΥΧΑΙΟΣ'], ['ΚΡΑΤΗΣΗ ΣΤΡ ΥΠΟΘΕΤΙΔΗΣ'], ['ΛΟΙΠΑ']],
    t2: 'ΔΕΝ ΕΧΕΙ ΜΕΤΑΒΟΛΕΣ\nΔΕΥΤΕΡΗ ΓΡΑΜΜΗ', t3: 'ΜΙΣΘΟΔΟΣΙΑ ΚΑΝΟΝΙΚΑ'
  });
  const entries: GoldenEntry[] = [{ key: key('template.docx'), hash: await zipHash(await builtinTemplate()) }];
  for (const [name, doc] of [['auto', cleanHd(hdAuto(state, day))], ['manual', manual]] as const) {
    const tags = hdTags(state.settings, day, doc, sigs);
    entries.push({ key: key(name + '.tags'), hash: textHash(JSON.stringify(tags)) });
    entries.push({ key: key(name + '.docx'), hash: await zipHash(await fillDocx(await builtinTemplate(), tags)) });
    const book = await hdBook(state, day, tags, HD_SECTIONS);
    entries.push({ key: key(name + '.name'), hash: textHash(book.name) });
    entries.push(...await bookEntries(key(name + '.xlsx'), book.data, BOOK_LAYOUTS));
  }
  return entries;
}

/** ΦΡΟΥΡΑ ΣΠΕΝ, ΠΣΚ (three days merged), Εξοδούχοι «Όλη η δύναμη» (one day and ΠΣΚ), custom signatures. */
export async function formVariantEntries(state: AppState, n: number): Promise<GoldenEntry[]> {
  const key = (name: string) => 'form-variant/n=' + n + '/' + name; const entries: GoldenEntry[] = [];
  const froura = readTemplate('froura.xlsx'); const outsTpl = readTemplate('exodouxoi.xlsx');
  const spen = await fillFroura(readTemplate('froura-spen.xlsx'), state, GOLDEN_END, 'spen');
  entries.push(...await bookEntries(key('froura-spen'), spen.data, ONE_LAYOUT));
  const signed = await fillFroura(froura, state, GOLDEN_END, undefined, undefined, CUSTOM_SIGS);
  entries.push(...await bookEntries(key('froura-custom-sigs'), signed.data, ONE_LAYOUT));

  // ΠΣΚ: Friday, Saturday and Sunday of the week, one tab per day (as `produce` in src/main/main.ts)
  const days = pskDays(GOLDEN_END); const tabs = days.map(d => dow(d).toUpperCase() + ' ' + dm(d).replace('/', '-'));
  const frouras = await Promise.all(days.map(d => fillFroura(froura, state, d)));
  const psk = await mergeFirstSheets(frouras.map(x => x.data), tabs, frouras[0].sheet);
  entries.push(...await bookEntries(key('froura-psk'), psk, ONE_LAYOUT));

  const allState: AppState = { ...state, settings: { ...state.settings, outsFmt: 'all' } };
  const outsAll = await fillOuts(outsTpl, allState, GOLDEN_END);
  entries.push(...await bookEntries(key('outs-all'), outsAll.data, ONE_LAYOUT));
  const outs = await Promise.all(days.map(d => fillOuts(outsTpl, allState, d)));
  const two = isOutsAll(allState.settings) && outs.every(x => x.sheets && x.sheets.length === 2);
  const outsPsk = two
    ? await mergeSheets(outs.map(x => x.data), outs.map(x => x.sheets!), tabs.map(t => [t, t + ' ΔΥΝ']))
    : await mergeFirstSheets(outs.map(x => x.data), tabs, outs[0].sheet);
  entries.push({ key: key('outs-psk.merge-two-sheets'), hash: String(two) });
  entries.push(...await bookEntries(key('outs-psk'), outsPsk, ONE_LAYOUT));
  return entries;
}
