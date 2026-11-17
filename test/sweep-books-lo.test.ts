// Sweep 17/11: the new Excel files of today (ΑΔΕΙΕΣ-ΑΠΑΛΛΑΓΕΣ, ΠΡΟΓΡΑΜΜΑ ΑΔΕΙΩΝ, ΥΠΗΡΕΣΙΕΣ ΣΤΕΛΕΧΩΝ, ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ, ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ and the
// ΟΠΛΙΣΜΟΣ with today's registry changes), built from random states, opened by LibreOffice and saved again: every cell must come back the
// same (the file is valid for a real spreadsheet program, not only for ExcelJS), and every text the app wrote must be in capitals.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import ExcelJS from 'exceljs';
import { apply, type Command } from '../src/shared/commands';
import { addDays } from '../src/shared/dates';
import { blocksOf, type AppState } from '../src/shared/domain';
import { registry } from '../src/shared/assets';
import { autoFill } from '../src/shared/cadreDuty';
import { assetBook, cadreDutyBook, cadreLeaveBook, cadrePlanBook, vehicleBook, weaponsBook } from '../src/main/excel';
import { upper } from '../src/shared/text';
import { fakeState } from './fixtures';

const D = '2026-11-17';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D, newId: () => 'b' + ++n }).state;
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = <T,>(r: () => number, l: T[]): T => l[Math.floor(r() * l.length)];
const soffice = ['/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice'].find(f => fs.existsSync(f));

function state(seed: number): AppState {
  const r = rng(seed); let s = fakeState(14);
  s = run(s, { t: 'setSettings', settings: { cadreDuty: { groups: [{ id: 'g', name: 'Πύλη και ΑΥΔΜ', services: [{ id: 'p', name: 'Πύλη', short: 'Π', perDay: 1, h24: true, hkCol: '' }, { id: 'a', name: 'Αξκός Υπηρεσίας', short: 'ΑΥ', perDay: 1, h24: true, hkCol: '', offOnly: true }] }] } }, text: 'δοκιμή' });
  const R = [['ΛΧΙΑΣ', 'Λοχίες'], ['ΥΠΛΓΟΣ', 'Ανθυπίλαρχοι-Ανθλγοι'], ['ΤΧΗΣ', 'Ίλαρχοι-Λοχαγοί'], ['ΕΠΧΙΑΣ', 'Επιλοχίες']];
  for (let i = 0; i < 7; i++) { const [rank, hk] = pick(r, R); s = run(s, { t: 'saveCadre', cadre: { rank, hk, last: 'στέλεχος' + 'αβγδεζη'[i], first: 'όνομα', weapon: r() < 0.5 ? 'μ-' + i : undefined, wtype: 'Μ1911 Α1' } as any }); }
  for (const c of s.cadreList) {
    s = run(s, { t: 'setCadreDutyOf', cid: c.id, person: { group: 'g' } });
    for (let k = 0; k < 3; k++) { const from = addDays('2026-11-25', Math.floor(r() * 40)); s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: pick(r, ['ka', 'amd', 'apal', 'an', 'nos', 'adik', 'fyl']), from, to: addDays(from, Math.floor(r() * 5)), note: r() < 0.3 ? 'σημείωση' : undefined }, replace: true }); }
    if (r() < 0.4) s = run(s, { t: 'setCadreNoDuty', cid: c.id, from: '2026-12-1' + Math.floor(r() * 9), to: '2026-12-19', note: 'σχολή' });
  }
  const f = autoFill(s, '2026-12'); if (f.add.length) s = run(s, { t: 'setCadreDuties', add: f.add, del: [], text: 'δοκιμή' });
  for (const p of s.people) if (r() < 0.8) s = run(s, { t: 'setWeapons', changes: [{ pid: p.id, weapon: 'ι ' + (100 + p.id), wtype: pick(r, ['g3a3', 'MG3A1']), rack: 'ε', wpos: String(p.id) }] });
  for (let i = 0; i < 6; i++) s = run(s, { t: 'saveAsset', asset: { cat: pick(r, ['diopt', 'asyrm', 'imatismos', 'pistolia']), type: pick(r, ['διόπτρα νυκτός', 'rf-13', 'χλαίνη', 'μ1911 α1']), no: 'σ' + i, qty: r() < 0.3 ? 12 : undefined, state: pick(r, ['ok', 'repair', 'writeoff']), holder: r() < 0.5 ? { k: 'person', pid: pick(r, s.people).id } : undefined, note: 'μικρά γράμματα' } as any, date: D });
  for (let i = 0; i < 3; i++) s = run(s, { t: 'saveAsset', asset: { cat: pick(r, ['troxofora', 'erpystr']), type: pick(r, ['μαν 6t', 'm113']), no: 'εσ ' + i, plate: 'εσ ' + i, state: 'ok' } as any, date: D });
  for (const v of registry(s).filter(x => x.cat?.kind === 'vehicle')) { s = run(s, { t: 'assetFuel', id: v.key, date: D, litres: 40, km: 12000 + Math.floor(r() * 5000) }); s = run(s, { t: 'assetMaint', id: v.key, date: '2026-06-01', km: 9000, note: 'αλλαγή λαδιών' }); }
  // υπηρεσία εκτός στρατοπέδου (στήλη ΗΚΑΙ «Φυλάκια»): το όπλο των δύο της μετρά ΑΠΩΝ, φύλλο ΑΠΟΝΤΑ στον ΟΠΛΙΣΜΟ και στο Μητρώο
  s = run(s, { t: 'setWeapons', changes: [3, 4].map(pid => ({ pid, weapon: 'φυλ ' + pid, wtype: 'G3A3' })) });
  s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'Φυλάκιο Ποταμού', kind: 'other', armed: true, n: 1, per: 2, hrs: '15:00-22:00', hkCol: 'fyl' });
  const fylBlock = blocksOf(s.settings).find(b => b.name === 'Φυλάκιο Ποταμού')!;
  s = { ...s, guards: { ...s.guards, [D]: { [fylBlock.posts[0].k]: 3, [fylBlock.posts[1].k]: 4 } } };
  // (το «προς επισκευή» δεν πάει σε όπλο της υπηρεσίας εκτός: εκεί νικά το ΕΚΤΟΣ της επισκευής)
  const w = registry(s).find(x => x.link && !(x.link.k === 'person' && (x.link.pid === 3 || x.link.pid === 4))); if (w) s = run(s, { t: 'assetState', ...(w.stored ? { id: w.key } : { id: w.key, base: w.a }), state: 'repair', why: 'σπασμένο κλείστρο', date: D });
  return s;
}

async function cells(buf: Buffer): Promise<Map<string, string>> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any); const m = new Map<string, string>();
  wb.eachSheet(ws => ws.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: false }, c => {
    const v: any = c.value; const t = v == null ? '' : typeof v === 'object' ? ('richText' in v ? v.richText.map((x: any) => x.text).join('') : 'formula' in v ? String(v.result ?? '') : 'text' in v ? String(v.text) : v instanceof Date ? v.toISOString().slice(0, 10) : JSON.stringify(v)) : String(v);
    if (t !== '') m.set(ws.name + '!' + c.address, t);
  })));
  return m;
}

describe('Τα νέα Excel της 17/11: ανοίγουν στο LibreOffice ίδια, με κεφαλαία', () => {
  it.skipIf(!soffice)('6 αρχεία × 4 τυχαίες καταστάσεις', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-books-'));
    try {
      const files: { f: string; buf: Buffer; what: string }[] = [];
      for (let seed = 1; seed <= 4; seed++) {
        const s = state(seed);
        const made = [await cadreLeaveBook(s, 2026, D, s.cadreList[0].id), await cadrePlanBook(s, '2026-12', D), await cadreDutyBook(s, '2026-12', D), await assetBook(s, registry(s, { day: D, hm: '18:00' }), D), await vehicleBook(s, D), await weaponsBook(s, D)];
        made.forEach((m, i) => { const f = path.join(dir, seed + '-' + i + '.xlsx'); fs.writeFileSync(f, m.data); files.push({ f, buf: m.data, what: seed + ' ' + m.name }); });
      }
      const prof = path.join(dir, 'prof');
      execFileSync(soffice!, ['--headless', '--norestore', '-env:UserInstallation=file://' + prof, '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(dir, 'out'), ...files.map(x => x.f)], { timeout: 240000, stdio: 'ignore' });
      for (const x of files) {
        const out = path.join(dir, 'out', path.basename(x.f)); expect(fs.existsSync(out), x.what + ' did not open in LibreOffice').toBe(true);
        const a = await cells(x.buf), b = await cells(fs.readFileSync(out));
        expect(a.size, x.what).toBeGreaterThan(10);
        for (const [k, v] of a) {
          expect(b.get(k), x.what + ' ' + k).toBe(v);
          // capitals: every text the app wrote (numbers and dates aside); the disjunctive «Ή» keeps its accent
          if (/[a-zα-ωά-ώ]/.test(v)) expect(v.replace(/ Ή /g, ' Η '), x.what + ' ' + k).toBe(upper(v));
        }
      }
      // ο ΟΠΛΙΣΜΟΣ έχει φύλλο ΑΠΟΝΤΑ με τα δύο όπλα, και το Μητρώο ΘΕΣΗ «ΑΠΩΝ (…)» και ΑΠΟΝΤΑ στα ΣΥΝΟΛΑ, όπως γύρισαν από το LibreOffice
      let wk = 0, reg = 0;
      for (const x of files) {
        const b = await cells(fs.readFileSync(path.join(dir, 'out', path.basename(x.f))));
        const ab = [...b].filter(([k]) => k.startsWith('ΑΠΟΝΤΑ!')).map(([, v]) => v);
        if (ab.length) { wk++; expect(ab.filter(v => v === 'ΑΠΩΝ: ΥΠΗΡΕΣΙΑ ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ 14:45–22:15'), x.what).toHaveLength(2); }
        const th = [...b.values()].filter(v => v === 'ΑΠΩΝ (ΦΥΛΑΚΙΟ ΠΟΤΑΜΟΥ)');
        if (th.length) { reg++; expect(th, x.what).toHaveLength(2); expect([...b].some(([k, v]) => k.startsWith('ΣΥΝΟΛΑ!') && v === 'ΑΠΟΝΤΑ'), x.what).toBe(true); }
      }
      expect(wk).toBe(4); expect(reg).toBe(4);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }, 300000);
});
