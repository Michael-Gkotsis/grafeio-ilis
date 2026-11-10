// Which template and which folder each form (ΦΡΟΥΡΑ, ΗΚΑΙ, Εξοδούχοι, check grid) is filled from and written to.
//
// Purpose: `formBinding`, `formOf`, `formTpl`, `formDir` and `templates`, the lookups of the forms export.
// Does NOT: fill a template, write a file or know the export queue (build.ts / service.ts); store any binding (the
//   Settings command does).
// Owner layer: main (architecture), `features/exports`. Imports app/*, shared/* and core files, never main.ts.
// Why: the form export, the saved-forms refresh, the form settings and the boot answer all ask the same questions;
//   moved verbatim from main.ts (Phase 4.2b) so they share one home.
// Covering test: test/forms*.test.ts and test/exports*.test.ts for the rules; `npm run bench:golden` for the files.
import fs from 'fs';
import path from 'path';
import { ownBinding } from '../../files';
import type { ISODate } from '../../../shared/dates';
import type { AppState } from '../../../shared/domain';
import { phaseBase } from '../../../shared/domain';
import type { ExportKind, TemplateInfo } from '../../../shared/api';
import type { FormBinding, FormKind } from '../../../shared/sources';
import { unitKindOf, unitText } from '../../../shared/unit';
import { outputDir } from '../../app/dirs';
import { USER_TPL, tplPath } from '../../app/paths';
import { store } from '../../app/state';
import { FORM_FILE, TPL } from '../../app/tables';

/**
 * Forms: which template and which folder (Αρχεία Excel). Without a choice: the app's own templates.
 * @returns the binding of form `f` from Settings, or an empty one when none was chosen.
 */
export const formBinding = (f: FormKind): FormBinding => ownBinding(store.state.settings.forms?.[f]);
/** The form (template family) an export kind is filled from: `froura`/`frouraSpen` follow the phase. */
export const formOf = (kind: ExportKind, s: AppState): FormKind =>
  kind === 'froura' || kind === 'frouraPsk'
    ? phaseBase(s.settings) === 'spen'
      ? 'frouraSpen'
      : 'froura'
    : kind === 'hkai'
      ? 'hkai'
      : kind === 'check'
        ? 'check'
        : 'outs';
/**
 * Path of the template file of form `f`: the chosen one, else the app's own in `templates/`.
 * @throws Error with a Greek message when the chosen or bundled file is missing.
 */
export function formTpl(f: Exclude<FormKind, 'check'>): string {
  const b = formBinding(f);
  if (b.file) {
    if (!fs.existsSync(b.file))
      throw new Error(
        'Δεν βρέθηκε το template ' + b.file + '. Διάλεξε άλλο στα «Αρχεία Excel» ή γύρνα στο template της εφαρμογής.',
      );
    return b.file;
  }
  const file = tplPath(FORM_FILE[f]);
  if (!fs.existsSync(file)) throw new Error('Λείπει το έντυπο ' + FORM_FILE[f] + ' από τον φάκελο templates');
  return file;
}
/**
 * Folder a form of `date` is written to: the form's folder (else the general output folder), plus a `YYYY-MM` subfolder
 * unless `monthly` is turned off.
 * @param date ISODate, local time
 */
export const formDir = (f: FormKind, date: ISODate) => {
  const b = formBinding(f);
  const dir = b.dir || outputDir();
  return b.monthly === false ? dir : path.join(dir, date.slice(0, 7));
};
/** The template list shown in Settings: the app's own or the chosen file per form, plus the generated check grid. */
export const templates = (): TemplateInfo[] => [
  ...TPL.map((t) => {
    const f: FormKind =
      t.file === 'froura.xlsx'
        ? 'froura'
        : t.file === 'froura-spen.xlsx'
          ? 'frouraSpen'
          : t.id === 'hkai'
            ? 'hkai'
            : 'outs';
    const b = ownBinding(store?.state.settings.forms?.[f]);
    const name = unitText(t.name, unitKindOf(store?.state.settings));
    return b?.file
      ? { id: t.id, name, file: b.file, ok: fs.existsSync(b.file), custom: true }
      : {
          id: t.id,
          name,
          file: t.file,
          ok: fs.existsSync(tplPath(t.file)),
          custom: fs.existsSync(path.join(USER_TPL, t.file)),
        };
  }),
  {
    id: 'check',
    name: 'Έλεγχος υπηρεσιών (μηνιαίο πλέγμα)',
    file: 'δημιουργείται από την εφαρμογή',
    ok: true,
    custom: false,
  },
];
