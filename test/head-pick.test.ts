// «Επικεφαλίδα: X ★» τη στιγμή που βγαίνει ένα έγγραφο: ο επιλογέας δείχνεται μόνο με πάνω από μία επικεφαλίδα, και η επιλογή
// αυτής της φοράς (headId) νικά την αρχική σε κάθε είδος εγγράφου: made (signMade), template (ΦΡΟΥΡΑ), Έντυπο και Word
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import JSZip from 'jszip';
import { fillFroura, signMade } from '../src/main/exports';
import { rosterPrint } from '../src/main/excel';
import { buildTemplate, fillReport } from '../src/main/reports';
import { makeHdDocx } from '../src/main/hdDocx';
import { hdAuto, hdHeadDate, hdTags } from '../src/shared/hd';
import { parseDrawings } from '../src/main/xlDrawings';
import { setImageDir } from '../src/main/eikones';
import { headFor, headPickOf, headPickShown, presetZones, TODAY } from '../src/shared/docHead';
import { defaultPick, forBuild, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-12';
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
function png(w: number, h: number): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 30; raw[o + 2] = 30; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let imgId = '';
beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-hpick-')); fs.mkdirSync(path.join(dir, 'eikones'));
  const b = png(120, 60); imgId = crypto.createHash('sha1').update(b).digest('hex'); fs.writeFileSync(path.join(dir, 'eikones', imgId + '.png'), b); setImageDir(dir);
});
afterAll(() => { setImageDir(null); });

// Μία επικεφαλίδα με εικόνα (h1). use = οι διαθέσιμες/αρχική κάθε εγγράφου
const mk = (use?: { on: string[]; def: string }) => {
  const s = fakeState(20); s.settings.unit = ['κεν αυλωνα', '2η επχια', '4η ιλη'];
  const z = presetZones('imgLeft', s.settings); for (const zone of z) for (const it of zone) if (it.k === 'img') it.id = imgId;
  s.settings = { ...s.settings, heads: [{ id: 'h1', name: 'Με έμβλημα', z }, { id: 'h2', name: 'Άσκηση', z }], ...(use ? { headUse: { roster: use, froura: use, reports: use, hd: use } } : {}) };
  return s;
};
const pics = async (data: Buffer) => {
  const zip = await JSZip.loadAsync(data); let n = 0;
  for (const f of Object.keys(zip.files).filter(x => /^xl\/worksheets\/sheet\d+\.xml$/.test(x))) n += (await parseDrawings(zip, f, await zip.file(f)!.async('string'))).length;
  return n;
};
const two = { on: [TODAY, 'h1'], def: TODAY };

describe('επιλογέας: πότε φαίνεται', () => {
  it('με μία διαθέσιμη επικεφαλίδα (ή χωρίς ρύθμιση) δεν φαίνεται', () => {
    const s = mk(); expect(headPickShown(headPickOf(s.settings, 'roster'))).toBe(false);
    const one = mk({ on: ['h1'], def: 'h1' }); expect(headPickShown(headPickOf(one.settings, 'roster'))).toBe(false);
  });
  it('με δύο φαίνεται, και η αρχική (★) είναι η επιλεγμένη', () => {
    const s = mk({ on: [TODAY, 'h1'], def: 'h1' }); const u = headPickOf(s.settings, 'roster');
    expect(headPickShown(u)).toBe(true); expect(u).toEqual({ on: [TODAY, 'h1'], def: 'h1' });
  });
  it('Έντυπα: η δική του επικεφαλίδα και όσες επιτρέπονται, αρχική η δική του· ένα έντυπο χωρίς επιλογή και μία επιτρεπτή = όχι επιλογέας', () => {
    const s = mk({ on: [TODAY, 'h1'], def: TODAY });
    expect(headPickOf(s.settings, 'reports', 'h2')).toEqual({ on: ['h2', TODAY, 'h1'], def: 'h2' });   // δική του και εκτός λίστας: μπαίνει πρώτη
    expect(headPickOf(s.settings, 'reports')).toEqual({ on: [TODAY, 'h1'], def: TODAY });
    expect(headPickOf(s.settings, 'reports', 'zzz').def).toBe(TODAY);                                  // άγνωστη = Όπως σήμερα
    const none = mk(); expect(headPickShown(headPickOf(none.settings, 'reports'))).toBe(false);
    expect(headPickShown(headPickOf(none.settings, 'reports', 'h1'))).toBe(true);
  });
});

describe('η επιλογή αυτής της φοράς νικά την αρχική', () => {
  it('made (Δυναμολόγιο): αρχική «Όπως σήμερα», με headId h1 βγαίνει με εικόνα· αρχική h1, με today χωρίς', async () => {
    const s = mk(two); const m = await rosterPrint(s, D);
    expect(await pics((await signMade(m.data, s, 'roster', m.marks, null, null, D)).data)).toBe(0);
    expect(await pics((await signMade(m.data, s, 'roster', m.marks, null, 'h1', D)).data)).toBeGreaterThan(0);
    const s2 = mk({ on: [TODAY, 'h1'], def: 'h1' }); const m2 = await rosterPrint(s2, D);
    expect(await pics((await signMade(m2.data, s2, 'roster', m2.marks, null, undefined, D)).data)).toBeGreaterThan(0);
    expect(await pics((await signMade(m2.data, s2, 'roster', m2.marks, null, 'today', D)).data)).toBe(0);
  });
  it('template (ΦΡΟΥΡΑ): το ίδιο', async () => {
    const s = mk(two);
    expect(await pics((await fillFroura(T('froura.xlsx'), s, D, 'sven')).data!)).toBe(0);
    expect(await pics((await fillFroura(T('froura.xlsx'), s, D, 'sven', undefined, undefined, 'h1')).data!)).toBeGreaterThan(0);
  });
  it('Έντυπο: χωρίς επιλογή η δική του (Όπως σήμερα), με headId η άλλη, και ο πίνακας ίδιος', async () => {
    const s = mk(two); const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }];
    const base: BuildOpts = { title: 'ΔΥΝΑΜΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols };
    const r0: Report = { id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file' };
    const bo = forBuild(base, r0); const b = await buildTemplate(bo, 'people'); const r = withBuilt(r0, b, bo);
    const ids = s.people.slice(0, 8).map(p => p.id); const o = { clock: { today: D, now: 720 } };
    const a = await fillReport(b.data, s, r, ids, D, o); const c = await fillReport(b.data, s, r, ids, D, { ...o, headId: 'h1' });
    const own = await fillReport(b.data, s, { ...r, hdId: 'h1' }, ids, D, o); const back = await fillReport(b.data, s, { ...r, hdId: 'h1' }, ids, D, { ...o, headId: 'today' });
    expect(await pics(a.data)).toBe(0); expect(await pics(c.data)).toBeGreaterThan(0);
    expect(await pics(own.data)).toBeGreaterThan(0); expect(await pics(back.data)).toBe(0);
    expect(back.data.equals(a.data)).toBe(true);
  });
  it('Word (Ημερήσια Διαταγή): η επικεφαλίδα της φοράς μπαίνει στο .docx με εικόνα', async () => {
    const s = mk(two); const tags = hdTags(s.settings, D, hdAuto(s, D), []); const O = { dateText: hdHeadDate(s.settings, D), font: 'Arial' };
    expect(headFor(s.settings, 'hd')).toBeNull(); expect(headFor(s.settings, 'hd', 'h1')).not.toBeNull();
    const media = async (h: ReturnType<typeof headFor>) => Object.keys((await JSZip.loadAsync(await makeHdDocx(null, tags, h, O))).files).filter(f => f.startsWith('word/media/')).length;
    expect(await media(headFor(s.settings, 'hd'))).toBe(0); expect(await media(headFor(s.settings, 'hd', 'h1'))).toBeGreaterThan(0);
  });
});
