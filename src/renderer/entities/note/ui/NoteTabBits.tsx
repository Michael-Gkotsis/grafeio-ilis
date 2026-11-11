// The two small pieces of a person's or cadre member's card that talk about notes.
// Purpose: `notesTabLabel` is the name of the «Σημειώσεις» tab (open count, and a red count when a reminder is due today);
//   `TodayAlert` is the «Σήμερα:» box above the tabs (the rules in force and the reminder line, a link to the notes tab).
// Does NOT: read the store; the sheet passes the groups, the rules and the reminder line.
// Owner layer: renderer/entities/note. Why: moved verbatim from screens/notes.ts (Phase 5.3c); both sheets use them.
// Covering test: test/notes.test.ts.
import type { PersonGroups } from '../../../../shared/notes';
import { Alert, Badge, Icon } from '../../../shared/ui';

/** The name of the «Σημειώσεις» tab: how many are open, and a red count when a reminder asks for attention today. */
export const notesTabLabel = (g: PersonGroups) => (
  <span>
    Σημειώσεις ({g.open})
    {g.dueN > 0 && (
      <>
        {' '}
        <Badge
          tone="bad"
          data-tip={g.dueN === 1 ? '1 υπενθύμιση ζητά προσοχή σήμερα' : g.dueN + ' υπενθυμίσεις ζητούν προσοχή σήμερα'}
        >
          {g.dueN}
        </Badge>
      </>
    )}
  </span>
);

/** Props of `TodayAlert`. */
export interface TodayAlertProps {
  /** The rules in force today («Καμία υπηρεσία», …). */
  rules: string[];
  /** The reminder line (`remLine`), or null. */
  rem: string;
  /** Click on the reminder: opens the notes tab. */
  onRem: () => void;
}

/** «Σήμερα:» in the card of a person: the rules in force and, when a reminder arrived, its line with a link to the notes tab. */
export function TodayAlert({ rules, rem, onRem }: TodayAlertProps) {
  if (!rules.length && !rem) return null;
  return (
    <Alert tone="warn">
      <span>
        <b>Σήμερα:</b> {rules.join(' · ')}
        {rem && rules.length > 0 && <br />}
        {rem && (
          <button type="button" className="linkish today-rem" data-tip="Άνοιγμα των σημειώσεων" onClick={onRem}>
            {Icon.bell}
            {rem}
          </button>
        )}
      </span>
    </Alert>
  );
}
