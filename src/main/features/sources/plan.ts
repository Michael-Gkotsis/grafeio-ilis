// Where a new Excel file goes, making it, and the preview of what a write would change.
//
// Purpose: `newPlace` (a sheet in the Δυναμολόγιο or a separate file), `createNew` («Νέο αρχείο…» and the files of a
//   new ΕΣΣΟ) and `planOut` (the preview shown before «Ενημέρωση Excel»).
// Does NOT: write anything but through `syncOut` (autowrite), and it does not read the statuses.
// Owner layer: main (architecture), `features/sources`. Imports app/*, `features/autowrite`, shared/*.
// Why: moved verbatim from main.ts (Phase 4.3b). Existing sheets and files are never written over.
// Covering test: test/sources*.test.ts, test/plan*.test.ts; the Electron comparison in the PR description.
import fs from 'fs';
import path from 'path';
import { today } from '../../../shared/dates';
import type { NewOut } from '../../app/types';
import type { WritePreview } from '../../../shared/api';
import { freeName } from '../../files';
import { essoName } from '../../../shared/esso';
import { normGreek } from '../../../shared/text';
import type { CellValue } from '../../../shared/roster';
import {
  KIND,
  NEW_KINDS,
  ambiguousLines,
  bestFor,
  bindingMonth,
  canCreate,
  capExtraCols,
  colLetter,
  defaultBinding,
  describeSets,
  detectTables,
  dutiesBinding,
  dutiesSheet,
  isStatusKind,
  planSource,
  rowName,
  sheetHost,
  stepRows,
  timeCols,
  withRows,
  type ListKind,
  type SourceBinding,
} from '../../../shared/sources';
import { bindingOf, current, srcMeta } from '../../app/bindings';
import { newDir } from '../../app/dirs';
import { writableDir } from '../../app/paths';
import { store } from '../../app/state';
import { readBook, tidyPreview } from '../../sources';
import { syncOut } from '../autowrite';
import { fail } from '../commands';
import { saveBinding } from './binding';
import { notReports, sheetOf } from './book';
import { notify } from './status';

// Where a new kind is made: as a sheet in the Δυναμολόγιο (as in the Ίλη's file), if it is set, exists and the
// app writes there; otherwise a separate file in the kind's folder. If the Δυναμολόγιο already has a table of this
// kind, that one is set (found) instead of making a second. An existing sheet or file is never written over.
async function newPlace(
  kind: ListKind,
): Promise<{ b: SourceBinding; found?: boolean; inRoster?: boolean } | { error: string }> {
  const host = sheetHost(kind);
  const ros = host ? bindingOf(host) : undefined; // a sheet inside the «host» file: Δυναμολόγιο or cadres
  if (host && ros && ros.write !== false && /\.xls[xm]$/i.test(ros.file) && fs.existsSync(ros.file)) {
    try {
      const book = await readBook(ros.file);
      const hit = detectTables(notReports(ros.file, book.sheets)).find((h) => h.best === kind);
      if (hit)
        return {
          b: { file: ros.file, sheet: hit.sheet, header: hit.header, cols: hit.cols, write: true, scope: 'active' },
          found: true,
        };
      const names = new Set(book.sheets.map((x) => normGreek(x.name)));
      const title = KIND[kind].title.slice(0, 28);
      let name = title;
      for (let i = 2; names.has(normGreek(name)); i++) name = title + ' ' + i;
      return { b: { ...defaultBinding(kind, ros.file, name), write: true }, inRoster: true };
    } catch {
      /* cannot be read (open, old .xls): a separate file */
    }
  }
  // duty check: a sheet of the current month, in the same file as the previous months if there is one
  if (kind === 'duties') {
    const ym = today().slice(0, 7);
    const cur = bindingOf('duties');
    if (cur && /\.xls[xm]$/i.test(cur.file) && fs.existsSync(cur.file)) {
      try {
        const book = await readBook(cur.file);
        const mine = book.sheets.find((x) => {
          const h = bestFor('duties', [x]);
          return h && bindingMonth(x, { ...cur, header: h.header }, today()) === ym;
        });
        if (mine) {
          const h = bestFor('duties', [mine])!;
          return { b: { ...cur, sheet: mine.name, header: h.header, cols: h.cols, month: ym }, found: true };
        }
        const names = new Set(book.sheets.map((x) => normGreek(x.name)));
        let name = dutiesSheet(ym);
        for (let i = 2; names.has(normGreek(name)); i++) name = dutiesSheet(ym) + ' ' + i;
        return { b: dutiesBinding(cur.file, ym, name, store.state.settings), inRoster: true };
      } catch {
        /* cannot be read: a new file */
      }
    }
  }
  const dir = newDir(kind);
  if (!writableDir(dir))
    return { error: 'Δεν γράφεται ο φάκελος ' + dir + '. Διάλεξε άλλο στις Ρυθμίσεις → Φάκελοι αρχείων.' };
  // with a known ΕΣΣΟ (Settings › ΕΣΣΟ) its name goes into the file name: «ΔΥΝΑΜΟΛΟΓΙΟ Γ΄ ΕΣΣΟ 2026 4ης ΙΛΗΣ»
  const es = store.state.settings.essos ? essoName(store.state.settings.essos) : '';
  if (kind === 'duties')
    return {
      b: dutiesBinding(
        freeName(dir, 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + (es || today().slice(0, 4))),
        today().slice(0, 7),
        undefined,
        store.state.settings,
      ),
    };
  const name =
    kind === 'people'
      ? ('ΔΥΝΑΜΟΛΟΓΙΟ ' + es + ' ' + (store.state.settings.unitName || '')).replace(/\s+/g, ' ').trim()
      : KIND[kind].title;
  return { b: { ...defaultBinding(kind, freeName(dir, name)), write: true } };
}
/** «Νέο αρχείο…» of a kind (Αρχεία Excel) and the Excel files of the new ΕΣΣΟ. */
export async function createNew(kind: ListKind): Promise<NewOut> {
  if (!KIND[kind] || !canCreate(kind)) return fail('Αυτό το είδος δεν φτιάχνεται ακόμα από την εφαρμογή');
  const prev = bindingOf(kind);
  const prevMeta = srcMeta.keep(kind);
  const at = await newPlace(kind);
  if ('error' in at) return fail(at.error);
  if (at.found) {
    saveBinding(kind, at.b);
    notify();
    return { ok: true, file: at.b.file, sheet: at.b.sheet, found: true };
  }
  saveBinding(kind, at.b);
  const r = await syncOut(kind, false, true);
  // not made: the binding goes back as it was (not to a file that does not exist), together with what the app knew
  // about the old file (when it was read, what it had): otherwise it would stay «Νέο» and would not write by itself
  if (!r.ok) {
    saveBinding(kind, prev || null);
    prevMeta();
    notify();
    return r;
  }
  // new Δυναμολόγιο: its sheets too (ΤΙΜΩΡΗΜΕΝΟΙ, ΑΔΕΙΕΣ, ΠΟΣΤΑ…) for the kinds that have no file yet
  const sheets: string[] = [];
  if (kind === 'people' || kind === 'cadres')
    for (const k of NEW_KINDS.filter((x) => sheetHost(x) === kind && !bindingOf(x))) {
      const at2 = await newPlace(k);
      if ('error' in at2 || !at2.inRoster) continue;
      saveBinding(k, at2.b);
      if ((await syncOut(k, false, true)).ok) sheets.push(at2.b.sheet);
      else saveBinding(k, null);
    }
  notify();
  return { ok: true, file: r.file, sheet: at.b.sheet, inRoster: at.inRoster, ...(sheets.length ? { sheets } : {}) };
}
/** The preview of what writing `kind` to its Excel would change (the dialog before «Ενημέρωση Excel»). */
export async function planOut(kind: ListKind): Promise<WritePreview | { ok: false; error: string }> {
  const b0 = await current(kind);
  if (!b0) return fail('Δεν έχει οριστεί αρχείο');
  let b: SourceBinding = b0;
  try {
    const exists = fs.existsSync(b.file);
    const book = exists ? await readBook(b.file) : null;
    const sheet = (book && sheetOf(book.sheets, b.sheet)) || { name: b.sheet, rows: [] };
    if (!book && !isStatusKind(kind)) return fail('Δεν βρέθηκε το ' + b.file);
    const had = !!book?.sheets.some((x) => x.name === b.sheet);
    if (!had && !isStatusKind(kind)) return fail('Δεν υπάρχει φύλλο «' + b.sheet + '» στο ' + path.basename(b.file));
    const tc0 = timeCols(kind, had ? sheet : null, b, store.state, today());
    const tc1 = capExtraCols(kind, had ? sheet : null, tc0.b, store.state);
    b = tc1.b;
    const tc = {
      head: [
        ...tc0.head.map((h) => ({
          ...h,
          why: kind === 'people' ? 'για τα στοιχεία των καρτελών (IBAN, ΑΜΚΑ, ΑΦΜ)' : 'για τις ώρες των αδειών',
        })),
        ...tc1.head.map((h) => ({ ...h, why: 'για όσους δεν κάνουν αυτή την υπηρεσία' })),
      ],
    };
    const plan = planSource(kind, had ? sheet : null, b, store.state, srcMeta.get(kind), today());
    const steps = plan.inserts || [],
      sheet2 = steps.length ? withRows(sheet, steps) : sheet;
    const lines = describeSets(
      kind,
      sheet2,
      b,
      plan.sets,
      plan.insert
        ? new Set(Array.from({ length: plan.insert.n }, (_, i) => plan.insert!.after + 1 + i))
        : stepRows(steps),
    );
    for (const d of plan.deletes || []) {
      const v: Record<string, CellValue> = {};
      for (const k in b.cols) v[k] = (sheet2.rows[d] || [])[b.cols[k]];
      lines.push({ r: d, who: rowName(v), text: 'η γραμμή σβήνεται (αναιρέθηκε στην εφαρμογή)' });
    }
    lines.sort((x, y) => x.r - y.r);
    const tidy = [
      ...tc.head.map((h) => 'Νέα στήλη «' + h.v + '» (' + colLetter(h.c) + ') στο τέλος του πίνακα, ' + h.why),
      ...(had && book ? await tidyPreview(kind, b, store.state.settings.lists) : []),
    ];
    return {
      ok: true,
      file: b.file,
      create: !exists || !had,
      lines,
      total: plan.added + plan.changed + plan.cleared,
      foreign: plan.foreign,
      notFound: plan.notFound,
      ambiguous: ambiguousLines(sheet, b, plan.ambiguous),
      warn: plan.warn,
      ...(tidy.length ? { tidy } : {}),
    };
  } catch (e) {
    return fail(e);
  }
}
