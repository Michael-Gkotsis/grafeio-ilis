// Mock units for the back side and the loose texts of the front (4b), each with GROUND TRUTH: where every section's rows are, which cells must never change.
// Built on genFillMock (the front table) plus: a back sheet in one of the forms of the real units (our 6 sections · the 2-group 7-section form · sections without
// numbers), 'right' layout (label, value cell next to it) or 'below' (rows under the label), a decision column (ΕΙΣΗΓΗΣΗ / ΑΠΟΦΑΣΗ) and «ΕΛΑΒΑ ΓΝΩΣΗ) next to the sections,
// missing sections, small sections that overflow, with or without a continuation sheet (ΕΠΕΚΤΑΣΗ ΣΕΛΙΔΑΣ), a filled worked-example sheet next to the blank back,
// title / date / signature variants with blank parts, Λόχος words. Made-up names only.
import ExcelJS from 'exceljs';
import { genFillMock, type FillMock } from './mockgen';
import { rng, int, pick, chance, shuffle } from './tplgen';
import { upper } from '../src/shared/text';
import type { SecId } from '../src/shared/backForm';
import type { AppState } from '../src/shared/domain';
import type { ISODate } from '../src/shared/dates';

export interface BackFlags {
  form: 'six' | 'two' | 'bare'; layout: 'right' | 'below'; decision: boolean; drop: SecId[]; rows: number; cont: boolean; example: boolean;
  title: number; dateLine: number; sigs: boolean; lochos: boolean; num: 'arabic' | 'greek'; dateFmt: 'hk' | 'slash' | 'slash4'; line: 'app' | 'person'; ample: boolean;
}
export interface BackMock {
  seed: number; fill: FillMock; buf: Buffer; s: AppState; date: ISODate; flags: BackFlags; desc: string[];
  back: string; cont: string | null;
  sections: { id: SecId; text: string; label: { r: number; c: number }; rows: { r: number; c: number }[] }[];   // the rows under (or the value cell next to) the label, 0-based
  contRows: { r: number; c: number }[];
  forbidden: Set<string>;                                  // 'sheet|r:c' that must stay exactly as they are (labels, decision columns, ΕΛΑΒΑ ΓΝΩΣΗ, example sheet)
  allowed: Set<string>;                                    // every other cell that may change on the back and continuation sheets (left-column blocks)
  front: { title?: { r: number; c: number; was: string; want: string }; date?: { r: number; c: number; was: string; want: string }; sigs: { r: number; c: number; was: string; want: string }[] };
}
const SECTION_TEXT: Record<SecId, string> = { enroll: 'ΕΓΓΡΑΦΕΣ', delete: 'ΔΙΑΓΡΑΦΕΣ', leaves: 'ΑΔΕΙΕΣ', punish: 'ΠΟΙΝΕΣ', requests: 'ΑΙΤΗΣΕΙΣ', misc: 'ΛΟΙΠΑ', reports: 'ΑΝΑΦΟΡΕΣ', absences: 'ΑΠΟΥΣΙΕΣ' };
const BORDER = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } as const;
const dd = (d: ISODate) => d.slice(8, 10) + '/' + d.slice(5, 7);

// the people of the day: moves, a punishment, a request, a leave, a hospital entry, free text (so every section has something to write)
export function withBackData(s: AppState, d: ISODate, r: () => number): AppState {
  const ps = s.people.filter(p => p.active); const n = ps.length;
  const people = s.people.map(p => ({ ...p }));
  const idx = (i: number) => people.findIndex(p => p.id === ps[i % n].id);
  const nIn = int(r, 1, 4), nOut = int(r, 1, 4);
  for (let i = 0; i < nIn; i++) people[idx(i)].inOn = d;
  for (let i = 0; i < nOut; i++) { const k = idx(i + 5); people[k].outOn = d; people[k].notes = 'Εκτός δύναμης: μετάθεση'; }
  const statuses = [...s.statuses.filter(x => !(x.from === d && ['PUN', 'LEAVE', 'NOS', 'SICK', 'HON'].includes(x.type)))];
  const nPun = int(r, 1, 4), nLv = int(r, 1, 4);
  for (let i = 0; i < nPun; i++) statuses.push({ id: 'bp' + i, pid: ps[(i + 8) % n].id, type: 'PUN', from: d, to: d, kind: 'Κράτηση', by: 'ΔΚΤΗ ΙΛΗΣ', reason: 'ΑΠΟΥΣΙΑ ΑΠΟ ΤΗΝ ΕΚΠΑΙΔΕΥΣΗ ΧΩΡΙΣ ΑΔΕΙΑ ΚΑΙ ΜΕ ΜΕΓΑΛΗ ΛΕΠΤΟΜΕΡΕΙΑ ΣΤΗΝ ΑΙΤΙΟΛΟΓΙΑ ' + i, on: d, days: 1 + i } as never);
  for (let i = 0; i < nLv; i++) statuses.push({ id: 'bl' + i, pid: ps[(i + 11) % n].id, type: 'LEAVE', from: d, to: d.slice(0, 8) + String(Math.min(28, +d.slice(8) + 3 + i)).padStart(2, '0'), kind: 'Κανονική' } as never);
  statuses.push({ id: 'bn0', pid: ps[2 % n].id, type: 'NOS', from: d, to: d } as never);
  const requests = [...s.requests.filter(x => x.date !== d)];
  for (let i = 0; i < int(r, 1, 3); i++) requests.push({ id: 'rq' + i, pid: ps[(i + 3) % n].id, date: d, text: 'ΑΙΤΕΙΤΑΙ ΕΞΟΔΟ ΤΟ ΣΑΒΒΑΤΟ ΜΕ ΜΕΓΑΛΟ ΚΕΙΜΕΝΟ ΓΙΑ ΝΑ ΧΡΕΙΑΣΤΕΙ ΑΛΛΗ ΓΡΑΜΜΗ ' + i } as never);
  const hm = { ...(s.hkaiManual || {}) }; hm[d] = { ...(hm[d] || {}), text: { ...(hm[d]?.text || {}), loi: 'ΑΝΑΤΙΘΕΝΤΑΙ ΚΑΘΗΚΟΝΤΑ ΣΤΟΝ ΣΤΡ ΔΕΙΓΜΑΤΟΣ' } } as never;
  return { ...s, people, statuses, requests, hkaiManual: hm };
}

export async function genBackMock(seed: number, force: Partial<BackFlags> = {}): Promise<BackMock> {
  const r = rng(seed * 7919 + 13);
  const fill = await genFillMock(seed, { countifs: false, lochos: force.lochos ?? chance(r, 0.25) });
  const form = force.form ?? pick(r, ['six', 'six', 'two', 'bare'] as const);
  const decision = force.decision ?? chance(r, 0.4);
  const flags: BackFlags = {
    form, decision, layout: decision ? 'below' : force.layout ?? pick(r, ['right', 'below', 'below'] as const),
    drop: force.drop ?? [], rows: force.rows ?? int(r, 2, 14), cont: force.cont ?? chance(r, 0.5), example: force.example ?? chance(r, 0.3),
    title: force.title ?? int(r, 0, 3), dateLine: force.dateLine ?? int(r, 0, 2), sigs: force.sigs ?? chance(r, 0.6), lochos: fill.flags.lochos,
    num: force.num ?? pick(r, ['arabic', 'greek'] as const), dateFmt: force.dateFmt ?? pick(r, ['hk', 'slash', 'slash4'] as const), line: force.line ?? pick(r, ['app', 'person'] as const), ample: force.ample ?? chance(r, 0.4)
  };
  if (!force.drop && chance(r, 0.35)) flags.drop = shuffle(r, form === 'two' ? ['enroll', 'delete', 'misc', 'requests', 'reports', 'absences', 'punish'] as SecId[] : ['enroll', 'delete', 'leaves', 'punish', 'requests', 'misc'] as SecId[]).slice(0, int(r, 1, 2));
  let order: SecId[] = form === 'two' ? ['enroll', 'delete', 'misc', 'requests', 'reports', 'absences', 'punish'] : ['enroll', 'delete', 'leaves', 'punish', 'requests', 'misc'];
  order = order.filter(x => !flags.drop.includes(x));
  const desc = [JSON.stringify(flags)];
  const d = fill.date; const s = withBackData(fill.s, d, r);
  // ---- the workbook: the front of the fill mock + the back sheet(s)
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fill.buf as never);
  const front = wb.getWorksheet(fill.sheet)!; const forbidden = new Set<string>(); const allowed = new Set<string>(); const frontOut: BackMock['front'] = { sigs: [] };
  const unit = s.settings.unitName; const kindWord = flags.lochos ? 'ΛΟΧΟΥ' : 'ΙΛΗΣ';
  // title (row 1, above the table: the mock's table starts at row ≥ 3)
  const upU = unit.toUpperCase();
  const slash2 = d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(2, 4), slash4 = d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const hkd = d.slice(8, 10) + ' ' + ['ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΙ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ'][+d.slice(5, 7) - 1] + ' ' + d.slice(2, 4);
  const T: [string, string][] = [
    ['Ημερήσια αναφορά της ____ της / / ', 'Ημερήσια αναφορά της ' + upU + ' της ' + (flags.dateFmt === 'slash4' ? slash4 : slash2) + ' '],
    ['ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ ΤΗΣ ________ ΤΗΣ __/__/20__', 'ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ ΤΗΣ ' + upU + ' ΤΗΣ ' + slash4],
    ['Ημερήσια αναφορά της ' + (kindWord === 'ΙΛΗΣ' ? '4ης ΙΛΗΣ' : '2ου ΛΟΧΟΥ') + ' της 01/01/2020', 'Ημερήσια αναφορά της ' + (kindWord === 'ΙΛΗΣ' ? '4ης ΙΛΗΣ' : '2ου ΛΟΧΟΥ') + ' της ' + slash4],
    ['Ημερήσια αναφορά της ΙΛΗΣ της 07 ΣΕΠ 10', 'Ημερήσια αναφορά της ΙΛΗΣ της ' + hkd]
  ];
  const [tWas, tWant] = T[flags.title];
  front.getCell(1, 1).value = tWas; frontOut.title = { r: 0, c: 0, was: tWas, want: tWant };
  const lastRow = front.rowCount;
  const placeUp = upper(s.settings.place);
  const D: [string, string][] = [['Αυλώνας,  /  /  ', s.settings.place + ', ' + (flags.dateFmt === 'slash4' ? slash4 : slash2)], ['____,  /  /  ', placeUp + ', ' + (flags.dateFmt === 'slash4' ? slash4 : slash2)], ['Αυλώνας, 25/09/26', s.settings.place + ', ' + slash2]];
  // the mock already has «Αυλώνας, 25/09/26» somewhere: this variant replaces it, the others add a line of their own below the table
  const [dWas, dWant] = D[flags.dateLine];
  if (flags.dateLine !== 2) { front.getCell(lastRow + 2, 1).value = dWas; frontOut.date = { r: lastRow + 1, c: 0, was: dWas, want: dWant }; }
  if (flags.sigs) {
    const t1 = 'Ο ΑΛΧΙΑΣ ' + kindWord, t2 = 'Ο ΔΚΤΗΣ ' + kindWord;
    const row = lastRow + 5;
    front.getCell(row, 1).value = t1; front.getCell(row + 2, 1).value = '________________'; front.getCell(row, 4).value = t2; front.getCell(row + 3, 4).value = '.................';
    frontOut.sigs.push({ r: row + 1, c: 0, was: '________________', want: 'ΛΧΙΑΣ ΔΕΙΓΜΑΤΟΣ ΑΛΦΑ' }, { r: row + 2, c: 3, was: '.................', want: 'ΛΓΟΣ ΔΕΙΓΜΑΤΟΣ ΒΗΤΑ' });
  }
  // ---- the back sheet
  const nameBack = pick(r, ['ΠΙΣΩ ΟΨΗ', 'ΠΑΡΑΓΡΑΦΟΙ ΣΕΛΙΔΑΣ', 'ΜΕΤΑΒΟΛΕΣ ' + seed]);
  const mkBack = (name: string) => {
    const ws = wb.addWorksheet(name); const sections: BackMock['sections'] = []; const own = new Set<string>();
    const mark = (set: Set<string>, rr: number, cc: number) => set.add(name + '|' + rr + ':' + cc);
    ws.getColumn(1).width = 22; for (let c = 2; c <= 4; c++) ws.getColumn(c).width = 12; ws.getColumn(5).width = 3;
    const F = 5; ws.getColumn(F + 1).width = flags.ample ? 70 : 38;    // text column (F, 0-based 5)
    ws.getColumn(F + 2).width = 18; ws.getColumn(F + 3).width = 18; ws.getColumn(F + 4).width = 18;
    const put = (rr: number, cc: number, v: string, forb = true) => { ws.getCell(rr + 1, cc + 1).value = v; if (forb) mark(forbidden, rr, cc); };
    // left column: officers of the day (the cells under the labels may be written), a vehicles heading, the fixed texts (never written)
    put(2, 0, 'ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ'); put(3, 0, 'ΑΞΙΩΜΑΤΙΚΟΙ:'); mark(allowed, 4, 0); put(5, 0, 'ΥΠΑΞΙΩΜΑΤΙΚΟΙ:'); mark(allowed, 6, 0); mark(allowed, 7, 0);
    put(9, 0, 'ΣΥΣΣΙΤΙΟ ΟΠΛΙΤΩΝ'); put(10, 0, 'ΠΡΩΙΝΟ'); put(11, 0, 'ΟΠΛΙΣΜΟΣ'); put(12, 0, 'Αναφέρεται πληρότητα οπλισμού, πυρ/κών και λοιπών ελκυστικών υλικών.');
    let row = 0;
    put(row, F, 'ΜΕΤΑΒΟΛΕΣ - ΑΙΤΗΣΕΙΣ'); if (flags.decision) put(row, F + 3, 'ΕΛΑΒΑ ΓΝΩΣΗ'); row++;
    let n = 0;
    const group = (t: string) => { put(row, F, t); row++; };
    for (const [i, id] of order.entries()) {
      if (flags.form === 'two' && (i === 0 || id === 'requests')) group(['enroll', 'delete', 'misc'].includes(id) ? 'ΟΜΑΔΑ Α΄ - ΣΤΡΑΤΟΛΟΓΙΚΕΣ ΜΕΤΑΒΟΛΕΣ' : 'ΟΜΑΔΑ Β΄ - ΔΙΟΙΚΗΤΙΚΕΣ ΜΕΤΑΒΟΛΕΣ');
      n = flags.form === 'two' ? (['enroll', 'delete', 'misc'].includes(id) ? ['enroll', 'delete', 'misc'].filter(x => order.includes(x as SecId)).indexOf(id) : ['requests', 'reports', 'absences', 'punish'].filter(x => order.includes(x as SecId)).indexOf(id)) + 1 : i + 1;
      const label = (flags.form === 'bare' ? '' : n + '. ') + SECTION_TEXT[id] + (flags.form === 'bare' ? '' : ':');
      put(row, F, label);
      if (flags.decision) { put(row, F + 1, 'ΕΙΣΗΓΗΣΗ (ΥΔΚΤΟΥ)'); put(row, F + 2, 'ΑΠΟΦΑΣΗ (ΔΚΤΟΥ)'); }
      const sec: BackMock['sections'][number] = { id, text: label, label: { r: row, c: F }, rows: [] };
      if (flags.layout === 'right' && !flags.decision) {
        const h = Math.max(1, Math.min(flags.rows, 4)); ws.mergeCells(row + 1, F + 2, row + h, F + 4);   // the value cell G:I next to the label (tall)
        sec.rows = [{ r: row, c: F + 1 }]; ws.getCell(row + 1, F + 2).border = BORDER; row += h;
      } else {
        const h = flags.rows;
        for (let k = 0; k < h; k++) { sec.rows.push({ r: row + 1 + k, c: F }); ws.getCell(row + 2 + k, F + 1).border = BORDER; if (flags.decision) { mark(forbidden, row + 1 + k, F + 1); mark(forbidden, row + 1 + k, F + 2); } }
        row += h + 1;
      }
      sections.push(sec);
    }
    void own;
    put(row, F, 'ΥΠΟΓΡΑΦΕΣ');
    return { ws, sections };
  };
  // fix the 'right' layout cell mapping: label in F, the merged value cell is G:I on the rows under the label
  const main = mkBack(nameBack);
  const sections = main.sections;
  if (flags.example) { const ex = mkBack('ΜΕΤΑΒΟΛΕΣ ΠΑΡΑΔΕΙΓΜΑ'); for (const sx of ex.sections) for (const rr of sx.rows) { ex.ws.getCell(rr.r + 1, rr.c + 1).value = 'ΠΑΡΑΔΕΙΓΜΑ ΜΕ ΚΕΙΜΕΝΟ ΤΟΥ ΥΠΟΔΕΙΓΜΑΤΟΣ'; forbidden.add('ΜΕΤΑΒΟΛΕΣ ΠΑΡΑΔΕΙΓΜΑ|' + rr.r + ':' + rr.c); } }
  // ---- the continuation sheet
  let cont: string | null = null; const contRows: { r: number; c: number }[] = [];
  if (flags.cont) {
    cont = 'ΕΠΕΚΤΑΣΗ ΣΕΛΙΔΑΣ'; const cs = wb.addWorksheet(cont); cs.getColumn(6).width = flags.ample ? 70 : 38;
    cs.getCell(1, 6).value = 'ΜΕΤΑΒΟΛΕΣ'; cs.getCell(1, 7).value = 'ΕΙΣΗΓΗΣΗ (ΥΔΚΤΟΥ)'; cs.getCell(1, 8).value = 'ΑΠΟΦΑΣΗ (ΔΚΤΟΥ)';
    forbidden.add(cont + '|0:5'); forbidden.add(cont + '|0:6'); forbidden.add(cont + '|0:7');
    const cn = int(r, 8, 24); for (let k = 0; k < cn; k++) { contRows.push({ r: 1 + k, c: 5 }); cs.getCell(2 + k, 6).border = BORDER; forbidden.add(cont + '|' + (1 + k) + ':6'); forbidden.add(cont + '|' + (1 + k) + ':7'); }
    cs.getCell(cn + 3, 1).value = 'Ο ΑΛΧΙΑΣ ' + kindWord; forbidden.add(cont + '|' + (cn + 2) + ':0');
  }
  // the decision columns on the back sheet stay forbidden below every section's rows too
  if (flags.decision) for (const sx of sections) { void sx; }
  desc.push('sections=' + order.join(',') + ' rows=' + flags.rows);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  // settings: the format of a line goes to the profile (via the test), the signatures to the settings
  const sigsSet = flags.sigs ? { sigs: { hkai: [{ art: 'Ο', title: 'ΑΛΧΙΑΣ ' + kindWord, name: 'Λχιας Δείγματος Άλφα' }, { art: 'Ο', title: 'ΔΚΤΗΣ ' + kindWord, name: 'Λγος Δείγματος Βήτα' }] } } : {};
  const s2: AppState = { ...s, settings: { ...s.settings, ...sigsSet } as never };
  void dd;
  return { seed, fill, buf, s: s2, date: d, flags, desc, back: nameBack, cont, sections, contRows, forbidden, allowed, front: frontOut };
}
