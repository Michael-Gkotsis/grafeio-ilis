// Η επικεφαλίδα που σχεδίασες (docHead.ts) πάνω σε φύλλο: τα τρία κουτιά γίνονται τρεις ομάδες στηλών (όσο το πλάτος της σελίδας,
// με το κοντινότερο όριο στο 1/3 και 2/3 του πλάτους σε px), κάθε γραμμή κειμένου μία γραμμή του φύλλου ενωμένη στις στήλες του
// κουτιού, κάθε εικόνα στη θέση της (πάνω από τα γράμματα ή δίπλα). Καθαρός υπολογισμός: το πού γράφονται τα κελιά και οι εικόνες
// (ExcelJS, xlsx.ts) το κάνουν οι γράφοντες. Μονάδες: px στα 96 dpi, ύψη γραμμών σε στιγμές (pt).
import type { DocHead, HeadAl, HeadItem } from './docHead';
import { upper } from './text';

export const CM_PX = 96 / 2.54;   // 1 εκ. = 37,795 px
export const ptPx = (pt: number) => (pt * 96) / 72;
export interface ImgInfo { w: number; h: number }   // το μέγεθος της εικόνας σε px (μόνο η αναλογία μετρά)
export interface LayoutIn { head: DocHead; colPx: number[]; hdrSz: number; img: (id: string) => ImgInfo | null; textPx?: (t: string, sz: number, b: boolean) => number; dateText?: string }
export interface TextAt { r: number; c1: number; c2: number; zone: number; date: boolean; item: Extract<HeadItem, { k: 'text' }> | null; al: HeadAl; over?: boolean }   // over: δεν χωρά στο κουτί· γράφεται σε ένα κελί (c1 = c2) χωρίς αναδίπλωση και συνεχίζει στα άδεια διπλανά
export interface PicAt { id: string; gray: boolean; zone: number; r: number; col: number; dx: number; w: number; h: number }   // r: γραμμή μέσα στην επικεφαλίδα (από 0)· col από 1· dx: px μέσα στη στήλη col
export interface HeadLayout { rows: number; rowPt: number[]; cells: TextAt[]; pics: PicAt[]; zones: [number, number][] }

// Τα όρια των τριών ομάδων στηλών: [c1, c2] ανά κουτί (από 1). Λιγότερες από 3 στήλες: όλα στο πρώτο κουτί, τα άλλα άδεια (c1 > c2)
export function zonesOf(colPx: number[], used: boolean[] = [true, true, true]): [number, number][] {
  const n = colPx.length; if (n < 3) return [[1, n], [n + 1, n], [n + 1, n]];
  const total = colPx.reduce((a, b) => a + b, 0) || n;
  // όριο στήλης κοντά στο κλάσμα f του πλάτους: η πρώτη στήλη της επόμενης ομάδας (1…n+1)
  const cut = (f: number) => {
    let acc = 0, best = 1, bd = Infinity;
    for (let i = 0; i <= n; i++) { const d = Math.abs(acc - total * f); if (d < bd) { bd = d; best = i + 1; } if (i < n) acc += colPx[i]; }
    return best;
  };
  // κουτί χωρίς τίποτα δανείζει το πλάτος του στα διπλανά: κενή Μέση → το όριο στη μέση της σελίδας, κενό Αριστερά ή Δεξιά → η Μέση φτάνει ως την άκρη
  let f1 = 1 / 3, f2 = 2 / 3; const [ul, um, ur] = used;
  if (!um) f1 = f2 = 1 / 2;
  if (!ul) { f1 = 0; if (!um) f2 = 0; }
  if (!ur) { f2 = 1; if (!um) f1 = 1; }
  let s1 = cut(f1), s2 = cut(f2);   // s1: πρώτη στήλη της Μέσης, s2: πρώτη της Δεξιάς
  // κάθε κουτί που έχει κάτι παίρνει τουλάχιστον μία στήλη
  if (ul && s1 < 2) s1 = 2;
  if (ur && s2 > n) s2 = n;
  if (um && s2 <= s1) { if (ur) { s2 = Math.min(n, s1 + 1); if (s2 <= s1) s1 = s2 - 1; } else s2 = n + 1; }
  if (!um && ul && ur && s2 <= s1) s2 = s1;
  if (s1 > s2) s1 = s2;
  return [[1, s1 - 1], [s1, s2 - 1], [s2, n]];
}
const baseRowPt = (sz: number) => Math.max(12.75, Math.round(sz * 1.3 * 4) / 4);

export function layoutHead(inp: LayoutIn): HeadLayout {
  const { head, colPx, hdrSz } = inp;
  const zones = zonesOf(colPx, [0, 1, 2].map(z => (head.z[z] || []).some(it => it.k === 'text' ? !!it.t : it.k === 'img' ? !!inp.img(it.id) : it.k === 'date')));
  const tw = inp.textPx || ((s: string, sz: number, b: boolean) => s.length * sz * (96 / 72) * (b ? 0.68 : 0.6));
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
      const sz = t?.sz ?? hdrSz; const txt = upper(date ? inp.dateText || '' : t!.t);
      const fits = tw(txt, sz, !!t?.b) + 8 <= width(t1, t2);
      if (fits || !txt) cells.push({ r: cur, c1: t1, c2: t2, zone, date, item: t, al });
      else {
        // δεν χωρά: ένα κελί, χωρίς αναδίπλωση, στην άκρη του κουτιού (αριστερά: αριστερά, δεξιά: δεξιά, μέση: στο κέντρο)
        const mid = colAt((left(t1) + left(t2 + 1)) / 2)[0]; const c = zone === 0 ? t1 : zone === 2 ? t2 : Math.min(t2, Math.max(t1, mid));
        cells.push({ r: cur, c1: c, c2: c, zone, date, item: t, al: zone === 0 ? 'l' : zone === 2 ? 'r' : 'c', over: true });
      }
      needAt(cur, baseRowPt(sz)); cur++;
    }
    rows = Math.max(rows, cur, zoneRows);
  });
  const rowPt = Array.from({ length: rows }, (_, r) => need[r] || base);
  return { rows, rowPt, cells, pics, zones };
}
