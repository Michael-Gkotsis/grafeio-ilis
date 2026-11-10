// The «Ημερήσια Διαταγή» (daily order) data: what is filled from the app, cleaned for saving and turned into tags/HTML.
// @decision Michael 3/11: the page prepared today for tomorrow.
//
// Purpose: `hdAuto`/`hdDocOf` (the page from the data: duty officers, cadre leaves, soldier entries/removals/leaves/
//   penalties exactly as on the back of the «ΗΚΑΙ», and what the user writes: ΛΟΙΠΑ, Τμήμα 2 and 3), `cleanHd`,
//   the Word tags (`HD_TAGS`, `hdTags`, `hdSigLines`) and the HTML page (`hdPageHtml`).
// Does NOT: write the .docx (src/main/hdDocx.ts does) or store the order (AppState.hd does: the order that was
//   issued is kept as it was issued).
// Owner layer: core/forms (pure: no fs, no Electron, no React); imports core/hkai, core/cadre, core/statuses.
// Why: every line can be changed or deleted in this one order only; the preview, the print without Word and the .docx
//   read the same tags, so they cannot differ.
// Covering tests: test/hd.test.ts.
import { addDays, type ISODate } from '../lib/dates';
import {
  hkaiCadreLeaveLines,
  hkaiDiaLines,
  hkaiEgrLines,
  hkaiPunLines,
  hkaiSoldierLeaveLines,
  lineText,
  type Line,
} from '../hkai/hkaiText';
import { hkOffText, orderedCadre } from '../cadre/cadre';
import { rankTxt } from '../people/ranks';
import { mondayOf } from '../statuses/imer';
import { upper } from '../lib/text';
import type { AppState } from '../model/state';
import type { Cadre } from '../model/cadreRecord';
import type { Settings } from '../model/settings';
import type { Sig } from './sigs';
import { sigsFor } from './sigs';
import type { HdDoc } from '../model/documents';
export type { HdDoc } from '../model/documents';

/** The five sections of the soldiers' and officers' changes, in the order of the form. */
export const HD_SECTIONS = ['ΕΓΓΡΑΦΕΣ', 'ΔΙΑΓΡΑΦΕΣ', 'ΑΔΕΙΕΣ', 'ΠΟΙΝΕΣ', 'ΛΟΙΠΑ'];
const MON = [
  'ΙΑΝΟΥΑΡΙΟΥ',
  'ΦΕΒΡΟΥΑΡΙΟΥ',
  'ΜΑΡΤΙΟΥ',
  'ΑΠΡΙΛΙΟΥ',
  'ΜΑΪΟΥ',
  'ΙΟΥΝΙΟΥ',
  'ΙΟΥΛΙΟΥ',
  'ΑΥΓΟΥΣΤΟΥ',
  'ΣΕΠΤΕΜΒΡΙΟΥ',
  'ΟΚΤΩΒΡΙΟΥ',
  'ΝΟΕΜΒΡΙΟΥ',
  'ΔΕΚΕΜΒΡΙΟΥ',
];
/** The date as written on the order: «03 ΝΟΕΜΒΡΙΟΥ 2025» (`d`: ISODate). */
export const hdDate = (d: ISODate) => d.slice(8, 10) + ' ' + MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4);
/** The order is prepared today for tomorrow. */
export const hdDefaultDay = (today: ISODate): ISODate => addDays(today, 1);
/** A cadre member as written in the order: rank, (speciality), last, first; CAPITALS. */
export const cadreTxt = (c: Cadre) =>
  upper([rankTxt(c), c.spec ? '(' + c.spec + ')' : '', c.last, c.first].filter(Boolean).join(' '));
/** The names of the active cadre in the cadre order. */
export const hdCadreNames = (s: Pick<AppState, 'cadreList'>): string[] =>
  orderedCadre(s.cadreList || [])
    .filter((c) => c.active)
    .map(cadreTxt);
const texts = (ls: Line[]) => ls.map(lineText);

// the previous orders (before day d); the last one of the same week (Monday-Sunday) gives `ilxos`
const before = (s: Pick<AppState, 'hd'>, d: ISODate): ISODate[] =>
  Object.keys(s.hd || {})
    .filter((x) => x < d)
    .sort();
/** The order of day `d` filled from the data; `aydm`, `t2`, `t3` carry over from the previous order. */
export function hdAuto(s: AppState, d: ISODate): HdDoc {
  const prev = before(s, d);
  const last = prev.length ? s.hd![prev[prev.length - 1]] : undefined;
  const wk = prev.filter((x) => mondayOf(x) === mondayOf(d));
  const lastWk = wk.length ? s.hd![wk[wk.length - 1]] : undefined;
  return {
    aydm: last?.aydm || '',
    dn: hkOffText(s, d),
    ilxos: lastWk?.ilxos || '',
    ax: [[], [], texts(hkaiCadreLeaveLines(s, d)), [], []],
    op: [
      texts(hkaiEgrLines(s, d)),
      texts(hkaiDiaLines(s, d)),
      texts(hkaiSoldierLeaveLines(s, d)),
      texts(hkaiPunLines(s, d)),
      [],
    ],
    t2: last?.t2 || '',
    t3: last?.t3 || '',
  };
}
/** The order that was issued (as it was issued), otherwise the automatic one. */
export const hdDocOf = (s: AppState, d: ISODate): HdDoc => s.hd?.[d] || hdAuto(s, d);

// cleaning before saving: CAPITALS, no empty lines, always 5 sections
const clean = (t: unknown) =>
  upper(String(t ?? ''))
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, 4000);
const cleanLines = (x: unknown): string[] => (Array.isArray(x) ? x : []).map(clean).filter(Boolean).slice(0, 60);
/** The order cleaned for saving: CAPITALS, no empty lines, always 5 sections, bounded lengths. */
export const cleanHd = (d: HdDoc): HdDoc => ({
  aydm: clean(d.aydm).slice(0, 160),
  dn: clean(d.dn).slice(0, 160),
  ilxos: clean(d.ilxos).slice(0, 160),
  ax: Array.from({ length: 5 }, (_, i) => cleanLines(d.ax?.[i])),
  op: Array.from({ length: 5 }, (_, i) => cleanLines(d.op?.[i])),
  t2: upper(String(d.t2 ?? ''))
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000),
  t3: upper(String(d.t3 ?? ''))
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000),
});

/** The {…} tags of the Word template; several lines are joined with \n and become paragraphs. */
export const HD_TAGS = [
  'ΜΟΝΑΔΑ',
  'ΙΛΗΣ',
  'ΗΜΕΡΟΜΗΝΙΑ',
  'ΑΥΔΜ',
  'ΔΝ',
  'ΙΛΧΟΣ',
  'ΑΞ1',
  'ΑΞ2',
  'ΑΞ3',
  'ΑΞ4',
  'ΑΞ5',
  'ΟΠ1',
  'ΟΠ2',
  'ΟΠ3',
  'ΟΠ4',
  'ΟΠ5',
  'ΤΜΗΜΑ2',
  'ΤΜΗΜΑ3',
  'ΥΠΟΓΡΑΦΗ',
];
const or0 = (t: string) => t.trim() || 'Ø';
/** The signature lines: «- Ο -», post, name (whatever is set in Settings › Υπογραφές). */
export const hdSigLines = (st: Pick<Settings, 'unitKind'>, sigs: Sig[]): string[] =>
  sigsFor(st, sigs).flatMap((x) => [x.art ? '- ' + x.art + ' -' : '', x.title, x.name || ''].filter(Boolean));
/** The value of every tag of the Word template for day `d` (`Ø` for an empty value). */
export function hdTags(
  st: Pick<Settings, 'unit' | 'unitName' | 'unitKind'>,
  d: ISODate,
  doc: HdDoc,
  sigs: Sig[],
): Record<string, string> {
  const x = cleanHd(doc);
  const t: Record<string, string> = {
    ΜΟΝΑΔΑ: st.unit
      .map((u) => upper(u))
      .filter(Boolean)
      .join('/'),
    ΙΛΗΣ: upper(st.unitName || ''),
    ΗΜΕΡΟΜΗΝΙΑ: hdDate(d),
    ΑΥΔΜ: or0(x.aydm),
    ΔΝ: or0(x.dn),
    ΙΛΧΟΣ: or0(x.ilxos),
    ΤΜΗΜΑ2: or0(x.t2),
    ΤΜΗΜΑ3: or0(x.t3),
    ΥΠΟΓΡΑΦΗ: hdSigLines(st, sigs).join('\n'),
  };
  x.ax.forEach((ls, i) => {
    t['ΑΞ' + (i + 1)] = or0(ls.join('\n'));
  });
  x.op.forEach((ls, i) => {
    t['ΟΠ' + (i + 1)] = or0(ls.join('\n'));
  });
  return t;
}

/**
 * The page as HTML, for the preview on screen and for printing without Word. `fs`: letter size in px (everything else
 * is in em).
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ml = (s: string) => s.split('\n').map(esc).join('<br>');
export function hdPageHtml(t: Record<string, string>, fs: number): string {
  const row = (a: string, b: string) =>
    `<tr><td class="l"></td><td class="a">${a}</td><td class="c">:</td><td class="v">${ml(b)}</td></tr>`;
  const mid = (h: string, cls = '') => `<tr><td class="l"></td><td colspan="3" class="m ${cls}">${h}</td></tr>`;
  const gap = '<tr><td class="l"></td><td colspan="3" class="g"></td></tr>';
  const sec = (k: string) => HD_SECTIONS.map((n, i) => row(i + 1 + '. ' + n, t[k + (i + 1)])).join('');
  return `<div class="hdp" style="font-size:${fs}px"><style>
.hdp{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;padding:1.2em 1em;line-height:1.25}.hdp table{border-collapse:collapse;width:100%;table-layout:fixed}
.hdp td{border-bottom:1px dotted #000;padding:.25em .4em;vertical-align:middle}.hdp td.l{width:12%;border-left:1px solid #000;border-right:1px solid #000}.hdp td.a{width:20%}.hdp td.c{width:3%;text-align:center}.hdp td.v{width:65%}
.hdp td.m{text-align:center}.hdp td.u{text-decoration:underline}.hdp td.ul{text-decoration:underline;text-align:left}.hdp td.g{height:1.2em}.hdp tr:last-child td{border-bottom:1px solid #000}
.hdp .top{display:flex;justify-content:space-between;font-weight:700}.hdp h1{font-size:1em;text-align:center;margin:.5em 0 .3em}.hdp .sig{text-align:center;padding-left:40%}
.hdp tr.h td{border:1px solid #000;text-align:center}
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
