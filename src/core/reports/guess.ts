// Guessing the field of a column from the header of an Excel.
//
// Purpose: `guessField` (the field of a kind that a header or a {LABEL} names) and the table of header patterns it
//   uses.
// Does NOT: know the fields themselves (fields.ts) or read any Excel.
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/reports/fields.
// Why: when a user's own template is uploaded, the app proposes which column takes what; the patterns are regular
//   expressions on the header without accents, spaces and punctuation.
// Covering tests: test/axiologisi.test.ts, test/personal-entypa.test.ts, test/reports-tables.test.ts,
//   test/reports.test.ts.
import { normGreek } from '../lib/text';
import type { RepKind } from '../model/reportTypes';
import { FIELDS } from './fields';

const k = (s: string) => normGreek(s).replace(/[\s.\-_:/\\()]/g, '');
const GUESS: [string, RegExp][] = [
  ['aa', /^(ΑΑ|ΑΡ|ΑΡΙΘ|ΑΡΙΘΜΟΣ|ΑΥΞΩΝΑΡΙΘΜΟΣ|ΑΥΞΑΡ|NO|Νο)$/],
  ['who', /^ΒΑΘΜΟΣ(ΚΑΙ)?ΟΝΟΜΑΤΕΠΩΝΥΜΟ$|^ΒΑΘΜΟΣ(ΚΑΙ)?ΕΠΩΝΥΜΟ(ΚΑΙ)?ΟΝΟΜΑ$/],
  ['rank', /^ΒΑΘΜΟΣ$|^ΒΑΘ$|^ΒΘΜ$/],
  ['origin', /^ΠΡΟΕΛΕΥΣΗ$|^ΠΡΟΕΛ$/],
  ['cspec', /^ΕΙΔΙΚΟΤΗΤΑ$/],
  ['spec', /^ΟΣ$|^ΕΙΔΙΚΟΤΗΤΑ$|^ΟΠΛΟΣΩΜΑ$/],
  ['name', /^ΟΝΟΜΑΤΕΠΩΝΥΜΟ$|^(ΕΠΩΝΥΜΟ|ΕΠΙΘΕΤΟ)(ΚΑΙ)?ΟΝΟΜΑ$/],
  ['last', /^ΕΠΩΝΥΜΟ$|^ΕΠΙΘΕΤΟ$/],
  ['first', /^ΟΝΟΜΑ$/],
  ['father', /^ΠΑΤΡΩΝΥΜΟ$|^ΟΝΠΑΤΡΟΣ$|^ΟΝΟΜΑΠΑΤΡΟΣ$/],
  ['asm', /^ΑΣΜ$|ΜΗΤΡΩΟΥ$/],
  ['am', /^ΑΜ$/],
  ['iban', /^ΙΒΑΝ$/],
  ['amka', /^ΑΜΚΑ$/],
  ['afm', /^ΑΦΜ$|^ΑFΜ$/],
  ['phone', /ΤΗΛΕΦΩΝΟ|^ΤΗΛ$|ΚΙΝΗΤΟ/],
  ['room', /^ΘΑΛΑΜΟΣ$|^ΘΑΛ$/],
  ['unit', /^ΟΥΛΑΜΟΣ$|^ΟΥΛ$/],
  ['si', /^ΣΙ$/],
  ['dcode', /^ΚΩΔΙΚΟΣΜΕΡΑΣ$|^ΚΑΤΑΣΤΑΣΗΗΜΕΡΑΣ$/],
  ['absent', /^ΑΠΩΝ$|^ΑΠΟΝ$/],
  ['areason', /^ΑΙΤΙΑΑΠΟΥΣΙΑΣ$|^ΑΙΤΙΑ$/],
  ['aret', /^ΗΜΝΙΑΕΠΙΣΤΡΟΦΗΣ$|^ΗΜΕΡΟΜΗΝΙΑΕΠΙΣΤΡΟΦΗΣ$|^ΕΠΙΣΤΡΟΦΗ$/],
  ['email', /^ΕΜΑΙ[LΛ]$|^ΗΛΕΚΤΡΟΝΙΚΟΤΑΧΥΔΡΟΜΕΙΟ$/],
  ['relEmail', /^ΕΜΑΙ[LΛ].*(ΣΥΓΓ|ΠΡΟΣΩΠ)/],
  ['blood', /ΟΜΑΔΑΑΙΜΑΤΟΣ$|^ΑΙΜΑΤΟΣ$/],
  ['post', /^ΠΟΣΤΟ$/],
  ['role', /^ΡΟΛΟΣ$|^ΘΕΣΗ$/],
  ['essos', /^ΕΣΣΟ$/],
  ['dn', /^ΔΝ$|ΔΙΚΑΙΩΜΑΔΝ/],
  ['weapon', /^ΑΡΟΠΛΟΥ$|^ΑΡΙΘΜΟΣΟΠΛΟΥ$|^ΟΠΛΟ$/],
  ['wtype', /^ΤΥΠΟΣΟΠΛΟΥ$|^ΤΥΠΟΣ$/],
  ['rack', /ΟΠΛΟΒΑΣΤΟΣ/],
  ['wpos', /^ΘΕΣΗΟΠΛΟΥ$/],
  ['status', /^ΚΑΤΑΣΤΑΣΗ$/],
  ['duty', /^ΥΠΗΡΕΣΙΑ$/],
  ['blank', /^ΥΠΟΓΡΑΦΗ$|^ΥΠΟΓΡ$/],
  ['stype', /^ΕΙΔΟΣ$|^ΚΑΤΑΣΤΑΣΗ$|^ΕΙΔΟΣΑΔΕΙΑΣ$|^ΠΟΙΝΗ$/],
  ['from', /^ΑΠΟ$|^ΕΝΑΡΞΗ$|^ΗΜΕΡΟΜΗΝΙΑΑΠΟ$/],
  ['to', /^ΕΩΣ$|^ΜΕΧΡΙ$|^ΛΗΞΗ$|^ΗΜΕΡΟΜΗΝΙΑΕΩΣ$/],
  ['days', /^ΗΜΕΡΕΣ$|^ΗΜΕΡΩΝ$|^ΗΜ$/],
  ['note', /^ΠΑΡΑΤΗΡΗΣΗ$|^ΠΑΡΑΤΗΡΗΣΕΙΣ$/],
  ['by', /ΤΙΜΩΡΗΣΕ|^ΥΠΟ$/],
  ['reason', /^ΔΙΟΤΙ$|^ΑΙΤΙΟΛΟΓΙΑ$|^ΑΙΤΙΑ$/],
  ['on', /^ΗΜΤΙΜΩΡΙΑΣ$|^ΗΜΕΡΟΜΗΝΙΑΤΙΜΩΡΙΑΣ$/],
  ['seat', /^ΘΕΣΗ$|^ΘΕΣΗΥΠΗΡΕΣΙΑΣ$/],
  ['hours', /^ΩΡΕΣ$|^ΩΡΑ$/],
  ['block', /^ΥΠΗΡΕΣΙΑ$/],
  ['armed', /^ΕΝΟΠΛΗ$|^ΕΝΟΠΛΟΣ$/],
  ['code', /^ΚΩΔ$|^ΚΩΔΙΚΟΣ$/],
  ['inout', /^ΕΝΤΟΣΕΚΤΟΣ$|^ΕΝΤΟΣ$|^ΕΚΤΟΣ$/],
  ['mreason', /^ΛΟΓΟΣΕΞΟΔΟΥ$|^ΛΟΓΟΣ$/],
  ['mout', /^ΕΞΟΔΟΣ$|^ΩΡΑΕΞΟΔΟΥ$/],
  ['minr', /^ΛΟΓΟΣΕΙΣΟΔΟΥ$/],
  ['min', /^ΕΙΣΟΔΟΣ$|^ΩΡΑΕΙΣΟΔΟΥ$/],
  ['mnote', /^ΠΑΡΑΤΗΡΗΣΗ$|^ΠΑΡΑΤΗΡΗΣΕΙΣ$/],
  ['smed', /^ΙΑΤΡΙΚΟ$|^ΙΑΤΡΙΚΑ$/],
  ['sabs', /^ΑΔΕΙΑ$|^ΑΔΕΙΕΣ$/],
  ['spun', /^ΠΟΙΝΗ$|^ΠΟΙΝΕΣ$/],
  ['sother', /^ΣΤΕΠ|^ΝΟΣΟΚΟΜΕΙΟ$/],
  ['sout', /^ΕΞΟΔΟΣ$|^ΕΞΟΔΟΥΧΟΣ$/],
];
/** Which field fits a header (or a {LABEL} inside the row); null = not known. */
export function guessField(kind: RepKind, head: unknown): string | null {
  const t = k(String(head ?? '').replace(/[{}]/g, ''));
  if (!t) return null;
  const ok = new Set(FIELDS[kind].map((f) => f.k));
  for (const [f, re] of GUESS) if (ok.has(f) && re.test(t)) return f;
  for (const f of FIELDS[kind])
    if (f.k !== 'text' && f.k !== 'blank' && (k(f.head) === t || k(f.label) === t)) return f.k;
  return null;
}
