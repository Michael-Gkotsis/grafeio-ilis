// Γράφει την επικεφαλίδα που σχεδίασες (docHead.ts, headLayout.ts) σε φύλλο του xlsx.ts: καθαρίζει τα κελιά της σημερινής
// κεφαλίδας και τόπου/ημερομηνίας, κάνει χώρο (γραμμές στην κορυφή) αν χρειάζεται, γράφει τις γραμμές κειμένου ενωμένες στο κουτί τους και
// βάζει τις εικόνες (Workbook.addPicture). Όλα τα κείμενα με κεφαλαία, όπως ό,τι γράφει η εφαρμογή στα Excel.
import type { AppState } from '../shared/domain';
import { upper } from '../shared/text';
import { formPart, xlLook } from '../shared/xlLook';
import type { DocHead } from '../shared/docHead';
import { layoutHead, type HeadLayout } from '../shared/headLayout';
import { colName, splitRef, unesc, type Sheet, type Workbook } from './xlsx';
import { loadHeadImage } from './headImages';
import { textPx } from './textfit';
import { EMU_PX } from './xlDrawings';

export const colPxOf = (w: number) => Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7);
export interface HeadAt {
  cols: number;                 // πόσες στήλες (από την Α) έχει η τυπωμένη σελίδα
  old: string[];                // τα κελιά της σημερινής κεφαλίδας (καθαρίζονται)· κενό = η επικεφαλίδα μπαίνει στην κορυφή
  dates?: string[];             // τα κελιά του τόπου/ημερομηνίας: όσα είναι δίπλα στην κεφαλίδα παίρνουν μέρος στο χώρο της, όσα είναι μακριά (π.χ. κάτω από τον πίνακα) απλώς καθαρίζονται
  dateText: string;             // ο τόπος και η ημερομηνία του εγγράφου, όπως γράφονται σήμερα
  dateStyle?: number | null;    // το στυλ του σημερινού κελιού ημερομηνίας (αλλιώς της κεφαλίδας)
}
export interface HeadDone {
  after: number; by: number;          // μπήκαν by γραμμές κάτω από τη γραμμή after (0 = κανείς)
  top: number; rows: number;          // η επικεφαλίδα καταλαμβάνει τις γραμμές top…top+rows-1
  head: string[]; date: string[];     // τα κελιά της (για «Θέσεις στο χαρτί»)
  shift: (r: number) => number;       // πού πάει μια γραμμή που ήταν κάτω από την after
  layout: HeadLayout;
}
export async function applyHead(wb: Workbook, ws: Sheet, s: AppState, head: DocHead, o: HeadAt): Promise<HeadDone> {
  const L = xlLook(s.settings); const hp = formPart(L, 'hdr') || {}; const hdrSz = hp.sz ?? L.sz;
  const colPx = Array.from({ length: Math.max(1, o.cols) }, (_, i) => colPxOf(ws.colWidth(i + 1)));
  const fnt = (sz: number, b: boolean) => ({ name: L.font, sz, b });
  const lay = layoutHead({ head, colPx, hdrSz, dateText: o.dateText, textPx: (x, sz, b) => textPx(x, fnt(sz, b)), img: id => { const x = loadHeadImage(id, false); return x ? { w: x.w, h: x.h } : null; } });
  // η σημερινή κεφαλίδα φεύγει (και οι συγχωνεύσεις της)
  const ok = (r: string) => /^[A-Z]+\d+$/.test(r);
  const heads = o.old.filter(ok); const hRows = heads.map(r => splitRef(r).r);
  const dts = (o.dates || []).filter(ok);
  const near = (r: string) => { const n = splitRef(r).r; return hRows.length ? hRows.some(x => Math.abs(x - n) <= 3) : n <= 8; };
  const olds = [...heads, ...dts.filter(near)]; const far = dts.filter(r => !near(r));
  const dateStyle = o.dateStyle ?? (olds.length ? ws.style(olds[olds.length - 1]) : far.length ? ws.style(far[0]) : null);
  for (const r of far) { const m = ws.mergeAt(r); if (m) ws.removeMerge(m); ws.set(r, null); }
  const rowsOld = olds.map(r => splitRef(r).r);
  for (const r of olds) { const m = ws.mergeAt(r); if (m) ws.removeMerge(m); ws.set(r, null); }
  const top = rowsOld.length ? Math.min(...rowsOld) : 1, bottom = rowsOld.length ? Math.max(...rowsOld) : 0;
  const avail = rowsOld.length ? bottom - top + 1 : 0; const R = lay.rows; const by = Math.max(0, R - avail); const after = rowsOld.length ? bottom : 0;
  if (by) { ws.insertRows(after, by, 0, wb); ws.shiftPane(after, by); if (!after) wb.printFromRow(ws.name, 1);
    // η αρίθμηση =ROW()-k κάτω από τη νέα κεφαλίδα (το ROW() δεν ακολουθεί τις γραμμές που μπήκαν)
    for (const x of [...ws.cells()].filter(y => y.r > after + by)) { const ref = colName(x.c) + x.r; const f = /^ROW\(\)\s*-\s*(\d+)$/.exec(unesc(ws.formula(ref) || '')); if (f) ws.setFormula(ref, 'ROW()-' + (+f[1] + by)); }
  }
  const done: HeadDone = { after, by, top, rows: R, head: [], date: [], shift: r => (r > after ? r + by : r), layout: lay };
  lay.rowPt.forEach((pt, i) => ws.setRowHeight(top + i, pt));
  const look = (it: { sz?: number; b?: boolean; u?: boolean; i?: boolean } | null) => ({ font: L.font, sz: it?.sz ?? hdrSz, b: !!it?.b, i: !!it?.i, u: !!it?.u, v: 'center' as const });
  const H = { l: 'left', c: 'center', r: 'right' } as const;
  for (const c of lay.cells) {
    const ref = colName(c.c1) + (top + c.r);
    if (c.date) {
      ws.set(ref, upper(o.dateText) || null); const base = dateStyle ?? await wb.style(look({ b: true })); ws.setStyle(ref, await wb.like(base, { h: H[c.al] }));
    } else {
      ws.set(ref, upper(c.item?.t || '') || null); ws.setStyle(ref, await wb.style({ ...look(c.item), h: H[c.al] }));
    }
    if (!c.over && c.c2 > c.c1) ws.addMerge(ref + ':' + colName(c.c2) + (top + c.r));
    (c.date ? done.date : done.head).push(ref);
  }
  for (const p of lay.pics) {
    const img = loadHeadImage(p.id, p.gray); if (!img) continue;
    wb.addPicture(ws, { bytes: img.bytes, ext: img.ext, col0: p.col - 1, colOff: Math.round(p.dx * EMU_PX), row0: top + p.r - 1, rowOff: 0, w: p.w, h: p.h });
  }
  return done;
}
