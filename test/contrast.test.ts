// Αντίθεση χρωμάτων στα δύο θέματα (WCAG 2.x): τα tokens του styles.css διαβάζονται και ελέγχονται ανά ζεύγος.
// Στόχος για παλιές οθόνες χαμηλής αντίθεσης: κείμενο 7:1 (AAA), δευτερεύον κείμενο 4.5:1+ (AA), όρια κουμπιών/πεδίων 3:1.
// Ο λόγος του WCAG 2 υπερεκτιμά την αντίθεση στο σκοτεινό (ανοιχτό κείμενο σε σκούρο φόντο), γι' αυτό ελέγχεται και το APCA (Lc).
import { describe, expect, it } from 'vitest';
import { PAGE_CSS } from '../src/renderer/shared/lib/pageCss';
import { colourTokens, parseCss, rawTokens, readStyles } from './support/css';

// Phase 0.4: the tokens used to come from `indexOf(':root{')` in styles.css. They now come from every .css under
// src/renderer (@import followed, var() chains resolved, see test/support/css.ts), so the same checks hold when the
// redesign moves the tokens to shared/ui/tokens.css with values like `var(--p-...)`.
const rules = readStyles();
const light = colourTokens(rules, 'light');
const dark = colourTokens(rules, 'dark');

const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// APCA-W3 0.0.98G: Lc ως 106 (σκούρο σε ανοιχτό) / 108 (ανοιχτό σε σκούρο)· 75 = κείμενο σώματος, 60 = μικρό δευτερεύον, 15 = όριο ορατότητας γραμμής
const Ys = (hex: string) => {
  const c = [1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.4);
  const y = 0.2126729 * c[0] + 0.7151522 * c[1] + 0.072175 * c[2];
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
};
const apca = (txt: string, bg: string) => {
  const t = Ys(txt), b = Ys(bg);
  const s = b > t ? (b ** 0.56 - t ** 0.57) * 1.14 : (b ** 0.65 - t ** 0.62) * 1.14;
  return Math.abs(s) < 0.1 ? 0 : (Math.abs(s) - 0.027) * 100;
};

// [κείμενο/στοιχείο, φόντο, ελάχιστο]
const PAIRS: [string, string, number][] = [
  // κύριο κείμενο: AAA
  ...['background', 'card', 'muted', 'hover', 'thead'].map(b => ['foreground', b, 7] as [string, string, number]),
  ['band-fg', 'band', 7], ['h2', 'card', 7], ['primary-fg', 'primary', 7], ['secondary-fg', 'secondary', 7],
  ['bar-fg', 'bar', 7], ['bar-fg', 'rail-on', 7], ['bar-fg', 'bar-field', 7], ['xl-fg', 'xl-bg', 7], ['xl-fg', 'xl-head', 7], ['paper-fg', 'paper', 7],
  // ετικέτες (μικρά έντονα γράμματα): AAA
  ['ok', 'ok-bg', 7], ['warn', 'warn-bg', 7], ['bad', 'bad-bg', 7], ['info', 'info-bg', 7], ['ey', 'ey-bg', 7], ['dn', 'dn-bg', 7],
  // δευτερεύον κείμενο: τουλάχιστον AA, στην κάρτα σχεδόν AAA
  ['muted-fg', 'card', 6.5], ['muted-fg', 'background', 6], ['muted-fg', 'muted', 5.5], ['muted-fg', 'thead', 5.5], ['muted-fg', 'hover', 5.5],
  ['bar-muted', 'bar', 6], ['bar-muted', 'rail', 6], ['bar-muted', 'bar-field', 4.5],
  ...['ok', 'warn', 'bad', 'info', 'ey', 'dn'].flatMap(t => [[t, 'card', 4.5], [t, 'background', 4.5]] as [string, string, number][]),
  ['bad', 'empty-row', 4.5], ['info', 'muted', 4.5],
  ['destructive-fg', 'destructive', 4.5], ['on-bad', 'bad-line', 4.5], ['xl-kenh-fg', 'xl-kenh', 4.5], ['xl-fg', 'xl-hdr', 7], ['xl-fg', 'flash', 4.5],
  // όρια πεδίων/κουμπιών και δείκτες (WCAG 1.4.11): 3:1
  ['input', 'card', 3], ['input', 'background', 3], ['input', 'muted', 2.5], ['primary', 'background', 3], ['primary', 'card', 3], ['ring', 'card', 3], ['ring', 'background', 3],
  ['band-line', 'band', 3], ['bad-line', 'card', 3], ['gold', 'rail-on', 3], ['gold', 'bar', 3], ['xl-grid', 'xl-bg', 1.5],
  // διαχωριστικές γραμμές και κάρτες: να φαίνονται και σε ξεθωριασμένη οθόνη
  ['border', 'card', 1.45], ['border', 'background', 1.3], ['rail-on', 'rail', 1.3],
  // μενού αριστερά (U4): κείμενο σε κανονική, πατημένη και ενεργή γραμμή· οι τίτλοι ομάδων και ο δείκτης της ενεργής
  ['nav-fg', 'nav-bg', 4.5], ['nav-fg', 'nav-hover', 4.5], ['nav-on-fg', 'nav-on', 4.5], ['nav-muted', 'nav-bg', 4.5], ['nav-accent', 'nav-on', 3], ['foreground', 'selected', 4.5],  // palette PR (11/11): text on gold, the filled button of the «Excel» card, the Excel title bar, the grey behind a page
  // preview, gold words on the top bar (was 4.05 in the light theme), and the «written by hand» dot as a 3:1 mark
  ['on-gold', 'gold', 7], ['bar-btn-fg', 'bar-btn', 7], ['xl-bar-fg', 'xl-bar', 4.5], ['backdrop-fg', 'backdrop', 4.5], ['gold', 'bar', 4.5],
  ['hand-dot', 'card', 3], ['hand-dot', 'muted', 3],
];

// [κείμενο/στοιχείο, φόντο, ελάχιστο Lc]
const APCA: [string, string, number][] = [
  ...['background', 'card', 'muted', 'hover', 'thead'].map(b => ['foreground', b, 88] as [string, string, number]),
  ['h2', 'card', 80], ['band-fg', 'band', 75], ['primary-fg', 'primary', 75], ['secondary-fg', 'secondary', 75], ['bar-fg', 'bar', 85], ['bar-fg', 'rail-on', 75],
  ['muted-fg', 'card', 75], ['muted-fg', 'background', 75], ['muted-fg', 'muted', 70], ['muted-fg', 'thead', 70], ['muted-fg', 'hover', 68],
  ['bar-muted', 'bar', 70], ['bar-muted', 'rail', 70],
  ...['ok', 'warn', 'bad', 'info', 'ey', 'dn'].flatMap(t => [[t, t + '-bg', 70], [t, 'card', 70]] as [string, string, number][]),
  ['xl-fg', 'xl-bg', 85], ['input', 'card', 30], ['input', 'background', 30], ['primary', 'card', 60], ['ring', 'card', 45],
  ['border', 'card', 15], ['border', 'background', 15], ['band-line', 'band', 30],
];

describe('αντίθεση χρωμάτων', () => {
  for (const [name, t] of [['φωτεινό', light], ['σκοτεινό', dark]] as const) {
    it(name + ' (APCA)', () => {
      const bad = APCA.filter(([a, b, min]) => !t[a] || !t[b] || apca(t[a], t[b]) < min)
        .map(([a, b, min]) => `${a} σε ${b}: Lc ${t[a] && t[b] ? apca(t[a], t[b]).toFixed(1) : 'λείπει'} < ${min}`);
      expect(bad).toEqual([]);
    });
  }
  for (const [name, t] of [['φωτεινό', light], ['σκοτεινό', dark]] as const) {
    it(name, () => {
      const bad = PAIRS.filter(([a, b, min]) => !t[a] || !t[b] || ratio(t[a], t[b]) < min)
        .map(([a, b, min]) => `${a} σε ${b}: ${t[a] && t[b] ? ratio(t[a], t[b]).toFixed(2) : 'λείπει'} < ${min}`);
      expect(bad).toEqual([]);
    });
  }
  it('το σκοτεινό θέμα είναι ίδιο στο «Όπως τα Windows» και στο «Σκοτεινό»', () => {
    const auto = colourTokens(rules, 'auto-dark');
    expect(Object.keys(auto).length).toBeGreaterThan(30);
    expect(auto).toEqual(dark);
  });
  // the «Σκοτεινό» block used to miss --overlay, --shadow and the scrollbar thumbs (not hex, so the test above never saw
  // them): on Win7, where only this block can apply, scrollbars were dark on dark. Every declaration must match.
  it('the two dark blocks declare exactly the same values (also shadows, overlay, scrollbars)', () => {
    const auto = Object.fromEntries(rawTokens(rules, 'auto-dark'));
    expect(Object.keys(auto)).toEqual(expect.arrayContaining(['--overlay', '--shadow', '--sb-thumb', '--shade']));
    expect(auto).toEqual(Object.fromEntries(rawTokens(rules, 'dark')));
  });
  // palette.css is the only place for colour values; a rule elsewhere reads a semantic token so it follows the theme.
  // Allowed: `#000` inside a mask-image (an alpha mask, not a colour on screen).
  it('colour values live only in the --p-* primitives, and rules never read a primitive directly', () => {
    const literal = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|color-mix)\(/i;
    const decls = rules.flatMap(r => Object.entries(r.decls).map(([prop, value]) => ({ prop, value, sel: r.selectors.join(',') })));
    const loose = decls.filter(d => literal.test(d.value) && !d.prop.startsWith('--p-') && !/mask-image$/.test(d.prop));
    expect(loose.map(d => `${d.sel} { ${d.prop}: ${d.value} }`)).toEqual([]);
    const direct = decls.filter(d => !d.prop.startsWith('--') && d.value.includes('var(--p-'));
    expect(direct.map(d => `${d.sel} { ${d.prop}: ${d.value} }`)).toEqual([]);
  });
  // A preview of a file is paper: it shows the file the way it is written and printed, so it stays a light sheet in
  // the dark theme (approved UI proposal 09/11). The scrolling boxes of the Excel preview and of the column mapper
  // declare the light map again on themselves; a token that a dark block overrides and the paper does not would leak
  // dark into it. Only the tone of the sheet (--paper*) follows the theme on purpose.
  it('paper (Excel preview, column mapper) declares again every token the dark theme overrides', () => {
    const declared = (sel: string): string[] =>
      rules.filter(r => r.at.length === 0 && r.selectors.some(s => s.trim() === sel)).flatMap(r => Object.keys(r.decls));
    const darkNames = declared(':root[data-theme="dark"]').filter(name => name.startsWith('--'));
    expect(darkNames.length).toBeGreaterThan(40);
    for (const paper of ['.xl__scroll', '.mapper__scroll']) {
      const own = new Set(declared(paper));
      expect(darkNames.filter(name => !own.has(name) && !name.startsWith('--paper'))).toEqual([]);
      expect(own.has('color-scheme')).toBe(true);
      expect(declared(paper).filter(name => name.startsWith('--paper'))).toEqual([]);
    }
  });
  // @decision Michael 12/11: the sheet is white, but not #fff in the dark theme: a soft tone that does not glare next
  // to the dark screen. Text inside a paper comes from the light map in both themes, so it is checked on both tones.
  it('the paper is softer than white in the dark theme and the light-map text still reads on it', () => {
    expect(light.paper).toBe('#ffffff');
    expect(ratio('#ffffff', dark.paper)).toBeGreaterThan(1.2);
    expect(ratio(dark.paper, dark.card)).toBeGreaterThan(9);
    const onPaper: [string, string, number][] = [
      ['xl-fg', 'paper', 7], ['paper-fg', 'paper', 7], ['xl-fg', 'paper-head', 7], ['xl-fg', 'paper-hdr', 7],
      ['muted-fg', 'paper-head', 4.5], ['foreground', 'paper', 7], ['ok', 'ok-bg', 7], ['xl-kenh-fg', 'xl-kenh', 4.5],
    ];
    for (const tone of [light, dark]) {
      const low = onPaper.filter(([fg, bg, min]) => ratio(light[fg], bg.startsWith('paper') ? tone[bg] : light[bg]) < min);
      expect(low).toEqual([]);
      expect(ratio(tone['paper-grid'], tone.paper)).toBeGreaterThan(1.5);
    }
  });
  // The page previews drawn from HTML (the pages of «Έντυπα» inside a shadow root) are sheets too: they take --paper
  // and fall back to white where the variable does not exist. The print window never loads the tokens, so print is white.
  it('the page preview of «Έντυπα» takes the paper tone, with white as the fallback', () => {
    const page = parseCss(PAGE_CSS).find(r => r.selectors.includes('.pg'));
    expect(page?.decls.background).toBe('var(--paper,#fff)');
  });
  it('τα tokens βρέθηκαν και στα δύο θέματα (όχι έλεγχος πάνω σε άδειο σύνολο)', () => {
    for (const t of [light, dark]) expect(Object.keys(t)).toEqual(expect.arrayContaining(['background', 'foreground', 'card', 'muted-fg', 'primary']));
    expect(dark.background).not.toBe(light.background);
  });
});
