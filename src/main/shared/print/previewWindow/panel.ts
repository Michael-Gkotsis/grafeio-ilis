// The settings column: radios, checkboxes, the «legible» box, the sheet chips and the summary line.
//
// Purpose: `panel` writes the state (`st.opts`, `st.info`) into the controls after every layout.
// Does NOT: ask for layouts (request.ts), draw the pages (pages.ts) or handle clicks (controls.ts).
// Owner layer: main (architecture), `shared/print/previewWindow` (browser side of the print window).
// Why: the text shown here (letter sizes, sheets of paper, orientation) is what the sergeant reads before printing.
// Covering test: test/print-window-gen.test.ts; the DOM is compared step by step in the Electron comparison of the PR.
import { sorts } from './sorts';
import { $, allLandscape, dlg, esc, fmt, go, hasBreaks, pdf, plural, st } from './state';
import type { Info } from './types';

const FLAGS = ['stretch', 'repeat', 'keep', 'pno', 'same'] as const;

/** Ticks the radio of group `name` whose value is `val`. With hand-made breaks no «Σε πόσες σελίδες» is ticked. */
function radios(name: string, val: unknown): void {
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="' + name + '"]')) {
    input.checked = !hasBreaks() || name !== 'pages' ? input.value === String(val) : false;
  }
}

/** «Ίδιο μέγεθος σε όλες...»: the sentence after the legibility verdict (empty for one page). */
function sameSizeText(info: Info, one: boolean, scales: number[], oneScale: boolean): string {
  if (info.total < 2) return '';
  if (one)
    return (
      ' Ίδιο μέγεθος σε όλες τις σελίδες' +
      (info.sheets.length > 1 && st.opts.side === 'back' ? ', μπρος και πίσω.' : '.')
    );
  if (oneScale) {
    return ' Ίδια κλίμακα σε όλα: ' + esc(info.sheets[0].font) + ' 12 βγαίνει ' + fmt(12 * scales[0]) + ' pt παντού.';
  }
  return '';
}

/** The box that says how legible the letters are on paper (and that Arial 12 is the same on every page). */
function legible(): void {
  const info = st.info;
  const box = $('legible');
  if (!info.sheets.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const min = Math.min(...info.sheets.map((s) => s.pt));
  const cls = min >= 10 ? 'ok' : min >= 8 ? 'warn' : 'bad';
  box.className = 'legible ' + cls;
  const first = info.sheets[0];
  const one = info.sheets.every((s) => s.font === first.font && s.size === first.size && s.pt === first.pt);
  const head = one
    ? first.font + ' ' + fmt(first.size) + ' του Excel → <b>' + fmt(first.pt) + ' pt</b> στο χαρτί'
    : info.sheets
        .map((s) => esc(s.name) + ': ' + esc(s.font) + ' ' + fmt(s.size) + ' → <b>' + fmt(s.pt) + ' pt</b>')
        .join('<br>');
  const word =
    cls === 'ok' ? 'Διαβάζεται καθαρά.' : cls === 'warn' ? 'Μικρά γράμματα, διαβάζονται.' : 'Πολύ μικρά γράμματα.';
  const scales = info.sheets.map((s) => s.scale);
  const oneScale = scales.every((x) => Math.abs(x - scales[0]) < 0.002);
  const same = sameSizeText(info, one, scales, oneScale);
  const sug = info.sug
    ? '<button type="button" class="sm" data-sug="' +
      info.sug.n +
      '">Σε ' +
      info.sug.n +
      ' σελίδες: ' +
      fmt(info.sug.pt) +
      ' pt</button>'
    : '';
  box.innerHTML = '<span>' + head + '</span><span>' + word + same + '</span>' + sug;
}

/** The checkboxes of the sheets of the Excel (the ones on the page are ticked, with their page count). */
function sheetChips(): void {
  const info = st.info;
  const chips = $('sheets');
  chips.hidden = info.all.length < 2;
  chips.innerHTML = info.all
    .map((name) => {
      const sheet = info.sheets.find((x) => x.name === name);
      return (
        '<label><input type="checkbox" value="' +
        esc(name) +
        '"' +
        (sheet ? ' checked' : '') +
        '> ' +
        esc(name) +
        (sheet ? ' <small>' + sheet.pages + '</small>' : '') +
        '</label>'
      );
    })
    .join('');
}

/** Help texts under «Σε πόσες σελίδες» and under the sides. */
function helpTexts(manual: boolean, multi: boolean, land: boolean): void {
  const o = st.opts;
  $('sideHelp').textContent =
    o.side === 'back'
      ? st.duplex
        ? 'Γυρίζει στην ' + (land ? 'κοντή' : 'μακριά') + ' πλευρά, ώστε η πίσω όψη να μη βγαίνει ανάποδα.'
        : 'Τυπώνει πρώτα τις μπροστινές. Μετά σου λέει να ξαναβάλεις τα φύλλα στον δίσκο και τυπώνει τις πίσω.'
      : 'Κάθε σελίδα σε δικό της χαρτί.';
  $('pagesHelp').textContent = manual
    ? 'Οι σελίδες αλλάζουν εκεί που έκανες κλικ. Τα γράμματα βγαίνουν όσο μεγάλα χωράνε.'
    : o.pages === 'auto'
      ? 'Διαλέγεις μέγεθος γραμμάτων και βγαίνουν όσες σελίδες χρειαστούν.'
      : 'Τα γράμματα βγαίνουν όσο μεγάλα χωράνε σε ' +
        (o.pages === 1 ? '1 σελίδα' : o.pages + ' σελίδες, με ίσες γραμμές') +
        (multi ? ' για κάθε φύλλο.' : '.');
}

/** Writes `st.opts` and `st.info` into the settings column, then rebuilds the sort controls. */
export function panel(): void {
  const { opts: o, info } = st;
  const manual = hasBreaks();
  const multi = info.sheets.length > 1;
  const land = allLandscape(info);
  const port = info.sheets.every((s) => !s.landscape);
  radios('pages', o.pages);
  radios('or', o.or);
  radios('sp', o.sp);
  radios('m', o.m);
  radios('pa', o.paper);
  radios('side', o.side);
  for (const key of FLAGS) $<HTMLInputElement>(key).checked = !!o[key];
  $<HTMLInputElement>('duplex').checked = st.duplex;
  $<HTMLInputElement>('remember').checked = st.remember;
  $('manual').hidden = !manual;
  $('mcount').textContent = String(info.total);
  $('sizeGrp').hidden = manual || o.pages !== 'auto';
  $<HTMLInputElement>('size').value = String(o.size);
  $('sizeOut').textContent = fmt(o.size) + ' pt';
  $('oaText').textContent =
    o.or === 'auto' && info.sheets.length
      ? 'Αυτόματα (' + (land ? 'οριζ.' : port ? 'κατακ.' : 'μικτά') + ')'
      : 'Αυτόματα';
  $('duplexRow').hidden = o.side !== 'back';
  helpTexts(manual, multi, land);
  $('sameGrp').hidden = !multi;
  $('repeatRow').hidden = !info.sheets.some((s) => s.titles);
  legible();
  sheetChips();
  const sheetsOfPaper = o.side === 'back' ? Math.ceil(info.total / 2) : info.total;
  $('meta').textContent = info.total
    ? plural(info.total, 'σελίδα', 'σελίδες') +
      ' σε ' +
      plural(sheetsOfPaper, 'φύλλο', 'φύλλα') +
      ' χαρτί' +
      (o.side === 'back' && info.total > 1 ? ' (μπρος-πίσω)' : '') +
      ' · ' +
      o.paper +
      ' ' +
      (land ? 'οριζόντια' : port ? 'κατακόρυφα' : 'κατακόρυφα και οριζόντια')
    : '';
  const none = !info.total;
  go.disabled = none;
  dlg.disabled = none;
  pdf.disabled = none;
  sorts();
}
