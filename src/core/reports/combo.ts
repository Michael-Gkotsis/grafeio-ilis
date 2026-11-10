// Combination columns: several fields of a row written in one cell.
//
// Purpose: `comboOf` / `DEF_COMBO` (fields and format), `comboFmts` (ready formats), `fillFmt` (fill a format and
//   clean what is empty), `comboHead` (the header) and `comboFields`.
// Does NOT: read the values of the fields (fieldValue.ts calls `fillFmt` with them).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model, core/reports/fields.
// Why: the screen shows a preview of the format and the Excel writer fills it, and both must clean empty parts the
//   same way.
// Covering tests: test/reports-tables.test.ts.
import type { RepKind, ColOpts } from '../model/reportTypes';
import { fieldOf, FIELDS, COMBO_NO } from './fields';

/** The fields of a kind that can go into a combination column. */
export const comboFields = (kind: RepKind) => FIELDS[kind].filter((f) => !COMBO_NO.has(f.k));
/** The default combination: rank and Ο/Σ, written «ΣΤΡ (ΜΧ)». */
export const DEF_COMBO: Required<Pick<ColOpts, 'parts' | 'fmt'>> = { parts: ['rank1', 'spec'], fmt: '{1} ({2})' };
/** Ready formats for a combination of n fields: «{1} {2}», «{1} ({2})», «{1} - {2}»… */
export function comboFmts(n: number): string[] {
  const p = Array.from({ length: Math.max(1, n) }, (_, i) => '{' + (i + 1) + '}');
  if (p.length === 1) return ['{1}'];
  return [p.join(' '), p[0] + ' (' + p.slice(1).join(' ') + ')', p.join(' - '), p.join('/'), p.join(', ')];
}
/** The fields and the format of a combination column; the default when none were set. */
export const comboOf = (o?: ColOpts) =>
  o?.parts?.length ? { parts: o.parts, fmt: o.fmt ?? comboFmts(o.parts.length)[0] } : DEF_COMBO;
/**
 * Fills the format with the values. If a value is empty, the empty brackets and the double or edge separators go («ΣΤΡ
 * ()» → «ΣΤΡ», «Α - - Γ» → «Α - Γ»).
 */
export function fillFmt(fmt: string, vals: string[]): string {
  let empty = false;
  const out = fmt.replace(/\{(\d{1,2})\}/g, (_m, n: string) => {
    const v = vals[+n - 1] ?? '';
    if (!v) empty = true;
    return v;
  });
  if (!empty) return out.trim();
  let t = out;
  for (let i = 0; i < 3; i++) t = t.replace(/\(\s*\)|\[\s*\]/g, '');
  t = t
    .replace(/([,/\-–·])(?:\s*\1)+/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1');
  return t.replace(/^[\s,/\-–·]+|[\s,/\-–·]+$/g, '').trim();
}
/**
 * The header of a combination from the names of its fields (ΒΑΘΜΟΣ (Ο/Σ)); also used for the ready formats in the
 * list.
 */
export const comboHead = (kind: RepKind, o?: ColOpts, fmt?: string) => {
  const c = comboOf(o);
  return fillFmt(
    fmt ?? c.fmt,
    c.parts.map((k) => fieldOf(kind, k)?.head || ''),
  );
};
