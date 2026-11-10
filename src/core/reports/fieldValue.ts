// The value of one field of one row of a report.
//
// Purpose: `fieldValue`: every field of every kind (people, cadres, statuses, duties, weapons, weapon moves, «Κενό»)
//   as the text or number written in the cell.
// Does NOT: choose the rows (candidates.ts) or the columns (fields.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/statuses, core/lib, core/model,
//   core/duty, core/weapons, core/people, core/cadre, core/reports/combo, core/reports/fields, core/reports/rowInfo,
//   core/reports/rowTypes, core/reports/statusCols.
// Why: all the Excel outputs of «Έντυπα» and the preview read a cell through this one function, so a field means the
//   same thing everywhere.
// Covering tests: test/armed.test.ts, test/axiologisi.test.ts, test/origin.test.ts, test/personal-entypa.test.ts.
import { dayCode } from '../statuses/dayCode';
import { absenceOfCadre, absenceOfPerson } from '../statuses/absence';
import { daysBetween, dmy, type ISODate } from '../lib/dates';
import { upper } from '../lib/text';
import { unitOf } from '../model/settingsAccess';
import { fullName, type Person } from '../model/person';
import type { AppState } from '../model/state';
import type { Cadre } from '../model/cadreRecord';
import { postBy } from '../duty/posts';
import { inOutText } from '../weapons/weaponInfo';
import { moveInCell, moveOutCell, isAuto } from '../weapons/weaponSheets';
import { rankTxt } from '../people/ranks';
import { cadreStatusOn } from '../cadre/cadre';
import type { RepKind, ColOpts } from '../model/reportTypes';
import { comboOf, fillFmt } from './combo';
import { COMBO_NO } from './fields';
import { blockName, when, wInfo, absField } from './rowInfo';
import { type Row, blankIdx, type WhoAt, type StatusRow, type DutyRow, type MoveRow } from './rowTypes';
import { stText, isStatusField, stCol, ST_FIELD } from './statusCols';

/**
 * The value of field `f` of row `x` for the cell of a report on day `d` (`i`: the place of the row; `text`: the fixed
 * text of a «text» column; `o`: the format of the column, for statuses and combinations). A number, a text, or null
 * for an empty cell.
 */
export function fieldValue(
  s: AppState,
  kind: RepKind,
  x: Row,
  f: string,
  i: number,
  d: ISODate,
  text?: string,
  o?: ColOpts,
): string | number | null {
  if (f === 'aa') return i + 1;
  if (f === 'blank') return null;
  if (f === 'text') return text || null;
  if (kind === 'blank') {
    const m = blankIdx(x, i);
    const typed = m < 0 ? null : upper(String(o?.vals?.[m] ?? '').trim()) || null; // typed cells (ColOpts.vals), in capitals; they always win
    const w = (x as unknown as { bw?: WhoAt }).bw;
    if (typed || f === 'col' || !w) return typed;
    const v = fieldValue(s, w.kind, w.x as Row, f, i, d, undefined, o); // the row's person: its field on day d
    return v == null || v === ''
      ? null
      : typeof v === 'string'
        ? f === 'email' || f === 'relEmail'
          ? v
          : upper(v)
        : v; // e-mails stay as written
  }
  if (f === 'combo') {
    const c = comboOf(o);
    const vals = c.parts.map((k) => {
      const v = COMBO_NO.has(k) ? null : fieldValue(s, kind, x, k, i, d, undefined, o);
      return v == null ? '' : String(v);
    });
    return fillFmt(c.fmt, vals) || null;
  }
  if (kind === 'status') {
    const r = x as StatusRow;
    const st = r.st;
    switch (f) {
      case 'stype':
        return stText(st, o?.sf, s.settings.lists, d);
      case 'from':
        return dmy(st.from);
      case 'to':
        return st.open ? '' : dmy(st.to);
      case 'days':
        return st.open ? '' : daysBetween(st.from, st.to);
      case 'note':
        return st.note || '';
      case 'by':
        return st.by || '';
      case 'reason':
        return st.reason || '';
      case 'on':
        return st.type === 'PUN' ? dmy(st.on || st.from) : '';
    }
    return fieldValue(s, 'people', r.p, f, i, d, text, o);
  }
  if (kind === 'duty') {
    const r = x as DutyRow;
    const po = r.seat;
    switch (f) {
      case 'seat':
        return po.label;
      case 'code':
        return po.code || '';
      case 'block':
        return blockName(s, po.block);
      case 'hours':
        return po.hours || '';
      case 'armed':
        return po.armed ? 'ΝΑΙ' : '';
    }
    return r.p ? fieldValue(s, 'people', r.p, f, i, d, text, o) : null;
  }
  if (kind === 'wmove') {
    const r = x as MoveRow;
    const m = r.m;
    switch (f) {
      case 'weapon':
        return m.weapon || r.p.weapon || '';
      case 'mreason':
        return m.reason;
      case 'mout':
        return isAuto(m) ? moveOutCell(m) : when(m.outDay, m.outTime);
      case 'minr':
        return m.inReason || '';
      case 'min':
        return isAuto(m) ? moveInCell(m) : when(m.inDay, m.inTime);
      case 'mnote':
        return isAuto(m) ? 'ΑΥΤΟΜΑΤΑ' + (m.note ? ' · ' + m.note : '') : m.note || '';
    }
    return fieldValue(s, 'people', r.p, f, i, d, text, o);
  }
  if (kind === 'weapon' && f === 'inout') return inOutText(x as Person, wInfo(s, d));
  if (kind === 'cadre') {
    const c = x as Cadre;
    const nm = [c.last, c.first].filter(Boolean).join(' ');
    switch (f) {
      case 'rank':
        return rankTxt(c);
      case 'rank1':
        return c.rank;
      case 'origin':
        return c.origin || '';
      case 'spec':
        return c.spec || '';
      case 'name':
        return nm;
      case 'who':
        return [rankTxt(c), c.spec ? '(' + c.spec + ')' : '', nm].filter(Boolean).join(' ');
      case 'last':
        return c.last;
      case 'first':
        return c.first;
      case 'am':
        return c.am || '';
      case 'phone':
        return c.phone || '';
      case 'role':
        return c.role || '';
      case 'iban':
        return c.iban || '';
      case 'amka':
        return c.amka || '';
      case 'afm':
        return c.afm || '';
      case 'status':
        return cadreStatusOn(s, c.id, d)?.label || '';
      case 'cspec':
        return c.eid || '';
      case 'absent':
      case 'areason':
      case 'aret':
        return absField(absenceOfCadre(s, c, d), f);
    }
    return null;
  }
  const p = x as Person;
  if (f !== 'stype' && isStatusField(f)) return stCol(s, p.id, d, ST_FIELD[f], o?.sf, o?.st);
  switch (f) {
    case 'rank':
      return rankTxt(p);
    case 'rank1':
      return p.rank;
    case 'origin':
      return p.origin || '';
    case 'spec':
      return p.spec;
    case 'name':
      return fullName(p);
    case 'who':
      return [rankTxt(p), p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
    case 'last':
      return p.last;
    case 'first':
      return p.first;
    case 'father':
      return p.father;
    case 'asm':
      return p.asm;
    case 'phone':
      return p.phone;
    case 'room':
      return p.room;
    case 'unit': {
      const u = unitOf(p, s.settings);
      return u === '—' ? '' : u;
    }
    case 'dcode':
      return dayCode(s, p, d);
    case 'absent':
    case 'areason':
    case 'aret':
      return absField(absenceOfPerson(s, p, d), f);
    case 'email':
      return p.email || '';
    case 'relEmail':
      return p.relEmail || '';
    case 'blood':
      return p.blood || '';
    case 'iban':
      return p.iban || '';
    case 'amka':
      return p.amka || '';
    case 'afm':
      return p.afm || '';
    case 'si':
      return p.si;
    case 'post':
      return p.post || '';
    case 'role':
      return p.role || '';
    case 'essos':
      return p.essos;
    case 'dn':
      return p.dn ? 'ΝΑΙ' : '';
    case 'weapon':
      return p.weapon || '';
    case 'wtype':
      return p.wtype || '';
    case 'rack':
      return p.rack || '';
    case 'wpos':
      return p.wpos || '';
    case 'duty':
      return Object.entries(s.guards[d] || {})
        .filter(([, pid]) => pid === p.id)
        .map(([key]) => postBy(s, key)?.label || '')
        .filter(Boolean)
        .join(', ');
    case 'notes':
      return p.notes;
  }
  return null;
}
