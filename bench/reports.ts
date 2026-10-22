// Μέτρηση των «Νέο έντυπο» / Έντυπα: πρότυπο, γέμισμα, προεπισκόπηση, εκτύπωση, υποψήφιοι (N=300 npm run bench:reports)
import { performance } from 'perf_hooks';
import { today as todayFn, type ISODate } from '../src/shared/dates';
import { buildTemplate, fillReport, previewReport, inspectTemplate } from '../src/main/reports';
import { renderBook, PRINT_DEFAULT } from '../src/main/print';
import { candidates, rowsOf, defaultPick, withBuilt, moreRows, PRESETS, newTable, type BuildOpts, type Report } from '../src/shared/reports';
import { benchState } from './state';

const N = Number(process.env.N || 300);
const END: ISODate = todayFn();
const R: Record<string, number> = {};
async function med(k: string, f: () => any, reps = 5) {
  const xs: number[] = [];
  for (let i = 0; i < reps; i++) { const a = performance.now(); await f(); xs.push(performance.now() - a); }
  R[k + ' (1η)'] = Math.round(xs[0]); xs.sort((a, b) => a - b); R[k] = Math.round(xs[Math.floor(xs.length / 2)] * 10) / 10;
}
(async () => {
  const s = benchState({ n: N, days: 120, end: END });
  const ids = s.people.map(p => p.id);
  const base = PRESETS.find(p => p.id === 'onomastiki')!.opts;
  const wide: BuildOpts = { ...base, cols: [...base.cols, { f: 'smed', h: 'ΙΑΤΡΙΚΟ', w: 'auto' }, { f: 'combo', h: 'ΒΑΘΜΟΣ (Ο/Σ)', w: 'auto', o: { parts: ['rank1', 'spec'], fmt: '{1} ({2})' } } as any, { f: 'room', h: 'ΘΑΛΑΜΟΣ', w: 'auto' }, { f: 'phone', h: 'ΤΗΛΕΦΩΝΟ', w: 'auto' }],
    more: [{ id: 't2', title: 'ΙΑΤΡΙΚΑ', kind: 'status', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }, { f: 'type', h: 'ΕΙΔΟΣ', w: 'auto' }], lay: { w: '1/2', at: 'center', even: true } } as any] };
  const rep0: Report = { id: 'r', name: 'Α', tpl: 't', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file' };
  await med('candidates', () => candidates(s, rep0, END));
  await med('rowsOf', () => rowsOf(s, rep0, END));
  for (const [k, o] of [['απλό', base], ['πολλές στήλες + 2ος πίνακας', wide]] as const) {
    await med(k + ': buildTemplate', () => buildTemplate(o, 'people'));
    const b = await buildTemplate(o, 'people'); const r = withBuilt(rep0, b, o);
    if (r.more) r.more[0] = { ...r.more[0], ...newTable('status', 't2'), head: r.more[0].head, cols: r.more[0].cols, title: 'ΙΑΤΡΙΚΑ' };
    await med(k + ': moreRows', () => moreRows(s, r, END));
    await med(k + ': fillReport', () => fillReport(b.data, s, r, ids, END));
    await med(k + ': previewReport (120)', () => previewReport(b.data, s, r, ids, END));
    await med(k + ': inspectTemplate', () => inspectTemplate(b.data, 'people'));
    const out = await fillReport(b.data, s, r, ids, END);
    await med(k + ': renderBook 1 σελίδα', () => renderBook(out.data, { file: 'x.xlsx', layout: PRINT_DEFAULT }));
    await med(k + ': renderBook auto', () => renderBook(out.data, { file: 'x.xlsx', layout: { ...PRINT_DEFAULT, pages: 'auto' } }));
  }
  const w = Math.max(...Object.keys(R).map(k => k.length));
  for (const [k, v] of Object.entries(R)) console.log(k.padEnd(w), String(v).padStart(8), 'ms');
})();
