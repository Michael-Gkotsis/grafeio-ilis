// Αναίρεση ανάγνωσης από Excel (και επαναφορά βάσης): ο έλεγχος υπηρεσιών ξεχνά ποιες εγγραφές του Excel «έχει δει», αλλιώς
// η επόμενη χειροκίνητη «Ενημέρωση Excel» θα σβήνε από το Excel ό,τι μόλις αναιρέθηκε στην εφαρμογή. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { bestFor, dutiesCmd, planDuties, planDutiesWrite, type SourceBinding } from '../src/shared/sources';
import { SourceMetaStore, holdPatch } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
const ctx: Ctx = { today: TODAY, newId: () => 'd1' };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
function sheetOf(s: AppState, cells: Record<string, string>): RawSheet {
  const days = Array.from({ length: 30 }, (_, i) => String(i + 1));
  return { name: 'ΕΛΕΓΧΟΣ', rows: [
    ['ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026'],
    ['Α/Α', 'ΒΘΜ', 'Ο-Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', 'ΑΡΓΕΙΑ', 'ΚΑΘΗΜΕΡΙΝΗ', 'ΣΥΝΟΛΟ', 'ΣΚΟΠΙΑ', 'ΜΑΓΕΙΡΕΙΑ', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', ...days],
    ...s.people.slice(0, 8).map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.room, 0, 0, 0, 0, 0, 0, ...days.map(d => cells[i + ':' + d] || null)])
  ] };
}

describe('αναμονή ειδών μετά από αναίρεση ανάγνωσης ή επαναφορά βάσης', () => {
  const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gi-hold-')), 'sources.json');
  it('έλεγχος υπηρεσιών: μετά την αναίρεση της ανάγνωσης η εγγραφή πίσω δεν σβήνει ό,τι διάβασε η εφαρμογή', () => {
    const s = fakeState(12);
    const sh = sheetOf(s, { '0:1': 'Θ1α', '1:1': 'Μ1', '2:3': 'Θ' });
    const x = bestFor('duties', [sh])!; const b: SourceBinding = { file: 'x.xlsx', sheet: sh.name, header: x.header, cols: x.cols, write: true };
    const p = planDuties(sh, b, s, '2026-09', TODAY);
    const imported = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' });
    expect(imported).not.toBe(s);
    // η εφαρμογή θυμάται ότι είδε αυτά τα κελιά (markSynced)· μετά η αναίρεση γυρίζει την εφαρμογή στο «πριν»
    const meta = new SourceMetaStore(tmp());
    meta.set('duties', { keys: p.keys, at: '12/10 09:00' });
    expect(planDutiesWrite(sh, b, s, TODAY, meta.get('duties')!.keys).sets.filter(c => c.v == null)).toHaveLength(3);   // πριν τη διόρθωση: σβήνει όλα
    meta.set('duties', holdPatch('duties', 'αναίρεση'));
    const m = meta.get('duties')!;
    expect(m.hold).toBe('αναίρεση'); expect(m.keys).toEqual([]); expect(m.at).toBe('12/10 09:00');
    expect(planDutiesWrite(sh, b, s, TODAY, m.keys).sets).toEqual([]);
  });
  it('τα άλλα είδη κρατούν τις εγγραφές που είχαν δει (η αναίρεση δεν τις αγγίζει)', () => {
    const meta = new SourceMetaStore(tmp());
    meta.set('punish', { keys: ['p1', 'p2'], at: 'x' });
    meta.set('punish', holdPatch('punish', 'αναίρεση'));
    expect(meta.get('punish')).toMatchObject({ hold: 'αναίρεση', keys: ['p1', 'p2'] });
  });
});
