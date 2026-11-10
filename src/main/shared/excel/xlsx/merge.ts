// Whole-file operations: fit an ExcelJS file, merge sheets of several files into one.
//
// Purpose: `fitBook` (make every cell of a foreign file show whole), `mergeFirstSheets` and `mergeSheets` (one file
//   with the sheets of many already filled files of the same template).
// Does NOT: fill cells or decide which sheets to merge (the exports feature does); it works on zip bytes only.
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: these three functions worked on whole files and were the tail of the old src/main/xlsx.ts. Moved verbatim
//   (Phase 4.7); `mergeFirstSheets` and `mergeSheets` stay oversize (known follow-up in the ratchet baseline).
// Covering test: test/exports.test.ts (mergeFirstSheets), test/outs-all.test.ts and test/outs-fmt.test.ts
//   (mergeSheets).
import JSZip from 'jszip';
import { attr, setAttr } from './refs';
import { esc } from './text';
import { Workbook } from './workbook';

/**
 * Re-saves a file made by ExcelJS so that every cell with a value shows whole (`Workbook.fitSheet`).
 * @param buf  the xlsx bytes
 * @returns the fitted xlsx bytes
 */
export async function fitBook(buf: Buffer | Uint8Array): Promise<Buffer> {
  const wb = await Workbook.open(buf);
  wb.widen = true;
  for (const n of wb.sheetNames()) (await wb.sheet(n)).markAll();
  return wb.save();
}

/**
 * One file with many sheets from already filled files of the same template (e.g. ΦΡΟΥΡΑ ΠΣΚ: one sheet per day).
 * Takes the first sheet of each file; styles and shared strings are the same, since they came from the same
 * template.
 * @param bufs  filled xlsx files of one template
 * @param names  the sheet name of each file in the result
 * @param pick  name of the sheet that is kept (when the form is not the first sheet of the template)
 * @returns the merged xlsx bytes
 */
export async function mergeFirstSheets(bufs: Buffer[], names: string[], pick?: string): Promise<Buffer> {
  const sheetTag = (x: string) =>
    [...x.matchAll(/<sheet\b[^>]*>/g)]
      .map((m) => m[0])
      .find((t) => pick && attr(t, 'name')!.replace(/&amp;/g, '&') === pick) || /<sheet\b[^>]*>/.exec(x)![0];
  const xmlName = (n: string) => esc(n.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
  const base = await JSZip.loadAsync(bufs[0]);
  let wbx = await base.file('xl/workbook.xml')!.async('string');
  let rels = await base.file('xl/_rels/workbook.xml.rels')!.async('string');
  let ct = await base.file('[Content_Types].xml')!.async('string');
  const firstSheet = sheetTag(wbx);
  const oldName = attr(firstSheet, 'name')!;
  const printArea = (x: string) =>
    /<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>([^<]*)<\/definedName>/.exec(x)?.[1] || null;
  const areaFor = (body: string | null, name: string) =>
    body ? body.replace(/^.*!/, "'" + xmlName(name).replace(/'/g, "''") + "'!") : null;
  // first sheet: new name and print area
  wbx = wbx.replace(firstSheet, setAttr(firstSheet, 'name', xmlName(names[0])));
  const areas: (string | null)[] = [areaFor(printArea(wbx), names[0])];
  let maxId = Math.max(...[...wbx.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1]));
  let maxRid = Math.max(...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]));
  const newSheets: string[] = [];
  for (let i = 1; i < bufs.length; i++) {
    const z = await JSZip.loadAsync(bufs[i]);
    const zw = await z.file('xl/workbook.xml')!.async('string');
    const zr = await z.file('xl/_rels/workbook.xml.rels')!.async('string');
    const rid = attr(sheetTag(zw), 'r:id')!;
    const target = attr(
      [...zr.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => attr(r, 'Id') === rid)!,
      'Target',
    )!;
    const src = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    // copy of the sheet without its own relations (printer, drawings): else references to nothing would remain
    let x = (await z.file(src)!.async('string'))
      .replace(/<drawing\b[^>]*\/>|<legacyDrawing\b[^>]*\/>/g, '')
      .replace(/\sr:id="[^"]*"/g, '')
      .replace(/\stabSelected="1"/g, '');
    const path = `xl/worksheets/sheet_m${i + 1}.xml`;
    base.file(path, x);
    maxId++;
    maxRid++;
    newSheets.push(
      `<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="${xmlName(names[i])}" sheetId="${maxId}" state="visible" r:id="rId${maxRid}"/>`,
    );
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/${path}" Id="rId${maxRid}"/></Relationships>`,
    );
    ct = ct.replace(
      '</Types>',
      `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    );
    areas.push(areaFor(printArea(zw), names[i]));
  }
  wbx = wbx.replace('</sheets>', newSheets.join('') + '</sheets>');
  // print areas of all the sheets
  const dn = areas
    .map((a, i) => (a ? `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${a}</definedName>` : ''))
    .join('');
  wbx = wbx.replace(/<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>[^<]*<\/definedName>/g, '');
  if (/<definedNames>/.test(wbx)) wbx = wbx.replace('<definedNames>', '<definedNames>' + dn);
  else if (dn) wbx = wbx.replace('</sheets>', '</sheets><definedNames>' + dn + '</definedNames>');
  wbx = wbx.replace(/<definedNames><\/definedNames>/, '');
  // other names that pointed at the old name of the first sheet
  const on = oldName.replace(/&amp;/g, '&');
  const nn = "'" + xmlName(names[0]).replace(/'/g, "''") + "'!";
  wbx = wbx.replace(
    /(<definedName\b[^>]*>)([^<]*)(<\/definedName>)/g,
    (_m, a, b: string, c) =>
      a +
      b
        .split("'" + on + "'!")
        .join(nn)
        .split(on + '!')
        .join(nn) +
      c,
  );
  base.file('xl/workbook.xml', wbx);
  base.file('xl/_rels/workbook.xml.rels', rels);
  base.file('[Content_Types].xml', ct);
  return base.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * The same as `mergeFirstSheets`, but with many sheets from each file (Εξοδούχοι «Όλη η δύναμη» in ΠΣΚ: two sheets
 * per day). From the first file the sheets that are not kept are removed; sheets go in the order of the files and
 * then
 * of the picks.
 * @param bufs  filled xlsx files of one template
 * @param picks  picks[i]: the sheets of file i that are kept
 * @param names  names[i]: their new names (same order)
 * @returns the merged xlsx bytes
 */
export async function mergeSheets(bufs: Buffer[], picks: string[][], names: string[][]): Promise<Buffer> {
  const xmlName = (n: string) => esc(n.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
  const plain = (t: string) => attr(t, 'name')!.replace(/&amp;/g, '&');
  // first file: only the sheets that are kept
  const first = await Workbook.open(bufs[0]);
  let dropped = false;
  for (const n of first.sheetNames())
    if (!picks[0].includes(n)) {
      await first.dropSheet(n);
      dropped = true;
    }
  const base = await JSZip.loadAsync(dropped ? await first.save() : bufs[0]);
  let wbx = await base.file('xl/workbook.xml')!.async('string');
  let rels = await base.file('xl/_rels/workbook.xml.rels')!.async('string');
  let ct = await base.file('[Content_Types].xml')!.async('string');
  const tagsOf = (x: string) => [...x.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]);
  const printArea = (x: string, idx: number) =>
    [...x.matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g)].find(
      (m) => attr(m[1], 'name') === '_xlnm.Print_Area' && attr(m[1], 'localSheetId') === String(idx),
    )?.[2] || null;
  const areaFor = (body: string | null, name: string) =>
    body ? body.replace(/^.*!/, "'" + xmlName(name).replace(/'/g, "''") + "'!") : null;
  // first file: new names and print areas
  const areas: (string | null)[] = [];
  const oldNames: [string, string][] = [];
  const baseTags = tagsOf(wbx);
  baseTags.forEach((t, idx) => {
    const j = picks[0].indexOf(plain(t));
    const nn = j >= 0 ? names[0][j] : plain(t);
    areas.push(areaFor(printArea(wbx, idx), nn));
    oldNames.push([plain(t), nn]);
  });
  for (const t of baseTags) {
    const j = picks[0].indexOf(plain(t));
    if (j >= 0) wbx = wbx.replace(t, setAttr(t, 'name', xmlName(names[0][j])));
  }
  let maxId = Math.max(...[...wbx.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1]));
  let maxRid = Math.max(...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]));
  const newSheets: string[] = [];
  for (let i = 1; i < bufs.length; i++) {
    const z = await JSZip.loadAsync(bufs[i]);
    const zw = await z.file('xl/workbook.xml')!.async('string');
    const zr = await z.file('xl/_rels/workbook.xml.rels')!.async('string');
    const tags = tagsOf(zw);
    for (let j = 0; j < picks[i].length; j++) {
      const idx = tags.findIndex((t) => plain(t) === picks[i][j]);
      if (idx < 0) throw new Error('Λείπει το φύλλο ' + picks[i][j]);
      const rid = attr(tags[idx], 'r:id')!;
      const target = attr(
        [...zr.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => attr(r, 'Id') === rid)!,
        'Target',
      )!;
      const src = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
      const x = (await z.file(src)!.async('string'))
        .replace(/<drawing\b[^>]*\/>|<legacyDrawing\b[^>]*\/>/g, '')
        .replace(/\sr:id="[^"]*"/g, '')
        .replace(/\stabSelected="1"/g, '');
      const path = `xl/worksheets/sheet_m${i + 1}_${j + 1}.xml`;
      base.file(path, x);
      maxId++;
      maxRid++;
      newSheets.push(
        `<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="${xmlName(names[i][j])}" sheetId="${maxId}" state="visible" r:id="rId${maxRid}"/>`,
      );
      rels = rels.replace(
        '</Relationships>',
        `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/${path}" Id="rId${maxRid}"/></Relationships>`,
      );
      ct = ct.replace(
        '</Types>',
        `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      );
      areas.push(areaFor(printArea(zw, idx), names[i][j]));
    }
  }
  wbx = wbx.replace('</sheets>', newSheets.join('') + '</sheets>');
  // print areas of all the sheets
  const dn = areas
    .map((a, i) => (a ? `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${a}</definedName>` : ''))
    .join('');
  wbx = wbx.replace(/<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>[^<]*<\/definedName>/g, '');
  if (/<definedNames>/.test(wbx)) wbx = wbx.replace('<definedNames>', '<definedNames>' + dn);
  else if (dn) wbx = wbx.replace('</sheets>', '</sheets><definedNames>' + dn + '</definedNames>');
  wbx = wbx.replace(/<definedNames><\/definedNames>/, '');
  // other names that pointed at the old names of the sheets of the first file
  for (const [o, n] of oldNames) {
    if (o === n) continue;
    const nn = "'" + xmlName(n).replace(/'/g, "''") + "'!";
    wbx = wbx.replace(
      /(<definedName\b[^>]*>)([^<]*)(<\/definedName>)/g,
      (_m, a, b: string, c) =>
        a +
        b
          .split("'" + o + "'!")
          .join(nn)
          .split(o + '!')
          .join(nn) +
        c,
    );
  }
  base.file('xl/workbook.xml', wbx);
  base.file('xl/_rels/workbook.xml.rels', rels);
  base.file('[Content_Types].xml', ct);
  return base.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
