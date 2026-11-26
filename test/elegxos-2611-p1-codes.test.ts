// Michael, 26/11: «γιατί δείχνει αυδμ/αυδμ ενώ είναι 2 διαφορετικοί κωδικοί». Στέλεχος σε δύο θέσεις «Μόνο στελέχη» την ίδια μέρα:
// στον Έλεγχο υπηρεσιών (οθόνη και Excel) φαίνεται ο κωδικός της υπηρεσίας στελεχών κάθε θέσης (ΑΥΔΜ/ΕΕΑΣ), όχι ο κωδικός θέσης (Υ1/Υ2).
// Αν η 2η θέση δεν έχει διαλέξει «Αντιστοιχεί στην υπηρεσία στελεχών», μετρά ως η 1η υπηρεσία της ομάδας (ΑΥΔΜ), όπως πριν. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type CadreDutyCfg } from '../src/shared/domain';
import { pickPeople } from '../src/shared/rules';
import { cellCode, personCells } from '../src/shared/cadreDuty';
import { monthIndex } from '../src/shared/cadrePlan';
import { Workbook } from '../src/main/xlsx';
import { dutyCheck } from '../src/main/excel';
import { checkSheet } from '../src/renderer/sheets';
import { fakeState } from './fixtures';

let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: '2026-12-10', newId: () => 'a' + ++n }).state;
const CFG: Partial<CadreDutyCfg> = {
  groups: [{ id: 'g', name: 'Αξιωματικοί', services: [
    { id: 'a', name: 'Αξιωματικός Υπηρεσίας', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' },
    { id: 'b', name: 'Επόπτης', short: 'ΕΠΟΠΤΗΣ', perDay: 1, h24: true, hkCol: '' }] }],
  limits: { off: { base: 9, extra: 1 }, nco: { base: 9, extra: 1 } }, rest: 0, carry: true, fairHol: true
};
const YM = '2026-12', D = '2026-12-05';
function setup(as?: string) {
  let s = run(fakeState(10), { t: 'setSettings', settings: { cadreDuty: CFG }, text: 'δοκιμή' });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΑΛΦΑ' } });
  const cid = s.cadreList[0].id; s = run(s, { t: 'setCadreDutyOf', cid, person: { group: 'g' } });
  s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'ΑΥΔΜ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g' });
  s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'ΕΠΟΠΤΗΣ', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g', ...(as ? { cadreAs: as } : {}) });
  const bs = blocksOf(s.settings); const pid = () => pickPeople(s).find(p => p.cid === cid)!.id;
  s = run(s, { t: 'assign', date: D, k: bs.find(b => b.name === 'ΑΥΔΜ')!.posts[0].k, pid: pid(), cid, force: 'δοκιμή' });
  s = run(s, { t: 'assign', date: D, k: bs.find(b => b.name === 'ΕΠΟΠΤΗΣ')!.posts[0].k, pid: pid(), cid, force: 'δοκιμή' });
  return s;
}
const gridCell = (s: AppState) => checkSheet(s, YM).rows.find(r => String(r[1]?.v).includes('ΣΤΕΛΕΧΟΣ'))![8 + 4]!.v;
const xlCell = async (s: AppState) => { const wb = await Workbook.open((await dutyCheck(s, YM)).data); const rows = await wb.values(wb.sheetNames()[0]); return rows.find(x => x[2] === 'ΣΤΕΛΕΧΟΣ')![rows[2].indexOf('5')]; };

describe('Έλεγχος υπηρεσιών: θέσεις «Μόνο στελέχη» με τον κωδικό της υπηρεσίας στελεχών', () => {
  it('2 θέσεις, 2 υπηρεσίες: ΑΥΔΜ/ΕΠΟΠΤΗΣ στο πλέγμα, στο Excel και στο πρόγραμμα (κωδικός 7 γραμμάτων ολόκληρος)', async () => {
    const s = setup('b');
    expect(gridCell(s)).toBe('ΑΥΔΜ/ΕΠΟΠΤΗΣ');
    expect(await xlCell(s)).toBe('ΑΥΔΜ/ΕΠΟΠΤΗΣ');
    expect(cellCode(personCells(s, s.cadreList[0], monthIndex(s, YM))[4])).toBe('ΑΥΔΜ/ΕΠΟΠΤΗΣ');
  });
  it('χωρίς «Αντιστοιχεί στην υπηρεσία στελεχών»: η 2η θέση μετρά ως η 1η υπηρεσία (ΑΥΔΜ/ΑΥΔΜ)', async () => {
    const s = setup();
    expect(gridCell(s)).toBe('ΑΥΔΜ/ΑΥΔΜ');
    expect(cellCode(personCells(s, s.cadreList[0], monthIndex(s, YM))[4])).toBe('ΑΥΔΜ/ΑΥΔΜ');
  });
});
