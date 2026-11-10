// Asking the app for a new layout, and changing one setting.
//
// Purpose: `request` (debounced `print:layout`, with the sequence guard and the «busy» class after 200 ms) and `set`.
// Does NOT: draw the settings column or the pages (`render`, registered by preview.ts through `onLayout`).
// Owner layer: main (architecture), `shared/print/previewWindow` (browser side of the print window).
// Why: every change of a setting asks the app for a new layout (the Excel was already read once); only the reply of
//   the latest request may be drawn, or a slow old reply would overwrite a newer page.
// Covering test: test/print-window-gen.test.ts; the timings are checked in the Electron comparison of the PR.
import { $, api, pagesEl, say, st } from './state';
import type { LayoutReply } from './types';

let draw: () => void = () => {};

/** Registers the function that draws the page after a layout reply (it breaks an import cycle). */
export const onLayout = (render: () => void): void => {
  draw = render;
};

/**
 * Asks for a new layout 40 ms after the last call (debounce). A reply is used only if no newer request started;
 * the page gets the `busy` class when the reply takes more than 200 ms.
 * @param save also save the settings for this form (only when «Να θυμάται» is on)
 */
export function request(save: boolean): void {
  clearTimeout(st.timer);
  st.timer = window.setTimeout(async () => {
    const mine = ++st.seq;
    clearTimeout(st.slow);
    st.slow = window.setTimeout(() => document.body.classList.add('busy'), 200);
    const reply = (await api.layout({ opts: st.opts, sheets: st.sel, save: !!save && st.remember })) as
      | LayoutReply
      | null
      | undefined;
    if (mine !== st.seq) return;
    clearTimeout(st.slow);
    document.body.classList.remove('busy');
    if (!reply?.ok) {
      say(reply?.error || 'Δεν έγινε η διάταξη.');
      return;
    }
    $('cells').textContent = reply.css;
    pagesEl.innerHTML = reply.html;
    st.info = reply.info;
    say('');
    draw();
  }, 40);
}

/**
 * Changes one setting and asks for a new layout. A new page count or sort drops the hand-made page breaks.
 * @param save false = do not save the settings of this form for this change
 */
export function set(key: string, value: unknown, save?: boolean): void {
  (st.opts as unknown as Record<string, unknown>)[key] = value;
  if (key === 'pages' || key === 'sort') delete st.opts.breaks;
  request(save !== false);
}
