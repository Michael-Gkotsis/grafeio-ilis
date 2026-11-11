// Tooltips for `data-tip`.
// Purpose: one shared element for the whole app, `position: fixed`, so it is never clipped by cards, tables or dialogs
//   and never leaves the screen. `data-tip-side="right"` puts it right of the element, `"left"` right-aligns it.
// Does NOT: show on touch devices (no hover) or for elements without `data-tip`.
// Owner layer: renderer/shared/ui. Why: one listener set for all screens instead of one tooltip per component.
// Covering test: test/ux-names.test.ts (data-tip texts); the behavior is checked by the Electron drive.

/** Installs the document-level listeners once; does nothing when the device has no hover. */
export function installTips() {
  if (!window.matchMedia('(hover:hover)').matches) return;
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  let cur: Element | null = null,
    timer = 0;
  const hide = () => {
    clearTimeout(timer);
    cur = null;
    tip.classList.remove('is-on');
  };
  const place = (el: Element) => {
    const text = el.getAttribute('data-tip');
    if (!text || !el.isConnected) return hide();
    const side = el.getAttribute('data-tip-side');
    tip.textContent = text;
    tip.classList.toggle('tip--line', side === 'right');
    const r = el.getBoundingClientRect(),
      vw = document.documentElement.clientWidth,
      vh = window.innerHeight;
    const w = tip.offsetWidth,
      h = tip.offsetHeight;
    let x: number, y: number;
    if (side === 'right') {
      x = r.right + 10;
      y = r.top + r.height / 2 - h / 2;
    } else {
      x = side === 'left' ? r.right - w : r.left + r.width / 2 - w / 2;
      y = r.bottom + 6;
      if (y + h > vh - 8 && r.top - h - 6 > 8) y = r.top - h - 6;
    }
    tip.style.left = Math.round(Math.max(8, Math.min(x, vw - w - 8))) + 'px';
    tip.style.top = Math.round(Math.max(8, Math.min(y, vh - h - 8))) + 'px';
    tip.classList.add('is-on');
  };
  const arm = (el: Element) => {
    hide();
    cur = el;
    timer = window.setTimeout(() => cur === el && place(el), 400);
  };
  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element).closest && (e.target as Element).closest('[data-tip]');
    if (el === cur) return;
    if (!el || e.pointerType === 'touch') return hide();
    arm(el);
  });
  document.addEventListener('pointerout', (e) => {
    if (cur && !(e.relatedTarget instanceof Node && cur.contains(e.relatedTarget))) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target as Element;
    if (el.matches && el.matches(':focus-visible[data-tip]')) arm(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  window.addEventListener(
    'scroll',
    () => {
      if (cur) hide();
    },
    true,
  );
  window.addEventListener('blur', hide);
}
