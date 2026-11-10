// The memory of the forms already made (`data/forms.json`) and their automatic refresh.
//
// Purpose: `readOuts` / `writeOuts` / `rememberOut` / `lastDay` keep the list of made forms; `regenForms` rewrites
//   the ones whose data changed, unless the user changed the file by hand or it is open in Excel.
// Does NOT: make the form export itself (service.ts) or decide when the refresh runs (the auto-write in main.ts).
// Owner layer: main (architecture), `features/exports`. Imports app/*, shared/*, core files and `build.ts`.
// Why: the export and the auto-write both read this list; moved verbatim from main.ts (Phase 4.2b). `forms.json` is a
//   frozen data contract (CLAUDE.md rule 3).
// Covering test: test/forms*.test.ts and test/exports*.test.ts; `npm run bench:golden`.
import fs from 'fs';
import path from 'path';
import { writeAll, writeJson } from '../../files';
import { nowHM, pskDays, today, type ISODate } from '../../../shared/dates';
import { preflight } from '../../../shared/preflight';
import type { ExportKind } from '../../../shared/api';
import { stamp } from '../../sources';
import { OUTS_FILE } from '../../app/paths';
import { serial } from '../../app/serial';
import { store } from '../../app/state';
import type { OutRec } from '../../app/types';
import { X, produce } from './build';

// ------------------------------------------------------------------ Excel files already made: they update themselves
// Every form made for today or a later day is written again when something changes in the app (Michael, 11/10).
// If the content did not change it is not touched; if it is open in Excel or the pre-check finds an error, it waits.
// vhash, mtime, size: what the app wrote, to tell whether the user changed it by hand afterwards
/** The remembered made forms (`data/forms.json`); an unreadable or missing file is an empty list. */
export const readOuts = (): OutRec[] => {
  try {
    return JSON.parse(fs.readFileSync(OUTS_FILE, 'utf8'));
  } catch {
    return [];
  }
};
/** Saves the remembered made forms; a failure is logged, never thrown. */
export const writeOuts = (l: OutRec[]) => {
  try {
    writeJson(OUTS_FILE, l);
  } catch (e) {
    console.error('forms.json', e);
  }
};
/** The last day a made form still covers (ISODate; the ΠΣΚ Sunday, or the 31st of a check grid's month). */
export const lastDay = (o: { kind: ExportKind; date: ISODate }) =>
  o.kind === 'frouraPsk' || o.kind === 'outsPsk'
    ? pskDays(o.date)[2]
    : o.kind === 'check'
      ? o.date.slice(0, 7) + '-31'
      : o.date;
/** Remembers a just-made form (replacing the same file), dropping those whose last day has passed. */
export function rememberOut(o: OutRec) {
  const t = today();
  writeOuts([...readOuts().filter((x) => x.file !== o.file && lastDay(x) >= t), o]);
}
/** Refreshes the made forms in the I/O queue; true when at least one file was rewritten. */
export const regenForms = () => serial(regenFormsNow);
async function regenFormsNow(): Promise<boolean> {
  const t = today();
  const list = readOuts().filter((o) => lastDay(o) >= t);
  let any = false;
  for (const o of list) {
    if (!fs.existsSync(o.file)) {
      o.error = undefined;
      o.pending = false;
      continue;
    } // the user deleted it: we do not make it again
    if (o.manual) continue;
    try {
      // The user corrected it by hand in Excel: we do not overwrite it. It comes out again only with the app's button.
      const st = stamp(o.file);
      if (st && o.vhash && (st.mtime !== o.mtime || st.size !== o.size)) {
        if ((await X.valuesHash(await fs.promises.readFile(o.file))) !== o.vhash) {
          o.manual = true;
          o.pending = false;
          o.error =
            "Το άλλαξες με το χέρι στο Excel, οπότε δεν ξαναγράφεται μόνο του. Αν θες τα νέα στοιχεία της εφαρμογής, βγάλ' το ξανά από την εφαρμογή.";
          continue;
        }
        o.mtime = st.mtime;
        o.size = st.size; // merely opened and saved: same values
      }
      const s = store.state;
      const errs = preflight(o.kind, s, o.date).filter((c) => c.level === 'err');
      if (errs.length) {
        o.pending = true;
        o.error = 'Ο προέλεγχος βρήκε λάθος: ' + errs[0].text;
        continue;
      }
      const r = await produce(o.kind, o.date, s, o.sigs);
      const h = await X.zipHash(r.data);
      if (h === o.hash) {
        o.pending = false;
        o.error = undefined;
        continue;
      }
      await writeAll([{ dir: path.dirname(o.file), name: path.basename(o.file), data: r.data }]);
      o.hash = h;
      o.vhash = await X.valuesHash(r.data);
      Object.assign(o, stamp(o.file) || {});
      o.at = nowHM();
      o.pending = false;
      o.error = undefined;
      any = true;
      store.addAudit(
        {
          at: nowHM(),
          day: t,
          text: 'Ενημερώθηκε μόνο του το ' + path.basename(o.file) + ' (άλλαξαν δεδομένα)',
          files: [path.basename(o.file)],
          source: 'auto',
          undoable: false,
        },
        null,
        false,
      );
    } catch (e) {
      o.pending = true;
      o.error = e instanceof Error ? e.message : String(e);
    }
  }
  writeOuts(list);
  if (any) store.flush();
  return any;
}
