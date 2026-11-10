// Reading the sheet «ΔΥΝΑΤΟΤΗΤΑ ΥΠΗΡΕΣΙΩΝ» (sample 02): who does not do which duty.
//
// Purpose: `planCaps` (the changes of the capabilities of the people), `capNo` (what a «does not do» cell looks
//   like), `capExtras` / `capExtraCols` (the columns of the user's own duties).
// Does NOT: write the sheet back (postsBack.ts `planCapsWrite`) or know the capabilities rules (core/duty does).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/duty, core/model,
//   core/excel-in/sheetPeople, core/excel-in/tableRows, core/excel-in/columns.
// Why: the «Ποιος κάνει τι» table is the same data as this file, so the duties of the settings (including the user's
//   own, like ΠΥΛΗ) become columns by themselves and the file and the screen never disagree.
// Covering tests: test/excel-caps.test.ts, test/who-does.test.ts, test/own-kind.test.ts.
import { norm, normGreek } from '../lib/text';
import { CAP_ACC, type DutyKind } from '../model/duty';
import type { AppState } from '../model/state';
import type { CapKey } from '../model/dutyRules';
import type { Settings } from '../model/settings';
import type { RawSheet } from './roster';
import { capCols } from '../duty/whoDoes';
import type { SourceBinding, ListKind } from '../model/bindings';
import { cellText, headText } from './cellText';
import { CAP_COLS } from './fields';
import { type SheetPeople, sheetPeople, nameOf } from './sheetPeople';
import { tableRows } from './tableRows';

/** True when the cell text means «does not do it»: «-» (or ΟΧΙ, ΔΕΝ…, 0). */
export const capNo = (t: string) => /^[-–—_.]+$|^ΟΧΙ|^ΔΕΝ|^0$/.test(normGreek(t).trim());
/**
 * The columns of the «Ποιος κάνει τι» that the sample does not have: the user's own duties (with their name, e.g.
 * ΠΥΛΗ) and «Άλλες», if the form has such a duty. Each active one goes into the sheet on its own (`capExtraCols`,
 * Michael 22/10); an inactive one is neither read nor written, and its column stays in the Excel as it is.
 */
export function capExtras(settings: Settings): { key: CapKey; head: string; acc: string }[] {
  return capCols(settings)
    .filter((c) => !(CAP_COLS as string[]).includes(c.key))
    .map((c) =>
      c.block
        ? { key: c.key, head: norm(c.block.name), acc: c.block.name }
        : { key: c.key, head: 'ΑΛΛΕΣ ΥΠΗΡΕΣΙΕΣ', acc: CAP_ACC[c.kind] || c.label },
    );
}
/** «όχι θαλαμοφύλακα», «όχι Πύλη»: how the duty of a column is called in the preview. */
export const capAcc = (k: CapKey, settings: Settings) =>
  CAP_ACC[k as DutyKind] || capExtras(settings).find((x) => x.key === k)?.acc || k;
/** The capability columns mapped in the binding: the built-in ones, then the user's own duties. */
export const capKeys = (b: SourceBinding, settings: Settings): CapKey[] =>
  [...CAP_COLS, ...capExtras(settings).map((x) => x.key)].filter((k) => b.cols[k] != null);
/**
 * Columns for the user's own duties in the capabilities sheet: those that already have a column with their name are
 * found on their own; the missing ones come in (`grow`) in the first empty columns after the table, like the time
 * columns (`timeCols`), so that none of the user's own columns moves. In a new table, before the ΠΑΡΑΤΗΡΗΣΕΙΣ. `head`:
 * the headers to write (in a new table `planSource` writes them).
 */
export function capExtraCols(
  kind: ListKind,
  sheet: RawSheet | null,
  b: SourceBinding,
  s: AppState,
  grow = true,
): { b: SourceBinding; head: { r: number; c: number; v: string }[] } {
  if (kind !== 'caps') return { b, head: [] };
  const ext = capExtras(s.settings);
  if (!ext.length) return { b, head: [] };
  const rows = sheet?.rows || [];
  const row = rows[b.header] || [];
  const fresh = !row.some((v) => cellText(v));
  const cols = { ...b.cols };
  const used = new Set(Object.values(cols));
  for (const x of ext)
    if (cols[x.key] == null) {
      const at = row.findIndex((v, c) => !used.has(c) && headText(v) === headText(x.head));
      if (at >= 0) {
        cols[x.key] = at;
        used.add(at);
      }
    }
  const need = grow ? ext.filter((x) => cols[x.key] == null) : [];
  if (!need.length)
    return Object.keys(cols).length === Object.keys(b.cols).length ? { b, head: [] } : { b: { ...b, cols }, head: [] };
  const head: { r: number; c: number; v: string }[] = [];
  if (fresh && cols.capnote != null) {
    let c = cols.capnote;
    for (const x of need) cols[x.key] = c++;
    cols.capnote = c;
  } else {
    const scan = sheet && !fresh ? tableRows(sheet, b.header, b.cols) : null;
    const last = scan ? Math.max(scan.end, b.header) : b.header;
    const empty = (c: number) => {
      for (let r = b.header; r <= last; r++) if (cellText((rows[r] || [])[c]) !== '') return false;
      return true;
    };
    let c = Math.max(scan ? scan.width[1] : 0, ...Object.values(cols)) + 1;
    for (const x of need) {
      while (Object.values(cols).includes(c) || !empty(c)) c++;
      cols[x.key] = c;
      if (!fresh) head.push({ r: b.header, c, v: x.head });
      c++;
    }
  }
  return { b: { ...b, cols }, head };
}
/**
 * One change to a capability: the person, the duty column (`kind`), the reason (null = does it again) and the name for
 * the user.
 */
export interface CapChange {
  pid: number;
  kind: CapKey;
  reason: string | null;
  who: string;
}
/**
 * The result of reading the capabilities sheet: the `changes`, the unchanged `same`, the number `listed`, and the
 * people found (`sp`).
 */
export interface CapsPlan {
  changes: CapChange[];
  same: number;
  listed: number;
  sp: SheetPeople;
}
/**
 * Capability of duties (sample 02): a «-» (or ΟΧΙ, ΔΕΝ…) in the column = does not do it. Empty = does it: whatever
 * obstacle the app put goes away, while the automatic ones (post, Σ.Ι. Ι4/unarmed) stay. Those not in the sheet do not
 * change.
 */
export function planCaps(
  sheet: RawSheet,
  b0: SourceBinding,
  s: AppState,
  choices: Record<number, number | null> = {},
): CapsPlan {
  const b = capExtraCols('caps', sheet, b0, s, false).b; // and the columns of the user's own duties, by their name
  const sp = sheetPeople(sheet, b, s.people, choices);
  const pm = new Map(s.people.map((p) => [p.id, p]));
  const plan: CapsPlan = { changes: [], same: 0, listed: sp.rows.length, sp };
  const cols = capKeys(b, s.settings);
  for (const row of sp.rows) {
    const p = pm.get(row.pid)!;
    const cur = s.caps[p.id] || {};
    const note = cellText(row.v.capnote);
    const reason = 'Από Excel' + (note ? ': ' + note : '');
    let ch = false;
    for (const k of cols) {
      const no = capNo(cellText(row.v[k]));
      const now = cur[k];
      if (no && typeof now !== 'string') {
        plan.changes.push({ pid: p.id, kind: k, reason, who: nameOf(p) });
        ch = true;
      } else if (!no && typeof now === 'string') {
        plan.changes.push({ pid: p.id, kind: k, reason: null, who: nameOf(p) });
        ch = true;
      }
    }
    if (!ch) plan.same++;
  }
  return plan;
}
