// Γράφει την επικεφαλίδα που σχεδίασες (docHead.ts, headLayout.ts) σε φύλλο του xlsx.ts: καθαρίζει τα κελιά της σημερινής
// κεφαλίδας και τόπου/ημερομηνίας, κάνει χώρο (γραμμές στην κορυφή) αν χρειάζεται, γράφει τις γραμμές κειμένου ενωμένες στο κουτί τους και
// βάζει τις εικόνες (Workbook.addPicture). Όλα τα κείμενα με κεφαλαία, όπως ό,τι γράφει η εφαρμογή στα Excel.
import type { AppState } from '../shared/domain';
import { upper } from '../shared/text';
import { formPart, xlLook } from '../shared/xlLook';
import type { DocHead } from '../shared/docHead';
import { CM_PX } from '../shared/headLayout';
import type { RepImage } from '../shared/reports';
import type { Block } from '../shared/layout';
import { layoutHead, type HeadLayout } from '../shared/headLayout';
import { colName, splitRef, unesc, type PicIn, type Sheet, type Workbook } from './xlsx';
import { blockOf } from './layout';
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
  at?: number;                  // old κενό: η επικεφαλίδα μπαίνει κάτω από αυτή τη γραμμή (αλλιώς στην κορυφή)
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
  const top = rowsOld.length ? Math.min(...rowsOld) : (o.at ?? 0) + 1, bottom = rowsOld.length ? Math.max(...rowsOld) : 0;
  const avail = rowsOld.length ? bottom - top + 1 : 0; const R = lay.rows; const by = Math.max(0, R - avail); const after = rowsOld.length ? bottom : (o.at ?? 0);
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
  const dateZones = new Set(lay.cells.filter(c => c.date).map(c => c.zone));
  for (const p of lay.pics) {
    const img = loadHeadImage(p.id, p.gray); if (!img) continue;
    // η εικόνα ανήκει στο κομμάτι που κάθεται το κουτί της: με την ημερομηνία (κουτί με «τόπος και ημερομηνία») ή με την κεφαλίδα
    wb.addPicture(ws, { bytes: img.bytes, ext: img.ext, col0: p.col - 1, colOff: Math.round(p.dx * EMU_PX), row0: top + p.r - 1, rowOff: 0, w: p.w, h: p.h, tag: dateZones.has(p.zone) ? 'date' : 'head' });
  }
  return done;
}

// Οι δικές σου εικόνες πάνω στο χαρτί (Report.images): γράφονται στο τέλος, αφού μπουν κεφαλίδα, υπογραφές και μετακινήσεις, για να είναι οι θέσεις τελικές.
// end: η τελευταία γραμμή του πίνακα (για τις εικόνες rel 'foot'). Γυρνά το κουτάκι κάθε εικόνας (img0, img1…) για τις «Θέσεις στο χαρτί»·
// εικόνα χωρίς id ή χωρίς αρχείο παραλείπεται (το id της σειράς μένει: τα κουτάκια ακολουθούν τη σειρά του Report.images)
export function placeImages(wb: Workbook, ws: Sheet, imgs: RepImage[] | undefined, end: number): Block[] {
  const out: Block[] = [];
  (imgs || []).forEach((im, i) => {
    const x = im.id ? loadHeadImage(im.id, !!im.gray) : null; if (!x) return;
    const row = Math.max(1, im.at.rel === 'foot' ? end + im.at.r : im.at.r), col = Math.max(1, im.at.c);
    const h = im.h * CM_PX, w = (h * x.w) / x.h;
    wb.addPicture(ws, { bytes: x.bytes, ext: x.ext, col0: col - 1, colOff: 0, row0: row - 1, rowOff: 0, w, h });
    // τα κελιά που πιάνει (για το κουτάκι)
    let r2 = row, acc = ws.rowHeight(row) * 96 / 72; while (acc < h - 0.5 && r2 < row + 400) { r2++; acc += ws.rowHeight(r2) * 96 / 72; }
    let c2 = col, aw = colPxOf(ws.colWidth(col)); while (aw < w - 0.5 && c2 < col + 60) { c2++; aw += colPxOf(ws.colWidth(c2)); }
    out.push({ id: 'img' + i, r1: row, c1: col, r2, c2 });
  });
  return out;
}

// Τα κομμάτια «head» και «date» για τις «Θέσεις στο χαρτί»: τα κελιά τους και οι εικόνες τους. Η εικόνα μπαίνει στο κουτάκι (για να τη βλέπεις να
// κινείται μαζί του), εκτός αν έτσι το κουτάκι θα πατούσε το άλλο· οι εικόνες ακολουθούν τη μετακίνηση ούτως ή άλλως (layout.ts, Workbook.movePics)
export function headBlocks(wb: Workbook, ws: Sheet, dh: HeadDone): (Block | null)[] {
  const rect = (ps: PicIn[]): Block | null => {
    let b: Block | null = null;
    for (const p of ps) {
      const r1 = p.row0 + 1, c1 = p.col0 + 1; let r2 = r1, c2 = c1;
      for (let acc = ws.rowHeight(r1) * 96 / 72; acc < p.h - 0.5 && r2 < r1 + 400; acc += ws.rowHeight(r2) * 96 / 72) r2++;
      for (let aw = colPxOf(ws.colWidth(c1)); aw < p.w - 0.5 && c2 < c1 + 60; aw += colPxOf(ws.colWidth(c2))) c2++;
      b = b ? { id: b.id, r1: Math.min(b.r1, r1), c1: Math.min(b.c1, c1), r2: Math.max(b.r2, r2), c2: Math.max(b.c2, c2) } : { id: '', r1, c1, r2, c2 };
    }
    return b;
  };
  const hit = (a: Block, b: Block) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
  const h = blockOf(ws, 'head', dh.head), d = blockOf(ws, 'date', dh.date);
  const hp = rect(wb.picsOf(ws, 'head')), dp = rect(wb.picsOf(ws, 'date'));
  const join = (id: string, t: Block | null, p: Block | null, other: Block | null): Block | null => {
    if (!p) return t; if (!t) return { ...p, id };
    const u: Block = { id, r1: Math.min(t.r1, p.r1), c1: Math.min(t.c1, p.c1), r2: Math.max(t.r2, p.r2), c2: Math.max(t.c2, p.c2) };
    return other && hit(u, other) && !hit(t, other) ? t : u;
  };
  return [join('head', h, hp, d), join('date', d, dp, h)];
}
