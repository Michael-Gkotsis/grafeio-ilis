// Where a change of a soldier's data goes: the sentence under the title of the edit / new-soldier dialogs.
// Purpose: `rosterNote` says if the change is also written to the Δυναμολόγιο Excel (when it is set in «Αρχεία Excel» and writing is on).
// Does NOT: write anything; it only builds the text.
// Owner layer: renderer/features/person-edit. Why: moved verbatim from screens/people.ts (Phase 5.3c).
// Covering test: test/ux-names.test.ts (texts).
import type { AppState } from '../../../../shared/domain';

// Πού πάει μια αλλαγή στοιχείων: και στο Δυναμολόγιο, αν έχει οριστεί στα Αρχεία Excel και η εφαρμογή γράφει εκεί
export function rosterNote(state: AppState, isNew: boolean): string {
  const b = state.settings.sources?.people;
  if (!b || b.write === false)
    return isNew
      ? 'Μένει μόνο στην εφαρμογή: δεν έχει οριστεί Δυναμολόγιο στα Αρχεία Excel για να γραφτεί και εκεί.'
      : 'Αλλάζει μόνο στην εφαρμογή. Στην επόμενη εισαγωγή Δυναμολογίου θα πάρει τις τιμές του αρχείου.';
  const at = b.file.split(/[\\/]/).pop() + ' › ' + b.sheet;
  return isNew
    ? 'Γράφεται και στο Δυναμολόγιο (' + at + '), σε νέα γραμμή κάτω από τον τελευταίο.'
    : 'Βαθμός, προέλευση, Ο/Σ, ονοματεπώνυμο, ΑΣΜ, τηλέφωνο, θάλαμος, Σ.Ι. και ρόλος γράφονται και στο Δυναμολόγιο (' +
        at +
        ').';
}
