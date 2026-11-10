// Printing from the window: the printer list, one job per paper and orientation, front-and-back in two passes, PDF.
//
// Purpose: `listPrinters`, `printAll` (via the «Εκτύπωση…» and «Διάλογος» buttons), the «Γύρισε τα φύλλα» question
//   (`flipDone`) and the PDF button, wired by `wirePrinting`.
// Does NOT: talk to the printer (main does, in `print:go`) or lay pages out.
// Owner layer: main (architecture), `shared/print/previewWindow` (browser side of the print window).
// Why: the pages are copied into `#out`, the only thing visible on paper (`@media print`), one job per paper size and
//   orientation. Without a duplex printer the front sides print first, then the user turns the sheets.
// Covering test: test/print-window-gen.test.ts; the print calls are compared in the Electron run of the PR.
import { $, api, copies, dlg, go, pages, pdf, plural, prn, range, say, st } from './state';
import type { JobReply, PrinterEntry } from './types';

/**
 * Fills the printer list (printing without the Windows dialog keeps paper and orientation). Without a list the
 * window keeps only the dialog.
 */
export async function listPrinters(): Promise<void> {
  if (!api?.printers) return;
  const list = (await api.printers()) as PrinterEntry[] | null | undefined;
  if (!list?.length) return;
  for (const p of list) {
    const option = document.createElement('option');
    option.value = p.name;
    option.textContent = p.label;
    if (p.def) option.selected = true;
    prn.appendChild(option);
  }
  for (const label of document.querySelectorAll<HTMLElement>('.prn')) label.hidden = false;
  go.textContent = 'Εκτύπωση';
  dlg.hidden = false;
}

/** An empty page like `like`, put in the back list so that an odd count still ends on a full sheet. */
function blank(like: HTMLElement): HTMLElement {
  const page = document.createElement('div');
  page.className = 'pg';
  page.style.width = like.style.width;
  page.style.height = like.style.height;
  page.setAttribute('data-land', String(like.getAttribute('data-land')));
  page.setAttribute('data-paper', String(like.getAttribute('data-paper')));
  return page;
}

/**
 * The page for the paper: a little shorter than the sheet, so that rounding (and the Windows scale) does not push a
 * sliver of it onto a second, empty sheet.
 */
function sheetOf(page: HTMLElement): HTMLElement {
  const copy = page.cloneNode(true) as HTMLElement;
  copy.style.height = Math.max(1, parseFloat(page.style.height) - 4) + 'px';
  return copy;
}

/** Pages with the same paper and orientation that follow each other print as one job. */
function jobGroups(list: HTMLElement[]): { key: string; list: HTMLElement[] }[] {
  return list.reduce<{ key: string; list: HTMLElement[] }[]>((groups, page) => {
    const key = page.getAttribute('data-paper') + '|' + page.getAttribute('data-land');
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) groups.push({ key, list: [page] });
    else last.list.push(page);
    return groups;
  }, []);
}

/**
 * Prints the pages: one job per paper and orientation. The pages are copied into `#out` for the job.
 * @param useDialog true = the Windows dialog, else the chosen printer
 * @param n copies
 * @param two true = duplex printer (the long edge, or the short edge for landscape)
 */
async function send(list: HTMLElement[], useDialog: boolean, n: number, two: boolean): Promise<JobReply> {
  const groups = jobGroups(list);
  const device = useDialog || !prn.value ? '' : prn.value;
  const out = $('out');
  let reply: JobReply = { ok: true };
  try {
    for (const [i, g] of groups.entries()) {
      if (!reply.ok) break;
      const land = g.list[0].getAttribute('data-land') === '1';
      const paper = g.list[0].getAttribute('data-paper') || 'A4';
      out.innerHTML = '';
      for (const p of g.list) out.appendChild(sheetOf(p));
      $('page').textContent = '@page{size:' + paper + ' ' + (land ? 'landscape' : 'portrait') + ';margin:0}';
      reply = (await api.print({
        landscape: land,
        pageSize: paper,
        part: groups.length > 1 ? i + 1 + '/' + groups.length : '',
        device,
        copies: n,
        duplex: two ? (land ? 'shortEdge' : 'longEdge') : 'simplex',
      })) as JobReply;
    }
  } finally {
    out.innerHTML = '';
  }
  return reply;
}

/** Ends the «Γύρισε τα φύλλα» question with the user's answer. */
export function flipDone(ok: boolean): void {
  $('flip').hidden = true;
  const next = st.flipNext;
  st.flipNext = null;
  if (next) next(ok);
}

/**
 * Front-and-back without a duplex printer: the front sides first, then (after the user turned the sheets) the back
 * sides. @returns the reply of the second pass, or `null` when it stopped (the message is already shown)
 */
async function twoPasses(list: HTMLElement[], useDialog: boolean, n: number): Promise<JobReply | null> {
  const front = Array.from({ length: n }, () => list.filter((_, i) => i % 2 === 0)).flat();
  const rear = Array.from({ length: n }, () => list.filter((_, i) => i % 2 === 1)).flat();
  if (list.length % 2) {
    for (const k of range(n)) rear.splice((k + 1) * Math.ceil(list.length / 2) - 1, 0, blank(list[0]));
  }
  const first = await send(front, useDialog, 1, false);
  if (!first.ok) {
    if (first.error) say(first.error);
    return null;
  }
  $('flipCount').textContent = plural(front.length, 'φύλλο', 'φύλλα');
  const turned = await new Promise<boolean>((resolve) => {
    st.flipNext = resolve;
    $('flip').hidden = false;
    $('flipGo').focus();
  });
  if (!turned) {
    say('Τυπώθηκαν μόνο οι μπροστινές.');
    return null;
  }
  const reversed = $<HTMLInputElement>('flipRev').checked;
  try {
    localStorage.setItem('flipRev', reversed ? '1' : '');
  } catch {
    // storage can be blocked: the answer is just not remembered
  }
  return send(reversed ? [...rear].reverse() : rear, useDialog, 1, false);
}

/** The «Εκτύπωση» and «Διάλογος των Windows» buttons. */
async function printAll(useDialog: boolean): Promise<void> {
  const list = pages();
  if (!list.length) return;
  const n = Math.min(99, Math.max(1, +copies.value || 1));
  const back = st.opts.side === 'back' && list.length > 1;
  go.disabled = true;
  dlg.disabled = true;
  pdf.disabled = true;
  say('');
  try {
    const reply = back && !st.duplex ? await twoPasses(list, useDialog, n) : await send(list, useDialog, n, back);
    if (!reply) return;
    if (!reply.ok) {
      if (reply.error) say(reply.error);
      return;
    }
    if (prn.value && !useDialog) say('Στάλθηκε στον εκτυπωτή ' + prn.options[prn.selectedIndex].text + '.', true);
  } finally {
    const none = !pages().length;
    go.disabled = none;
    dlg.disabled = none;
    pdf.disabled = none;
  }
}

/** The PDF button: all pages in `#out`, each with its own `@page` (portrait or landscape), saved by the app. */
async function savePdf(): Promise<void> {
  const list = pages();
  if (!list.length) return;
  const out = $('out');
  out.innerHTML = '';
  for (const p of list) {
    const copy = sheetOf(p);
    copy.style.setProperty('page', p.getAttribute('data-land') === '1' ? 'land' : 'port');
    out.appendChild(copy);
  }
  const paper = list[0].getAttribute('data-paper') || 'A4';
  const land = list[0].getAttribute('data-land') === '1';
  $('page').textContent =
    '@page{size:' +
    paper +
    ' ' +
    (land ? 'landscape' : 'portrait') +
    ';margin:0}@page land{size:' +
    paper +
    ' landscape;margin:0}@page port{size:' +
    paper +
    ' portrait;margin:0}';
  pdf.disabled = true;
  try {
    const reply = (await api.pdf()) as JobReply | null | undefined;
    if (reply?.ok) say('Σώθηκε το ' + reply.name + '.', true);
    else if (reply?.error) say(reply.error);
  } finally {
    out.innerHTML = '';
    pdf.disabled = !pages().length;
  }
}

/** Registers the buttons of the flip question and of printing, and restores the «reverse order» tick. */
export function wirePrinting(): void {
  $('flipGo').addEventListener('click', () => flipDone(true));
  $('flipNo').addEventListener('click', () => flipDone(false));
  try {
    $<HTMLInputElement>('flipRev').checked = localStorage.getItem('flipRev') === '1';
  } catch {
    // storage can be blocked: the tick stays off
  }
  go.addEventListener('click', () => void printAll(false));
  dlg.addEventListener('click', () => void printAll(true));
  pdf.addEventListener('click', () => void savePdf());
}
