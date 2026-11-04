// Ό,τι χρειάζεται τη βιβλιοθήκη ExcelJS (βαριά): ο μηνιαίος έλεγχος υπηρεσιών (νέο αρχείο από την αρχή).
// Η ανάγνωση των Excel (Δυναμολόγιο, Αρχεία Excel) γίνεται πια με το ελαφρύ xlsx.ts.
// Χτίζεται ως χωριστό αρχείο και φορτώνεται μόνο όταν χρειαστεί (όριο μνήμης 2 GB, 12 §5).
import ExcelJS from 'exceljs';
import { MONTHS, dmy, hkDate, nowMin, parseD, today, type ISODate } from '../shared/dates';
import { rosterSheets, type RosterSheet } from '../shared/rosterLists';
import { W_NUM, weaponSheets } from '../shared/weapons';
import { cadreSheets } from '../shared/cadre';
import { norm, collator, upper } from '../shared/text';
import { everyBlock, fatherTxt, type AppState, type DutyKind } from '../shared/domain';
import { live, absCode, rankTxt } from '../shared/ranks';
import { bareOf, codeOf } from '../shared/codes';
import { activePeople, cadreSeats, isHol, postBy, statusesFrom, dutyMin } from '../shared/rules';
import { colName, fitBook, sheetSafe } from './xlsx';
import { DUTY_CODES, IMER_ROWS, imerCode, imerDays, imerGrid, imerSheets, imerTitle, sumTotals, type ImerPart, type ImerReq } from '../shared/imer';
import { currentEsso, essoName } from '../shared/esso';
import type { MadeMark } from './exports';
import { widthChars } from './textfit';
import { formPart, tablePart, xlLook, type XlPart } from '../shared/xlLook';

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
  // γράμματα ανά κομμάτι (Ρυθμίσεις › Γράμματα Excel): τίτλος έντονος, υπογραμμισμένος, 2 μεγέθη πάνω· επικεφαλίδες έντονες·
  // κεφαλίδα (γραμμές της μονάδας και ημερομηνία) έντονη στο μέγεθος των γραμμών
  const font = (p: Required<XlPart>) => ({ name: L.font, size: p.sz, bold: p.b, italic: p.i, underline: p.u });
  const hp = formPart(L, 'hdr') || {};
  const hdr = (u: boolean) => font({ sz: hp.sz ?? L.sz, b: hp.b ?? true, i: hp.i ?? false, u: hp.u ?? u });
  const FT = { title: font(tablePart(L, 'title', L.sz, { u: true })), head: font(tablePart(L, 'head')), data: font(tablePart(L, 'data')), unit: hdr(true), date: hdr(false) };
  return { F: L.font, Z: L.sz, al, fitWidth, colWidth, FT };
}

// Πού είναι σε κάθε φύλλο η κεφαλίδα (γραμμές της μονάδας), ο τόπος/ημερομηνία και ο τίτλος, και η τελευταία γραμμή
// του (foot): από κάτω μπαίνουν οι υπογραφές, και όλα μετακινούνται πάνω στο χαρτί (exports.ts signMade, Michael 22/10).
// key: ποιες θέσεις του εντύπου ισχύουν (LAYOUT_SHEETS)· τα φύλλα με την ίδια μορφή έχουν το ίδιο key
type MadeSheet = MadeMark;
export interface Made { name: string; data: Buffer; marks: MadeSheet[] }
const unitRefs = (s: AppState) => s.settings.unit.map((_, i) => 'A' + (i + 1));

const BASE_KINDS: DutyKind[] = ['th', 'mg', 'ly'];
// Μηνιαίο πλέγμα «Έλεγχος υπηρεσιών» (δείγμα 03): άτομα × ημέρες με κωδικό θέσης, γκρι ΣΚ/αργίες
export async function dutyCheck(s: AppState, ym: string): Promise<Made> {
  const [y, m] = ym.split('-').map(Number);
  const nd = new Date(y, m, 0).getDate();
  const days: ISODate[] = Array.from({ length: nd }, (_, i) => ym + '-' + String(i + 1).padStart(2, '0'));
  // ο κωδικός της θέσης (Θ1α, Μ2…) και το είδος της, για τα σύνολα· υπηρεσία χωρίς θέση (από Excel): το σκέτο γράμμα
  // δικές σου υπηρεσίες που δεν μετρούν σε καμία από τις στήλες Θ, Μ, ΛΥ (π.χ. «Πύλη»): δική τους στήλη στο τέλος, με το
  // όνομά τους (ίδιο όνομα σε δύο έντυπα = μία στήλη)· και οι ανενεργές, για να μη χάνονται οι υπηρεσίες που έγιναν
  const ownOf = new Map<string, string>();
  for (const b of everyBlock(s.settings)) if (b.custom && !BASE_KINDS.includes(b.kind)) ownOf.set(b.id, norm(b.name));
  const OWN = [...new Set(ownOf.values())];
  const per = new Map<number, Map<ISODate, { code: string; kind: DutyKind; own?: string }>>();
  const set = (pid: number, d: ISODate, v: { code: string; kind: DutyKind; own?: string }) => { if (!per.has(pid)) per.set(pid, new Map()); per.get(pid)!.set(d, v); };
  for (const d of days) {
    for (const e of s.dutyLog?.[d] || []) set(e.pid, d, { code: bareOf(undefined, e.kind), kind: e.kind });
    const g = s.guards[d] || {};
    for (const k in g) { const p = postBy(s, k); if (p) set(g[k], d, { code: codeOf(s.settings, k, p.kind), kind: p.kind, own: ownOf.get(p.block) }); }
  }
  const { F, Z, al, fitWidth, colWidth, FT } = lookOf(s);
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
  ws.getCell(1, 1).font = FT.title; ws.getCell(1, 1).alignment = { horizontal: 'center' };
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const gray = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9D9D9' } };
  const head = ws.getRow(3);
  [...FIX, ...days.map(d => String(parseD(d).getDate())), ...TAIL].forEach((t, i) => {
    const c = head.getCell(i + 1); c.value = t; c.font = FT.head; c.alignment = { ...al, wrapText: true }; c.border = border;
    if (i >= FIX.length && i < FIX.length + nd && isHol(s.settings, days[i - FIX.length])) c.fill = gray;
  });
  // στελέχη που έκαναν υπηρεσία τον μήνα (Michael, 26/10): μετά τους στρατιώτες, με βαθμό
  const people = [...activePeople(s).slice().sort((a, b) => (a.room ?? 99) - (b.room ?? 99) || collator.compare(a.last, b.last)), ...cadreSeats(s).filter(c => per.has(c.id))];
  people.forEach((p, i) => {
    const row = ws.getRow(4 + i); const x = per.get(p.id) || new Map<ISODate, { code: string; kind: DutyKind; own?: string }>();
    let hol = 0; const c: Record<string, number> = {}; const o: Record<string, number> = {};
    const vals: (string | number)[] = [i + 1, upper(rankTxt(p)), upper(p.last), upper(p.first + fatherTxt(p))];
    for (const d of days) {
      const v = x.get(d);
      if (v) { if (isHol(s.settings, d)) hol++; c[v.kind] = (c[v.kind] || 0) + 1; if (v.own) o[v.own] = (o[v.own] || 0) + 1; vals.push(v.code); continue; }
      // απουσία: μικρός κωδικός του ημερολογίου κωλυομένων (Κ.Α, ΑΝ.ΑΔ, Ε.Υ…) για να φαίνεται γιατί δεν έχει υπηρεσία
      const st = statusesFrom(live(s), p.id, d, dutyMin(s.settings)).find(t => absCode(t, s.settings.lists));
      vals.push(st ? absCode(st, s.settings.lists)! : '');
    }
    vals.push(p.room ?? '', x.size, hol, c.th || '', c.mg || '', c.ly || '', ...OWN.map(n => o[n] || ''));
    vals.forEach((v, j) => {
      const cell = row.getCell(j + 1); cell.value = v; cell.border = border; cell.font = FT.data;
      cell.alignment = al;
      if (j >= FIX.length && j < FIX.length + nd) {
        if (isHol(s.settings, days[j - FIX.length])) cell.fill = gray;
        if (typeof v === 'string' && v.includes('.')) cell.font = { name: F, size: Math.max(6, Z - 2), italic: true, color: { argb: 'FF666666' } };
        else if (v) cell.font = { ...FT.data, bold: true };
      }
    });
  });
  ws.getColumn(1).width = fitWidth(4, [people.length]); [7, 18, 13].forEach((w, j) => { ws.getColumn(j + 2).width = Math.min(30, colWidth(w, FIX[j + 1], people.map(p => [rankTxt(p), p.last, p.first + fatherTxt(p)][j]))); });
  // ημέρες: όσο θέλει ο μεγαλύτερος κωδικός της στήλης (έντονος), ως 8
  for (let j = 0; j < nd; j++) { const d = days[j]; ws.getColumn(FIX.length + 1 + j).width = fitWidth(3.2, people.map(p => per.get(p.id)?.get(d)?.code), 8, true); }
  for (let j = 0; j < TAIL.length; j++) ws.getColumn(FIX.length + nd + 1 + j).width = j < 6 ? fitWidth(4.5, [TAIL[j]], 8, true) : fitWidth(4.5, [TAIL[j]], 14, true);
  const foot = 5 + people.length;
  ws.getCell(foot, 1).value = 'Θ1α… θαλαμοφύλακας (θέση) · Μ1… μαγειρεία · ΛΥ / ΔΥ · σκέτο γράμμα: χωρίς θέση · γκρι: ΣΚ και αργίες · πλάγια: λόγος απουσίας (Κ.Α άδεια, ΑΝ.ΑΔ αναρρωτική, Ε.Υ, Ε.Α)';
  ws.getCell(foot, 1).font = { name: F, size: Math.max(7, Z - 2), italic: true };
  ws.pageSetup.printTitlesRow = '3:3';
  const data = await fitBook(Buffer.from(await wb.xlsx.writeBuffer()));
  return { name: 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(MONTHS[m - 1]) + ' ' + y + '.xlsx', data, marks: [{ sheet: ws.name, key: 'main', head: [], date: [], title: ['A1'], foot, cols: W }] };
}

// Δυναμολόγιο και καταστάσεις (Michael, 17/10): ένα Excel, ένα φύλλο ανά φίλτρο της οθόνης (Όλοι, Άδειες, Τιμωρημένοι,
// Πόστα, Εκτός δύναμης, Με δικαίωμα ΔΝ), για μία ημερομηνία. Όλα με κεφαλαία, όπως ό,τι γράφει η εφαρμογή στα Excel.
const ROSTER_W: Record<string, number> = { 'Α/Α': 5, 'ΒΑΘΜΟΣ': 9, 'Ο/Σ': 8, 'ΕΠΙΘΕΤΟ': 18, 'ΟΝΟΜΑ': 14, 'ΠΑΤΡΩΝΥΜΟ': 14, 'ΑΣΜ': 13, 'ΤΗΛΕΦΩΝΟ': 13, 'ΘΑΛΑΜΟΣ': 9, 'ΠΟΣΤΟ': 14, 'ΡΟΛΟΣ': 14, 'Σ.Ι.': 14, 'ΔΙΚΑΙΩΜΑ ΔΝ': 10, 'ΕΙΔΟΣ': 18, 'ΑΠΟ': 11, 'ΕΩΣ': 11, 'ΠΑΡΑΤΗΡΗΣΗ': 22, 'ΘΕΣΗ': 20, 'ΓΡΑΜΜΗ ΗΚΑΙ': 16, 'ΓΡΑΜΜΗ ΗΚΑΛ': 16, 'ΚΑΤΑΣΤΑΣΗ': 22, 'ΣΤΗΛΗ ΗΚΑΙ': 18, 'ΣΤΗΛΗ ΗΚΑΛ': 18 };
export async function rosterLists(s: AppState, d: ISODate): Promise<Made> {
  const wb = newBook(d); const marks = addSheets(wb, s, rosterSheets(s, d, d === today() ? nowMin() : undefined), 'lists');
  return { name: 'ΔΥΝΑΜΟΛΟΓΙΟ ΚΑΤΑΣΤΑΣΕΙΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data: await fitBook(Buffer.from(await wb.xlsx.writeBuffer())), marks };
}
// Στελέχη (Michael, 17/10): ίδια μορφή, με τα φύλλα του cadre.ts (στελέχη, καταστάσεις της ΗΚΑΙ, εκτός δύναμης)
export async function cadreLists(s: AppState, d: ISODate): Promise<Made> {
  const wb = newBook(d); const marks = addSheets(wb, s, cadreSheets(s, d), 'main');
  return { name: 'ΔΥΝΑΜΙΚΟ ΣΤΕΛΕΧΩΝ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data: await fitBook(Buffer.from(await wb.xlsx.writeBuffer())), marks };
}
// Σταθερή ημερομηνία στις ιδιότητες: ίδια δεδομένα, ίδιο αρχείο
function newBook(d: ISODate) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Γραφείο Λοχία';
  wb.created = wb.modified = new Date(d + 'T00:00:00Z');
  return wb;
}
function addSheets(wb: ExcelJS.Workbook, s: AppState, sheets: RosterSheet[], key: string): MadeSheet[] {
  const { F, Z, al, colWidth, FT } = lookOf(s); const marks: MadeSheet[] = [];
  const thin = { style: 'thin' as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
      views: [{ state: 'frozen', ySplit: 3 }]
    });
    const W = sh.head.length;
    ws.mergeCells(1, 1, 1, W);
    const t = ws.getCell(1, 1); t.value = upper(sh.title + ' · ' + s.settings.unitName); t.font = FT.title; t.alignment = { horizontal: 'center' };
    sh.head.forEach((h, i) => { const c = ws.getRow(3).getCell(i + 1); c.value = h; c.font = FT.head; c.alignment = { ...al, wrapText: true }; c.border = border; });
    sh.rows.forEach((r, j) => r.forEach((v, i) => {
      const c = ws.getRow(4 + j).getCell(i + 1); c.value = typeof v === 'string' ? upper(v) : v;
      c.font = FT.data; c.alignment = al; c.border = border;
    }));
    if (!sh.rows.length) { ws.mergeCells(4, 1, 4, W); const c = ws.getCell(4, 1); c.value = 'ΚΑΝΕΝΑΣ'; c.alignment = { horizontal: 'center' }; c.font = { name: F, italic: true, size: Z }; }
    sh.head.forEach((h, i) => { ws.getColumn(i + 1).width = colWidth(ROSTER_W[h] || 12, h, sh.rows.map(r => r[i])); });
    ws.pageSetup.printTitlesRow = '3:3';
    marks.push({ sheet: ws.name, key, head: [], date: [], title: ['A1'], foot: 3 + Math.max(1, sh.rows.length), cols: W });
  }
  return marks;
}

// Συνολικό Δυναμολόγιο για εκτύπωση (Michael, 17/10), με την κεφαλίδα της ΗΚΑΙ: οι 3 γραμμές της μονάδας πάνω αριστερά,
// τόπος και ημερομηνία («14 ΟΚΤ 26») πάνω δεξιά, τίτλος στη μέση. Όλοι όσοι είναι σε δύναμη, κατά θάλαμο και επώνυμο.
export async function rosterPrint(s: AppState, d: ISODate): Promise<Made> {
  const wb = newBook(d); const mark = addRosterPrint(wb, s, d);
  const data = await fitBook(Buffer.from(await wb.xlsx.writeBuffer()));
  return { name: 'ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data, marks: [mark] };
}
// «Θέσεις στο χαρτί» του Δυναμολογίου: το συνολικό και ένα από τα φύλλα του Excel, στο ίδιο αρχείο
export async function rosterPreview(s: AppState, d: ISODate): Promise<Made> {
  const wb = newBook(d); const mark = addRosterPrint(wb, s, d);
  const marks = addSheets(wb, s, rosterSheets(s, d).slice(0, 1).map(x => ({ ...x, name: x.name + ' (ΦΥΛΛΟ)' })), 'lists');
  return { name: 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx', data: await fitBook(Buffer.from(await wb.xlsx.writeBuffer())), marks: [mark, ...marks] };
}
function addRosterPrint(wb: ExcelJS.Workbook, s: AppState, d: ISODate): MadeSheet {
  const sh = rosterSheets(s, d)[0]; const { F, Z, al, colWidth, FT } = lookOf(s);
  const ws = wb.addWorksheet('ΔΥΝΑΜΟΛΟΓΙΟ', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
  const thin = { style: 'thin' as const }; const border = { top: thin, left: thin, bottom: thin, right: thin };
  const W = sh.head.length; const T = Math.max(5, s.settings.unit.length + 2); const HEAD = T + 3;
  s.settings.unit.forEach((u, i) => { ws.mergeCells(i + 1, 1, i + 1, 5); const c = ws.getCell(i + 1, 1); c.value = upper(u); c.font = FT.unit; c.alignment = { horizontal: 'center' }; });
  ws.mergeCells(1, W - 3, 1, W); const dc = ws.getCell(1, W - 3); dc.value = upper((s.settings.place ? s.settings.place + ', ' : '') + hkDate(d)); dc.font = FT.date; dc.alignment = { horizontal: 'right' };
  ws.mergeCells(T, 1, T, W); const t = ws.getCell(T, 1); t.value = upper('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ' + (s.settings.unitName || '') + ' ΤΗΣ ' + hkDate(d)).replace(/\s+/g, ' '); t.font = FT.title; t.alignment = { horizontal: 'center' };
  ws.mergeCells(T + 1, 1, T + 1, W); const n = ws.getCell(T + 1, 1); n.value = 'ΔΥΝΑΜΗ: ' + sh.rows.length; n.font = { name: F, size: Z }; n.alignment = { horizontal: 'center' };
  sh.head.forEach((h, i) => { const c = ws.getRow(HEAD).getCell(i + 1); c.value = h; c.font = FT.head; c.alignment = { ...al, wrapText: true }; c.border = border; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; });
  sh.rows.forEach((r, j) => r.forEach((v, i) => {
    const c = ws.getRow(HEAD + 1 + j).getCell(i + 1); c.value = typeof v === 'string' ? upper(v) : v;
    c.font = FT.data; c.alignment = al; c.border = border;
  }));
  sh.head.forEach((h, i) => { ws.getColumn(i + 1).width = colWidth(ROSTER_W[h] || 12, h, sh.rows.map(r => r[i])); });
  ws.pageSetup.printTitlesRow = HEAD + ':' + HEAD;
  return { sheet: ws.name, key: 'print', head: unitRefs(s), date: [colName(W - 3) + 1], title: ['A' + T, 'A' + (T + 1)], foot: HEAD + Math.max(1, sh.rows.length), cols: W };
}

// Οπλισμός: ένα Excel, ένα φύλλο ανά φίλτρο της καρτέλας. Το πρώτο (όλοι σε δύναμη) με την κεφαλίδα της ΗΚΑΙ και στήλη
// υπογραφής, για να τυπωθεί ως κατάσταση χρέωσης όπλων· τα υπόλοιπα (χωρίς όπλο, άοπλοι με όπλο, ίδιος αριθμός, να
// παραδώσουν) για έλεγχο. Όλα με κεφαλαία.
const WEAPON_W: Record<string, number> = { ...ROSTER_W, 'ΤΥΠΟΣ ΟΠΛΟΥ': 11, 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ': 16, 'ΟΠΛΟΒΑΣΤΟΣ': 11, 'ΘΕΣΗ': 14, 'ΕΝΤΟΣ / ΕΚΤΟΣ': 28, 'ΥΠΟΓΡΑΦΗ': 20, 'ΛΟΓΟΣ ΕΞΟΔΟΥ': 14, 'ΕΞΟΔΟΣ': 17, 'ΛΟΓΟΣ ΕΙΣΟΔΟΥ': 20, 'ΕΙΣΟΔΟΣ': 17 };
export async function weaponsBook(s: AppState, d: ISODate): Promise<Made> {
  const { F, Z, al, colWidth, FT } = lookOf(s);
  const wb = newBook(d); const marks: MadeSheet[] = [];
  const thin = { style: 'thin' as const }; const border = { top: thin, left: thin, bottom: thin, right: thin };
  weaponSheets(s, d).forEach((sh, k) => {
    const ws = wb.addWorksheet(sh.name, { pageSetup: { paperSize: 9, orientation: k === 0 ? 'portrait' : 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
    const W = sh.head.length; let HEAD = 3; let title = ['A1', 'A2'];
    if (k === 0) {
      const T = Math.max(5, s.settings.unit.length + 2); HEAD = T + 3; title = ['A' + T, 'A' + (T + 1)];
      s.settings.unit.forEach((u, i) => { ws.mergeCells(i + 1, 1, i + 1, 5); const c = ws.getCell(i + 1, 1); c.value = upper(u); c.font = FT.unit; c.alignment = { horizontal: 'center' }; });
      ws.mergeCells(1, W - 3, 1, W); const dc = ws.getCell(1, W - 3); dc.value = upper((s.settings.place ? s.settings.place + ', ' : '') + hkDate(d)); dc.font = FT.date; dc.alignment = { horizontal: 'right' };
      ws.mergeCells(T, 1, T, W); const t = ws.getCell(T, 1); t.value = upper('ΚΑΤΑΣΤΑΣΗ ΟΠΛΙΣΜΟΥ ' + (s.settings.unitName || '') + ' ΤΗΣ ' + hkDate(d)).replace(/\s+/g, ' '); t.font = FT.title; t.alignment = { horizontal: 'center' };
      const armed = sh.rows.filter(r => r[W_NUM]).length;
      ws.mergeCells(T + 1, 1, T + 1, W); const n = ws.getCell(T + 1, 1); n.value = 'ΔΥΝΑΜΗ: ' + sh.rows.length + ' · ΜΕ ΟΠΛΟ: ' + armed; n.font = { name: F, size: Z }; n.alignment = { horizontal: 'center' };
    } else {
      ws.mergeCells(1, 1, 1, W); const t = ws.getCell(1, 1); t.value = upper(sh.title + ' · ' + s.settings.unitName); t.font = FT.title; t.alignment = { horizontal: 'center' };
      ws.mergeCells(2, 1, 2, W); const n = ws.getCell(2, 1); n.value = upper(sh.note); n.font = { name: F, italic: true, size: Math.max(7, Z - 1) }; n.alignment = { horizontal: 'center' };
    }
    sh.head.forEach((h, i) => { const c = ws.getRow(HEAD).getCell(i + 1); c.value = h; c.font = FT.head; c.alignment = { ...al, wrapText: true }; c.border = border; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; });
    sh.rows.forEach((r, j) => { const row = ws.getRow(HEAD + 1 + j); if (k === 0) row.height = Math.max(20, Z * 2); r.forEach((v, i) => {
      const c = row.getCell(i + 1); c.value = typeof v === 'string' ? upper(v) : v;
      c.font = { ...FT.data, bold: FT.data.bold || sh.head[i] === 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ' }; c.alignment = al; c.border = border;
    }); });
    if (!sh.rows.length) { ws.mergeCells(HEAD + 1, 1, HEAD + 1, W); const c = ws.getCell(HEAD + 1, 1); c.value = 'ΚΑΝΕΝΑΣ'; c.alignment = { horizontal: 'center' }; c.font = { name: F, italic: true, size: Z }; }
    sh.head.forEach((h, i) => { ws.getColumn(i + 1).width = colWidth(WEAPON_W[h] || 12, h, sh.rows.map(r => r[i]), h === 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ'); });
    ws.views = [{ state: 'frozen', ySplit: HEAD }];
    ws.pageSetup.printTitlesRow = HEAD + ':' + HEAD;
    marks.push({ sheet: ws.name, key: k === 0 ? 'main' : 'rest', head: k === 0 ? unitRefs(s) : [], date: k === 0 ? [colName(W - 3) + 1] : [], title, foot: HEAD + Math.max(1, sh.rows.length), cols: W });
  });
  const data = await fitBook(Buffer.from(await wb.xlsx.writeBuffer()));
  return { name: 'ΟΠΛΙΣΜΟΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data, marks };
}

// Ημερολόγιο κωλυομένων-απόντων (Michael, 3/11): όπως το Excel του (ΗΜΕΡΟΛΟΓΙΟ ΚΩΛΥΟΜΕΝΩΝ-ΑΠΟΝΤΩΝ / ΔΥΝΑΜΟΛΟΓΙΟ ΕΚΠΑΙΔΕΥΣΗΣ):
// ένα φύλλο ανά ουλαμό (ή ένα για όλη την Ίλη), γραμμή ανά στρατιώτη, στήλη ανά μέρα εκπαίδευσης, σύνολα Π/Α και υπόμνημα κωδικών.
// Γράφει ό,τι δείχνει η οθόνη, και τα κελιά που γράφτηκαν με το χέρι. Νέο αρχείο κάθε φορά: δεν διαβάζεται πίσω.
export async function imerBook(s: AppState, o: ImerReq): Promise<Made> {
  const { F, Z, al, fitWidth, FT } = lookOf(s);
  const days = imerDays(s, o.from, o.to, !!o.all); const td = today();
  const parts = imerGrid(s, o.from, o.to, !!o.all, td).groups;
  const mode = imerSheets(s.settings);
  const flat: ImerPart = { g: { name: 'ΣΥΝΟΛΙΚΟ ΙΛΗΣ', unit: 'ΣΥΝΟΛΙΚΟ ΙΛΗΣ', rooms: '', rows: parts.flatMap(x => x.g.rows) }, cells: parts.flatMap(x => x.cells), tot: sumTotals(parts.map(x => x.tot)) };
  const sheets = (mode === 'unit' ? parts : mode === 'all' ? [flat] : [...parts, flat]).filter(x => x.g.rows.length);
  if (!sheets.length) sheets.push({ g: { name: 'ΣΥΝΟΛΙΚΟ ΙΛΗΣ', unit: 'ΣΥΝΟΛΙΚΟ ΙΛΗΣ', rooms: '', rows: [] }, cells: [], tot: days.map(d => ({ p: 0, a: 0, show: d <= td })) });
  const wb = newBook(o.from); const marks: MadeSheet[] = [];
  const thin = { style: 'thin' as const }; const border = { top: thin, left: thin, bottom: thin, right: thin };
  const gray = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9D9D9' } };
  const light = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF2F2F2' } };
  const esso = currentEsso(s); const title = upper(imerTitle(s.settings) + (esso ? ' ' + essoName(esso) : ''));
  const used = new Set<string>();
  const legend: [string, string][] = [...IMER_ROWS.filter(r => r.edit).map(r => [imerCode(s.settings, r.key), r.label] as [string, string]),
    ...[['th', 'Θαλαμοφύλακας'], ['op', 'Οπλοφύλακας'], ['sk', 'Σκοπός'], ['mg', 'Μαγειρεία'], ['ly', 'Λ/Υ - Δ/Υ'], ['tae', 'ΤΑΕ'], ['other', 'Περιπολία / άλλη υπηρεσία']].map(([k, n]) => [DUTY_CODES[k as DutyKind], n] as [string, string]), ['ΓΡ', 'Γραφέας'], ['ΕΣΤ', 'Εστιάτορας']];
  for (const x of sheets) {
    const nm = upper(x.g.name).replace(/^(\d+)ΟΣ/, '$1ος'); let name = sheetSafe(nm); for (let i = 2; used.has(name); i++) name = sheetSafe(nm).slice(0, 28) + ' ' + i; used.add(name);
    const ws = wb.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
    const W = 5 + Math.max(days.length, 1); const HEAD = 9; const n = x.g.rows.length;
    // κεφαλίδα της μονάδας δεξιά, όπως στο δικό του Excel: 3 γραμμές της Ρυθμίσεων, ουλαμός, θάλαμοι
    const bw = Math.min(5, W - 5); const c0 = W - bw + 1; const unitHead = [...s.settings.unit.map(u => upper(u)), x.g.name === 'ΣΥΝΟΛΙΚΟ ΙΛΗΣ' ? '' : nm, x.g.rooms];
    unitHead.forEach((t, i) => { ws.mergeCells(i + 1, c0, i + 1, W); const c = ws.getCell(i + 1, c0); c.value = t || null; c.font = FT.unit; c.alignment = { horizontal: 'center' }; });
    ws.mergeCells(7, 1, 7, W); const tc = ws.getCell(7, 1); tc.value = title; tc.font = FT.title; tc.alignment = { horizontal: 'center' };
    ws.mergeCells(8, 1, 8, 5); const uc = ws.getCell(8, 1); uc.value = nm; uc.font = FT.head;
    // μήνες πάνω από τις μέρες τους
    for (let i = 0; i < days.length;) { let j = i; while (j + 1 < days.length && days[j + 1].slice(0, 7) === days[i].slice(0, 7)) j++;
      ws.mergeCells(8, 6 + i, 8, 6 + j); const mc = ws.getCell(8, 6 + i); mc.value = upper(MONTHS[+days[i].slice(5, 7) - 1]); mc.font = FT.head; mc.alignment = { horizontal: 'center' }; mc.border = border; i = j + 1; }
    const head = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο-Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', ...days.map(d => +d.slice(8, 10))];
    head.forEach((h, i) => { const c = ws.getRow(HEAD).getCell(i + 1); c.value = h; c.font = FT.head; c.alignment = { ...al, wrapText: true }; c.border = border; c.fill = gray; });
    x.g.rows.forEach((p, i) => {
      const row = ws.getRow(HEAD + 1 + i);
      [i + 1, upper(rankTxt(p)), upper(p.spec), upper(p.last), upper(p.first + fatherTxt(p))].forEach((v, k) => { const c = row.getCell(k + 1); c.value = v; c.font = FT.data; c.alignment = al; c.border = border; });
      x.cells[i].forEach((cl, k) => { const c = row.getCell(6 + k); c.value = cl.code ? upper(cl.code) : null; c.font = cl.code ? { ...FT.data, bold: true } : FT.data; c.alignment = al; c.border = border; if (cl.count === 'A' && cl.code) c.fill = light; });
    });
    ['Π', 'Α'].forEach((t, k) => {
      const r = HEAD + 1 + n + k; const row = ws.getRow(r);
      if (k === 0) { const c = row.getCell(1); c.value = 'ΣΥΝΟΛΟ'; c.font = FT.head; }
      const l = row.getCell(3); l.value = t; l.font = FT.head; l.alignment = al;
      x.tot.forEach((tt, i) => { const c = row.getCell(6 + i); c.value = tt.show ? (k === 0 ? tt.p : tt.a) : null; c.font = FT.head; c.alignment = al; c.border = border; });
      for (let i = 1; i <= 5; i++) row.getCell(i).border = border;
    });
    let r = HEAD + n + 4;
    legend.forEach(([code, what]) => { const a = ws.getRow(r++); const d = a.getCell(4); d.value = upper(what); d.font = { name: F, size: Math.max(7, Z - 1) }; const e = a.getCell(5); e.value = upper(code); e.font = { name: F, size: Math.max(7, Z - 1), bold: true }; });
    ws.getColumn(1).width = fitWidth(4, [n]); ws.getColumn(2).width = fitWidth(7, x.g.rows.map(p => rankTxt(p)), 14); ws.getColumn(3).width = fitWidth(5, x.g.rows.map(p => p.spec), 8);
    ws.getColumn(4).width = fitWidth(14, [...x.g.rows.map(p => p.last), ...legend.map(l => l[1])], 30); ws.getColumn(5).width = fitWidth(12, x.g.rows.map(p => p.first + fatherTxt(p)), 24);
    for (let i = 0; i < days.length; i++) ws.getColumn(6 + i).width = fitWidth(4.2, x.cells.map(r => r[i]?.code), 9, true);
    ws.views = [{ state: 'frozen', xSplit: 5, ySplit: HEAD }]; ws.pageSetup.printTitlesRow = HEAD + ':' + HEAD;
    marks.push({ sheet: ws.name, key: 'main', head: unitHead.slice(0, 3).map((_, i) => colName(c0) + (i + 1)), date: [], title: ['A7'], foot: r, cols: W });
  }
  const data = await fitBook(Buffer.from(await wb.xlsx.writeBuffer()));
  const rng = dmy(o.from).replace(/\//g, '-') + ' έως ' + dmy(o.to).replace(/\//g, '-');
  return { name: imerTitle(s.settings) + ' ' + rng + '.xlsx', data, marks };
}

// Ημερήσια Διαταγή για εκτύπωση (Michael, 4/11): η ίδια σελίδα ως Excel, για να ανοίγει στην ίδια προεπισκόπηση εκτύπωσης με
// τα άλλα έντυπα (μέγεθος γραμμάτων, σελίδες, εκτυπωτής). Ίδιες γραμμές με τη σελίδα της οθόνης και με το έτοιμο πρότυπο Word.
export async function hdBook(s: AppState, d: ISODate, t: Record<string, string>, sections: string[]): Promise<Made> {
  const { F, Z } = lookOf(s);
  const wb = newBook(d);
  const ws = wb.addWorksheet('ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
  const f = (o: { b?: boolean; u?: boolean; sz?: number } = {}) => ({ name: F, size: o.sz ?? Z, bold: !!o.b, underline: !!o.u });
  const solid = { style: 'thin' as const }; const dot = { style: 'dotted' as const };
  // γραμμή: στήλη Α «ΣΥΝΟΠΤΙΚΗ ΠΕΡΙΓΡΑΦΗ» (κενή), B ετικέτα, C «:», D τιμή· ή B:D ενωμένα (επικεφαλίδες, Τμήμα 2/3, υπογραφή)
  let r = 1;
  const cellIn = (c: ExcelJS.Cell, v: string, o: { b?: boolean; u?: boolean; sz?: number; h?: 'left' | 'center' | 'right' } = {}) => {
    c.value = v || null; c.font = f(o); c.alignment = { horizontal: o.h || 'left', vertical: 'middle', wrapText: true };
  };
  const frame = (row: number, last = false, head = false) => {
    ws.getCell(row, 1).border = { left: solid, right: solid, top: head ? solid : undefined, bottom: last || head ? solid : dot };
    for (let c = 2; c <= 4; c++) ws.getCell(row, c).border = { right: c === 4 ? solid : undefined, top: head ? solid : undefined, bottom: last || head ? solid : dot };
  };
  // γραμμές που πιάνει ένα κείμενο σε στήλη πλάτους w (με την αναδίπλωση)
  const lines = (v: string, w: number) => Math.max(1, v.split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(widthChars(l, { name: F, sz: Z, b: false }) / (w - 1))), 0));
  const height = (row: number, n: number) => { ws.getRow(row).height = Math.max(20, n * (Z + 3) + 6); };
  const WA = 14, WB = 26, WC = 3, WD = 60;
  const full = (v: string, o: { u?: boolean; h?: 'left' | 'center'; last?: boolean } = {}) => {
    ws.mergeCells(r, 2, r, 4); cellIn(ws.getCell(r, 2), v, { u: o.u, h: o.h || 'center' }); frame(r, o.last); height(r, lines(v, WB + WC + WD)); r++;
  };
  const lab = (a: string, v: string) => {
    cellIn(ws.getCell(r, 2), a); cellIn(ws.getCell(r, 3), ':', { h: 'center' }); cellIn(ws.getCell(r, 4), v); frame(r); height(r, Math.max(lines(v, WD), lines(a, WB))); r++;
  };
  const gap = () => full('');
  const sec = (k: string) => sections.forEach((n, i) => lab((i + 1) + '. ' + n, t[k + (i + 1)]));
  ws.mergeCells(r, 1, r, 4); cellIn(ws.getCell(r, 1), 'ΜΟΝΑΔΑ: ' + t['ΜΟΝΑΔΑ'], { b: true }); r++;
  ws.mergeCells(r, 1, r, 4); cellIn(ws.getCell(r, 1), '1ο ΕΓ/68/80', { b: true, h: 'right', sz: Math.max(7, Z - 3) }); r++;
  ws.mergeCells(r, 1, r, 4); cellIn(ws.getCell(r, 1), 'ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ΤΗΣ ' + t['ΗΜΕΡΟΜΗΝΙΑ'], { b: true, h: 'center' }); ws.getRow(r).height = Z * 2 + 6; r++;
  const head = r; cellIn(ws.getCell(r, 1), 'ΣΥΝΟΠΤΙΚΗ ΠΕΡΙΓΡΑΦΗ', { h: 'center' }); ws.mergeCells(r, 2, r, 4); cellIn(ws.getCell(r, 2), 'ΑΝΑΛΥΤΙΚΗ ΠΕΡΙΓΡΑΦΗ', { h: 'center' }); frame(r, false, true); height(r, 2); r++;
  full('ΤΜΗΜΑ 1°', { u: true }); full('1° ΓΡΑΦΕΙΟ - ΣΤΡΑΤΟΛΟΓΙΑ', { u: true }); full('ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ', { u: true, h: 'left' });
  lab('ΑΥΔΜ', t['ΑΥΔΜ']); lab('Δ/Ν ' + t['ΙΛΗΣ'], t['ΔΝ']); lab('ΙΛΧΟΣ ΕΒΔΟΜΑΔΟΣ', t['ΙΛΧΟΣ']); gap();
  full('ΜΕΤΑΒΟΛΕΣ ΑΞΙΩΜΑΤΙΚΩΝ', { u: true, h: 'left' }); sec('ΑΞ'); gap();
  full('ΜΕΤΑΒΟΛΕΣ ΟΠΛΙΤΩΝ', { u: true, h: 'left' }); sec('ΟΠ'); gap();
  full('ΤΜΗΜΑ 2°', { u: true }); full('4° ΓΡΑΦΕΙΟ', { u: true }); full('ΚΑΤΑΛΟΓΙΣΜΟΣ ΔΗΜΟΣΙΟΥ ΥΛΙΚΟΥ ΣΕ ΒΑΡΟΣ ΟΠΛΙΤΩΝ', { u: true }); full(t['ΤΜΗΜΑ2']); gap();
  full('ΤΜΗΜΑ 3°', { u: true }); full('ΔΙΟΙΚΗΤΙΚΗ ΜΕΡΙΜΝΑ – ΤΡΟΦΟΔΟΣΙΑ', { u: true }); full('ΜΙΣΘΟΔΟΣΙΑ:', { u: true, h: 'left' }); full(t['ΤΜΗΜΑ3'], { h: 'left' }); gap();
  // υπογραφή δεξιά (στη στήλη της τιμής), όπως στη σελίδα
  cellIn(ws.getCell(r, 4), t['ΥΠΟΓΡΑΦΗ'], { h: 'center' }); frame(r, true); height(r, lines(t['ΥΠΟΓΡΑΦΗ'], WD));
  [WA, WB, WC, WD].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.pageSetup.printArea = 'A1:D' + r; ws.pageSetup.printTitlesRow = head + ':' + head;
  const data = Buffer.from(await wb.xlsx.writeBuffer());
  return { name: 'ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ' + d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(0, 4) + '.xlsx', data, marks: [] };
}
