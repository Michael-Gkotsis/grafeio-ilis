// Ό,τι χρειάζεται τη βιβλιοθήκη ExcelJS (βαριά): ο μηνιαίος έλεγχος υπηρεσιών (νέο αρχείο από την αρχή).
// Η ανάγνωση των Excel (Δυναμολόγιο, Αρχεία Excel) γίνεται πια με το ελαφρύ xlsx.ts.
// Χτίζεται ως χωριστό αρχείο και φορτώνεται μόνο όταν χρειαστεί (όριο μνήμης 2 GB, 12 §5).
import ExcelJS from 'exceljs';
import { MONTHS, dmy, hkDate, nowMin, parseD, today, type ISODate } from '../shared/dates';
import { rosterSheets, type RosterSheet } from '../shared/rosterLists';
import { W_NUM, weaponSheets } from '../shared/weapons';
import { cadreSheets } from '../shared/cadre';
import { norm, collator, upper } from '../shared/text';
import { fatherTxt, type AppState, type DutyKind } from '../shared/domain';
import { absCode } from '../shared/ranks';
import { bareOf, codeOf } from '../shared/codes';
import { activePeople, isHol, postBy, statusesFrom, DUTY_START } from '../shared/rules';
import { fitBook } from './xlsx';
import { widthChars } from './textfit';
import { xlLook } from '../shared/xlLook';

// Γράμματα και στοίχιση από τις Ρυθμίσεις › Γράμματα Excel (προεπιλογή Arial 12, στο κέντρο). Η γραμματοσειρά με όνομα σε
// κάθε κελί: χωρίς αυτό το LibreOffice (και ό,τι δεν είναι Excel) δείχνει άλλη, πιο φαρδιά. Τίτλος 2 μεγέθη μεγαλύτερος.
// min: πλάτος στήλης για γράμματα 10, μεγαλώνει μαζί με τα γράμματα
function lookOf(s: AppState) {
  const L = xlLook(s.settings);
  const al = { horizontal: L.h, vertical: L.v === 'center' ? 'middle' as const : L.v };
  // Πλάτος στήλης: όσο θέλει το μεγαλύτερο κείμενό της (από min ως max)· ό,τι περισσεύει μικραίνει ή αναδιπλώνεται στο fitBook
  const fitWidth = (min: number, vals: unknown[], max = 40, b = false) =>
    Math.round(Math.min(max, Math.max(min * L.sz / 10, ...vals.map(v => (v == null || v === '' ? 0 : widthChars(upper(String(v)), { name: L.font, sz: L.sz, b }))))) * 10) / 10;
  // στήλη πίνακα: χωράει και την επικεφαλίδα (έντονη) στο μέγεθος των ρυθμίσεων, για να μη μικραίνει στο fitBook
  const colWidth = (min: number, head: string, vals: unknown[], b = false) => Math.max(fitWidth(min, vals, 40, b), fitWidth(0, [head], 30, true));
  return { F: L.font, Z: L.sz, al, fitWidth, colWidth };
}

const BASE_KINDS: DutyKind[] = ['th', 'mg', 'ly'];
// Μηνιαίο πλέγμα «Έλεγχος υπηρεσιών» (δείγμα 03): άτομα × ημέρες με κωδικό θέσης, γκρι ΣΚ/αργίες
export async function dutyCheck(s: AppState, ym: string): Promise<{ name: string; data: Buffer }> {
  const [y, m] = ym.split('-').map(Number);
  const nd = new Date(y, m, 0).getDate();
  const days: ISODate[] = Array.from({ length: nd }, (_, i) => ym + '-' + String(i + 1).padStart(2, '0'));
  // ο κωδικός της θέσης (Θ1α, Μ2…) και το είδος της, για τα σύνολα· υπηρεσία χωρίς θέση (από Excel): το σκέτο γράμμα
  // δικές σου υπηρεσίες που δεν μετρούν σε καμία από τις στήλες Θ, Μ, ΛΥ (π.χ. «Πύλη»): δική τους στήλη στο τέλος, με το
  // όνομά τους (ίδιο όνομα στα δύο έντυπα = μία στήλη)
  const ownOf = new Map<string, string>();
  for (const b of [...(s.settings.blocks || []), ...(s.settings.blocksSpen || [])]) if (b.custom && !b.hidden && !BASE_KINDS.includes(b.kind)) ownOf.set(b.id, norm(b.name));
  const OWN = [...new Set(ownOf.values())];
  const per = new Map<number, Map<ISODate, { code: string; kind: DutyKind; own?: string }>>();
  const set = (pid: number, d: ISODate, v: { code: string; kind: DutyKind; own?: string }) => { if (!per.has(pid)) per.set(pid, new Map()); per.get(pid)!.set(d, v); };
  for (const d of days) {
    for (const e of s.dutyLog?.[d] || []) set(e.pid, d, { code: bareOf(undefined, e.kind), kind: e.kind });
    const g = s.guards[d] || {};
    for (const k in g) { const p = postBy(s, k); if (p) set(g[k], d, { code: codeOf(s.settings, k, p.kind), kind: p.kind, own: ownOf.get(p.block) }); }
  }
  const { F, Z, al, fitWidth, colWidth } = lookOf(s);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Γραφείο Λοχία';
  // Σταθερή ημερομηνία στις ιδιότητες του αρχείου: με τα ίδια δεδομένα βγαίνει το ίδιο αρχείο, οπότε η αυτόματη
  // ενημέρωση δεν το ξαναγράφει σε κάθε αλλαγή της εφαρμογής (αλλιώς άλλαζε μόνο το docProps/core.xml)
  wb.created = wb.modified = new Date(Date.UTC(y, m - 1, 1));
  const ws = wb.addWorksheet('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', xSplit: 4, ySplit: 3 }]
  });
  const FIX = ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ'];
  const TAIL = ['ΘΑΛ.', 'ΣΥΝ.', 'ΑΡΓ.', 'Θ', 'Μ', 'ΛΥ', ...OWN];
  const W = FIX.length + nd + TAIL.length;
  ws.mergeCells(1, 1, 1, W);
  ws.getCell(1, 1).value = 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(MONTHS[m - 1]) + ' ' + y;
  ws.getCell(1, 1).font = { name: F, bold: true, size: Z + 2, underline: true }; ws.getCell(1, 1).alignment = { horizontal: 'center' };
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const gray = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9D9D9' } };
  const head = ws.getRow(3);
  [...FIX, ...days.map(d => String(parseD(d).getDate())), ...TAIL].forEach((t, i) => {
    const c = head.getCell(i + 1); c.value = t; c.font = { name: F, bold: true, size: Z }; c.alignment = { ...al, wrapText: true }; c.border = border;
    if (i >= FIX.length && i < FIX.length + nd && isHol(s.settings, days[i - FIX.length])) c.fill = gray;
  });
  const people = activePeople(s).slice().sort((a, b) => (a.room ?? 99) - (b.room ?? 99) || collator.compare(a.last, b.last));
  people.forEach((p, i) => {
    const row = ws.getRow(4 + i); const x = per.get(p.id) || new Map<ISODate, { code: string; kind: DutyKind; own?: string }>();
    let hol = 0; const c: Record<string, number> = {}; const o: Record<string, number> = {};
    const vals: (string | number)[] = [i + 1, upper(p.rank), upper(p.last), upper(p.first + fatherTxt(p))];
    for (const d of days) {
      const v = x.get(d);
      if (v) { if (isHol(s.settings, d)) hol++; c[v.kind] = (c[v.kind] || 0) + 1; if (v.own) o[v.own] = (o[v.own] || 0) + 1; vals.push(v.code); continue; }
      // απουσία: μικρός κωδικός του ημερολογίου κωλυομένων (Κ.Α, ΑΝ.ΑΔ, Ε.Υ…) για να φαίνεται γιατί δεν έχει υπηρεσία
      const st = statusesFrom(s.statuses, p.id, d, DUTY_START).find(t => absCode(t, s.settings.lists));
      vals.push(st ? absCode(st, s.settings.lists)! : '');
    }
    vals.push(p.room ?? '', x.size, hol, c.th || '', c.mg || '', c.ly || '', ...OWN.map(n => o[n] || ''));
    vals.forEach((v, j) => {
      const cell = row.getCell(j + 1); cell.value = v; cell.border = border; cell.font = { name: F, size: Z };
      cell.alignment = al;
      if (j >= FIX.length && j < FIX.length + nd) {
        if (isHol(s.settings, days[j - FIX.length])) cell.fill = gray;
        if (typeof v === 'string' && v.includes('.')) cell.font = { name: F, size: Math.max(6, Z - 2), italic: true, color: { argb: 'FF666666' } };
        else if (v) cell.font = { name: F, size: Z, bold: true };
      }
    });
  });
  ws.getColumn(1).width = fitWidth(4, [people.length]); [7, 18, 13].forEach((w, j) => { ws.getColumn(j + 2).width = Math.min(30, colWidth(w, FIX[j + 1], people.map(p => [p.rank, p.last, p.first + fatherTxt(p)][j]))); });
  // ημέρες: όσο θέλει ο μεγαλύτερος κωδικός της στήλης (έντονος), ως 8
  for (let j = 0; j < nd; j++) { const d = days[j]; ws.getColumn(FIX.length + 1 + j).width = fitWidth(3.2, people.map(p => per.get(p.id)?.get(d)?.code), 8, true); }
  for (let j = 0; j < TAIL.length; j++) ws.getColumn(FIX.length + nd + 1 + j).width = j < 6 ? fitWidth(4.5, [TAIL[j]], 8, true) : fitWidth(4.5, [TAIL[j]], 14, true);
  const foot = 5 + people.length;
  ws.getCell(foot, 1).value = 'Θ1α… θαλαμοφύλακας (θέση) · Μ1… μαγειρεία · ΛΥ / ΔΥ · σκέτο γράμμα: χωρίς θέση · γκρι: ΣΚ και αργίες · πλάγια: λόγος απουσίας (Κ.Α άδεια, ΑΝ.ΑΔ αναρρωτική, Ε.Υ, Ε.Α)';
  ws.getCell(foot, 1).font = { name: F, size: Math.max(7, Z - 2), italic: true };
  ws.pageSetup.printTitlesRow = '3:3';
  const data = await fitBook(Buffer.from(await wb.xlsx.writeBuffer()));
  return { name: 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(MONTHS[m - 1]) + ' ' + y + '.xlsx', data };
}

// Δυναμολόγιο και καταστάσεις (Michael, 17/10): ένα Excel, ένα φύλλο ανά φίλτρο της οθόνης (Όλοι, Άδειες, Τιμωρημένοι,
// Πόστα, Εκτός δύναμης, Με δικαίωμα ΔΝ), για μία ημερομηνία. Όλα με κεφαλαία, όπως ό,τι γράφει η εφαρμογή στα Excel.
const ROSTER_W: Record<string, number> = { 'Α/Α': 5, 'ΒΑΘΜΟΣ': 9, 'Ο/Σ': 8, 'ΕΠΙΘΕΤΟ': 18, 'ΟΝΟΜΑ': 14, 'ΠΑΤΡΩΝΥΜΟ': 14, 'ΑΣΜ': 13, 'ΤΗΛΕΦΩΝΟ': 13, 'ΘΑΛΑΜΟΣ': 9, 'ΠΟΣΤΟ': 14, 'ΡΟΛΟΣ': 14, 'Σ.Ι.': 14, 'ΔΙΚΑΙΩΜΑ ΔΝ': 10, 'ΕΙΔΟΣ': 18, 'ΑΠΟ': 11, 'ΕΩΣ': 11, 'ΠΑΡΑΤΗΡΗΣΗ': 22, 'ΘΕΣΗ': 20, 'ΓΡΑΜΜΗ ΗΚΑΙ': 16, 'ΓΡΑΜΜΗ ΗΚΑΛ': 16, 'ΚΑΤΑΣΤΑΣΗ': 22, 'ΣΤΗΛΗ ΗΚΑΙ': 18, 'ΣΤΗΛΗ ΗΚΑΛ': 18 };
export async function rosterLists(s: AppState, d: ISODate): Promise<{ name: string; data: Buffer }> {
  return { name: 'ΔΥΝΑΜΟΛΟΓΙΟ ΚΑΤΑΣΤΑΣΕΙΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data: await sheetsBook(s, d, rosterSheets(s, d, d === today() ? nowMin() : undefined)) };
}
// Στελέχη (Michael, 17/10): ίδια μορφή, με τα φύλλα του cadre.ts (στελέχη, καταστάσεις της ΗΚΑΙ, εκτός δύναμης)
export async function cadreLists(s: AppState, d: ISODate): Promise<{ name: string; data: Buffer }> {
  return { name: 'ΔΥΝΑΜΙΚΟ ΣΤΕΛΕΧΩΝ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data: await sheetsBook(s, d, cadreSheets(s, d)) };
}
async function sheetsBook(s: AppState, d: ISODate, sheets: RosterSheet[]): Promise<Buffer> {
  const { F, Z, al, colWidth } = lookOf(s);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Γραφείο Λοχία';
  wb.created = wb.modified = new Date(d + 'T00:00:00Z');
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
      views: [{ state: 'frozen', ySplit: 3 }]
    });
    const W = sh.head.length;
    ws.mergeCells(1, 1, 1, W);
    const t = ws.getCell(1, 1); t.value = upper(sh.title + ' · ' + s.settings.unitName); t.font = { name: F, bold: true, size: Z + 2, underline: true }; t.alignment = { horizontal: 'center' };
    sh.head.forEach((h, i) => { const c = ws.getRow(3).getCell(i + 1); c.value = h; c.font = { name: F, bold: true, size: Z }; c.alignment = { ...al, wrapText: true }; c.border = border; });
    sh.rows.forEach((r, j) => r.forEach((v, i) => {
      const c = ws.getRow(4 + j).getCell(i + 1); c.value = typeof v === 'string' ? upper(v) : v;
      c.font = { name: F, size: Z }; c.alignment = al; c.border = border;
    }));
    if (!sh.rows.length) { ws.mergeCells(4, 1, 4, W); const c = ws.getCell(4, 1); c.value = 'ΚΑΝΕΝΑΣ'; c.alignment = { horizontal: 'center' }; c.font = { name: F, italic: true, size: Z }; }
    sh.head.forEach((h, i) => { ws.getColumn(i + 1).width = colWidth(ROSTER_W[h] || 12, h, sh.rows.map(r => r[i])); });
    ws.pageSetup.printTitlesRow = '3:3';
  }
  return fitBook(Buffer.from(await wb.xlsx.writeBuffer()));
}

// Συνολικό Δυναμολόγιο για εκτύπωση (Michael, 17/10), με την κεφαλίδα της ΗΚΑΙ: οι 3 γραμμές της μονάδας πάνω αριστερά,
// τόπος και ημερομηνία («14 ΟΚΤ 26») πάνω δεξιά, τίτλος στη μέση. Όλοι όσοι είναι σε δύναμη, κατά θάλαμο και επώνυμο.
export async function rosterPrint(s: AppState, d: ISODate): Promise<{ name: string; data: Buffer }> {
  const sh = rosterSheets(s, d)[0]; const { F, Z, al, colWidth } = lookOf(s);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Γραφείο Λοχία';
  wb.created = wb.modified = new Date(d + 'T00:00:00Z');
  const ws = wb.addWorksheet('ΔΥΝΑΜΟΛΟΓΙΟ', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
  const thin = { style: 'thin' as const }; const border = { top: thin, left: thin, bottom: thin, right: thin };
  const W = sh.head.length; const T = Math.max(5, s.settings.unit.length + 2); const HEAD = T + 3;
  s.settings.unit.forEach((u, i) => { ws.mergeCells(i + 1, 1, i + 1, 5); const c = ws.getCell(i + 1, 1); c.value = upper(u); c.font = { name: F, bold: true, size: Z, underline: true }; c.alignment = { horizontal: 'center' }; });
  ws.mergeCells(1, W - 3, 1, W); const dc = ws.getCell(1, W - 3); dc.value = upper((s.settings.place ? s.settings.place + ', ' : '') + hkDate(d)); dc.font = { name: F, bold: true, size: Z }; dc.alignment = { horizontal: 'right' };
  ws.mergeCells(T, 1, T, W); const t = ws.getCell(T, 1); t.value = upper('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ' + (s.settings.unitName || '') + ' ΤΗΣ ' + hkDate(d)).replace(/\s+/g, ' '); t.font = { name: F, bold: true, size: Z + 2, underline: true }; t.alignment = { horizontal: 'center' };
  ws.mergeCells(T + 1, 1, T + 1, W); const n = ws.getCell(T + 1, 1); n.value = 'ΔΥΝΑΜΗ: ' + sh.rows.length; n.font = { name: F, size: Z }; n.alignment = { horizontal: 'center' };
  sh.head.forEach((h, i) => { const c = ws.getRow(HEAD).getCell(i + 1); c.value = h; c.font = { name: F, bold: true, size: Z }; c.alignment = { ...al, wrapText: true }; c.border = border; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; });
  sh.rows.forEach((r, j) => r.forEach((v, i) => {
    const c = ws.getRow(HEAD + 1 + j).getCell(i + 1); c.value = typeof v === 'string' ? upper(v) : v;
    c.font = { name: F, size: Z }; c.alignment = al; c.border = border;
  }));
  sh.head.forEach((h, i) => { ws.getColumn(i + 1).width = colWidth(ROSTER_W[h] || 12, h, sh.rows.map(r => r[i])); });
  ws.pageSetup.printTitlesRow = HEAD + ':' + HEAD;
  const data = await fitBook(Buffer.from(await wb.xlsx.writeBuffer()));
  return { name: 'ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data };
}

// Οπλισμός: ένα Excel, ένα φύλλο ανά φίλτρο της καρτέλας. Το πρώτο (όλοι σε δύναμη) με την κεφαλίδα της ΗΚΑΙ και στήλη
// υπογραφής, για να τυπωθεί ως κατάσταση χρέωσης όπλων· τα υπόλοιπα (χωρίς όπλο, άοπλοι με όπλο, ίδιος αριθμός, να
// παραδώσουν) για έλεγχο. Όλα με κεφαλαία.
const WEAPON_W: Record<string, number> = { ...ROSTER_W, 'ΤΥΠΟΣ ΟΠΛΟΥ': 11, 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ': 16, 'ΟΠΛΟΒΑΣΤΟΣ': 11, 'ΘΕΣΗ': 14, 'ΕΝΤΟΣ / ΕΚΤΟΣ': 28, 'ΥΠΟΓΡΑΦΗ': 20, 'ΛΟΓΟΣ ΕΞΟΔΟΥ': 14, 'ΕΞΟΔΟΣ': 17, 'ΛΟΓΟΣ ΕΙΣΟΔΟΥ': 20, 'ΕΙΣΟΔΟΣ': 17 };
export async function weaponsBook(s: AppState, d: ISODate): Promise<{ name: string; data: Buffer }> {
  const { F, Z, al, colWidth } = lookOf(s);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Γραφείο Λοχία';
  wb.created = wb.modified = new Date(d + 'T00:00:00Z');
  const thin = { style: 'thin' as const }; const border = { top: thin, left: thin, bottom: thin, right: thin };
  weaponSheets(s, d).forEach((sh, k) => {
    const ws = wb.addWorksheet(sh.name, { pageSetup: { paperSize: 9, orientation: k === 0 ? 'portrait' : 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
    const W = sh.head.length; let HEAD = 3;
    if (k === 0) {
      const T = Math.max(5, s.settings.unit.length + 2); HEAD = T + 3;
      s.settings.unit.forEach((u, i) => { ws.mergeCells(i + 1, 1, i + 1, 5); const c = ws.getCell(i + 1, 1); c.value = upper(u); c.font = { name: F, bold: true, size: Z, underline: true }; c.alignment = { horizontal: 'center' }; });
      ws.mergeCells(1, W - 3, 1, W); const dc = ws.getCell(1, W - 3); dc.value = upper((s.settings.place ? s.settings.place + ', ' : '') + hkDate(d)); dc.font = { name: F, bold: true, size: Z }; dc.alignment = { horizontal: 'right' };
      ws.mergeCells(T, 1, T, W); const t = ws.getCell(T, 1); t.value = upper('ΚΑΤΑΣΤΑΣΗ ΟΠΛΙΣΜΟΥ ' + (s.settings.unitName || '') + ' ΤΗΣ ' + hkDate(d)).replace(/\s+/g, ' '); t.font = { name: F, bold: true, size: Z + 2, underline: true }; t.alignment = { horizontal: 'center' };
      const armed = sh.rows.filter(r => r[W_NUM]).length;
      ws.mergeCells(T + 1, 1, T + 1, W); const n = ws.getCell(T + 1, 1); n.value = 'ΔΥΝΑΜΗ: ' + sh.rows.length + ' · ΜΕ ΟΠΛΟ: ' + armed; n.font = { name: F, size: Z }; n.alignment = { horizontal: 'center' };
    } else {
      ws.mergeCells(1, 1, 1, W); const t = ws.getCell(1, 1); t.value = upper(sh.title + ' · ' + s.settings.unitName); t.font = { name: F, bold: true, size: Z + 2, underline: true }; t.alignment = { horizontal: 'center' };
      ws.mergeCells(2, 1, 2, W); const n = ws.getCell(2, 1); n.value = upper(sh.note); n.font = { name: F, italic: true, size: Math.max(7, Z - 1) }; n.alignment = { horizontal: 'center' };
    }
    sh.head.forEach((h, i) => { const c = ws.getRow(HEAD).getCell(i + 1); c.value = h; c.font = { name: F, bold: true, size: Z }; c.alignment = { ...al, wrapText: true }; c.border = border; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; });
    sh.rows.forEach((r, j) => { const row = ws.getRow(HEAD + 1 + j); if (k === 0) row.height = Math.max(20, Z * 2); r.forEach((v, i) => {
      const c = row.getCell(i + 1); c.value = typeof v === 'string' ? upper(v) : v;
      c.font = { name: F, size: Z, bold: sh.head[i] === 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ' }; c.alignment = al; c.border = border;
    }); });
    if (!sh.rows.length) { ws.mergeCells(HEAD + 1, 1, HEAD + 1, W); const c = ws.getCell(HEAD + 1, 1); c.value = 'ΚΑΝΕΝΑΣ'; c.alignment = { horizontal: 'center' }; c.font = { name: F, italic: true, size: Z }; }
    sh.head.forEach((h, i) => { ws.getColumn(i + 1).width = colWidth(WEAPON_W[h] || 12, h, sh.rows.map(r => r[i]), h === 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ'); });
    ws.views = [{ state: 'frozen', ySplit: HEAD }];
    ws.pageSetup.printTitlesRow = HEAD + ':' + HEAD;
  });
  const data = await fitBook(Buffer.from(await wb.xlsx.writeBuffer()));
  return { name: 'ΟΠΛΙΣΜΟΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data };
}
