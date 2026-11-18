// Σ2 (έλεγχος 18/11, φάση 3): τα 5 νεότερα Excel (Άδειες-απαλλαγές, Πρόγραμμα αδειών, Υπηρεσίες στελεχών, Μητρώο οπλισμού,
// Οχήματα) περνούν από το ίδιο τελικό βήμα με τα άλλα (signMade): υπογραφές, επικεφαλίδα εγγράφων, θέσεις στο χαρτί.
// Χωρίς ρυθμίσεις το αρχείο μένει byte-προς-byte ίδιο με του κατασκευαστή του (excel.ts).
import { describe, it, expect } from 'vitest';
import { assetBook, cadreDutyBook, cadreLeaveBook, cadrePlanBook, vehicleBook, type Made } from '../src/main/excel';
import { signMade } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { assetView, registry } from '../src/shared/assets';
import { presetZones, headUseOf, cleanHeadUse, type DocHead } from '../src/shared/docHead';
import { LAYOUT_SHEETS } from '../src/shared/layout';
import { FILE_ROWS } from '../src/shared/fileNames';
import { MADE_FORMS, SIG_FORMS, sigLabel, sigsSaved, type Sig, type SigForm } from '../src/shared/sigs';
import { fakeState } from './fixtures';

const D = '2026-11-17';
const NEW: SigForm[] = ['cadreLeave', 'cadrePlan', 'cadreDuty', 'assets', 'vehicles'];
const two: Sig[] = [{ art: 'Ο', title: 'ΑΛΧΙΑΣ ΙΛΗΣ', name: 'Λοχιας Δοκιμης' }, { art: 'Ο', title: 'ΔΚΤΗΣ ΙΛΗΣ' }];
const HEAD_TXT = 'ΕΠΙΚΕΦΑΛΙΔΑ ΔΟΚΙΜΗΣ';

const build = (s: ReturnType<typeof fakeState>): Record<string, () => Promise<Made>> => ({
  cadreLeave: () => cadreLeaveBook(s, 2026, D),
  cadrePlan: () => cadrePlanBook(s, '2026-11', D, 'all'),
  cadreDuty: () => cadreDutyBook(s, '2026-11', D),
  assets: () => assetBook(s, assetView(s, { filter: 'all', q: '' }, D, registry(s, { day: D, hm: '10:00' })), D),
  vehicles: () => vehicleBook(s, D)
});
async function texts(data: Buffer): Promise<string[]> {
  const wb = await Workbook.open(data); const out: string[] = [];
  for (const n of wb.sheetNames()) (await wb.values(n, 400, 60)).forEach(row => (row || []).forEach(v => { if (v != null && String(v) !== '') out.push(String(v)); }));
  return out;
}

describe('Σ2: τα 5 νεότερα Excel στο κοινό τελικό βήμα', () => {
  it('οι 5 φόρμες είναι στη λίστα των Υπογραφών, με τις ετικέτες των ονομάτων αρχείων, και έχουν θέσεις στο χαρτί', () => {
    for (const f of NEW) {
      expect(SIG_FORMS).toContain(f); expect(MADE_FORMS).toContain(f);
      expect(sigLabel(f)).toBe(FILE_ROWS(fakeState(3).settings).find(r => r.id === f)!.label);
      expect(LAYOUT_SHEETS[f as Exclude<SigForm, 'reports'>].length).toBeGreaterThan(0);
      expect(sigsSaved(fakeState(3).settings, f)).toEqual([]);
    }
    expect(SIG_FORMS[SIG_FORMS.length - 1]).toBe('reports');
    expect(SIG_FORMS.slice(0, 9)).toEqual(['hkai', 'froura', 'outs', 'check', 'roster', 'cadre', 'weapons', 'imer', 'hd']);   // τα παλιά κλειδιά στη σειρά τους
  });

  it('επικεφαλίδες εγγράφων: κάθε νέο έγγραφο ξεκινά με «Όπως σήμερα» και δέχεται επιλογή· ισχύει και η αποθήκευση', () => {
    const h: DocHead = { id: 'h1', name: 'Δοκιμή', z: presetZones('empty', fakeState(3).settings) };
    for (const f of NEW) {
      expect(headUseOf({ heads: [h] }, f).def).toBe('today');
      const kept = cleanHeadUse({ [f]: { on: ['h1'], def: 'h1' } }, [h]);
      expect(kept?.[f]).toEqual({ on: ['h1'], def: 'h1' });
    }
  });

  for (const f of NEW) {
    describe(f, () => {
      it('χωρίς υπογραφές και με «Όπως σήμερα» το αρχείο μένει ίδιο byte προς byte με του κατασκευαστή', async () => {
        const s = fakeState(12); const m = await build(s)[f]();
        const r = await signMade(m.data, s, f, m.marks);
        expect(r.data.equals(m.data)).toBe(true);
        expect(r.warnings).toEqual([]);
        // και ό,τι άλλο ισχύει πριν από τις ρυθμίσεις: κενή λίστα υπογραφών, καμία μετακίνηση
        const r2 = await signMade(m.data, { ...s, settings: { ...s.settings, sigs: {}, layout: {} } }, f, m.marks);
        expect(r2.data.equals(m.data)).toBe(true);
      });

      it('με υπογραφές στις Ρυθμίσεις το αρχείο έχει το μπλοκ υπογραφών κάτω από κάθε φύλλο', async () => {
        const s0 = fakeState(12); const s = { ...s0, settings: { ...s0.settings, sigs: { [f]: two } } };
        const m = await build(s)[f]();
        const r = await signMade(m.data, s, f, m.marks);
        expect(r.data.equals(m.data)).toBe(false);
        const t = await texts(r.data);
        expect(t.filter(x => x === 'ΑΛΧΙΑΣ ΙΛΗΣ').length).toBe(m.marks.length);
        expect(t.filter(x => x === 'ΛΟΧΙΑΣ ΔΟΚΙΜΗΣ').length).toBe(m.marks.length);
        expect(r.layout.flatMap(l => l.blocks.map(b => b.id))).toContain('s1');
      });

      it('με σχεδιασμένη επικεφαλίδα αρχική για το έγγραφο, η επικεφαλίδα εμφανίζεται· με «Όπως σήμερα» όχι', async () => {
        const s0 = fakeState(12); const z = presetZones('empty', s0.settings); z[0] = [{ k: 'text', t: HEAD_TXT }];
        const h: DocHead = { id: 'h1', name: 'Δοκιμή', z };
        const s = { ...s0, settings: { ...s0.settings, heads: [h], headUse: { [f]: { on: ['h1'], def: 'h1' } } } };
        const m = await build(s)[f]();
        const r = await signMade(m.data, s, f, m.marks);
        expect((await texts(r.data)).filter(x => x === HEAD_TXT).length).toBe(m.marks.length);
        // η επιλογή «για μία φορά» (headId) «Όπως σήμερα»: πάλι ίδιο byte προς byte
        const r2 = await signMade(m.data, s, f, m.marks, undefined, 'today');
        expect(r2.data.equals(m.data)).toBe(true);
        // επικεφαλίδα δοσμένη για μία φορά, ενώ η αρχική είναι «Όπως σήμερα»
        const s3 = { ...s0, settings: { ...s0.settings, heads: [h] } };
        const r3 = await signMade(m.data, s3, f, m.marks, undefined, 'h1');
        expect((await texts(r3.data)).filter(x => x === HEAD_TXT).length).toBe(m.marks.length);
      });

      it('μετακίνηση στις «Θέσεις στο χαρτί» (τίτλος) ισχύει και βγαίνουν τα κομμάτια του φύλλου', async () => {
        const s0 = fakeState(12); const s = { ...s0, settings: { ...s0.settings, layout: { [f]: { main: { title: [0, 1] as [number, number] } } } } };
        const m = await build(s)[f]();
        const r = await signMade(m.data, s, f, m.marks);
        expect(r.data.equals(m.data)).toBe(false);
        expect(r.layout[0].blocks.map(b => b.id)).toContain('title');
      });
    });
  }
});
