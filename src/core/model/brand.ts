// App title and logo by the rank of whoever uses the app.
//
// Purpose: the rank table (title «Γραφείο <rank in the genitive>», chevrons for NCOs, stars for officers) and the two
//   readers appTitle / appLogo.
// Does NOT: draw the logo (src/renderer/ui.ts) or store settings (BrandSettings lives in settings.ts).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: one rank table feeds the window title, the sidebar and the settings screen.
// @decision Michael 17/10: title and logo follow the rank of the user.
// Covering tests: test/units.test.ts (brand part), test/screens-settings-guide.test.ts.
import type { Settings } from './settings';

// Logo designs (ui.ts): a shield with chevrons, or a shield with 1–3 stars
export type LogoKind = 'chev' | 'star1' | 'star2' | 'star3';
export const LOGO_KINDS: [LogoKind, string][] = [
  ['chev', 'Σιρίτια'],
  ['star1', '1 αστέρι'],
  ['star2', '2 αστέρια'],
  ['star3', '3 αστέρια'],
];

// rank code (as in the cadre list) · full name · title · logo
export const BRAND_RANKS: { rank: string; name: string; title: string; logo: LogoKind }[] = [
  { rank: 'ΛΧΙΑΣ', name: 'Λοχίας', title: 'Γραφείο Λοχία', logo: 'chev' },
  { rank: 'ΕΠΛΧΙΑΣ', name: 'Επιλοχίας', title: 'Γραφείο Επιλοχία', logo: 'chev' },
  { rank: 'ΑΛΧΙΑΣ', name: 'Αρχιλοχίας', title: 'Γραφείο Αρχιλοχία', logo: 'chev' },
  { rank: 'ΑΝΘΣΤΗΣ', name: 'Ανθυπασπιστής', title: 'Γραφείο Ανθυπασπιστή', logo: 'chev' },
  { rank: 'ΑΝΘΛΧΟΣ', name: 'Ανθυπίλαρχος', title: 'Γραφείο Ανθυπιλάρχου', logo: 'star1' },
  { rank: 'ΥΠΛΧΟΣ', name: 'Υπίλαρχος', title: 'Γραφείο Υπιλάρχου', logo: 'star2' },
  { rank: 'ΙΛΧΟΣ', name: 'Ίλαρχος', title: 'Γραφείο Ιλάρχου', logo: 'star3' },
  { rank: 'ΑΝΘΛΓΟΣ', name: 'Ανθυπολοχαγός', title: 'Γραφείο Ανθυπολοχαγού', logo: 'star1' },
  { rank: 'ΥΠΛΓΟΣ', name: 'Υπολοχαγός', title: 'Γραφείο Υπολοχαγού', logo: 'star2' },
  { rank: 'ΛΓΟΣ', name: 'Λοχαγός', title: 'Γραφείο Λοχαγού', logo: 'star3' },
];
export const DEFAULT_TITLE = 'Γραφείο Λοχία';

const rankOf = (st?: Pick<Settings, 'brand'> | null) =>
  BRAND_RANKS.find((r) => r.rank === st?.brand?.rank) || BRAND_RANKS[0];
// The title: the user's own, otherwise the rank's
export const appTitle = (st?: Pick<Settings, 'brand'> | null) => st?.brand?.title?.trim() || rankOf(st).title;
// The logo: an uploaded image (data URL), a chosen design, otherwise the rank's
export function appLogo(st?: Pick<Settings, 'brand'> | null): { kind: LogoKind; src?: string } {
  const l = st?.brand?.logo || '';
  if (/^data:image\//.test(l)) return { kind: rankOf(st).logo, src: l };
  if (LOGO_KINDS.some(([k]) => k === l)) return { kind: l as LogoKind };
  return { kind: rankOf(st).logo };
}
