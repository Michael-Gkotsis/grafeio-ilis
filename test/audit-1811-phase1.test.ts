// Έλεγχος 18/11, φάση 1: Άγνοια/Λιποταξία/Αδικαιολόγητη απουσία στη ΔΥΝΑΜΗ των Εξοδούχων (ομάδα Β5 ή της επιλογής), όνομα αρχείου
// «ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ» από τις Ρυθμίσεις, και αντίγραφο/επαναφορά εικόνων και προτύπων εντύπων από USB
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fillOuts } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { copyTemplates, restoreExtras, TPL_FOLDER, IMG_DIR } from '../src/main/eikones';
import { apply, type Ctx } from '../src/shared/commands';
import { dayBook, DAY_GROUPS } from '../src/shared/outsDay';
import { fileNameOf } from '../src/shared/fileNames';
import { adikGroupOf, type AdikGroup, type AppState, type Status, type TypeKey } from '../src/shared/domain';
import { fakeState } from './fixtures';

const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx'));
const FRI = '2026-10-30', SAT = '2026-10-31', SUN = '2026-11-01';
let q = 0;
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 'a' + ++q, pid, type, from, to: extra.to || from, ...extra });
// ο 40 έχει έξοδο όλες τις γύρω μέρες (δηλωμένες μέρες), όπως στα outs-day
const base = (extra: Status[], set: Partial<AppState['settings']> = {}): AppState => {
  const s = fakeState(40); s.statuses = [st(40, 'OUT', '2026-10-28'), st(40, 'OUT', '2026-10-29'), st(40, 'OUT', FRI), st(40, 'OUT', SAT), st(40, 'OUT', SUN), ...extra];
  s.settings = { ...s.settings, outsFmt: 'all', ...set }; return s;
};
const grp = (s: AppState, d: string, pid = 1) => dayBook(s, d).find(r => r.p.id === pid)!.g;

describe('Σ1: Άγνοια / Λιποταξία / Αδικαιολόγητη απουσία στη ΔΥΝΑΜΗ', () => {
  it('το Β5 είναι ομάδα Β μετά το Β4, με τον τίτλο του', () => {
    const i = DAY_GROUPS.findIndex(g => g[0] === 'B4');
    expect(DAY_GROUPS[i + 1]).toEqual(['B5', 'B', 'ΑΓΝΟΙΑ / ΛΙΠΟΤΑΞΙΑ / ΑΔΙΚ. ΑΠΟΥΣΙΑ']);
  });
  it('προεπιλογή: Β5 την πρώτη μέρα και τις επόμενες, ποτέ Α3 / Β1', () => {
    for (const ty of ['AGN', 'LIP', 'ADK'] as TypeKey[]) {
      const s = base([st(1, ty, FRI, { to: '2026-11-05' })]);
      expect(adikGroupOf(s.settings, ty)).toBe('B5');
      for (const d of [FRI, SAT, SUN]) expect(grp(s, d), ty + ' ' + d).toBe('B5');
    }
  });
  it('η επιλογή ανά κατάσταση: Β3 για Άγνοια, οι άλλες μένουν Β5', () => {
    const set = { outsAdik: { AGN: 'B3' as AdikGroup } };
    const a = base([st(1, 'AGN', FRI, { to: '2026-11-05' }), st(2, 'LIP', FRI, { to: '2026-11-05' })], set);
    for (const d of [FRI, SAT]) { expect(grp(a, d, 1)).toBe('B3'); expect(grp(a, d, 2)).toBe('B5'); }
  });
  it('άδεια + έξοδος: ακολουθεί την επιλογή (και η απλή άδεια μένει Β1)', () => {
    const s = base([st(1, 'AGN', '2026-10-28', { to: '2026-11-05' }), st(1, 'OUT', FRI), st(2, 'LEAVE', '2026-10-26', { to: '2026-11-02' }), st(2, 'OUT', FRI)], { outsAdik: { AGN: 'B4' } });
    expect(grp(s, FRI, 1)).toBe('B4'); expect(grp(s, FRI, 2)).toBe('B1');
  });
  it('ο κανόνας Γ4 (γυρίζει απόψε και μένει) μένει όπως ήταν', () => {
    const s = base([st(1, 'AGN', '2026-10-26', { to: FRI, toTime: '14:00' }), st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '14:00' })]);
    expect(grp(s, FRI)).toBe('G4');
  });
  it('χωρίς τέτοιες καταστάσεις: η άδεια μένει Α3 / Β1 και κανείς δεν είναι στο Β5', () => {
    const s = base([st(1, 'LEAVE', FRI, { to: '2026-11-03', fromTime: '14:00' }), st(2, 'LEAVE', '2026-10-26', { to: '2026-11-02' })]);
    expect(grp(s, FRI, 1)).toBe('A3'); expect(grp(s, FRI, 2)).toBe('B1');
    expect(dayBook(s, FRI).some(r => r.g === 'B5')).toBe(false);
  });
  it('η ρύθμιση περνά από την εντολή setSettings (με αναίρεση)', () => {
    const ctx: Ctx = { today: FRI, newId: () => 'n' + ++q };
    const s = base([]); const r = apply(s, { t: 'setSettings', settings: { outsAdik: { LIP: 'B2' } }, text: 'δοκιμή' }, ctx);
    expect(adikGroupOf(r.state.settings, 'LIP')).toBe('B2');
  });
  it('Excel ΔΥΝΑΜΗ: ο τίτλος Β5 και το άτομο μέσα του· χωρίς τέτοιον, δεν γράφεται', async () => {
    const readSubs = async (s: AppState) => {
      const r = await fillOuts(T, s, SAT); const wb = await Workbook.open(r.data); const rows = await wb.values(r.sheets![1], 600, 30);
      return rows.map(row => String(row[0] ?? ''));
    };
    const withA = await readSubs(base([st(1, 'AGN', FRI, { to: '2026-11-05' })]));
    const i = withA.findIndex(x => /^Β5\. ΑΓΝΟΙΑ \/ ΛΙΠΟΤΑΞΙΑ \/ ΑΔΙΚ\. ΑΠΟΥΣΙΑ \(1\)$/.test(x));
    expect(i).toBeGreaterThan(-1);
    const without = await readSubs(base([st(1, 'LEAVE', FRI, { to: '2026-11-05' })]));
    expect(without.some(x => x.startsWith('Β5.'))).toBe(false);
  });
});

describe('Σ6: όνομα αρχείου «ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ»', () => {
  it('προεπιλογή: ίδιο με πριν, byte προς byte', async () => {
    expect((await fillOuts(T, base([]), SAT)).name).toBe('ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ 31-10-2026.xlsx');
  });
  it('δικό σου όνομα, διαχωριστικό και μορφή ημερομηνίας από τις Ρυθμίσεις', async () => {
    const s = base([], { fileNames: { per: { outs: { name: 'ΔΥΝΑΜΗ ΙΛΗΣ', sep: '_', date: 'Y-m-d' } } } });
    const r = await fillOuts(T, s, SAT);
    expect(r.name).toBe('ΔΥΝΑΜΗ ΙΛΗΣ_2026-10-31.xlsx'); expect(r.name).toBe(fileNameOf(s.settings, 'outs', SAT));
  });
});

describe('Σ10: USB, εικόνες και πρότυπα εντύπων', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gi-usb-'));
  const U1 = '11111111-1111-1111-1111-111111111111.xlsx', U2 = '22222222-2222-2222-2222-222222222222.docx';
  const IMG = 'a'.repeat(40) + '.png';
  const put = (dir: string, f: string, c: string) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); };
  const get = (dir: string, f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
  it('αντίγραφο: αντιγράφει όσα λείπουν και όσα άλλαξαν, δεν σβήνει, αγνοεί ξένα αρχεία', () => {
    const data = tmp(), usb = tmp();
    put(data, path.join(TPL_FOLDER, U1), 'v1'); put(data, path.join(TPL_FOLDER, 'notes.txt'), 'x');
    expect(copyTemplates(data, usb)).toBe(1); expect(get(usb, path.join(TPL_FOLDER, U1))).toBe('v1');
    expect(fs.existsSync(path.join(usb, TPL_FOLDER, 'notes.txt'))).toBe(false);
    expect(copyTemplates(data, usb)).toBe(0);
    put(data, path.join(TPL_FOLDER, U1), 'v2'); put(data, path.join(TPL_FOLDER, U2), 'w');
    expect(copyTemplates(data, usb)).toBe(2); expect(get(usb, path.join(TPL_FOLDER, U1))).toBe('v2');
    fs.rmSync(path.join(data, TPL_FOLDER, U2));
    copyTemplates(data, usb); expect(fs.existsSync(path.join(usb, TPL_FOLDER, U2))).toBe(true);
    expect(copyTemplates(path.join(data, 'δεν υπάρχει'), usb)).toBe(0);
  });
  it('επαναφορά: φέρνει εικόνες και πρότυπα που λείπουν, δεν αλλάζει τα υπάρχοντα', () => {
    const usb = tmp(), data = tmp();
    put(usb, path.join(IMG_DIR, IMG), 'img'); put(usb, path.join(TPL_FOLDER, U1), 'usb1'); put(usb, path.join(TPL_FOLDER, U2), 'usb2');
    put(data, path.join(TPL_FOLDER, U1), 'local1');
    expect(restoreExtras(usb, data)).toEqual({ images: 1, templates: 1 });
    expect(get(data, path.join(IMG_DIR, IMG))).toBe('img'); expect(get(data, path.join(TPL_FOLDER, U2))).toBe('usb2');
    expect(get(data, path.join(TPL_FOLDER, U1))).toBe('local1');
    expect(restoreExtras(usb, data)).toEqual({ images: 0, templates: 0 });
    expect(restoreExtras(tmp(), tmp())).toEqual({ images: 0, templates: 0 });
  });
});
