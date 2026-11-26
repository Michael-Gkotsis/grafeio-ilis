// Έλεγχος 25/11, πακέτο Π5: όλα τα αρχεία που βγάζει η εφαρμογή, με επικεφαλίδα που σχεδίασες (μεγάλες και στενές εικόνες,
// πολλές γραμμές) και τα Έντυπα με κάθε στήλη, 400 άτομα και κενές τιμές. Κανόνες: «Όπως σήμερα» = ίδιο αρχείο με πριν,
// η επικεφαλίδα δεν προσθέτει σελίδα, ΚΕΦΑΛΑΙΑ, ημερομηνίες ηη/μμ/εεεε, ποτέ «undefined»/«NaN». Μόνο ψεύτικα ονόματα.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fillFroura, fillHkai, fillOuts, signMade } from '../src/main/exports';
import * as XL from '../src/main/excel';
import { previewOf } from '../src/main/formPreview';
import { Workbook } from '../src/main/xlsx';
import { setImageDir } from '../src/main/eikones';
import { buildTemplate, fillReport } from '../src/main/reports';
import { FIELDS, SPLITS, candidates, defaultPick, forBuild, withBuilt, type RepKind, type Report } from '../src/shared/reports';
import type { DocHead, HeadItem } from '../src/shared/docHead';
import type { AppState } from '../src/shared/domain';
import { benchState } from '../bench/state';

const D = '2026-10-12';
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
function png(w: number, h: number): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(Buffer.alloc((w * 3 + 1) * h))), chunk('IEND', Buffer.alloc(0))]);
}
const img: Record<string, string> = {};
beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-p5-')); fs.mkdirSync(path.join(dir, 'eikones'));
  for (const [k, w, h] of [['wide', 2000, 20], ['tall', 20, 2000], ['sq', 300, 300]] as const) { const b = png(w, h); img[k] = crypto.createHash('sha1').update(b).digest('hex'); fs.writeFileSync(path.join(dir, 'eikones', img[k] + '.png'), b); }
  setImageDir(dir);
});
afterAll(() => { setImageDir(null); });

// τα ελέγχει κάθε κελί κειμένου: τίποτα σπασμένο, καμία ημερομηνία ISO ή με διψήφιο έτος, καμία ημέρα/μήνας με ένα ψηφίο
function badCells(rows: unknown[][], sh: string): string[] {
  const out: string[] = [];
  rows.forEach((r, i) => r.forEach((c, j) => {
    if (typeof c !== 'string') return;
    if (/undefined|NaN|null|\[object/.test(c) || /\d{4}-\d\d-\d\d/.test(c) || /(^|[^\d/])\d{1,2}\/\d{1,2}\/\d{2}(?![\d/])/.test(c) || /(^|[^\d])\d\/\d{1,2}\/\d{4}/.test(c)) out.push(sh + ' ' + (i + 1) + ':' + (j + 1) + ' ' + JSON.stringify(c.slice(0, 50)));
  }));
  return out;
}
const LOWER = /[a-zα-ωάέήίόύώϊϋΐΰς]/;
const ORD = /(?<![\p{L}\d])(\d+)(ος|ου|ης|οι|ες|ων|ο|η)(?![\p{L}\d])/gu;   // τακτικός αριθμός: η κατάληξη μένει με πεζά (1ο, 2η, 3ος)
const MADE_FORM: Record<string, string> = { lists: 'roster', rosterPrint: 'roster' };
async function everyFile(s: AppState, headId?: string): Promise<Record<string, { name?: string; data: Buffer }>> {
  const out: Record<string, { name?: string; data: Buffer }> = {};
  out.froura = await fillFroura(T('froura.xlsx'), s, D, undefined, undefined, undefined, headId);
  out.hkai = await fillHkai(T('hkai.xlsx'), s, D, { headId });
  out.outs = await fillOuts(T('exodouxoi.xlsx'), s, D, {}, undefined, headId);
  const made: Record<string, XL.Made> = {
    lists: await XL.rosterLists(s, D), cadre: await XL.cadreLists(s, D), cadreLeave: await XL.cadreLeaveBook(s, 2026, D), cadrePlan: await XL.cadrePlanBook(s, '2026-10', D),
    cadreDuty: await XL.cadreDutyBook(s, '2026-10', D), vehicles: await XL.vehicleBook(s, D), weapons: await XL.weaponsBook(s, D), rosterPrint: await XL.rosterPrint(s, D),
    check: await XL.dutyCheck(s, '2026-10'), imer: await XL.imerBook(s, { from: '2026-10-01', to: D } as Parameters<typeof XL.imerBook>[1])
  };
  for (const [k, m] of Object.entries(made)) out[k] = { name: m.name, data: (await signMade(m.data, s, (MADE_FORM[k] || k) as Parameters<typeof signMade>[2], m.marks, undefined, headId, D)).data };
  return out;
}

describe('Π5: επικεφαλίδα που σχεδίασες σε όλα τα αρχεία', () => {
  it('13 αρχεία: «Όπως σήμερα» = ίδιο αρχείο· μεγάλη επικεφαλίδα (εικόνες 6 εκ. φαρδιά, στενή, τετράγωνη, 10 γραμμές): γράφεται με κεφαλαία, ίδιες σελίδες, κανένα σπασμένο κελί', async () => {
    const txt = (t: string): HeadItem => ({ k: 'text', t });
    const big: DocHead = { id: 'hbig', name: 'Μεγάλη', z: [[{ k: 'img', id: img.tall, h: 6 }, ...Array.from({ length: 10 }, (_, i) => txt('γραμμή κεφαλίδας με πολλά γράμματα για να δούμε αν χωρά ' + i))], [{ k: 'img', id: img.wide, h: 6 }], [{ k: 'date' }, { k: 'img', id: img.sq, h: 6, side: true }, txt('τέλος')]] };
    const s0 = benchState({ n: 150, days: 40, end: D }); const s = { ...s0, settings: { ...s0.settings, heads: [big] } };
    const none = await everyFile(s); const today = await everyFile(s, 'today'); const withBig = await everyFile(s, 'hbig');
    expect(Object.keys(none)).toHaveLength(13);
    for (const k of Object.keys(none)) {
      expect(today[k].data.equals(none[k].data), k + ': «Όπως σήμερα»').toBe(true);
      expect(withBig[k].data.equals(none[k].data), k + ': η επικεφαλίδα μπήκε').toBe(false);
      const a = await previewOf(none[k]), b = await previewOf(withBig[k]);
      expect(b.sheets.map(x => x.pages), k + ': σελίδες').toEqual(a.sheets.map(x => x.pages));
      const wb = await Workbook.open(withBig[k].data); const bad: string[] = []; let head = 0;
      for (const sh of wb.sheetNames()) {
        const v = await wb.values(sh, 600, 60); bad.push(...badCells(v, sh));
        for (const c of v.flat()) if (typeof c === 'string' && /ΓΡΑΜΜΗ ΚΕΦΑΛΙΔΑΣ|^ΤΕΛΟΣ$/.test(c)) head++; else if (typeof c === 'string' && /γραμμή κεφαλίδας|^τέλος$/.test(c)) bad.push(sh + ' πεζά: ' + c);
      }
      expect(bad, k).toEqual([]); expect(head, k + ': γραμμές επικεφαλίδας').toBeGreaterThanOrEqual(11);
    }
  }, 120000);
});

describe('Π5: Έντυπα με κάθε στήλη, 400 άτομα, κενές τιμές', () => {
  const s0 = benchState({ n: 400, days: 30, end: D });
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const s: AppState = { ...s0, people: s0.people.map(p => (rnd() < 0.4 ? p : { ...p, iban: rnd() < 0.5 ? '' : 'GR1601101250000000012300695', amka: rnd() < 0.5 ? undefined : '01019012345', afm: '', religion: rnd() < 0.5 ? 'Ορθόδοξος' : '', eid: rnd() < 0.5 ? 'οδηγός' : undefined, sub: rnd() < 0.5 ? '1ος Λόχος' : '', inOn: rnd() < 0.5 ? '2026-05-03' : undefined, email: 'a@b.gr', blood: rnd() < 0.5 ? 'A+' : '' } as typeof p)) };
  async function make(kind: RepKind, cols: { f: string; h: string; w: 'auto' | 'narrow' }[], x: Partial<Report> = {}) {
    const base = { title: 'ΔΟΚΙΜΗ', head: true, date: true, sig: 'list' as const, land: true, sz: 10 as const, fill: 'gray' as const, cols };
    const r0: Report = { id: 'r1', name: 'Δοκιμή', tpl: 't1', kind, sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x };
    const bo = forBuild(base, r0); const b = await buildTemplate(bo, kind); const r = withBuilt(r0, b, bo);
    const ids = candidates(s, r, D).map(y => y.id);
    return { ids, out: await fillReport(b.data, s, r, ids, D, { clock: { today: D, now: 720 } }) };
  }
  for (const kind of ['people', 'duty', 'status', 'weapon', 'cadre', 'wmove'] as RepKind[]) it(kind + ': όλες οι στήλες, κεφαλαία (εκτός e-mail και κωδικών θέσεων), ημερομηνίες ηη/μμ/εεεε', async () => {
    const cols = FIELDS[kind].filter(f => f.k !== 'blank' && f.k !== 'text' && f.k !== 'col').map(f => ({ f: f.k, h: f.head, w: 'auto' as const }));
    const { ids, out } = await make(kind, cols); expect(ids.length).toBeGreaterThan(0);
    const wb = await Workbook.open(out.data); const bad: string[] = [];
    for (const sh of wb.sheetNames()) { const v = await wb.values(sh, 500, 80); bad.push(...badCells(v, sh)); v.forEach((r, i) => r.forEach((c, j) => { if (typeof c === 'string' && LOWER.test(c.replace(ORD, '$1')) && !/@/.test(c) && !/^Θ\d/.test(c)) bad.push(sh + ' ' + (i + 1) + ':' + (j + 1) + ' πεζά ' + JSON.stringify(c)); })); }
    expect(bad).toEqual([]);
  }, 60000);
  it('χωρισμός σε φύλλα (θάλαμος, ουλαμός, Σ.Ι., λόχος με κενό ή με / : * ?): ίδιοι άνθρωποι σε κάθε χωρισμό, σωστά ονόματα φύλλων', async () => {
    const people = s.people.map((p, i) => ({ ...p, sub: i % 3 === 0 ? '' : i % 3 === 1 ? '1ος Λόχος' : 'Ίλη/Β:2*?' }));
    const s2 = { ...s, people }; const counts: number[] = [];
    for (const split of SPLITS.map(x => x.value)) {
      const base = { title: 'ΔΟΚΙΜΗ', head: true, date: true, sig: 'list' as const, land: false, sz: 10 as const, fill: 'gray' as const, cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑ', w: 'auto' as const }, { f: 'sub', h: 'ΛΟΧΟΣ', w: 'auto' as const }] };
      const r0: Report = { id: 'r1', name: 'Δοκιμή', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', split };
      const bo = forBuild(base, r0); const b = await buildTemplate(bo, 'people'); const r = withBuilt(r0, b, bo);
      const ids = candidates(s2, r, D).map(y => y.id); const out = await fillReport(b.data, s2, r, ids, D, { clock: { today: D, now: 720 } });
      const wb = await Workbook.open(out.data); let n = 0;
      for (const sh of wb.sheetNames()) { expect(sh).not.toMatch(/[\\/:*?[\]]/); n += (await wb.values(sh, 500, 3)).filter(x => typeof x[0] === 'number' && typeof x[1] === 'string' && x[1]).length; }
      counts.push(n);
    }
    expect(new Set(counts).size).toBe(1); expect(counts[0]).toBeGreaterThan(100);
  }, 60000);
});
