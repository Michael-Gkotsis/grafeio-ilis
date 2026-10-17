// Τίτλος και λογότυπο της εφαρμογής ανάλογα με τον βαθμό όποιου τη χρησιμοποιεί (Michael, 17/10).
// Ο τίτλος είναι «Γραφείο» + ο βαθμός στη γενική· το λογότυπο: σιρίτια για τους υπαξιωματικούς, αστέρια για τους αξιωματικούς.
import type { Settings } from './domain';

// Σχέδια λογότυπου (ui.ts): ασπίδα με σιρίτια και αστέρι, ή ασπίδα με 1–3 αστέρια
export type LogoKind = 'chev' | 'star1' | 'star2' | 'star3';
export const LOGO_KINDS: [LogoKind, string][] = [['chev', 'Σιρίτια'], ['star1', '1 αστέρι'], ['star2', '2 αστέρια'], ['star3', '3 αστέρια']];

// κωδικός βαθμού (όπως στη λίστα στελεχών) · πλήρες όνομα · τίτλος · λογότυπο
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
  { rank: 'ΛΓΟΣ', name: 'Λοχαγός', title: 'Γραφείο Λοχαγού', logo: 'star3' }
];
export const DEFAULT_TITLE = 'Γραφείο Λοχία';

const rankOf = (st?: Pick<Settings, 'brand'> | null) => BRAND_RANKS.find(r => r.rank === st?.brand?.rank) || BRAND_RANKS[0];
// Ο τίτλος: ο δικός σου, αλλιώς του βαθμού
export const appTitle = (st?: Pick<Settings, 'brand'> | null) => st?.brand?.title?.trim() || rankOf(st).title;
// Το λογότυπο: εικόνα που ανέβασες (data URL), σχέδιο που διάλεξες, αλλιώς του βαθμού
export function appLogo(st?: Pick<Settings, 'brand'> | null): { kind: LogoKind; src?: string } {
  const l = st?.brand?.logo || '';
  if (/^data:image\//.test(l)) return { kind: rankOf(st).logo, src: l };
  if (LOGO_KINDS.some(([k]) => k === l)) return { kind: l as LogoKind };
  return { kind: rankOf(st).logo };
}
