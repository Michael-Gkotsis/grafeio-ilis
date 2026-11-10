// Writing a report as sheet(s) inside an Excel file, and the saved-signatures rule that goes with it.
//
// Purpose: `writeRepSheet` (fill the template, place its sheets in the Δυναμολόγιο or another Excel, remember them in
//   `meta.json`), `savedSigs` (a saved report as it is produced), and the helpers that name the sheet and find the
//   file.
// Does NOT: serialise the write (callers wrap it in `serial`), push events, schedule anything, or decide which reports
//   update themselves (`features/autowrite` `autoReps`).
// Owner layer: main (architecture), `features/reports`. Imports app/*, shared/*, `features/sources`, the engines.
// Why: moved verbatim from main.ts (Phase 4.4). `repRun`, `layoutPreview` and `regenReports` all need it, so it sits
//   at the bottom of the feature and imports nothing from it. `meta.json` is a frozen data file (CLAUDE.md rule 3).
// Covering test: test/reports*.test.ts; the written file is covered by the Electron comparison in the PR description.
import fs from 'fs';
import path from 'path';
import type { ISODate } from '../../../shared/dates';
import { sigsNone, splitOk, type Report } from '../../../shared/reports';
import { KINDS, type SourceBinding } from '../../../shared/sources';
import { upper } from '../../../shared/text';
import { bindingOf } from '../../app/bindings';
import { readMeta, writeMeta } from '../../app/meta';
import { TPL_DIR, tplBuf } from '../../app/paths';
import { store } from '../../app/state';
import type { RepOut } from '../../app/types';
import { writeAll } from '../../files';
import { off } from '../../offload';
import { fillReport, placeSheets } from '../../reports';
import { PREV_EVERY, stamp } from '../../sources';
import { sheetSafe } from '../../xlsx';
import { sameFile } from '../sources';

// a saved report that is produced: the «Φτιάξ' το εδώ» setting «Υπογραφές: Καμία» also holds for those saved before
// the fix (shared/reports sigsNone)
/**
 * A saved report as it is produced: «Υπογραφές: Καμία» of the built template also holds for reports saved before the
 * fix, unless the template file was edited since (then its own signatures stay).
 * @param file template file name in `TPL_DIR`
 */
export const savedSigs = (r: Report, file: string): Report => {
  const t = (store.state.settings.reportTpls || []).find((x) => x.id === r.tpl);
  if (r.sigs || !t?.built) return r;
  let edited = false;
  try {
    edited = !!t.mtime && Math.abs(fs.statSync(path.join(TPL_DIR, file)).mtimeMs - t.mtime) > 2000;
  } catch {
    /* missing: tplBuf reports it */
  }
  return sigsNone(r, store.state.settings.reportTpls, edited);
};
// Έντυπα › «Φύλλο στο Δυναμολόγιο» / «Φύλλο σε άλλο Excel…»: the report is written as a sheet (or sheets, one per room)
// inside the file. Each time only the report's own sheets are rewritten; the app never reads them back (import,
// Αρχεία Excel).
/** Sheet name a report writes under (or the prefix of its per-room sheets): capitals, Excel-safe, never empty. */
const repSheetBase = (r: Report) => sheetSafe(upper((r.target?.sheet || r.name || '').trim())).trim() || 'ΕΝΤΥΠΟ';
/** The Excel file a report sheet goes to, or the Greek reason it cannot (not set, not .xlsx/.xlsm, missing). */
function repFileOf(r: Report): string | { error: string } {
  const t = r.target;
  const f = !t || t.to === 'people' ? bindingOf('people')?.file : t.file;
  if (!f)
    return {
      error:
        !t || t.to === 'people'
          ? 'Δεν έχει οριστεί Δυναμολόγιο. Όρισέ το στα Αρχεία Excel ή διάλεξε «Φύλλο σε άλλο Excel…».'
          : 'Δεν έχει διαλεχτεί αρχείο. Άνοιξε το έντυπο με «Αλλαγή» και διάλεξε το Excel.',
    };
  if (!/\.xls[xm]$/i.test(f))
    return { error: 'Το ' + path.basename(f) + ' δεν είναι .xlsx: φύλλο γράφεται μόνο σε .xlsx ή .xlsm.' };
  if (!fs.existsSync(f))
    return { error: 'Δεν βρίσκω το ' + path.basename(f) + '. Άνοιξε το έντυπο με «Αλλαγή» και διάλεξέ το ξανά.' };
  return f;
}
/**
 * Writes a report as sheet(s) inside its target Excel and remembers them in `meta.json` `repSheets`.
 * @param tplFile template file name in `TPL_DIR`
 * @param ids person ids (or seat keys) the report lists
 * @param d ISODate, local time
 * @param force overwrite a sheet that this report did not make
 * @returns the file, warnings and sheet names, or `{ ok: false, error }` (also `confirm` for the sheets in the way)
 * @decision no `serial` inside: the callers (`repRun`, `regenReports`) wrap it around the whole read-write.
 */
export async function writeRepSheet(
  r: Report,
  tplFile: string,
  ids: (number | string)[],
  d: ISODate,
  force: boolean,
): Promise<RepOut> {
  r = savedSigs(r, tplFile);
  const file = repFileOf(r);
  if (typeof file !== 'string') return { ok: false, error: file.error };
  const s = store.state;
  const all = readMeta().repSheets || {};
  const prev = all[r.id] && sameFile(all[r.id].file, file) ? all[r.id] : undefined;
  const base = repSheetBase(r);
  const split = !!r.split && r.split !== 'none' && splitOk(r.kind);
  const tpl = await tplBuf(tplFile);
  const o = split ? { prefix: base, stale: prev?.groups || [] } : {};
  const out = await off('fillReport', [tpl, r, ids, d, o], () => fillReport(tpl, s, r, ids, d, o), s);
  const pairs: [string, string][] = split ? out.sheets.map((n) => [n, n]) : [[out.sheets[0], base]];
  // sheets the app reads (Δυναμολόγιο, medical...) are never written over
  const bound = KINDS.map((k) => bindingOf(k.id))
    .filter((b): b is SourceBinding => !!b && sameFile(b.file, file))
    .map((b) => b.sheet.toUpperCase());
  const hit = pairs.map((p) => p[1]).find((n) => bound.includes(n.toUpperCase()));
  if (hit)
    return {
      ok: false,
      error:
        'Το φύλλο «' +
        hit +
        '» το διαβάζει η εφαρμογή (είναι πίνακας από τα Αρχεία Excel). Δώσε άλλο όνομα φύλλου στο έντυπο.',
    };
  const fj = path.join(path.dirname(file), path.basename(file));
  const st = stamp(fj);
  const target = await fs.promises.readFile(fj);
  const placed = await off('placeSheets', [target, out.data, pairs, force ? null : prev?.sheets || []], () =>
    placeSheets(target, out.data, pairs, force ? null : prev?.sheets || []),
  );
  if (placed.clash)
    return {
      ok: false,
      error:
        placed.clash.length === 1
          ? 'Υπάρχει ήδη φύλλο «' +
            placed.clash[0] +
            '» στο ' +
            path.basename(file) +
            ' που δεν το έφτιαξε αυτό το έντυπο.'
          : 'Υπάρχουν ήδη τα φύλλα ' +
            placed.clash.map((x) => '«' + x + '»').join(', ') +
            ' στο ' +
            path.basename(file) +
            ' που δεν τα έφτιαξε αυτό το έντυπο.',
      confirm: placed.clash,
    };
  const [f] = await writeAll([{ dir: path.dirname(fj), name: path.basename(fj), data: placed.data! }], {
    prevEvery: PREV_EVERY,
    expect: st ? { [fj]: st } : undefined,
  });
  const names = pairs.map((p) => p[1]);
  const m = readMeta().repSheets || {};
  writeMeta({
    repSheets: {
      ...m,
      [r.id]: { file: f, sheets: [...new Set([...(prev?.sheets || []), ...names])], groups: out.groups },
    },
  });
  return { ok: true, file: f, warnings: out.warnings || [], sheets: names };
}
