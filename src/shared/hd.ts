// Ημερήσια Διαταγή (Michael, 3/11): η σελίδα που ετοιμάζεται σήμερα για αύριο. Γεμίζει από τα δεδομένα (όργανα υπηρεσίας, άδειες στελεχών,
// εγγραφές/διαγραφές/άδειες/ποινές οπλιτών ακριβώς όπως στην πίσω σελίδα της ΗΚΑΙ) και ό,τι γράφεις (ΛΟΙΠΑ, Τμήμα 2 και 3).
// Κάθε γραμμή αλλάζει ή σβήνεται μόνο σε αυτή την ΗΔ. Η ΗΔ που βγήκε κρατιέται όπως βγήκε (AppState.hd).
import { addDays, type ISODate } from './dates';
import { hkaiCadreLeaveLines, hkaiDiaLines, hkaiEgrLines, hkaiPunLines, hkaiSoldierLeaveLines, lineText, type Line } from './hkaiText';
import { hkOffText, orderedCadre } from './cadre';
import { rankTxt } from './ranks';
import { mondayOf } from './imer';
import { upper } from './text';
import type { AppState, Cadre, Settings } from './domain';
import type { Sig } from './sigs';
import { sigsFor } from './sigs';

// ax: μεταβολές αξιωματικών 1–5, op: μεταβολές οπλιτών 1–5 (γραμμές κειμένου)· τα 3 των αξιωματικών και τα 1–4 των οπλιτών βγαίνουν από τα δεδομένα
export interface HdDoc { aydm: string; dn: string; ilxos: string; ax: string[][]; op: string[][]; t2: string; t3: string }
export const HD_SECTIONS = ['ΕΓΓΡΑΦΕΣ', 'ΔΙΑΓΡΑΦΕΣ', 'ΑΔΕΙΕΣ', 'ΠΟΙΝΕΣ', 'ΛΟΙΠΑ'];
const MON = ['ΙΑΝΟΥΑΡΙΟΥ', 'ΦΕΒΡΟΥΑΡΙΟΥ', 'ΜΑΡΤΙΟΥ', 'ΑΠΡΙΛΙΟΥ', 'ΜΑΪΟΥ', 'ΙΟΥΝΙΟΥ', 'ΙΟΥΛΙΟΥ', 'ΑΥΓΟΥΣΤΟΥ', 'ΣΕΠΤΕΜΒΡΙΟΥ', 'ΟΚΤΩΒΡΙΟΥ', 'ΝΟΕΜΒΡΙΟΥ', 'ΔΕΚΕΜΒΡΙΟΥ'];
export const hdDate = (d: ISODate) => d.slice(8, 10) + ' ' + MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4);
// ετοιμάζεται σήμερα για αύριο
export const hdDefaultDay = (today: ISODate): ISODate => addDays(today, 1);
export const cadreTxt = (c: Cadre) => upper([rankTxt(c), c.spec ? '(' + c.spec + ')' : '', c.last, c.first].filter(Boolean).join(' '));
export const hdCadreNames = (s: Pick<AppState, 'cadreList'>): string[] => orderedCadre(s.cadreList || []).filter(c => c.active).map(cadreTxt);
const texts = (ls: Line[]) => ls.map(lineText);

// η προηγούμενη ΗΔ (πριν από τη μέρα d) και η τελευταία της ίδιας εβδομάδας (Δευτέρα–Κυριακή)
const before = (s: Pick<AppState, 'hd'>, d: ISODate): ISODate[] => Object.keys(s.hd || {}).filter(x => x < d).sort();
export function hdAuto(s: AppState, d: ISODate): HdDoc {
  const prev = before(s, d); const last = prev.length ? s.hd![prev[prev.length - 1]] : undefined;
  const wk = prev.filter(x => mondayOf(x) === mondayOf(d)); const lastWk = wk.length ? s.hd![wk[wk.length - 1]] : undefined;
  return {
    aydm: last?.aydm || '', dn: hkOffText(s, d), ilxos: lastWk?.ilxos || '',
    ax: [[], [], texts(hkaiCadreLeaveLines(s, d)), [], []],
    op: [texts(hkaiEgrLines(s, d)), texts(hkaiDiaLines(s, d)), texts(hkaiSoldierLeaveLines(s, d)), texts(hkaiPunLines(s, d)), []],
    t2: last?.t2 || '', t3: last?.t3 || ''
  };
}
// η ΗΔ που βγήκε (όπως βγήκε), αλλιώς η αυτόματη
export const hdDocOf = (s: AppState, d: ISODate): HdDoc => s.hd?.[d] || hdAuto(s, d);

// καθαρισμός πριν την αποθήκευση: κεφαλαία, χωρίς κενές γραμμές, πάντα 5 ενότητες
const clean = (t: unknown) => upper(String(t ?? '')).replace(/[ \t]+/g, ' ').trim().slice(0, 4000);
const cleanLines = (x: unknown): string[] => (Array.isArray(x) ? x : []).map(clean).filter(Boolean).slice(0, 60);
export const cleanHd = (d: HdDoc): HdDoc => ({
  aydm: clean(d.aydm).slice(0, 160), dn: clean(d.dn).slice(0, 160), ilxos: clean(d.ilxos).slice(0, 160),
  ax: Array.from({ length: 5 }, (_, i) => cleanLines(d.ax?.[i])), op: Array.from({ length: 5 }, (_, i) => cleanLines(d.op?.[i])),
  t2: upper(String(d.t2 ?? '')).split('\n').map(x => x.trim()).filter(Boolean).join('\n').slice(0, 4000), t3: upper(String(d.t3 ?? '')).split('\n').map(x => x.trim()).filter(Boolean).join('\n').slice(0, 4000)
});

// οι ετικέτες {…} του προτύπου Word και η τιμή τους· πολλές γραμμές χωρίζονται με \n και γίνονται παράγραφοι
export const HD_TAGS = ['ΜΟΝΑΔΑ', 'ΙΛΗΣ', 'ΗΜΕΡΟΜΗΝΙΑ', 'ΑΥΔΜ', 'ΔΝ', 'ΙΛΧΟΣ', 'ΑΞ1', 'ΑΞ2', 'ΑΞ3', 'ΑΞ4', 'ΑΞ5', 'ΟΠ1', 'ΟΠ2', 'ΟΠ3', 'ΟΠ4', 'ΟΠ5', 'ΤΜΗΜΑ2', 'ΤΜΗΜΑ3', 'ΥΠΟΓΡΑΦΗ'];
const or0 = (t: string) => t.trim() || 'Ø';
// υπογραφή: «- Ο -», θέση, όνομα (όσα βάλεις στις Ρυθμίσεις › Υπογραφές)
export const hdSigLines = (st: Pick<Settings, 'unitKind'>, sigs: Sig[]): string[] => sigsFor(st, sigs).flatMap(x => [x.art ? '- ' + x.art + ' -' : '', x.title, x.name || ''].filter(Boolean));
export function hdTags(st: Pick<Settings, 'unit' | 'unitName' | 'unitKind'>, d: ISODate, doc: HdDoc, sigs: Sig[]): Record<string, string> {
  const x = cleanHd(doc); const t: Record<string, string> = {
    'ΜΟΝΑΔΑ': st.unit.map(u => upper(u)).filter(Boolean).join('/'), 'ΙΛΗΣ': upper(st.unitName || ''), 'ΗΜΕΡΟΜΗΝΙΑ': hdDate(d),
    'ΑΥΔΜ': or0(x.aydm), 'ΔΝ': or0(x.dn), 'ΙΛΧΟΣ': or0(x.ilxos), 'ΤΜΗΜΑ2': or0(x.t2), 'ΤΜΗΜΑ3': or0(x.t3), 'ΥΠΟΓΡΑΦΗ': hdSigLines(st, sigs).join('\n')
  };
  x.ax.forEach((ls, i) => { t['ΑΞ' + (i + 1)] = or0(ls.join('\n')); }); x.op.forEach((ls, i) => { t['ΟΠ' + (i + 1)] = or0(ls.join('\n')); });
  return t;
}

// Η σελίδα ως HTML: για την προεπισκόπηση στην οθόνη και για την εκτύπωση χωρίς Word. fs: μέγεθος γραμμάτων σε px (όλα τα άλλα σε em)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ml = (s: string) => s.split('\n').map(esc).join('<br>');
export function hdPageHtml(t: Record<string, string>, fs: number): string {
  const row = (a: string, b: string) => `<tr><td class="l"></td><td class="a">${a}</td><td class="c">:</td><td class="v">${ml(b)}</td></tr>`;
  const mid = (h: string, cls = '') => `<tr><td class="l"></td><td colspan="3" class="m ${cls}">${h}</td></tr>`;
  const gap = '<tr><td class="l"></td><td colspan="3" class="g"></td></tr>';
  const sec = (k: string) => HD_SECTIONS.map((n, i) => row((i + 1) + '. ' + n, t[k + (i + 1)])).join('');
  return `<div class="hd" style="font-size:${fs}px"><style>
.hd{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;padding:1.2em 1em;line-height:1.25}.hd table{border-collapse:collapse;width:100%;table-layout:fixed}
.hd td{border-bottom:1px dotted #000;padding:.25em .4em;vertical-align:middle}.hd td.l{width:12%;border-left:1px solid #000;border-right:1px solid #000}.hd td.a{width:20%}.hd td.c{width:3%;text-align:center}.hd td.v{width:65%}
.hd td.m{text-align:center}.hd td.u{text-decoration:underline}.hd td.ul{text-decoration:underline;text-align:left}.hd td.g{height:1.2em}.hd tr:last-child td{border-bottom:1px solid #000}
.hd .top{display:flex;justify-content:space-between;font-weight:700}.hd h1{font-size:1em;text-align:center;margin:.5em 0 .3em}.hd .sig{text-align:center;padding-left:40%}
.hd tr.h td{border:1px solid #000;text-align:center}
</style><div class="top"><span>ΜΟΝΑΔΑ: ${esc(t['ΜΟΝΑΔΑ'])}</span></div><div class="top" style="justify-content:flex-end;font-size:.8em">1ο ΕΓ/68/80</div>
<h1>ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ΤΗΣ ${esc(t['ΗΜΕΡΟΜΗΝΙΑ'])}</h1><table><colgroup><col style="width:12%"><col style="width:20%"><col style="width:3%"><col></colgroup>
<tr class="h"><td class="l" style="width:12%;border-bottom:1px solid #000">ΣΥΝΟΠΤΙΚΗ ΠΕΡΙΓΡΑΦΗ</td><td colspan="3" style="border-bottom:1px solid #000">ΑΝΑΛΥΤΙΚΗ ΠΕΡΙΓΡΑΦΗ</td></tr>
${mid('ΤΜΗΜΑ 1°', 'u')}${mid('1° ΓΡΑΦΕΙΟ - ΣΤΡΑΤΟΛΟΓΙΑ', 'u')}${mid('ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ', 'ul')}
${row('ΑΥΔΜ', t['ΑΥΔΜ'])}${row('Δ/Ν ' + esc(t['ΙΛΗΣ']), t['ΔΝ'])}${row('ΙΛΧΟΣ ΕΒΔΟΜΑΔΟΣ', t['ΙΛΧΟΣ'])}${gap}
${mid('ΜΕΤΑΒΟΛΕΣ ΑΞΙΩΜΑΤΙΚΩΝ', 'ul')}${sec('ΑΞ')}${gap}${mid('ΜΕΤΑΒΟΛΕΣ ΟΠΛΙΤΩΝ', 'ul')}${sec('ΟΠ')}${gap}
${mid('ΤΜΗΜΑ 2°', 'u')}${mid('4° ΓΡΑΦΕΙΟ', 'u')}${mid('ΚΑΤΑΛΟΓΙΣΜΟΣ ΔΗΜΟΣΙΟΥ ΥΛΙΚΟΥ ΣΕ ΒΑΡΟΣ ΟΠΛΙΤΩΝ', 'u')}${mid(ml(t['ΤΜΗΜΑ2']))}${gap}
${mid('ΤΜΗΜΑ 3°', 'u')}${mid('ΔΙΟΙΚΗΤΙΚΗ ΜΕΡΙΜΝΑ – ΤΡΟΦΟΔΟΣΙΑ', 'u')}${mid('ΜΙΣΘΟΔΟΣΙΑ:', 'ul')}${mid(ml(t['ΤΜΗΜΑ3']))}${gap}
<tr><td class="l"></td><td colspan="3" class="m sig">${ml(t['ΥΠΟΓΡΑΦΗ'])}</td></tr></table></div>`;
}
