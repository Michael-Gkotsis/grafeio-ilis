// Αυτόματη ενημέρωση (main/update.ts): εκδόσεις, manifest, zip, αλλαγή φακέλου, επιστροφή. Όλα σε προσωρινό φάκελο.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import JSZip from 'jszip';
import { clearTrial, cmpVersion, downloadApp, extractZip, fetchManifest, health, parseManifest, pendingVersion, prevVersion, readTrial, rollbackApp, stage, swap, swapPrev, zipVersion, type Fetcher } from '../src/main/update';

let tmp = '', res = '', trial = '';
const mk = async (version: string, extra: Record<string, string> = {}) => {
  const z = new JSZip();
  z.file('package.json', JSON.stringify({ name: 'x', version, main: 'dist/main/main.js' }));
  z.file('dist/main/main.js', '// ' + version);
  z.file('templates/a.txt', 'a');
  for (const [k, v] of Object.entries(extra)) z.file(k, v);
  return z.generateAsync({ type: 'nodebuffer' });
};
const putApp = (dir: string, version: string) => { fs.mkdirSync(path.join(dir, 'dist', 'main'), { recursive: true }); fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version })); fs.writeFileSync(path.join(dir, 'dist', 'main', 'main.js'), '// ' + version); };
const snap = (dir: string): Record<string, string> => { const o: Record<string, string> = {}; const w = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) w(f); else o[path.relative(dir, f)] = fs.readFileSync(f).toString('hex'); } }; w(dir); return o; };
const failNw = (a: string) => { if (a.endsWith('app.new')) throw new Error('κλειδωμένο'); };
const realRename = fs.renameSync;
const renameFailing = (a: string, b: string) => { failNw(a); realRename(a, b); };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ilh-upd-'));
  res = path.join(tmp, 'resources'); trial = path.join(tmp, 'data', 'update-trial.json');
  putApp(path.join(res, 'app'), '0.1.5');
  fs.mkdirSync(path.join(tmp, 'data', 'backups'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'data', 'ilh.db'), Buffer.from([1, 2, 3, 0, 255, 7]));
  fs.writeFileSync(path.join(tmp, 'data', 'backups', 'ilh_x.db'), 'b');
  fs.mkdirSync(path.join(tmp, 'templates')); fs.writeFileSync(path.join(tmp, 'templates', 'froura.xlsx'), 'δικό μου');
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('εκδόσεις και manifest', () => {
  it('σύγκριση αριθμητική, όχι αλφαβητική', () => {
    expect(cmpVersion('0.1.10', '0.1.9')).toBe(1);
    expect(cmpVersion('0.1.9', '0.1.10')).toBe(-1);
    expect(cmpVersion('0.1.232', '0.1.232')).toBe(0);
    expect(cmpVersion('1.0', '0.9.99')).toBe(1);
    expect(cmpVersion('0.1', '0.1.0')).toBe(0);
  });
  const good = { version: '0.1.240', date: '2026-11-04T10:00', electron: '22.3.27', app: { file: 'GrafeioIlis-app-0.1.240.zip', size: 1700000, sha256: 'a'.repeat(64) }, notes: ['α', '', 5, 'β'] };
  it('δέχεται σωστό manifest και καθαρίζει τις σημειώσεις', () => {
    const m = parseManifest(good);
    expect(m.version).toBe('0.1.240'); expect(m.date).toBe('2026-11-04'); expect(m.notes).toEqual(['α', 'β']);
    expect(parseManifest({ ...good, notes: Array.from({ length: 40 }, (_, i) => 'n' + i) }).notes).toHaveLength(20);
  });
  it('απορρίπτει άκυρα πεδία', () => {
    for (const bad of [null, 'x', { ...good, version: '1.x' }, { ...good, version: undefined }, { ...good, app: { ...good.app, file: '../evil.zip' } }, { ...good, app: { ...good.app, file: 'other.zip' } },
      { ...good, app: { ...good.app, size: 0 } }, { ...good, app: { ...good.app, size: 1e12 } }, { ...good, app: { ...good.app, sha256: 'zz' } }, { ...good, electron: '' }, { ...good, app: undefined }])
      expect(() => parseManifest(bad), JSON.stringify(bad)).toThrow();
  });
  it('fetchManifest και downloadApp με ψεύτικο fetcher: έλεγχος μεγέθους και SHA-256', async () => {
    const zip = await mk('0.1.9');
    const m = parseManifest({ ...good, version: '0.1.9', app: { file: 'GrafeioIlis-app-0.1.9.zip', size: zip.length, sha256: crypto.createHash('sha256').update(zip).digest('hex') } });
    const urls: string[] = [];
    const fake: Fetcher = async u => { urls.push(u); return u.endsWith('latest.json') ? Buffer.from(JSON.stringify(m)) : zip; };
    expect((await fetchManifest(fake)).version).toBe('0.1.9');
    expect(await downloadApp(fake, m)).toEqual(zip);
    expect(urls[1]).toContain('/releases/download/v0.1.9/GrafeioIlis-app-0.1.9.zip');
    const bad: Fetcher = async () => Buffer.concat([zip.subarray(0, zip.length - 1), Buffer.from([zip[zip.length - 1] ^ 0xff])]);
    await expect(downloadApp(bad, m)).rejects.toThrow(/SHA-256/);
    await expect(downloadApp(async () => zip.subarray(1), m)).rejects.toThrow(/μέγεθος/);
    await expect(fetchManifest(async () => Buffer.from('όχι json'))).rejects.toThrow();
  });
  it('πραγματικό HTTP: κατέβασμα από τοπικό server και ανακατεύθυνση', async () => {
    const zip = await mk('0.1.9');
    const srv = http.createServer((q, r) => { if (q.url === '/go') { r.writeHead(302, { location: '/z' }); r.end(); } else { r.writeHead(200, { 'content-length': zip.length }); r.end(zip); } });
    await new Promise<void>(ok => srv.listen(0, '127.0.0.1', ok));
    const port = (srv.address() as any).port;
    // ο ίδιος τύπος Fetcher με του Electron, εδώ πάνω στο http του Node
    const get = (u: string, hops = 0): Promise<Buffer> => new Promise((ok, no) => http.get(u, r => {
      if (r.statusCode === 302 && hops < 3) return ok(get(new URL(r.headers.location!, u).href, hops + 1));
      const c: Buffer[] = []; r.on('data', d => c.push(d)); r.on('end', () => ok(Buffer.concat(c))); r.on('error', no);
    }).on('error', no));
    try { const got = await get(`http://127.0.0.1:${port}/go`); expect(got).toEqual(zip); expect(await zipVersion(got)).toBe('0.1.9'); } finally { srv.close(); }
  });
});

describe('zip', () => {
  it('απορρίπτει διαδρομές με .. ή απόλυτες, και δεν γράφει τίποτα', async () => {
    for (const evil of ['../evil.txt', 'a/../../evil.txt', '/abs/evil.txt', 'C:/evil.txt', '..\\evil.txt']) {
      const z = new JSZip(); z.file('package.json', '{}'); z.file(evil, 'x');
      const out = path.join(tmp, 'out'); const buf = await z.generateAsync({ type: 'nodebuffer' });
      await expect(extractZip(buf, out), evil).rejects.toThrow(/επικίνδυνη/);
      expect(fs.existsSync(path.join(tmp, 'evil.txt'))).toBe(false);
      expect(fs.existsSync(out)).toBe(false);
    }
  });
  it('το stage ελέγχει package.json και dist/main/main.js και καθαρίζει όταν λείπουν', async () => {
    const z = new JSZip(); z.file('package.json', JSON.stringify({ version: '0.1.7' }));
    await expect(stage(res, await z.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow(/main\.js/);
    expect(fs.existsSync(path.join(res, 'app.new'))).toBe(false);
    await expect(zipVersion(await z.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow();
  });
  it('το stage απορρίπτει άλλη έκδοση από την αναμενόμενη', async () => {
    await expect(stage(res, await mk('0.1.7'), '0.1.8')).rejects.toThrow(/αναμενόμενη/);
    expect(pendingVersion(res)).toBeNull();
  });
});

describe('stage → swap', () => {
  it('ζωντανό zip: αλλάζει μόνο το app, το data και το templates μένουν byte-byte ίδια', async () => {
    const before = { data: snap(path.join(tmp, 'data')), tpl: snap(path.join(tmp, 'templates')) };
    fs.writeFileSync(path.join(res, 'app.new-stale'), 'x');
    fs.mkdirSync(path.join(res, 'app.new')); fs.writeFileSync(path.join(res, 'app.new', 'leftover'), 'παλιό');   // μισοτελειωμένο από πριν
    expect(await stage(res, await mk('0.1.7'), '0.1.7')).toBe('0.1.7');
    expect(fs.existsSync(path.join(res, 'app.new', 'leftover'))).toBe(false);
    expect(pendingVersion(res)).toBe('0.1.7');
    expect(fs.readFileSync(path.join(res, 'app', 'package.json'), 'utf8')).toContain('0.1.5');   // μέχρι το swap δεν αλλάζει τίποτα
    const r = swap(res, trial);
    expect(r).toEqual({ ok: true, version: '0.1.7' });
    expect(JSON.parse(fs.readFileSync(path.join(res, 'app', 'package.json'), 'utf8')).version).toBe('0.1.7');
    expect(fs.existsSync(path.join(res, 'app', '.ready'))).toBe(false);
    expect(fs.existsSync(path.join(res, 'app', 'templates', 'a.txt'))).toBe(true);
    expect(prevVersion(res)).toBe('0.1.5');
    expect(readTrial(trial)).toEqual({ version: '0.1.7', from: '0.1.5', starts: 0 });
    expect({ data: snap(path.join(tmp, 'data')), tpl: snap(path.join(tmp, 'templates')) }).toEqual({ ...before, data: { ...before.data, ['update-trial.json']: expect.any(String) } });
  });
  it('χωρίς .ready δεν γίνεται τίποτα', async () => {
    fs.mkdirSync(path.join(res, 'app.new')); putApp(path.join(res, 'app.new'), '0.1.9');
    expect(swap(res, trial)).toEqual({ ok: false, none: true });
    expect(JSON.parse(fs.readFileSync(path.join(res, 'app', 'package.json'), 'utf8')).version).toBe('0.1.5');
  });
  it('αποτυχία στη δεύτερη μετονομασία: γυρίζει το παλιό app, μένει το app.new για την επόμενη φορά', async () => {
    await stage(res, await mk('0.1.7'));
    const r = swap(res, trial, { rename: renameFailing, tries: 1 });
    expect(r.ok).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(res, 'app', 'package.json'), 'utf8')).version).toBe('0.1.5');
    expect(fs.existsSync(path.join(res, 'app', 'dist', 'main', 'main.js'))).toBe(true);
    expect(pendingVersion(res)).toBe('0.1.7');
    expect(fs.existsSync(trial)).toBe(false);
    expect(swap(res, trial).ok).toBe(true);   // την επόμενη φορά περνά
  });
  it('αποτυχία στην πρώτη μετονομασία: τίποτα δεν αλλάζει', async () => {
    await stage(res, await mk('0.1.7'));
    const r = swap(res, trial, { rename: (a, b) => { if (a.endsWith('app')) throw new Error('κλειδωμένο'); realRename(a, b); }, tries: 1 });
    expect(r.ok).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(res, 'app', 'package.json'), 'utf8')).version).toBe('0.1.5');
    expect(pendingVersion(res)).toBe('0.1.7');
  });
});

describe('δοκιμαστική περίοδος και επιστροφή', () => {
  const updated = async () => { await stage(res, await mk('0.1.7')); swap(res, trial); };
  it('επιβεβαιωμένη εκκίνηση σβήνει το αρχείο δοκιμής και κρατά τη νέα έκδοση', async () => {
    await updated();
    expect(health(res, trial, '0.1.7')).toEqual({ state: 'trial' });
    expect(readTrial(trial)!.starts).toBe(1);
    clearTrial(trial);
    expect(health(res, trial, '0.1.7')).toEqual({ state: 'none' });
    expect(versionOf('app')).toBe('0.1.7');
  });
  const versionOf = (d: string) => JSON.parse(fs.readFileSync(path.join(res, d, 'package.json'), 'utf8')).version;
  it('2 εκκινήσεις χωρίς επιβεβαίωση: επιστροφή στην προηγούμενη', async () => {
    await updated();
    expect(health(res, trial, '0.1.7').state).toBe('trial');
    expect(health(res, trial, '0.1.7')).toEqual({ state: 'rolledback', version: '0.1.7' });
    expect(versionOf('app')).toBe('0.1.5');
    expect(fs.existsSync(path.join(res, 'app.old'))).toBe(false);
    expect(versionOf('app.new-failed')).toBe('0.1.7');
    expect(fs.existsSync(trial)).toBe(false);
  });
  it('το αρχείο δοκιμής άλλης έκδοσης αγνοείται και σβήνεται', async () => {
    await updated();
    expect(health(res, trial, '0.1.5')).toEqual({ state: 'none' });
    expect(fs.existsSync(trial)).toBe(false);
  });
  it('χωρίς app.old δεν υπάρχει επιστροφή και η εφαρμογή ανοίγει', async () => {
    fs.writeFileSync(trial, JSON.stringify({ version: '0.1.5', from: '', starts: 1 }));
    expect(health(res, trial, '0.1.5')).toEqual({ state: 'none' });
    expect(versionOf('app')).toBe('0.1.5');
  });
  it('χειροκίνητη επιστροφή: οι δύο φάκελοι αλλάζουν θέση (και πάλι πίσω)', async () => {
    await updated();
    expect(prevVersion(res)).toBe('0.1.5');
    expect(swapPrev(res)).toBe(true);
    expect(versionOf('app')).toBe('0.1.5'); expect(prevVersion(res)).toBe('0.1.7');
    expect(swapPrev(res)).toBe(true);
    expect(versionOf('app')).toBe('0.1.7');
  });
  it('αποτυχημένη χειροκίνητη επιστροφή αφήνει το app όπως ήταν', async () => {
    await updated();
    let n = 0;
    expect(swapPrev(res, { rename: (a, b) => { if (++n === 2) throw new Error('κλειδωμένο'); realRename(a, b); }, tries: 1 })).toBe(false);
    expect(versionOf('app')).toBe('0.1.7'); expect(prevVersion(res)).toBe('0.1.5');
  });
  it('χωρίς app.old δεν γίνεται επιστροφή', () => { expect(prevVersion(res)).toBeNull(); expect(swapPrev(res)).toBe(false); expect(rollbackApp(res)).toBe(false); });
});
