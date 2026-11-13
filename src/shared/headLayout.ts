// Η επικεφαλίδα που σχεδίασες (docHead.ts) πάνω σε φύλλο: τα τρία κουτιά γίνονται τρεις ομάδες στηλών (όσο το πλάτος της σελίδας,
// με το κοντινότερο όριο στο 1/3 και 2/3 του πλάτους σε px), κάθε γραμμή κειμένου μία γραμμή του φύλλου ενωμένη στις στήλες του
// κουτιού, κάθε εικόνα στη θέση της (πάνω από τα γράμματα ή δίπλα). Καθαρός υπολογισμός: το πού γράφονται τα κελιά και οι εικόνες
// (ExcelJS, xlsx.ts) το κάνουν οι γράφοντες. Μονάδες: px στα 96 dpi, ύψη γραμμών σε στιγμές (pt).
import type { DocHead, HeadAl, HeadItem } from './docHead';

export const CM_PX = 96 / 2.54;   // 1 εκ. = 37,795 px
export const ptPx = (pt: number) => (pt * 96) / 72;
export interface ImgInfo { w: number; h: number }   // το μέγεθος της εικόνας σε px (μόνο η αναλογία μετρά)
export interface LayoutIn { head: DocHead; colPx: number[]; hdrSz: number; img: (id: string) => ImgInfo | null }
export interface TextAt { r: number; c1: number; c2: number; zone: number; date: boolean; item: Extract<HeadItem, { k: 'text' }> | null; al: HeadAl }
export interface PicAt { id: string; gray: boolean; zone: number; r: number; col: number; dx: number; w: number; h: number }   // r: γραμμή μέσα στην επικεφαλίδα (από 0)· col από 1· dx: px μέσα στη στήλη col
export interface HeadLayout { rows: number; rowPt: number[]; cells: TextAt[]; pics: PicAt[]; zones: [number, number][] }

// Τα όρια των τριών ομάδων στηλών: [c1, c2] ανά κουτί (από 1). Λιγότερες από 3 στήλες: όλα στο πρώτο κουτί, τα άλλα άδεια (c1 > c2)
export function zonesOf(colPx: number[]): [number, number][] {
  const n = colPx.length; if (n < 3) return [[1, n], [n + 1, n], [n + 1, n]];
  const total = colPx.reduce((a, b) => a + b, 0) || n; const cut = (k: number) => {
    let acc = 0, best = 1, bd = Infinity;
    for (let i = 1; i < n; i++) { acc += colPx[i - 1]; const d = Math.abs(acc - (total * k) / 3); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  let a = cut(1), b = cut(2); if (a < 1) a = 1; if (b <= a) b = a + 1; if (b > n - 1) { b = n - 1; if (a >= b) a = b - 1; }
  return [[1, a], [a + 1, b], [b + 1, n]];
}
const baseRowPt = (sz: number) => Math.max(12.75, Math.round(sz * 1.3 * 4) / 4);

export function layoutHead(inp: LayoutIn): HeadLayout {
  const { head, colPx, hdrSz } = inp; const zones = zonesOf(colPx);
  const left = (c: number) => { let x = 0; for (let i = 1; i < c; i++) x += colPx[i - 1]; return x; };   // px από την αριστερή άκρη ως την αρχή της στήλης c
  const width = (c1: number, c2: number) => left(c2 + 1) - left(c1);
  const colAt = (x: number): [number, number] => { let c = 1, acc = 0; while (c < colPx.length && acc + colPx[c - 1] <= x) { acc += colPx[c - 1]; c++; } return [c, Math.max(0, x - acc)]; };
  const base = baseRowPt(hdrSz), basePx = ptPx(base);
  const cells: TextAt[] = []; const pics: PicAt[] = []; let rows = 0; const need: number[] = [];
  const needAt = (r: number, pt: number) => { need[r] = Math.max(need[r] || base, pt); };
  zones.forEach(([c1, c2], zone) => {
    if (c1 > c2) return;
    const items = head.z[zone] || []; const zw = width(c1, c2);
    // εικόνες: μέγεθος (ύψος σε εκ., πλάτος από την αναλογία, όχι πιο φαρδιά από το κουτί)
    const pic = (it: Extract<HeadItem, { k: 'img' }>) => {
      const nat = it.id ? inp.img(it.id) : null; if (!nat || !(nat.w > 0 && nat.h > 0)) return null;
      let h = it.h * CM_PX, w = (h * nat.w) / nat.h; if (w > zw) { w = zw; h = (w * nat.h) / nat.w; }
      return { w, h };
    };
    // πόσο στενεύει το κείμενο από εικόνες «δίπλα»
    let padL = 0, padR = 0;
    for (const it of items) if (it.k === 'img' && it.side) { const p = pic(it); if (!p) continue; if (it.al === 'r') padR = Math.max(padR, p.w + 4); else padL = Math.max(padL, p.w + 4); }
    let t1 = c1, t2 = c2;
    if (padL) while (t1 < c2 && left(t1) - left(c1) < padL) t1++;
    if (padR) while (t2 > t1 && left(c2 + 1) - left(t2 + 1) < padR) t2--;
    let cur = 0, zoneRows = 0;
    for (const it of items) {
      if (it.k === 'gap') { cur++; continue; }
      if (it.k === 'img') {
        const p = pic(it); if (!p) continue;   // χωρίς εικόνα ή χωρίς αρχείο: δεν γράφεται
        const x = left(c1) + (it.al === 'r' ? zw - p.w : it.al === 'c' && !it.side ? (zw - p.w) / 2 : 0); const [col, dx] = colAt(x);
        pics.push({ id: it.id, gray: !!it.gray, zone, r: cur, col, dx, w: p.w, h: p.h });
        const n = Math.max(1, Math.ceil(p.h / basePx)); zoneRows = Math.max(zoneRows, cur + n);
        if (!it.side) cur += n;
        continue;
      }
      const date = it.k === 'date'; const t = date ? null : it;
      const al: HeadAl = (t && t.al) || 'c';
      cells.push({ r: cur, c1: t1, c2: t2, zone, date, item: t, al }); needAt(cur, baseRowPt(t?.sz ?? hdrSz)); cur++;
    }
    rows = Math.max(rows, cur, zoneRows);
  });
  const rowPt = Array.from({ length: rows }, (_, r) => need[r] || base);
  return { rows, rowPt, cells, pics, zones };
}
