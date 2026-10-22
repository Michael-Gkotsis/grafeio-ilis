// Ίδιο αποτέλεσμα πριν και μετά από αλλαγές ταχύτητας (npm run bench:golden, πριν και μετά, και diff): hash του Excel και της εκτύπωσης
import crypto from 'crypto';
import JSZip from 'jszip';
import { buildTemplate, fillReport, previewReport } from '../src/main/reports';
import { renderBook, PRINT_DEFAULT, type PrintOpts } from '../src/main/print';
import { defaultPick, withBuilt, PRESETS, newTable, type BuildOpts, type Report } from '../src/shared/reports';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { benchState } from './state';
import fs from 'fs';
import path from 'path';

const END = '2026-10-22' as any;
const zipHash = async (buf: Buffer) => { const z = await JSZip.loadAsync(buf); const h = crypto.createHash('sha1'); for (const n of Object.keys(z.files).sort()) { if (z.files[n].dir) continue; h.update(n); h.update(await z.files[n].async('nodebuffer')); } return h.digest('hex').slice(0, 12); };
const sh = (t: string) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 12);
(async () => {
  const out: string[] = [];
  for (const n of [5, 60, 300]) {
    const s = benchState({ n, days: 60, end: END }); const ids = s.people.map(p => p.id);
    for (const pre of PRESETS) {
      for (const extra of [false, true]) {
        const o: BuildOpts = extra ? { ...pre.opts, cols: [...pre.opts.cols, { f: 'smed', h: 'ΙΑΤΡΙΚΟ', w: 'auto' } as any, { f: 'phone', h: 'ΤΗΛ', w: 'wide' }], more: [{ id: 't2', title: 'ΑΔΕΙΕΣ', kind: 'status', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑ', w: 'auto' }], lay: { w: '1/2', at: 'center', even: true } } as any] } : pre.opts;
        const kind = (pre as any).kind || 'people';
        let b; try { b = await buildTemplate(o, kind); } catch (e: any) { out.push(pre.id + ' build ERR ' + e.message); continue; }
        let r: Report = withBuilt({ id: 'r', name: pre.id, tpl: 't', kind, sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', sigs: extra ? [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }] : undefined } as Report, b, o);
        if (r.more) r.more = r.more.map(t => ({ ...t, pick: newTable('status', t.id).pick }));
        const res = await fillReport(b.data, s, r, kind === 'people' ? ids : [], END);
        const pv = await previewReport(b.data, s, r, ids, END);
        const line = [n, pre.id, extra, await zipHash(res.data), sh(pv.html), pv.pages];
        for (const lay of [PRINT_DEFAULT, { ...PRINT_DEFAULT, pages: 2 }, { ...PRINT_DEFAULT, pages: 'auto' }, { ...PRINT_DEFAULT, or: 'l', sp: 'fill', keep: false }] as PrintOpts[]) {
          const d = await renderBook(res.data, { file: 'x.xlsx', layout: lay }); line.push(sh(d.sheets.map(x => x.html).join('')), JSON.stringify(d.sug || null));
        }
        const d2 = await renderBook(res.data, { file: 'x.xlsx', refs: true, maxPages: 2 }); line.push(sh(d2.sheets.map(x => x.html).join('')));
        out.push(line.join(' '));
      }
    }
    // τα έντυπα της εφαρμογής (ίδιο xlsx.ts)
    const tpl = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', f));
    for (const [k, f] of [['froura', () => fillFroura(tpl('froura.xlsx'), s, END)], ['hkai', () => fillHkai(tpl('hkai.xlsx'), s, END)], ['outs', () => fillOuts(tpl('exodouxoi.xlsx'), s, END)]] as const) {
      try { const x = await f(); const d = await renderBook(x.data, { file: 'x.xlsx', layout: PRINT_DEFAULT }); out.push(k + ' ' + n + ' ' + await zipHash(x.data) + ' ' + sh(d.sheets.map(y => y.html).join(''))); } catch (e: any) { out.push(k + ' ERR ' + e.message); }
    }
  }
  console.log(out.join('\n'));
})();
