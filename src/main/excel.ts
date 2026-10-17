// Ό,τι χρειάζεται τη βιβλιοθήκη ExcelJS (βαριά): ο μηνιαίος έλεγχος υπηρεσιών (νέο αρχείο από την αρχή).
// Η ανάγνωση των Excel (Δυναμολόγιο, Αρχεία Excel) γίνεται πια με το ελαφρύ xlsx.ts.
// Χτίζεται ως χωριστό αρχείο και φορτώνεται μόνο όταν χρειαστεί (όριο μνήμης 2 GB, 12 §5).
import ExcelJS from 'exceljs';
import { MONTHS, dmy, parseD, type ISODate } from '../shared/dates';
import { rosterSheets } from '../shared/rosterLists';
import { norm, collator, upper } from '../shared/text';
import { fatherTxt, type AppState, type DutyKind } from '../shared/domain';
import { absCode } from '../shared/ranks';
import { bareOf, codeOf } from '../shared/codes';
import { activePeople, isHol, postBy, statusesOn } from '../shared/rules';

// Μηνιαίο πλέγμα «Έλεγχος υπηρεσιών» (δείγμα 03): άτομα × ημέρες με κωδικό θέσης, γκρι ΣΚ/αργίες
export async function dutyCheck(s: AppState, ym: string): Promise<{ name: string; data: Buffer }> {
  const [y, m] = ym.split('-').map(Number);
  const nd = new Date(y, m, 0).getDate();
  const days: ISODate[] = Array.from({ length: nd }, (_, i) => ym + '-' + String(i + 1).padStart(2, '0'));
  // ο κωδικός της θέσης (Θ1α, Μ2…) και το είδος της, για τα σύνολα· υπηρεσία χωρίς θέση (από Excel): το σκέτο γράμμα
  const per = new Map<number, Map<ISODate, { code: string; kind: DutyKind }>>();
  const set = (pid: number, d: ISODate, v: { code: string; kind: DutyKind }) => { if (!per.has(pid)) per.set(pid, new Map()); per.get(pid)!.set(d, v); };
  for (const d of days) {
    for (const e of s.dutyLog?.[d] || []) set(e.pid, d, { code: bareOf(undefined, e.kind), kind: e.kind });
    const g = s.guards[d] || {};
    for (const k in g) { const p = postBy(s, k); if (p) set(g[k], d, { code: codeOf(s.settings, k, p.kind), kind: p.kind }); }
  }
  const wb = new ExcelJS.Workbook(); wb.creator = 'Γραφείο Λοχία';
  // Σταθερή ημερομηνία στις ιδιότητες του αρχείου: με τα ίδια δεδομένα βγαίνει το ίδιο αρχείο, οπότε η αυτόματη
  // ενημέρωση δεν το ξαναγράφει σε κάθε αλλαγή της εφαρμογής (αλλιώς άλλαζε μόνο το docProps/core.xml)
  wb.created = wb.modified = new Date(Date.UTC(y, m - 1, 1));
  const ws = wb.addWorksheet('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', xSplit: 4, ySplit: 3 }]
  });
  const FIX = ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ'];
  const TAIL = ['ΘΑΛ.', 'ΣΥΝ.', 'ΑΡΓ.', 'Θ', 'Μ', 'ΛΥ'];
  const W = FIX.length + nd + TAIL.length;
  ws.mergeCells(1, 1, 1, W);
  ws.getCell(1, 1).value = 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(MONTHS[m - 1]) + ' ' + y;
  ws.getCell(1, 1).font = { bold: true, size: 14, underline: true }; ws.getCell(1, 1).alignment = { horizontal: 'center' };
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const gray = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9D9D9' } };
  const head = ws.getRow(3);
  [...FIX, ...days.map(d => String(parseD(d).getDate())), ...TAIL].forEach((t, i) => {
    const c = head.getCell(i + 1); c.value = t; c.font = { bold: true, size: 9 }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = border;
    if (i >= FIX.length && i < FIX.length + nd && isHol(s.settings, days[i - FIX.length])) c.fill = gray;
  });
  const people = activePeople(s).slice().sort((a, b) => (a.room ?? 99) - (b.room ?? 99) || collator.compare(a.last, b.last));
  people.forEach((p, i) => {
    const row = ws.getRow(4 + i); const x = per.get(p.id) || new Map<ISODate, { code: string; kind: DutyKind }>();
    let hol = 0; const c: Record<string, number> = {};
    const vals: (string | number)[] = [i + 1, p.rank, p.last, p.first + fatherTxt(p)];
    for (const d of days) {
      const v = x.get(d);
      if (v) { if (isHol(s.settings, d)) hol++; c[v.kind] = (c[v.kind] || 0) + 1; vals.push(v.code); continue; }
      // απουσία: μικρός κωδικός του ημερολογίου κωλυομένων (Κ.Α, ΑΝ.ΑΔ, Ε.Υ…) για να φαίνεται γιατί δεν έχει υπηρεσία
      const st = statusesOn(s.statuses, p.id, d).find(t => absCode(t, s.settings.lists));
      vals.push(st ? absCode(st, s.settings.lists)! : '');
    }
    vals.push(p.room ?? '', x.size, hol, c.th || '', c.mg || '', c.ly || '');
    vals.forEach((v, j) => {
      const cell = row.getCell(j + 1); cell.value = v; cell.border = border; cell.font = { size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (j >= FIX.length && j < FIX.length + nd) {
        if (isHol(s.settings, days[j - FIX.length])) cell.fill = gray;
        if (typeof v === 'string' && v.includes('.')) cell.font = { size: 7, italic: true, color: { argb: 'FF666666' } };
        else if (v) cell.font = { size: 9, bold: true };
      }
    });
  });
  ws.getColumn(1).width = 4; ws.getColumn(2).width = 7; ws.getColumn(3).width = 18; ws.getColumn(4).width = 13;
  for (let j = 0; j < nd; j++) ws.getColumn(FIX.length + 1 + j).width = 3.6;
  for (let j = 0; j < TAIL.length; j++) ws.getColumn(FIX.length + nd + 1 + j).width = 5;
  const foot = 5 + people.length;
  ws.getCell(foot, 1).value = 'Θ1α… θαλαμοφύλακας (θέση) · Μ1… μαγειρεία · ΛΥ / ΔΥ · σκέτο γράμμα: χωρίς θέση · γκρι: ΣΚ και αργίες · πλάγια: λόγος απουσίας (Κ.Α άδεια, ΑΝ.ΑΔ αναρρωτική, Ε.Υ, Ε.Α)';
  ws.getCell(foot, 1).font = { size: 8, italic: true };
  ws.pageSetup.printTitlesRow = '3:3';
  const data = Buffer.from(await wb.xlsx.writeBuffer());
  return { name: 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(MONTHS[m - 1]) + ' ' + y + '.xlsx', data };
}

// Δυναμολόγιο και καταστάσεις (Michael, 17/10): ένα Excel, ένα φύλλο ανά φίλτρο της οθόνης (Όλοι, Άδειες, Τιμωρημένοι,
// Πόστα, Εκτός δύναμης, Με δικαίωμα ΔΝ), για μία ημερομηνία. Όλα με κεφαλαία, όπως ό,τι γράφει η εφαρμογή στα Excel.
export async function rosterLists(s: AppState, d: ISODate): Promise<{ name: string; data: Buffer }> {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Γραφείο Λοχία';
  wb.created = wb.modified = new Date(d + 'T00:00:00Z');
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  for (const sh of rosterSheets(s, d)) {
    const ws = wb.addWorksheet(sh.name, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
      views: [{ state: 'frozen', ySplit: 3 }]
    });
    const W = sh.head.length;
    ws.mergeCells(1, 1, 1, W);
    const t = ws.getCell(1, 1); t.value = upper(sh.title + ' · ' + s.settings.unitName); t.font = { bold: true, size: 13, underline: true }; t.alignment = { horizontal: 'center' };
    sh.head.forEach((h, i) => { const c = ws.getRow(3).getCell(i + 1); c.value = h; c.font = { bold: true, size: 10 }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border; });
    sh.rows.forEach((r, j) => r.forEach((v, i) => {
      const c = ws.getRow(4 + j).getCell(i + 1); c.value = typeof v === 'string' ? upper(v) : v;
      c.font = { size: 10 }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = border;
    }));
    if (!sh.rows.length) { ws.mergeCells(4, 1, 4, W); const c = ws.getCell(4, 1); c.value = 'ΚΑΝΕΝΑΣ'; c.alignment = { horizontal: 'center' }; c.font = { italic: true, size: 10 }; }
    const width: Record<string, number> = { 'Α/Α': 5, 'ΒΑΘΜΟΣ': 9, 'Ο/Σ': 8, 'ΕΠΙΘΕΤΟ': 18, 'ΟΝΟΜΑ': 14, 'ΠΑΤΡΩΝΥΜΟ': 14, 'ΑΣΜ': 13, 'ΤΗΛΕΦΩΝΟ': 13, 'ΘΑΛΑΜΟΣ': 9, 'ΠΟΣΤΟ': 14, 'ΡΟΛΟΣ': 14, 'Σ.Ι.': 14, 'ΔΙΚΑΙΩΜΑ ΔΝ': 10, 'ΕΙΔΟΣ': 18, 'ΑΠΟ': 11, 'ΕΩΣ': 11, 'ΠΑΡΑΤΗΡΗΣΗ': 22 };
    sh.head.forEach((h, i) => { ws.getColumn(i + 1).width = width[h] || 12; });
    ws.pageSetup.printTitlesRow = '3:3';
  }
  const data = Buffer.from(await wb.xlsx.writeBuffer());
  return { name: 'ΔΥΝΑΜΟΛΟΓΙΟ ΚΑΤΑΣΤΑΣΕΙΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data };
}
