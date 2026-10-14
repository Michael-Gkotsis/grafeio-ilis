// Πολλά είδη στο ίδιο Δυναμολόγιο: μία εγγραφή για όλα, ίδιο αποτέλεσμα με την εγγραφή ένα-ένα· και ποια είδη αφορά
// μια αλλαγή σε άτομο. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AppState, Status } from '../src/shared/domain';
import { KIND, defaultBinding, kindsForPeople, type ListKind, type SourceBinding } from '../src/shared/sources';
import { readBook, tableState, writeGroup, writeSource, type SourceMeta } from '../src/main/sources';
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
  });
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
