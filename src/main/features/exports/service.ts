// The form export: pre-check, fill, write, remember, open or print.
//
// Purpose: `exportGuarded` (one export at a time, one-minute limit) around `exportFile`, and the print-preview hook the
//   export uses to print instead of opening Excel.
// Does NOT: fill the forms (build.ts), keep the list of made forms (outs.ts), register IPC (ipc.ts) or own the print
//   window: that belongs to main.ts until the print area moves, hence the hook.
// Owner layer: main (architecture), `features/exports`. Imports app/*, shared/*, core files, `features/commands`.
// Why: moved verbatim from main.ts (Phase 4.2b). The print preview cannot be imported (main.ts must not be), so
//   main.ts installs it once with `onPrintPreview`, as it does with `onCommandApplied`.
// Covering test: test/exports*.test.ts, test/preflight*.test.ts; `npm run bench:golden`.
import path from 'path';
import { shell } from 'electron';
import { writeAll, LockedError } from '../../files';
import { hasErrors, preflight } from '../../../shared/preflight';
import { nowHM, pskDays, today, type ISODate } from '../../../shared/dates';
import { hkLvOn } from '../../../shared/domain';
import type { ExportKind, ExportOpts, ExportResult } from '../../../shared/api';
import { TemplateError } from '../../exports';
import { stamp } from '../../sources';
import { serial } from '../../app/serial';
import { store } from '../../app/state';
import { fail, runCmd } from '../commands';
import { X, produce } from './build';
import { formDir, formOf } from './forms';
import { rememberOut } from './outs';

/** What the print preview answers: opened, or the reason it did not. */
type PreviewResult = { ok: true } | { ok: false; error: string };
type PreviewHook = (file: string) => Promise<PreviewResult>;
let preview: PreviewHook = () => {
  throw new Error('onPrintPreview was not installed'); // loud on purpose: a silent skip would drop the printing
};

/**
 * Installs the print preview (main.ts's `printPreview`) that the exports use to print a just-made file. It lives in
 * main.ts because the print window belongs to an area this module may not import; main.ts installs it once while it
 * loads, before any export can run.
 * @decision Phase 4.2b: a hook instead of an import, so the feature never imports main.ts (no cycle).
 */
export function onPrintPreview(fn: PreviewHook): void {
  preview = fn;
}

/** Opens the print preview of `file` (the hook above). */
export const printPreview: PreviewHook = (file) => preview(file);

// One export at a time, and never an endless wait: if something hangs (slow disk, antivirus), after EXPORT_MAX
// the button unlocks with a message instead of staying on «Δημιουργία…»
const EXPORT_MAX = 60000;
let exporting = false;
/**
 * Exports one form with the single-export guard and the time limit.
 * @param date ISODate, local time
 * @returns the file and warnings, or `{ ok: false, error }`; never throws.
 */
export async function exportGuarded(kind: ExportKind, date: ISODate, opts: ExportOpts): Promise<ExportResult> {
  if (exporting) return { ok: false, error: 'Βγαίνει ήδη άλλο έντυπο. Περίμενε να τελειώσει και ξαναπάτα.' };
  exporting = true;
  let timer: NodeJS.Timeout | undefined;
  const slow = new Promise<ExportResult>((res) => {
    timer = setTimeout(
      () =>
        res({
          ok: false,
          error:
            'Η εξαγωγή άργησε πάνω από ένα λεπτό. Δες αν ο φάκελος των Excel είναι σε USB ή δίσκο δικτύου που δεν απαντά (Ρυθμίσεις → Φάκελος για τα Excel) και ξαναπάτα.',
        }),
      EXPORT_MAX,
    );
  });
  const work = exportFile(kind, date, opts);
  try {
    return await Promise.race([work, slow]);
  } finally {
    clearTimeout(timer);
    work.finally(() => {
      exporting = false;
    });
  }
}

/** Checks, makes, writes and remembers one form, then opens or prints it; `exportGuarded` is the guarded entry. */
async function exportFile(kind: ExportKind, date: ISODate, opts: ExportOpts): Promise<ExportResult> {
  try {
    const s = store.state;
    // Pre-check: with ✕ no form comes out, with ⚠ it needs a confirmation that is written to the history
    const checks = preflight(kind, s, date);
    if (hasErrors(checks))
      return { ok: false, error: 'Ο προέλεγχος βρήκε λάθη που πρέπει να διορθωθούν πρώτα', checks };
    if (checks.length && !opts.ack) return { ok: false, error: 'Θέλει επιβεβαίωση', checks, needAck: true };
    const { r, out } = await serial(async () => {
      const r = await produce(kind, date, s, opts.sigs);
      const [out] = await writeAll([{ dir: formDir(formOf(kind, s), date), name: r.name, data: r.data }]);
      // the signatures of this time stay for the automatic refreshes of the same file too
      rememberOut({
        form: formOf(kind, s),
        kind,
        date,
        file: out,
        at: nowHM(),
        hash: await X.zipHash(r.data),
        vhash: await X.valuesHash(r.data),
        ...(stamp(out) || {}),
        ...(opts.sigs ? { sigs: opts.sigs } : {}),
      });
      return { r, out };
    });
    // ΗΚΑΙ: the «3. Άδειες» that was used stays for the day (else a new default would change the re-export)
    if (kind === 'hkai') runCmd({ t: 'freezeHkaiLv', date, on: hkLvOn(s, date) });
    for (const d of kind === 'frouraPsk' || kind === 'outsPsk' ? pskDays(date) : [date])
      runCmd({ t: 'printed', date: d, at: nowHM(), files: [path.basename(out)] });
    for (const c of checks)
      store.addAudit(
        {
          at: nowHM(),
          day: today(),
          text: 'Βγήκε ' + path.basename(out) + ' με προειδοποίηση: ' + c.text,
          files: [],
          source: 'app',
          undoable: false,
        },
        null,
        false,
      );
    if (checks.length) store.flush();
    const warnings = r.warnings || [];
    // «Εκτύπωση»: the Excel is written as always and the print preview opens instead of Excel
    if (opts.print) {
      const p = await printPreview(out);
      if (!p.ok) warnings.push('Δεν άνοιξε η εκτύπωση: ' + p.error);
    } else if (opts.open) shell.openPath(out);
    return { ok: true, file: out, warnings };
  } catch (e) {
    if (e instanceof LockedError) return { ok: false, error: e.message, locked: true };
    if (e instanceof TemplateError) return { ok: false, error: e.message, checks: [{ level: 'err', text: e.message }] };
    return fail(e);
  }
}
