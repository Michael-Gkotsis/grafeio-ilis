// Εικόνες μέσα σε φύλλα Excel (xl/drawings): ανάγνωση των αγκυρώσεων xdr:oneCellAnchor, twoCellAnchor και absoluteAnchor με xdr:pic.
// Το διαβάζει η εκτύπωση και η προεπισκόπηση (print.ts)· ο γραφέας εικόνων στα πρότυπα (xlsx.ts) μπορεί να ξαναχρησιμοποιήσει
// τα ίδια: parseDrawings (θέση σε κελιά ή απόλυτη), sheetRelsPath, resolveTarget, sniffImage, EMU_PX.
import path from 'path';
import type JSZip from 'jszip';

export const EMU_PX = 9525;   // 1 px στα 96 dpi
export interface CellPos { c: number; r: number; co: number; ro: number }   // c, r από το 1 (όπως τα κελιά του φύλλου)· co, ro σε EMU μέσα στο κελί
export interface DrawingPic {
  kind: 'one' | 'two' | 'abs';
  from?: CellPos; to?: CellPos;            // one: from + ext· two: from + to
  x?: number; y?: number;                  // abs: EMU από την πάνω αριστερή άκρη του φύλλου
  cx: number; cy: number;                  // ext σε EMU (one, abs)
  media: string;                           // η διαδρομή του αρχείου εικόνας μέσα στο zip (xl/media/…)
}
export type ImgMime = 'image/png' | 'image/jpeg' | 'image/gif';

const T = (n: string) => '(?:[\\w.-]+:)?' + n;
const tagRe = (n: string) => new RegExp('<' + T(n) + '\\b([^>]*?)(?:/>|>([\\s\\S]*?)</' + T(n) + '>)', 'g');
const attrOf = (s: string, n: string) => new RegExp('(?:^|\\s)' + n + '="([^"]*)"').exec(s)?.[1];
const numIn = (xml: string, tag: string) => { const m = new RegExp('<' + T(tag) + '\\b[^>]*>\\s*(-?\\d+)\\s*</' + T(tag) + '>').exec(xml); return m ? +m[1] : 0; };
const cellPos = (xml: string | undefined): CellPos | undefined => xml ? { c: numIn(xml, 'col') + 1, r: numIn(xml, 'row') + 1, co: numIn(xml, 'colOff'), ro: numIn(xml, 'rowOff') } : undefined;
const sub = (xml: string, tag: string) => new RegExp('<' + T(tag) + '\\b[^>]*>([\\s\\S]*?)</' + T(tag) + '>').exec(xml)?.[1];

// «../drawings/drawing1.xml» σε σχέση με το xl/worksheets/sheet1.xml → xl/drawings/drawing1.xml
export const resolveTarget = (baseFile: string, target: string) => (target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(baseFile), target)));
export const sheetRelsPath = (file: string) => path.posix.join(path.posix.dirname(file), '_rels', path.posix.basename(file) + '.rels');
const relsOf = (xml: string) => { const m = new Map<string, string>(); for (const r of xml.matchAll(/<Relationship\b[^>]*>/g)) { const id = attrOf(r[0], 'Id'), t = attrOf(r[0], 'Target'); if (id && t) m.set(id, t); } return m; };

// Ο τύπος της εικόνας από τα πρώτα byte (όχι από την κατάληξη): PNG, JPEG, GIF· EMF, WMF κ.ά. → null
export function sniffImage(b: Uint8Array): ImgMime | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  return null;
}

// Οι εικόνες ενός φύλλου (η διαδρομή του φύλλου μέσα στο zip). Ό,τι δεν είναι απλή εικόνα (ομάδες, σχήματα, κρυμμένες) αγνοείται.
export async function parseDrawings(zip: JSZip, sheetPath: string, sheetXml: string): Promise<DrawingPic[]> {
  const rid = /<drawing\s[^>]*?r:id="([^"]+)"/.exec(sheetXml)?.[1]; if (!rid) return [];
  const relF = zip.file(sheetRelsPath(sheetPath)); if (!relF) return [];
  const target = relsOf(await relF.async('string')).get(rid); if (!target) return [];
  const dpath = resolveTarget(sheetPath, target); const dF = zip.file(dpath); if (!dF) return [];
  const dxml = await dF.async('string');
  const drel = zip.file(sheetRelsPath(dpath)); const drels = drel ? relsOf(await drel.async('string')) : new Map<string, string>();
  const out: DrawingPic[] = [];
  for (const [kind, name] of [['one', 'oneCellAnchor'], ['two', 'twoCellAnchor'], ['abs', 'absoluteAnchor']] as const) {
    for (const m of dxml.matchAll(tagRe(name))) {
      const body = m[2] || ''; if (/<(?:[\w.-]+:)?grpSp\b/.test(body)) continue;
      const pic = new RegExp('<' + T('pic') + '\\b[^>]*>([\\s\\S]*?)</' + T('pic') + '>').exec(body)?.[1]; if (!pic) continue;
      if (/<(?:[\w.-]+:)?cNvPr\b[^>]*\shidden="(1|true)"/.test(pic)) continue;
      const emb = /<(?:[\w.-]+:)?blip\b[^>]*?r:embed="([^"]+)"/.exec(pic)?.[1]; const t = emb && drels.get(emb); if (!t) continue;
      const ext = /<(?:[\w.-]+:)?ext\b[^>]*?cx="(\d+)"[^>]*?cy="(\d+)"/.exec(body.replace(pic, '')); const cx = ext ? +ext[1] : 0, cy = ext ? +ext[2] : 0;
      const p: DrawingPic = { kind, cx, cy, media: resolveTarget(dpath, t) };
      if (kind === 'abs') { const pos = /<(?:[\w.-]+:)?pos\b[^>]*?x="(-?\d+)"[^>]*?y="(-?\d+)"/.exec(body); if (!pos) continue; p.x = +pos[1]; p.y = +pos[2]; }
      else { p.from = cellPos(sub(body, 'from')); if (!p.from) continue; if (kind === 'two') { p.to = cellPos(sub(body, 'to')); if (!p.to) continue; } }
      if (kind !== 'two' && (cx <= 0 || cy <= 0)) continue;
      out.push(p);
    }
  }
  return out;
}
