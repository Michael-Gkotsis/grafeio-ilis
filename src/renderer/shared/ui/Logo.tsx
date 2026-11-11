// The squadron logo: a shield with two chevrons and a star, or the shield with 1-3 stars (officers), or an upload.
// Purpose: `<Logo/>` draws the logo in the top bar, the side menu and Settings › Εμφάνιση.
// Does NOT: choose which logo the user picked (the caller passes `kind` and `src` from the prefs).
// Owner layer: renderer/shared/ui. Why: same drawing as public/logo.svg and the window icon, in one place.
// Covering test: test/screens-*.test.ts (the logo is in the shell markup).

// why: ids `lg-f` (green) and `lg-g` (gold) are referenced by the paths, so the defs travel with the drawing.
const LOGO =
  '<defs><linearGradient id="lg-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b7f2b"/>' +
  '<stop offset="1" stop-color="#2c4313"/></linearGradient>' +
  '<linearGradient id="lg-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d77a"/>' +
  '<stop offset="1" stop-color="#c39323"/></linearGradient></defs>' +
  '<path d="M32 3 L56 11 V30 C56 45 46 55 32 61 C18 55 8 45 8 30 V11 Z" fill="url(#lg-g)"/>' +
  '<path d="M32 7.2 L52.4 14 V30 C52.4 42.6 44.2 51.4 32 56.9 C19.8 51.4 11.6 42.6 11.6 30 V14 Z" ' +
  'fill="url(#lg-f)"/>' +
  '<path d="M32 7.2 V56.9 C19.8 51.4 11.6 42.6 11.6 30 V14 Z" fill="#fff" fill-opacity=".07"/>' +
  '<path d="M32 13.5 l2.35 4.76 5.25 .76 -3.8 3.7 .9 5.23 L32 25.48 l-4.7 2.47 .9-5.23 -3.8-3.7 5.25-.76 Z" ' +
  'fill="url(#lg-g)"/>' +
  '<path d="M19 37 L32 30 L45 37 V42.5 L32 35.5 L19 42.5 Z" fill="url(#lg-g)"/>' +
  '<path d="M19 45.5 L32 38.5 L45 45.5 V51 L32 44 L19 51 Z" fill="url(#lg-g)"/>';
// The same shield with 1-3 stars (officers, Settings › Εμφάνιση): everything before the chevron star.
const LOGO_SHIELD = LOGO.slice(0, LOGO.indexOf('<path d="M32 13.5'));

const star = (x: number, y: number, r: number): string =>
  '<path d="' +
  Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const dist = i % 2 ? r * 0.42 : r;
    return (i ? 'L' : 'M') + (x + dist * Math.cos(angle)).toFixed(2) + ' ' + (y + dist * Math.sin(angle)).toFixed(2);
  }).join(' ') +
  'Z" fill="url(#lg-g)"/>';

const STARS: Record<string, [number, number][]> = {
  star1: [[32, 32]],
  star2: [
    [32, 22],
    [32, 41],
  ],
  star3: [
    [32, 18],
    [32, 32],
    [32, 46],
  ],
};
const LOGOS: Record<string, string> = {
  chev: LOGO,
  ...Object.fromEntries(
    Object.entries(STARS).map(([kind, spots]) => [
      kind,
      LOGO_SHIELD + spots.map(([x, y]) => star(x, y, spots.length === 3 ? 6.5 : 8)).join(''),
    ]),
  ),
};

/** Props of `Logo`. */
export interface LogoProps {
  /** Width and height in px. Default 32. */
  size?: number;
  /** Drawing: `chev` (default), `star1`, `star2`, `star3` (brand.ts); an unknown kind falls back to `chev`. */
  kind?: string;
  /** Image the user uploaded (a URL or data URI); when set it replaces the drawing and `kind` is ignored. */
  src?: string;
}

/** The logo as an `<img>` (uploaded) or an inline `<svg>` (drawn), both with class `logo` and hidden from readers. */
export const Logo = ({ size = 32, kind = 'chev', src }: LogoProps) =>
  src ? (
    <img className="logo" src={src} width={size} height={size} alt="" style={{ objectFit: 'contain' }} />
  ) : (
    <svg
      className="logo"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: constant SVG drawings of this file, no user data
      dangerouslySetInnerHTML={{ __html: LOGOS[kind] || LOGO }}
    />
  );
