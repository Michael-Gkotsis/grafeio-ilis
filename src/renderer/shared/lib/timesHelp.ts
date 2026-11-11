// The help line under the time fields of a leave, hospital stay or ΣΤΕΠ.
// Purpose: `timesHelp`, the one Greek sentence that explains which day a time belongs to and what it means for outs and the ΗΚΑΙ.
// Does NOT: read the store (the caller passes the rules and settings) or draw anything.
// Owner layer: renderer/shared/lib. Why: moved down from common.ts so the declaration and the hours dialogs (features) can use it.
// Covering test: test/screens-dialogs-forms.test.ts (the text is in the step 3 snapshot).
import type { Rules, Settings } from '../../../shared/domain';
import { dutyStartOf } from '../../../shared/domain';
import { outTimesTxt } from '../../../shared/returns';
import { DEFAULT_HK_TIME } from '../../../shared/rules';
import { HK } from '../../../shared/unit';

/**
 * The text under the time fields.
 * @param r - the rules (out times, ΗΚΑΙ time); may be missing
 * @param st - the settings (start of the duty day); may be missing
 */
export const timesHelp = (r?: Rules | null, st?: Pick<Settings, 'dutyStart'> | null): string =>
  'Η μέρα της υπηρεσίας είναι ' +
  dutyStartOf(st) +
  ' → ' +
  dutyStartOf(st) +
  '. Αν γυρίζει πριν ξεκινήσει μια θέση (π.χ. στις 12:00), μπαίνει σε αυτή την ίδια μέρα. Αν φεύγει πριν τελειώσει η υπηρεσία της προηγούμενης μέρας (π.χ. στις 10:00), δεν μπαίνει σε αυτήν. Αν γυρίζει ως την ώρα εξόδου της μέρας (' +
  outTimesTxt(r) +
  '), βγαίνει κανονικά έξοδο εκείνη τη μέρα· ως τις ' +
  (r?.hkTime || DEFAULT_HK_TIME) +
  ' μετρά παρών και στην ' +
  HK() +
  '. Χωρίς ώρες μετρά όλη η μέρα.';
