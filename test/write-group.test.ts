// Πολλά είδη στο ίδιο Δυναμολόγιο: μία εγγραφή για όλα, ίδιο αποτέλεσμα με την εγγραφή ένα-ένα· και ποια είδη αφορά
// μια αλλαγή σε άτομο. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AppState, Status } from '../src/shared/domain';
import { KIND, defaultBinding, kindsForPeople, type ListKind, type SourceBinding } from '../src/shared/sources';
import { readBook, tableState, writeGroup, writeSource, type SourceMeta } from '../src/main/sources';
import { Workbook } from '../src/main/xlsx';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
export const KINDS9: ListKind[] = ['people', 'punish', 'medical', 'hospital', 'step', 'leave', 'dn', 'posts', 'outside'];
export function bigState(n = 150): AppState {
  const s = fakeState(n); const st: Status[] = [];
  const T: [Status['type'], string?][] = [['PUN', 'Κράτηση'], ['EA'], ['NOS'], ['STEP'], ['LEAVE', 'Κανονική'], ['DN']];
  s.people.forEach((p, i) => { if (i % 5 === 0) { const [type, kind] = T[(i / 5) % T.length]; st.push({ id: 'g' + i, pid: p.id, type, from: '2026-10-0' + (1 + (i % 8)), to: '2026-10-2' + (i % 9), ...(kind ? { kind } : {}) }); } });
  s.people = s.people.map((p, i) => (i % 17 === 3 ? { ...p, active: false, notes: 'Εκτός δύναμης: ΑΝΑΒΟΛΗ' } : i % 11 === 4 ? { ...p, post: 'ΚΨΜ' } : p));
  return { ...s, statuses: st };
}
// Δυναμολόγιο όπως το φτιάχνει η εφαρμογή: ΣΥΝΟΛΙΚΟ και ένα φύλλο ανά είδος
export async function bigRoster(dir: string, s: AppState): Promise<{ file: string; b: Record<string, SourceBinding>; meta: Record<string, SourceMeta> }> {
  const file = path.join(dir, 'Δ.xlsx'); const b: Record<string, SourceBinding> = {}; const meta: Record<string, SourceMeta> = {};
  for (const k of KINDS9) {
    b[k] = { ...defaultBinding(k, file, k === 'people' ? 'ΣΥΝΟΛΙΚΟ' : KIND[k].title.slice(0, 31)), write: true };
    const w = await writeSource(k, b[k], s, undefined, TODAY, { create: true }); if (!w.ok) throw new Error(w.error);
    meta[k] = { at: 'x', keys: [], ...w.meta } as SourceMeta;
  }
  return { file, b, meta };
}
const values = async (file: string) => (await readBook(file)).sheets.map(x => ({ name: x.name, rows: JSON.stringify(x.rows) }));

describe('εγγραφή πολλών ειδών του ίδιου αρχείου (P2)', () => {
  it('μία αλλαγή τηλεφώνου: ίδιο αρχείο με την εγγραφή ένα-ένα, και κανένα είδος δεν φαίνεται «αλλαγμένο» μετά', async () => {
    const s0 = bigState(60); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-grp-'));
    const { file, b, meta } = await bigRoster(dir, s0);
    const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gi-grp-')), 'Δ.xlsx'); fs.copyFileSync(file, copy);
    const s1 = { ...s0, people: s0.people.map(p => (p.id === 6 ? { ...p, phone: '6999999999' } : p)) };
    const kinds = [...kindsForPeople(s0.people, s1.people, b)];
    expect(kinds.sort()).toEqual([...KINDS9].sort());   // όλα τα φύλλα έχουν στήλη τηλεφώνου
    for (const k of kinds) { const w = await writeSource(k, { ...b[k], file: copy }, s1, meta[k], TODAY); expect(w.ok).toBe(true); }
    const rs = await writeGroup(kinds.map(k => ({ kind: k, b: b[k], meta: meta[k] })), s1, TODAY);
    expect(rs.every(r => r.ok)).toBe(true);
    expect(await values(file)).toEqual(await values(copy));
    for (const [i, k] of kinds.entries()) { const r = rs[i]; if (!r.ok) throw new Error(r.error); expect((await tableState(b[k], { ...meta[k], ...r.meta } as SourceMeta, k)).changed, k).toBe(false); }
  }, 20_000);   // 9 φύλλα Excel στον δίσκο: σε φορτωμένο μηχάνημα περνά τα 5 δευτ. του vitest
});

describe('ποια είδη αφορά μια αλλαγή σε άτομο', () => {
  it('μόνο όσα έχουν στήλη για το πεδίο που άλλαξε· νέο άτομο αφορά όλα', () => {
    const s = fakeState(5);
    const b = (cols: Record<string, number>): SourceBinding => ({ file: 'x', sheet: 'x', header: 0, cols });
    const src = { people: b({ last: 1, first: 2, phone: 3, si: 4 }), punish: b({ last: 1, first: 2, from: 3 }), posts: b({ last: 1, first: 2, post: 3 }), duties: b({ last: 1, first: 2, d1: 6 }) };
    const ch = (patch: object) => kindsForPeople(s.people, s.people.map(p => (p.id === 2 ? { ...p, ...patch } : p)), src);
    expect([...ch({ phone: '1' })]).toEqual(['people']);
    expect([...ch({ post: 'ΚΨΜ' })]).toEqual(['posts']);
    expect([...ch({ si: 'Ι2' })]).toEqual(['people']);
    expect([...ch({ last: 'ΑΛΛΟΣ' })].sort()).toEqual(['duties', 'people', 'posts', 'punish']);
    expect(kindsForPeople(s.people, [...s.people, { ...s.people[0], id: 99 }], src).size).toBe(4);
  });
});

// Τρεις πίνακες στο ίδιο φύλλο: ο πάνω μεγαλώνει με εισαγωγή γραμμής ενώ δεν είναι το πρώτο είδος της ομάδας, οπότε οι
// πίνακες από κάτω (που είχαν ήδη γραφτεί) κατεβαίνουν. Το αποτύπωμά τους πρέπει να είναι από τη νέα τους θέση.
describe('εγγραφή ομάδας: πίνακες κάτω από πίνακα που μεγάλωσε', () => {
  const serial = (iso: string) => (Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86400000;
  it('κανένας πίνακας δεν φαίνεται «αλλαγμένος» μετά την εγγραφή (ούτε στην επόμενη αλλαγή ώρας του αρχείου)', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gi-grp-')), 'Δ.xlsx');
    const wb = await Workbook.blank('ΙΑΤΡΙΚΑ'); const ws = await wb.sheet('ΙΑΤΡΙΚΑ');
    const put = (r: number, vals: (string | number | { d: string })[]) => vals.forEach((v, c) => { const ref = String.fromCharCode(65 + c) + r; if (typeof v === 'object') ws.setNumber(ref, serial(v.d), 3); else ws.set(ref, v); });
    const s0 = fakeState(6); const [a, b, c] = s0.people;
    put(1, ['ΕΙΣΑΓΩΓΕΣ ΣΤΕΠ']); put(2, ['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΣ', 'ΕΞ']); put(3, [1, a.last, a.first, { d: '2026-10-01' }, { d: '2026-10-02' }]);
    put(4, ['ΕΑ-ΕΥ']); put(5, ['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΑ-ΕΥ', 'ΑΠΟ', 'ΕΩΣ']); put(6, [1, b.last, b.first, 'ΕΑ', { d: '2026-10-01' }, { d: '2026-10-09' }]);
    put(7, ['ΝΟΣΟΚΟΜΕΙΟ']); put(8, ['Α/Α', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΣΑΓΩΓΗ', 'ΕΙΣ', 'ΕΞ']); put(9, [1, c.last, c.first, 'ΝΟΣΟΚΟΜΕΙΟ', { d: '2026-10-03' }, { d: '2026-10-05' }]);
    fs.writeFileSync(file, await wb.save());
    const s: AppState = { ...s0, statuses: [
      { id: 's1', pid: a.id, type: 'STEP', from: '2026-10-01', to: '2026-10-02' },
      { id: 'm1', pid: b.id, type: 'EA', from: '2026-10-01', to: '2026-10-09', kind: 'ΕΑ' },
      { id: 'h1', pid: c.id, type: 'NOS', from: '2026-10-03', to: '2026-10-05' }] };
    const base = { aa: 0, last: 1, first: 2 };
    const bs: Record<string, SourceBinding> = {
      step: { file, sheet: 'ΙΑΤΡΙΚΑ', header: 1, cols: { ...base, from: 3, to: 4 }, write: true },
      medical: { file, sheet: 'ΙΑΤΡΙΚΑ', header: 4, cols: { ...base, kind: 3, from: 4, to: 5 }, write: true },
      hospital: { file, sheet: 'ΙΑΤΡΙΚΑ', header: 7, cols: { ...base, where: 3, from: 4, to: 5 }, write: true } };
    const meta: Record<string, SourceMeta> = {};
    for (const k of ['step', 'medical', 'hospital'] as const) { const w = await writeSource(k, bs[k], s, undefined, TODAY); if (!w.ok) throw new Error(w.error); meta[k] = { at: 'x', keys: [], ...w.meta } as SourceMeta; }
    for (const k of Object.keys(bs)) expect((await tableState(bs[k], meta[k], k as ListKind)).changed, 'πριν ' + k).toBe(false);
    // νέο ΣΤΕΠ: ο πάνω πίνακας δεν έχει ελεύθερη γραμμή, μπαίνει γραμμή και οι άλλοι κατεβαίνουν. Το ΣΤΕΠ είναι τελευταίο στην ομάδα.
    const d = s0.people[3];
    const s2 = { ...s, statuses: [...s.statuses, { id: 's2', pid: d.id, type: 'STEP' as const, from: '2026-10-05', to: '2026-10-06' }] };
    const rs = await writeGroup([{ kind: 'medical', b: bs.medical, meta: meta.medical }, { kind: 'hospital', b: bs.hospital, meta: meta.hospital }, { kind: 'step', b: bs.step, meta: meta.step }], s2, TODAY);
    rs.forEach(r => expect(r.ok).toBe(true));
    fs.utimesSync(file, new Date(), new Date(Date.now() + 60000));   // κάποιος έσωσε το αρχείο στο Excel χωρίς να αλλάξει κάτι
    for (const [i, k] of (['medical', 'hospital', 'step'] as const).entries()) {
      const r = rs[i]; if (!r.ok) throw new Error(r.error);
      expect(r.binding?.header ?? bs[k].header, 'γραμμή ' + k).toBe({ medical: 5, hospital: 8, step: 1 }[k]);
      expect((await tableState({ ...bs[k], ...r.binding }, { ...meta[k], ...r.meta } as SourceMeta, k)).changed, 'μετά ' + k).toBe(false);
    }
  }, 20_000);
});
