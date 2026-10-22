// Αντίθεση χρωμάτων στα δύο θέματα (WCAG 2.x): τα tokens του styles.css διαβάζονται και ελέγχονται ανά ζεύγος.
// Στόχος για παλιές οθόνες χαμηλής αντίθεσης: κείμενο 7:1 (AAA), δευτερεύον κείμενο 4.5:1+ (AA), όρια κουμπιών/πεδίων 3:1.
// Ο λόγος του WCAG 2 υπερεκτιμά την αντίθεση στο σκοτεινό (ανοιχτό κείμενο σε σκούρο φόντο), γι' αυτό ελέγχεται και το APCA (Lc).
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles.css'), 'utf8');
const block = (start: string) => { const i = css.indexOf(start); const j = css.indexOf('}', i); return css.slice(i, j); };
const tokens = (src: string) => Object.fromEntries([...src.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(m => [m[1], m[2]]));
const light = tokens(block(':root{'));
const dark = { ...light, ...tokens(block(':root[data-theme="dark"]{')) };

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
  ['bar-fg', 'bar', 7], ['bar-fg', 'rail-on', 7], ['bar-fg', 'bar-field', 7], ['xl-fg', 'xl-bg', 7], ['xl-fg', 'xl-head', 7],
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
    const auto = block('@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){');
    expect(tokens(auto)).toEqual(tokens(block(':root[data-theme="dark"]{')));
  });
});
