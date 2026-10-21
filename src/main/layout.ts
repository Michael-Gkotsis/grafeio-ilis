// Θέσεις πάνω στο χαρτί (Michael, 20/10): οι υπογραφές, η κεφαλίδα και ο τόπος/ημερομηνία μετακινούνται όσες γραμμές
// και στήλες τα έσυρες, με τις τιμές, τα στυλ και τις συγχωνεύσεις τους. Τα κελιά με τύπο δεν μετακινούνται ούτε
// σβήνονται. Η περιοχή εκτύπωσης μεγαλώνει προς τα κάτω αν χρειαστεί.
import { colName, splitRef, type Sheet, type Workbook } from './xlsx';
import { moved, type Block, type Moves } from '../shared/layout';

type Rect = { r1: number; c1: number; r2: number; c2: number };
const inside = (m: Rect, b: Rect) => m.r1 >= b.r1 && m.r2 <= b.r2 && m.c1 >= b.c1 && m.c2 <= b.c2;
const touches = (m: Rect, b: Rect) => m.r1 <= b.r2 && b.r1 <= m.r2 && m.c1 <= b.c2 && b.c1 <= m.c2;

// Το κομμάτι που πιάνουν κάποια κελιά (μαζί με τις συγχωνεύσεις τους)· null αν είναι όλα άδεια
export function blockOf(ws: Sheet, id: string, refs: string[]): Block | null {
  let b: Block | null = null;
  for (const x of refs) {
    if (!ws.raw(x)) continue;
    const m = ws.mergeAt(x); const { r, c } = splitRef(x); const z = m || { r1: r, c1: c, r2: r, c2: c };
    b = b ? { id, r1: Math.min(b.r1, z.r1), c1: Math.min(b.c1, z.c1), r2: Math.max(b.r2, z.r2), c2: Math.max(b.c2, z.c2) } : { id, ...z };
  }
  return b;
}

// Μετακινεί τα κομμάτια· γυρνά πού κατέληξε το καθένα
export function applyMoves(wb: Workbook, ws: Sheet, blocks: Block[], moves: Moves | undefined): Block[] {
  const out = blocks.map(b => ({ ...b }));
  const todo = out.map(b => ({ b, m: moves?.[b.id] })).filter(x => moved(x.m)).map(({ b, m }) => {
    const dr = Math.max(m![0], 1 - b.r1), dc = Math.max(m![1], 1 - b.c1);   // όχι πάνω ή αριστερά από το Α1
    const cells: { r: number; c: number; raw: ReturnType<Sheet['raw']>; s: number | null }[] = [];
    for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) {
      const ref = colName(c) + r; if (ws.hasFormula(ref)) continue;
      cells.push({ r, c, raw: ws.raw(ref), s: ws.style(ref) });
    }
    return { b, dr, dc, cells, merges: ws.merges().filter(x => inside(x, b)) };
  });
  // πρώτα αδειάζουν όλα (ένα κομμάτι μπορεί να πάει εκεί που ήταν ένα άλλο), μετά γράφονται στη νέα θέση
  for (const t of todo) { t.merges.forEach(m => ws.removeMerge(m)); for (const x of t.cells) if (x.raw) ws.setRaw(colName(x.c) + x.r, null); }
  for (const t of todo) {
    const to: Rect = { r1: t.b.r1 + t.dr, c1: t.b.c1 + t.dc, r2: t.b.r2 + t.dr, c2: t.b.c2 + t.dc };
    ws.merges().filter(m => touches(m, to)).forEach(m => ws.removeMerge(m));   // ό,τι ήταν συγχωνευμένο εκεί χωρίζει
    for (const x of t.cells) {
      const ref = colName(x.c + t.dc) + (x.r + t.dr); if (ws.hasFormula(ref)) continue;
      if (x.raw) ws.setRaw(ref, x.raw);
      if (x.s != null && (x.raw || t.merges.some(m => x.r >= m.r1 && x.r <= m.r2 && x.c >= m.c1 && x.c <= m.c2))) ws.setStyle(ref, x.s);
    }
    for (const m of t.merges) ws.addMerge(colName(m.c1 + t.dc) + (m.r1 + t.dr) + ':' + colName(m.c2 + t.dc) + (m.r2 + t.dr));
    wb.printDownTo(ws.name, to.r2);
    Object.assign(t.b, to);
  }
  return out;
}
