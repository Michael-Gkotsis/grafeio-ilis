// Reading the details of the cadres from the sheet ΣΤΕΛΕΧΗ.
//
// Purpose: `planCadres` (new cadres, changes, conflicts) with `CadresRead` / `CadreNew`.
// Does NOT: read the statuses (cadreAbsRead.ts) or write (cadreWrite.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/people,
//   core/excel-in/cadreCols, core/excel-in/cadreMatch, core/excel-in/tableRows.
// Why: the cadres' Excel is theirs: the read takes what the Excel changed, keeps what only the app changed (it is
//   written back), and an empty cell never deletes what defines the cadre.
// Covering tests: test/cadre-excel.test.ts, test/stelexi.test.ts.
import type { AppState } from '../model/state';
import type { Cadre } from '../model/cadreRecord';
import { guessHk } from '../people/hkRows';
import { PKEYS, personalFromCell, type PKey } from '../people/personal';
import type { SourceBinding } from '../model/bindings';
import type { CellValue, RawSheet } from './roster';
import { type Meta, CADRE_KEYS, vals, parse, cmpKey, LABEL, nameOf, type Cfg, parseActive, hkKeyOf } from './cadreCols';
import { cadreMatcher, identsOf, nk } from './cadreMatch';
import { cellText } from './cellText';
import { tableRows } from './tableRows';

/** A cadre read from a row of the Excel: every field but the id, with `active` optional. */
export type CadreNew = Omit<Cadre, 'id' | 'active'> & { active?: boolean };
/**
 * The result of reading the ΣΤΕΛΕΧΗ sheet: `adds` (new cadres), `updates` (changes; `conflict` when both sides
 * changed), the unchanged `same`, `listed` rows, `amb` (namesakes), `skipped` rows with the reason, `appOnly` ids and
 * `warn` messages.
 */
export interface CadresRead {
  adds: { r: number; who: string; cadre: CadreNew }[];
  updates: { id: string; r: number; who: string; patch: Partial<Cadre>; what: string[]; conflict: boolean }[];
  same: number;
  listed: number;
  amb: { r: number; who: string }[];
  skipped: { r: number; who: string; why: string }[];
  appOnly: string[];
  warn: string[];
}
/**
 * Reads the ΣΤΕΛΕΧΗ sheet into a plan: new cadres, changes to the existing ones (what the Excel changed since the last
 * sync) and what only the app has.
 */
export function planCadres(sheet: RawSheet, b: SourceBinding, s: AppState, meta?: Meta): CadresRead {
  const out: CadresRead = { adds: [], updates: [], same: 0, listed: 0, amb: [], skipped: [], appOnly: [], warn: [] };
  const list = s.cadreList || [];
  const hasO = b.cols.origin != null;
  const byId = new Map(list.map((c) => [c.id, c]));
  const match = cadreMatcher(identsOf(list));
  const seen = new Set<string>();
  const newKeys = new Set<string>();
  const hkBad = new Set<string>();
  for (const { r, v } of tableRows(sheet, b.header, b.cols).records) {
    const last = cellText(v.last).trim();
    const who = [cellText(v.rank), last, cellText(v.first)].filter(Boolean).join(' ');
    if (!last) continue;
    if (b.cols.first != null && !cellText(v.first).trim()) {
      out.skipped.push({ r, who, why: 'λείπει το όνομα' });
      continue;
    }
    out.listed++;
    const m = match(v);
    if (m.alts) {
      out.amb.push({ r, who });
      continue;
    }
    if (m.id == null) {
      // new cadre: what the row has, and the ΗΚΑΙ line from the column or from the rank
      const nk2 = nk(last, cellText(v.first));
      if (newKeys.has(nk2)) {
        out.skipped.push({ r, who, why: 'διπλή γραμμή' });
        continue;
      }
      newKeys.add(nk2);
      const o: Record<string, unknown> = { last, first: cellText(v.first).trim() };
      for (const k of CADRE_KEYS) {
        const col = b.cols[k];
        if (col == null || k === 'last' || k === 'first') continue;
        const t = cellText(v[k]).trim();
        if (!t) continue;
        const pv = readVal(k, v[k], s);
        if (pv.skip) {
          if (pv.warn) out.warn.push('Γραμμή ' + (r + 1) + ' ' + who + ': ' + pv.warn);
          continue;
        }
        o[k] = pv.value;
      }
      if (o.hk == null) {
        const g = guessHk(String(o.rank || ''), s.settings.lists, o.origin as string | undefined);
        o.hk = g;
        if (b.cols.hk != null && cellText(v.hk).trim()) hkBad.add(cellText(v.hk).trim());
      }
      if (o.rank == null) o.rank = '';
      out.adds.push({ r, who, cadre: o as unknown as CadreNew });
      continue;
    }
    if (seen.has(m.id)) {
      out.skipped.push({ r, who, why: 'διπλή γραμμή (κρατήθηκε η πρώτη)' });
      continue;
    }
    seen.add(m.id);
    const c = byId.get(m.id)!;
    const now = vals(c, s, hasO);
    const bv = parse(meta?.base?.[c.id]);
    const patch: Record<string, unknown> = {};
    const what: string[] = [];
    let conflict = false;
    for (const k of CADRE_KEYS) {
      const col = b.cols[k];
      if (col == null) continue;
      const cell = cellText(v[k]).trim();
      if (cmpKey(k, now[k], s) === cmpKey(k, cell, s)) continue;
      // the Excel has what it had at the previous read/write, only the app changed: it stays the app's (written to the Excel)
      if (bv && cmpKey(k, bv[k] ?? '', s) === cmpKey(k, cell, s)) continue;
      // an empty cell does not delete what the cadre himself defines (name, rank, ΗΚΑΙ line, in strength)
      if (!cell && ['rank', 'last', 'first', 'hk', 'active'].includes(k)) continue;
      const pv = readVal(k, v[k], s);
      if (pv.skip) {
        if (pv.warn) out.warn.push('Γραμμή ' + (r + 1) + ' ' + who + ': ' + pv.warn);
        continue;
      }
      patch[k] = pv.value;
      what.push(LABEL[k] + ': ' + (now[k] || '(κενό)') + ' → ' + (cell || '(κενό)'));
      if (bv && cmpKey(k, bv[k] ?? '', s) !== cmpKey(k, now[k], s)) conflict = true;
    }
    if (what.length) out.updates.push({ id: c.id, r, who: nameOf(c), patch: patch as Partial<Cadre>, what, conflict });
    else out.same++;
  }
  out.appOnly = list.filter((c) => !seen.has(c.id)).map(nameOf);
  if (hkBad.size)
    out.warn.push(
      'Δεν αναγνωρίστηκε γραμμή ΗΚΑΙ «' +
        [...hkBad].slice(0, 4).join('», «') +
        '»: βάλθηκε από τον βαθμό. Άλλαξέ την από την καρτέλα του στελέχους.',
    );
  return out;
}
/** The value of a cell as it goes into the cadre (`skip`: it does not pass). */
function readVal(
  k: string,
  raw: CellValue,
  s: Cfg,
): { skip: false; value: string | number | boolean } | { skip: true; warn?: string } {
  const t = cellText(raw).trim();
  if (k === 'active') {
    const a = parseActive(t);
    return a == null
      ? { skip: true, warn: 'το «σε δύναμη» γράφει «' + t + '» (ΝΑΙ ή ΟΧΙ)' }
      : { skip: false, value: a };
  }
  if (k === 'hk') {
    const h = hkKeyOf(t, s);
    return h ? { skip: false, value: h } : { skip: true };
  }
  if (k === 'monthMax') {
    const n = Math.floor(Number(t.replace(',', '.')));
    return Number.isFinite(n)
      ? { skip: false, value: n > 0 ? n : 0 }
      : { skip: true, warn: 'το όριο υπηρεσιών δεν είναι αριθμός: «' + t + '»' };
  }
  if (PKEYS.includes(k as PKey)) return { skip: false, value: personalFromCell(k as PKey, raw) };
  return { skip: false, value: t };
}
