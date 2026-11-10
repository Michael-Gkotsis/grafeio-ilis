// The controls of the settings column and the keyboard shortcuts of the window.
//
// Purpose: `wireControls` (radios, checkboxes, size slider, sheet chips, duplex, remember, reset, close) and `wireKeys`
//   (Escape, Ctrl+P, 1/2/3 pages, O orientation).
// Does NOT: draw anything (panel.ts, pages.ts) or print (printing.ts).
// Owner layer: main (architecture), `shared/print/previewWindow` (browser side of the print window).
// Why: every change goes through `set`, so one rule decides what a setting does (new layout, breaks dropped, saved).
// Covering test: test/print-window-gen.test.ts; every control is compared in the Electron run of the PR.
import { panel } from './panel';
import { request, set } from './request';
import { closeColumnMenu } from './sorts';
import { flipDone } from './printing';
import { $, allLandscape, api, fmt, go, menu, say, st } from './state';
import type { Opts } from './types';

/** Radio group name in the page -> setting it changes. */
const RADIO_GROUPS: [string, string][] = [
  ['pages', 'pages'],
  ['or', 'or'],
  ['sp', 'sp'],
  ['m', 'm'],
  ['pa', 'paper'],
  ['side', 'side'],
];
const CHECKS = ['stretch', 'repeat', 'keep', 'pno', 'same'];

function wireSettings(): void {
  for (const [name, key] of RADIO_GROUPS) {
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name="' + name + '"]')) {
      input.addEventListener('change', () =>
        set(key, name === 'pages' && input.value !== 'auto' ? +input.value : input.value),
      );
    }
  }
  for (const key of CHECKS) $(key).addEventListener('change', () => set(key, $<HTMLInputElement>(key).checked));
  $('size').addEventListener('input', () => {
    $('sizeOut').textContent = fmt(+$<HTMLInputElement>('size').value) + ' pt';
    set('size', +$<HTMLInputElement>('size').value);
  });
  $('mreset').addEventListener('click', () => {
    delete st.opts.breaks;
    request(false);
  });
  $('legible').addEventListener('click', (e) => {
    const b = (e.target as Element).closest('[data-sug]');
    if (b) set('pages', +(b.getAttribute('data-sug') as string));
  });
}

function wireSession(): void {
  $('sheets').addEventListener('change', () => {
    st.sel = [...document.querySelectorAll<HTMLInputElement>('#sheets input:checked')].map((x) => x.value);
    st.opts.sheets = st.sel;
    delete st.opts.breaks;
    request(true);
  });
  $('duplex').addEventListener('change', () => {
    st.duplex = $<HTMLInputElement>('duplex').checked;
    void api.duplex(st.duplex);
    panel();
  });
  $('remember').addEventListener('change', () => {
    st.remember = $<HTMLInputElement>('remember').checked;
    if (st.remember) request(true);
    else void api.forget();
  });
  $('reset').addEventListener('click', async () => {
    const defaults = (await api.forget()) as Opts;
    st.opts = defaults;
    request(st.remember);
    say('Επανήλθαν οι αρχικές ρυθμίσεις.', true);
  });
  $('close').addEventListener('click', () => void api.close());
}

/** Registers the listeners of the settings column. */
export function wireControls(): void {
  wireSettings();
  wireSession();
}

/** Escape: closes the flip question, then the column menu, then the window. */
function escapeKey(): void {
  if (!$('flip').hidden) flipDone(false);
  else if (!menu.hidden) closeColumnMenu(true);
  else void api.close();
}

/** Registers the keyboard shortcuts of the window (Escape, Ctrl+P, 1-3, O). */
export function wireKeys(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      escapeKey();
      return;
    }
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P' || e.key === 'π' || e.key === 'Π')) {
      e.preventDefault();
      if (!go.disabled) go.click();
      return;
    }
    const t = e.target as HTMLInputElement | null;
    const typing = !!t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && t.type !== 'radio' && t.type !== 'checkbox';
    if (e.ctrlKey || e.altKey || e.metaKey || typing) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') set('pages', +e.key);
    else if (/^[oOοΟ]$/.test(e.key)) set('or', allLandscape(st.info) ? 'p' : 'l');
  });
}
