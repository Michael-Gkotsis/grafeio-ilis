// Pure rules of the «Σ.Ι.: σε ποιες υπηρεσίες μπαίνει» card: counts, rows and the changes each button makes.
// Purpose: `siView` helpers for `useSi` and their test; every change is a `SiPlan` (the new config, the history text
//   and the toast), so the hook only saves it.
// Does NOT: render anything, touch React or call `run` (model/useSi.ts does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/si.ts (Phase 6) so the rules are testable
//   without a render.
// Covering test: test/settings-si-view.test.ts.
import type { BlockDef, Person } from '../../../../shared/domain';
import type { UserLists } from '../../../../shared/ranks';
import {
  SI_BASES,
  SI_CATS,
  SI_CAT_BASES,
  parseSi,
  siBases,
  siCats,
  siCellOf,
  siCombos,
  siName,
  siOf,
  siRowKey,
  type SiConfig,
} from '../../../../shared/si';

/** Between the Σ.Ι. and the condition category in a row key («Ι3 ΧΩΡΙΣ ΟΠΛΟ · ΟΡΘΟΠΑΙΔΙΚΟ»). */
export const CAT_SEP = ' · ';

/** A row of the table: a Σ.Ι. (`cat` empty) or a Σ.Ι. with a condition category that has its own rules. */
export interface SiRow {
  label: string;
  cat: string;
}
/** What a button saves: the new config, the history text (after «Σ.Ι. ») and the toast text, if it shows one. */
export interface SiChange {
  si: SiConfig;
  text: string;
  toast?: string;
}
/** The result of a button that can be refused: the change to save, or the `error` to show. */
export type SiPlan = ({ ok: true } & SiChange) | { ok: false; error: string };

/** How many soldiers in service have each row, which unknown values they have, and which Σ.Ι. exist. */
export function siCounts(people: Person[], lists: UserLists, cfg: SiConfig) {
  const count = new Map<string, number>();
  const odd = new Map<string, number>();
  const seenBases = new Set<string>();
  const add = (k: string) => count.set(k, (count.get(k) || 0) + 1);
  for (const p of people) {
    if (!p.active || !p.si) continue;
    const x = siOf(p, lists);
    if (!x.known) {
      odd.set(p.si, (odd.get(p.si) || 0) + 1);
      continue;
    }
    add(x.label);
    seenBases.add(parseSi(x.label, cfg)!.base);
    if (x.cat) add(siRowKey(x.label, x.cat));
  }
  return { count, odd, seenBases };
}

/** Rows: every Σ.Ι. (also the ones only people have) and below it the condition categories with their own rules. */
export function siRows(cfg: SiConfig, cells: NonNullable<SiConfig['cells']>, seenBases: Set<string>): SiRow[] {
  const known = siCombos(cfg);
  const main = [...known, ...[...seenBases].filter((b) => !known.includes(b))];
  return main.flatMap((l) => [
    { label: l, cat: '' },
    ...Object.keys(cells)
      .filter((k) => k.startsWith(l + CAT_SEP))
      .map((k) => ({ label: l, cat: k.slice(l.length + CAT_SEP.length) })),
  ]);
}

/** The Σ.Ι. that can get a category row (Ι3, Ι4 and their parts). */
export const catRowChoices = (cfg: SiConfig) =>
  siCombos(cfg).filter((l) => SI_CAT_BASES.includes(parseSi(l, cfg)?.base || ''));
/** The old «Σ.Ι. άοπλων» list of «Λίστες» has entries, so the note about it is shown. */
export const hasLegacyUnarmed = (lists: UserLists) =>
  (lists.siUnarmed?.add || []).length > 0 || (lists.siUnarmed?.hide || []).length > 0;
/** The categories the user added (not the built-in ones). */
export const ownCategories = (cfg: SiConfig) => siCats(cfg).filter((c) => !SI_CATS.includes(c));
/** A Σ.Ι. the user added. */
export const isOwnBase = (cfg: SiConfig, b: string) =>
  !SI_BASES.includes(b) && (cfg.add || []).some((x) => siName(x) === b);
/** Someone has the category, or a row uses it, so it cannot be deleted. */
export const isUsedCat = (people: Person[], cells: NonNullable<SiConfig['cells']>, c: string) =>
  people.some((p) => p.siCat && siName(p.siCat) === c) || Object.keys(cells).some((k) => k.endsWith(CAT_SEP + c));

/** A cell flipped between «Ναι» and «Όχι»; a value equal to what would apply without the cell is not stored. */
export function toggleCell(
  lists: UserLists,
  cfg: SiConfig,
  label: string,
  cat: string,
  b: BlockDef,
): SiChange & { toast: string } {
  const cells = cfg.cells || {};
  const next = !siCellOf(lists, label, cat, b).ok;
  // What would apply without this cell: for a condition category its Σ.Ι., else the default.
  const inherited = cat
    ? siCellOf(lists, label, '', b).ok
    : siCellOf({ ...lists, si: { ...cfg, cells: {} } }, label, '', b).ok;
  const k = siRowKey(label, cat);
  const row = { ...(cells[k] || {}) };
  if (next === inherited) delete row[b.id];
  else row[b.id] = next;
  const nextCells = { ...cells, [k]: row };
  if (!cat && !Object.keys(row).length) delete nextCells[k];
  const who = cat ? label + ' ' + cat : label;
  return {
    si: { ...cfg, cells: nextCells },
    text: who + ': ' + (next ? 'μπαίνει' : 'δεν μπαίνει') + ' σε ' + b.name,
    toast:
      who +
      (next ? ' μπαίνει' : ' δεν μπαίνει') +
      ' σε ' +
      b.name +
      '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.',
  };
}

/** «Επαναφορά»: a category row keeps an empty rule set, a Σ.Ι. row goes back to the defaults. */
export function resetRow(cfg: SiConfig, label: string, cat: string): SiChange {
  const nextCells = { ...(cfg.cells || {}) };
  if (cat) nextCells[siRowKey(label, cat)] = {};
  else delete nextCells[siRowKey(label, cat)];
  return {
    si: { ...cfg, cells: nextCells },
    text: cat ? label + ' ' + cat + ': όπως το ' + label : label + ': όπως στην αρχή',
  };
}

/** «✕» on a category row: it follows its Σ.Ι. again. */
export function removeCatRow(cfg: SiConfig, label: string, cat: string): SiChange {
  const nextCells = { ...(cfg.cells || {}) };
  delete nextCells[siRowKey(label, cat)];
  return { si: { ...cfg, cells: nextCells }, text: label + ' ' + cat + ': όπως το ' + label };
}

/** «Πρόσθεσε γραμμή»: a category row with its own (still empty) rules. */
export function addCatRow(cfg: SiConfig, catRow: string, catPick: string): SiPlan {
  const cells = cfg.cells || {};
  const k = siRowKey(catRow, catPick);
  if (cells[k]) return { ok: false, error: 'Το ' + catRow + ' ' + catPick + ' έχει ήδη δικούς του κανόνες.' };
  return {
    ok: true,
    si: { ...cfg, cells: { ...cells, [k]: {} } },
    text: catRow + ' ' + catPick + ': δικοί του κανόνες',
    toast:
      'Άλλαξε τα Ναι/Όχι στη γραμμή ' + catRow + ' ' + catPick + '. Μέχρι τότε ισχύει ό,τι και για το ' + catRow + '.',
  };
}

/** «Νέα Σ.Ι.»: `null` when the box is empty. */
export function addBase(cfg: SiConfig, typed: string): SiPlan | null {
  const n = siName(typed);
  if (!n) return null;
  if (/[,"]/.test(n))
    return {
      ok: false,
      error: 'Χωρίς κόμμα ή εισαγωγικά: το Excel τα χρησιμοποιεί για να χωρίζει τις τιμές της λίστας.',
    };
  if (siBases(cfg).includes(n)) return { ok: false, error: 'Η Σ.Ι. «' + n + '» υπάρχει ήδη.' };
  return { ok: true, si: { ...cfg, add: [...(cfg.add || []), n] }, text: '+ ' + n, toast: 'Μπήκε η Σ.Ι. ' + n };
}

/** «Νέα κατηγορία πάθησης»: `null` when the box is empty. */
export function addCategory(cfg: SiConfig, typed: string): SiPlan | null {
  const n = siName(typed);
  if (!n) return null;
  if (siCats(cfg, true).includes(n)) return { ok: false, error: 'Η κατηγορία «' + n + '» υπάρχει ήδη.' };
  return {
    ok: true,
    si: { ...cfg, cats: { ...(cfg.cats || {}), add: [...(cfg.cats?.add || []), n] } },
    text: '+ κατηγορία ' + n,
    toast: 'Μπήκε η κατηγορία πάθησης ' + n,
  };
}

/** «✕» next to an own category. */
export const removeCategory = (cfg: SiConfig, c: string): SiChange => ({
  si: { ...cfg, cats: { ...(cfg.cats || {}), add: (cfg.cats?.add || []).filter((x) => siName(x) !== c) } },
  text: 'σβήστηκε η κατηγορία ' + c,
});

/** «✕» on an own Σ.Ι. row (also its category rows). */
export const removeBase = (cfg: SiConfig, b: string): SiChange => ({
  si: {
    ...cfg,
    add: (cfg.add || []).filter((x) => siName(x) !== b),
    cells: Object.fromEntries(Object.entries(cfg.cells || {}).filter(([k]) => k !== b && !k.startsWith(b + CAT_SEP))),
  },
  text: 'σβήστηκε το ' + b,
});
