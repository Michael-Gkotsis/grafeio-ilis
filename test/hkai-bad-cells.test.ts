// ΗΚΑΙ με δικό σου template και αποθηκευμένη αντιστοίχιση που έχει άκυρο κελί (π.χ. «2» στον Τίτλο): η εξαγωγή και η προεπισκόπηση δεν
// σταματούν πια με «Λάθος κελί: 2»· η άκυρη τιμή παραλείπεται, βγαίνει προειδοποίηση και το έντυπο γράφεται όπως αν δεν υπήρχε. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply } from '../src/shared/commands';
import { cleanHkaiCells } from '../src/shared/sources';
import { fillHkai } from '../src/main/exports';
import { previewOf } from '../src/main/formPreview';
import { fakeState } from './fixtures';

const D = '2026-10-12'; let n = 0;
const s = apply(fakeState(60), { t: 'autofill', date: D }, { today: D, newId: () => 'q' + ++n }).state;
const tpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'hkai.xlsx'));

describe('ΗΚΑΙ: άκυρη αποθηκευμένη αντιστοίχιση', () => {
  it('cleanHkaiCells κρατά τα έγκυρα και λέει ποια παραλείφθηκαν', () => {
    expect(cleanHkaiCells(undefined)).toEqual({ cells: undefined, bad: [] });
    const r = cleanHkaiCells({ title: 'B2', date: '2', rows: { ΛΧΙΑΣ: 7, ΕΠΟΠ: 0, ΑΝΘΛΓΟΣ: -3 as number }, cols: { sum: 'F', ab: '12' } });
    expect(r.cells).toEqual({ title: 'B2', rows: { ΛΧΙΑΣ: 7, ΕΠΟΠ: 0 }, cols: { sum: 'F' } });
    expect(r.bad.join(' | ')).toMatch(/Τόπος και ημερομηνία «2»/); expect(r.bad.join(' | ')).toMatch(/ΑΝΘΛΓΟΣ/); expect(r.bad.join(' | ')).toMatch(/ab «12»/);
  });
  for (const cells of [{ title: '2' }, { date: '2' }, { cols: { sum: '2' } }] as object[]) {
    it('εξαγωγή και προεπισκόπηση με ' + JSON.stringify(cells) + ': όχι «Λάθος κελί», με προειδοποίηση', async () => {
      const out = await fillHkai(tpl, s, D, { cells } as never);
      expect(out.warnings!.join(' ')).toMatch(/μη έγκυρες τιμές/);
      const pv = await previewOf(out); expect(pv.sheets.length).toBe(2);
      // ίδιο αρχείο με αυτό χωρίς αντιστοίχιση (η άκυρη τιμή δεν αλλάζει τίποτα)
      const plain = await fillHkai(tpl, s, D, {});
      expect(Buffer.compare(out.data, plain.data)).toBe(0);
    });
  }
  it('έγκυρη αντιστοίχιση: καμία προειδοποίηση', async () => {
    const out = await fillHkai(tpl, s, D, { cells: { title: 'A3' } } as never);
    expect((out.warnings || []).join(' ')).not.toMatch(/μη έγκυρες/);
  });
});
