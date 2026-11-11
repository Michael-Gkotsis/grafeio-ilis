// The icon set of the app: one inline SVG element per name.
// Purpose: `Icon.print`, `Icon.chev`, `Icon.x`… are ready React elements to drop into buttons and menus.
// Does NOT: take props (an icon is a fixed element), load files, or know the screens that use it.
// Owner layer: renderer/shared/ui. Why: every screen draws icons; one file keeps stroke, size and viewBox the same.
// Covering test: test/screens-*.test.ts (the icons are part of every screen snapshot).
import type { ReactElement } from 'react';

// why: the paths are raw SVG strings set with dangerouslySetInnerHTML, so the markup is byte-identical to what the
// htm version produced; width/height are written only when the icon has its own size (the others use the CSS size).
const svg = (paths: string, size = ''): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
    {...(size ? { width: size, height: size } : {})}
    // biome-ignore lint/security/noDangerouslySetInnerHtml: constant SVG paths of this file, no user data
    dangerouslySetInnerHTML={{ __html: paths }}
  />
);

/**
 * Icon elements by name. Elements are created once and shared, so use them as `{Icon.chev}` (never call them).
 * Stroke-only, `currentColor`, 24x24 viewBox. `search` (18), `x`, `chev`, `up`, `down`, `edit`, `trash` (16),
 * `star`, `bell`, `check` (14) and `shield` (22) carry their own width and height in px; the others take the CSS size.
 */
export const Icon = {
  print: svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>'),
  home: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  people: svg(
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 ' +
      '5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.7.2 4.6 2 5.3 5"/>',
  ),
  cadre: svg(
    '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c.9-4 3.7-6.5 7-6.5s6.1 2.5 7 6.5"/><path ' +
      'd="M8.5 17.5l3.5-1.8 3.5 1.8"/>',
  ),
  guard: svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
  strength: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15v-3M12 15V8M17 15v-5"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  file: svg(
    '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 ' + '3v5h5M9 13h6M9 17h6"/>',
  ),
  out: svg('<path d="M14 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5"/><path d="M9 17l5-5-5-5M14 12H3"/>'),
  med: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>'),
  more: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', '18'),
  gear: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 ' +
      '2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 ' +
      '0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 ' +
      '0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 ' +
      '1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 ' +
      '1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 ' +
      '0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  ),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', '16'),
  shield: svg('<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>', '22'),
  back: svg('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
  chev: svg('<path d="M9 6l6 6-6 6"/>', '16'),
  up: svg('<path d="M6 15l6-6 6 6"/>', '16'),
  down: svg('<path d="M6 9l6 6 6-6"/>', '16'),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', '14'),
  collapse: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M16 10l-2 2 2 2"/>'),
  // question mark in a circle: «Οδηγός χρήσης» (user guide)
  help: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 ' +
      '4"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor"/>',
  ),
  // crosshair: «Οπλισμός» (weapons)
  weapon: svg(
    '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle ' +
      'cx="12" cy="12" r="1.2" fill="currentColor"/>',
  ),
  notes: svg(
    '<path d="M5 4h14a1 1 0 0 1 1 1v9l-6 6H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 ' +
      '20v-5a1 1 0 0 1 1-1h5M8 9h8M8 13h4"/>',
  ),
  bell: svg('<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>', '14'),
  edit: svg('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>', '16'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', '16'),
  check: svg('<path d="M5 12l5 5 9-10"/>', '14'),
  expand: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M14 10l2 2-2 2"/>'),
};

/** A key of `Icon`. */
export type IconName = keyof typeof Icon;
