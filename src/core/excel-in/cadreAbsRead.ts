// Reading the statuses of the cadres from the sheet ΚΑΤΑΣΤΑΣΕΙΣ.
//
// Purpose: `planCadreAbs` with `CadreAbsRead` / `AbsNew`.
// Does NOT: write the sheet (cadreAbsWrite.ts) or read the details (cadreRead.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/excel-in/cadreAbs,
//   core/excel-in/cadreCols, core/excel-in/cadreMatch.
// Why: a status of a cadre (leave, hospital, duty…) kept by the sergeant in the Excel reaches the app with the same
//   rules as the other statuses: what cannot be read is listed with the reason.
// Covering tests: test/cadre-excel.test.ts, test/stelexi.test.ts.
import type { ISODate } from '../lib/dates';
import { upper } from '../lib/text';
import type { AppState } from '../model/state';
import { cadreAbsOf } from '../people/kinds';
import type { SourceBinding } from '../model/bindings';
import type { RawSheet } from './roster';
import { keyOf, absRows, absNote } from './cadreAbs';
import { type Meta, nameOf, parse, sq } from './cadreCols';

/** A status read from a row of the Excel: the cadre, the kind, the dates and the note. */
export interface AbsNew {
  cid: string;
  kind: string;
  from: ISODate;
  to: ISODate;
  note?: string;
}
/**
 * The result of reading the ΚΑΤΑΣΤΑΣΕΙΣ sheet: `adds`, `updates` (the note), `removed` (deleted in the Excel), the
 * unchanged `same`, `listed` rows, `skipped` rows with the reason and the number `appOnly`.
 */
export interface CadreAbsRead {
  adds: { r: number; who: string; abs: AbsNew; text: string }[];
  updates: { id: string; r: number; who: string; note: string; text: string }[];
  removed: { id: string; who: string; text: string }[];
  same: number;
  listed: number;
  skipped: { r: number; who: string; why: string }[];
  appOnly: number;
}
/** Reads the ΚΑΤΑΣΤΑΣΕΙΣ sheet into a plan: new statuses, changed notes and statuses deleted in the Excel. */
export function planCadreAbs(sheet: RawSheet, b: SourceBinding, s: AppState, meta?: Meta): CadreAbsRead {
  const out: CadreAbsRead = { adds: [], updates: [], removed: [], same: 0, listed: 0, skipped: [], appOnly: 0 };
  const byId = new Map((s.cadreList || []).map((c) => [c.id, c]));
  const app = new Map((s.cadreAbs || []).filter((a) => byId.has(a.cid)).map((a) => [keyOf(a, s), a]));
  const known = new Set(meta?.keys || []);
  const seen = new Set<string>();
  const dm2 = (d: string) => d.slice(8) + '/' + d.slice(5, 7);
  for (const e of absRows(sheet, b, s, meta)) {
    out.listed++;
    if (!e.key) {
      out.skipped.push({ r: e.r, who: e.who, why: e.why });
      continue;
    }
    if (seen.has(e.key)) {
      out.skipped.push({ r: e.r, who: e.who, why: 'διπλή γραμμή (κρατήθηκε η πρώτη)' });
      continue;
    }
    seen.add(e.key);
    const a = app.get(e.key);
    const c = byId.get(e.cid!)!;
    const note = absNote(e.v.note);
    const label = upper(cadreAbsOf(e.code!, s.settings.lists)?.[1] || e.code!);
    const rng = dm2(e.from!) + '–' + dm2(e.to!);
    if (!a) {
      out.adds.push({
        r: e.r,
        who: nameOf(c),
        abs: { cid: c.id, kind: e.code!, from: e.from!, to: e.to!, ...(note ? { note } : {}) },
        text: label + ' ' + rng,
      });
      continue;
    }
    const bv = parse(meta?.base?.[e.key]);
    if (b.cols.note != null && sq(note) !== sq(a.note || '') && !(bv && sq(bv.n ?? '') === sq(note)))
      out.updates.push({
        id: a.id,
        r: e.r,
        who: nameOf(c),
        note,
        text: label + ' ' + rng + ': παρατήρηση «' + (a.note || '') + '» → «' + note + '»',
      });
    else out.same++;
  }
  for (const [key, a] of app)
    if (!seen.has(key)) {
      if (known.has(key))
        out.removed.push({
          id: a.id,
          who: nameOf(byId.get(a.cid)!),
          text: upper(cadreAbsOf(a.kind, s.settings.lists)?.[1] || a.kind) + ' ' + dm2(a.from) + '–' + dm2(a.to),
        });
      else out.appOnly++;
    }
  return out;
}
