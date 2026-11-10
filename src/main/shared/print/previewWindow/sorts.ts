// The sort controls (1st, 2nd, 3rd column) and the column menu.
//
// Purpose: `sorts` draws the rows of sort keys, `wireSorts` handles their clicks and the keyboard of the menu.
// Does NOT: sort anything (the app sorts the rows in `print:layout`) or draw the rest of the settings column.
// Owner layer: main (architecture), `shared/print/previewWindow` (browser side of the print window).
// Why: the menu is a button with a list, not the Windows `<select>`, so it looks the same on every machine; the focus
//   must stay on the control the user used, also after the new layout replaces the buttons.
// Covering test: test/print-sort.test.ts (the sorting itself); the controls are compared in the Electron run of the PR.
import { set } from './request';
import { $, esc, menu, st, view } from './state';
import type { SortKey } from './types';
import type { SortKind } from '../types';

/** Direction labels per kind of column: ascending, descending. */
const DIR: Record<SortKind, [string, string]> = {
  text: ['Α → Ω', 'Ω → Α'],
  num: ['1 → 9', '9 → 1'],
  date: ['Παλιά πρώτα', 'Νέα πρώτα'],
  rank: ['Ανώτεροι πρώτα', 'Κατώτεροι πρώτα'],
};

const colOf = (key: string) => (st.info.cols || []).find((c) => c.k === key);

/** One row of the sort list: number, column button, direction button, remove button. */
function sortRow(s: SortKey, i: number): string {
  const c = colOf(s.c);
  const kind = c ? c.kind : 'text';
  return (
    '<div class="srt"><span class="no">' +
    (i + 1) +
    'η</span><button type="button" class="dd" data-i="' +
    i +
    '" aria-haspopup="listbox" aria-label="' +
    (i + 1) +
    'η ταξινόμηση: ' +
    esc(c ? c.label : s.l || s.c) +
    '"' +
    (c ? '' : ' title="Δεν υπάρχει αυτή η στήλη σε αυτό το έντυπο"') +
    '><span>' +
    esc(c ? c.label : s.l || s.c) +
    '</span></button>' +
    '<button type="button" class="sm dir" data-d="' +
    i +
    '" title="Αλλαγή φοράς">' +
    DIR[kind][s.d ? 1 : 0] +
    '</button>' +
    '<button type="button" class="sm x" data-x="' +
    i +
    '" aria-label="Χωρίς την ' +
    (i + 1) +
    'η ταξινόμηση" title="Βγάλε την">✕</button></div>'
  );
}

/** Selector of the sort control that has the focus now, so it keeps the focus after the new layout. */
function focusedSortSelector(): string | null {
  const active = document.activeElement;
  if (!active || !$('sorts').contains(active)) return null;
  return ['data-i', 'data-d', 'data-x'].reduce<string | null>(
    (keep, n) => (active.hasAttribute(n) ? '#sorts [' + n + '="' + active.getAttribute(n) + '"]' : keep),
    null,
  );
}

/** Draws the sort rows and the «+ Ταξινόμηση κατά…» button from `st.opts.sort` and `st.info.cols`. */
export function sorts(): void {
  const list = st.opts.sort || [];
  const cols = st.info.cols || [];
  const keep = st.want || focusedSortSelector();
  st.want = null;
  $('sortGrp').hidden = !cols.length && !list.length;
  $('sorts').innerHTML = list.map(sortRow).join('');
  const free = cols.filter((c) => !list.some((s) => s.c === c.k));
  $('sortAdd').hidden = list.length >= 3 || !free.length;
  $('sortAdd').textContent = list.length ? '+ Μετά κατά…' : '+ Ταξινόμηση κατά…';
  if (keep) {
    let target = document.querySelector<HTMLElement>(keep);
    if (!target || target.hidden) target = document.querySelector<HTMLElement>('#sorts .dd') || $('sortAdd');
    if (target && !target.hidden) target.focus();
  }
  $('sortHelp').textContent = list.length
    ? 'Αλλάζει μόνο η σειρά των γραμμών του πίνακα. Κεφαλίδα, σύνολα και υπογραφές μένουν στη θέση τους, και το Α/Α μετράει ξανά από το 1.'
    : 'Όπως είναι στο Excel. Διάλεξε στήλη, π.χ. πρώτα θάλαμος και μετά επίθετο.';
}

const putSort = (list: SortKey[] | undefined): void => set('sort', list);

function closeMenu(focus: boolean): void {
  if (menu.hidden) return;
  menu.hidden = true;
  const button = st.menuAt?.btn;
  st.menuAt = null;
  if (focus && button && document.body.contains(button)) button.focus();
}

/** Opens the column menu under `btn`; `at` = the sort row it changes, -1 = a new sort. */
function openMenu(btn: HTMLElement, at: number): void {
  const list = st.opts.sort || [];
  const current = at >= 0 ? list[at].c : null;
  const options = (st.info.cols || []).filter((c) => c.k === current || !list.some((s) => s.c === c.k));
  if (!options.length) return;
  menu.innerHTML = options
    .map(
      (c) =>
        '<button type="button" role="option" data-k="' +
        esc(c.k) +
        '" aria-selected="' +
        (c.k === current) +
        '">' +
        esc(c.label) +
        '</button>',
    )
    .join('');
  menu.hidden = false;
  st.menuAt = { btn, at };
  const r = btn.getBoundingClientRect();
  const h = menu.offsetHeight;
  const w = Math.max(r.width, menu.offsetWidth);
  menu.style.minWidth = r.width + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  menu.style.top = (r.bottom + h + 8 > window.innerHeight && r.top - h - 2 > 8 ? r.top - h - 2 : r.bottom + 2) + 'px';
  (menu.querySelector<HTMLElement>('[aria-selected="true"]') || (menu.firstChild as HTMLElement)).focus();
}

function pickCol(key: string): void {
  const at = st.menuAt ? st.menuAt.at : -1;
  const c = colOf(key);
  const list = (st.opts.sort || []).slice();
  closeMenu(false);
  if (!c) return;
  if (at >= 0) list[at] = { c: key, l: c.label, d: list[at].d && list[at].c === key ? true : undefined };
  else list.push({ c: key, l: c.label });
  st.want = '#sorts [data-i="' + (at >= 0 ? at : list.length - 1) + '"]';
  putSort(list);
}

/** Letters without accents, upper case: typing «α» in the menu finds «Άλφα». */
const plain = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Keys inside the open menu: Escape, Tab, arrows, Home/End and the first letter of a column. */
function menuKey(e: KeyboardEvent): void {
  const items = [...menu.querySelectorAll<HTMLElement>('[data-k]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  e.stopPropagation();
  if (e.key === 'Escape') {
    e.preventDefault();
    closeMenu(true);
  } else if (e.key === 'Tab') closeMenu(false);
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    items[e.key === 'Home' ? 0 : items.length - 1].focus();
  } else if (e.key.length === 1 && e.key !== ' ') {
    // typing the first letter moves to the next column that starts with it (accents ignored)
    const ch = plain(e.key);
    const next = items
      .map((_, n) => items[(i + n + 1) % items.length])
      .find((x) => plain(x.textContent || '').indexOf(ch) === 0);
    if (next) next.focus();
  }
}

/** Click on a button of the sort rows: open the menu, flip the direction, or remove the sort. */
function sortsClick(e: MouseEvent): void {
  const b = (e.target as Element).closest('button');
  if (!b) return;
  const list = (st.opts.sort || []).slice();
  if (b.hasAttribute('data-i')) openMenu(b, +(b.getAttribute('data-i') as string));
  else if (b.hasAttribute('data-d')) {
    const i = +(b.getAttribute('data-d') as string);
    list[i] = { c: list[i].c, l: list[i].l, d: !list[i].d || undefined };
    putSort(list);
  } else if (b.hasAttribute('data-x')) {
    list.splice(+(b.getAttribute('data-x') as string), 1);
    st.want = '#sortAdd';
    putSort(list.length ? list : undefined);
  }
}

/** Registers the listeners of the sort controls and of the column menu. */
export function wireSorts(): void {
  $('sortAdd').addEventListener('click', () => openMenu($('sortAdd'), -1));
  $('sorts').addEventListener('click', sortsClick);
  menu.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('[data-k]');
    if (b) pickCol(b.getAttribute('data-k') as string);
  });
  menu.addEventListener('keydown', menuKey);
  document.addEventListener('mousedown', (e) => {
    const target = e.target as Node;
    if (!menu.hidden && !menu.contains(target) && !st.menuAt?.btn.contains(target)) closeMenu(false);
  });
  view.addEventListener('scroll', () => closeMenu(false));
}

/** Closes the column menu; `focus` = give the focus back to the button that opened it. */
export const closeColumnMenu = closeMenu;
