// The «Κείμενο στην ΗΚΑΙ» editor of a leave kind or cadre absence, with a sample line under it.
// Purpose: `LeaveTextEdit` (Michael, 1/11): the text and the «Κατεύθυνση στο κείμενο» tick;
//   saved when you leave the box.
// Does NOT: save by itself (`save` is given) or know the list.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/lists.ts (Phase 6); a component because the
//   typed text is its own state, as before.
// Covering test: test/screens-settings-guide.test.ts, test/leave-text.test.ts.
import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { cadreLeaveHk, hkRange, leaveDest, leaveHk } from '../../../../../shared/hkaiText';
import type { LeaveText, UserLists } from '../../../../../shared/ranks';
import { upper } from '../../../../../shared/text';
import { HK } from '../../../../../shared/unit';

// The sample line of the 5. ΑΙΤΗΣΕΙΣ (Michael, 1/11), with the text that is typed now.
const SAMPLE = { from: '2026-11-04', to: '2026-11-04' };

/** Props of `LeaveTextEdit`: the key `lk`, the item (`st` for a leave, `cadre` for a cadre absence) and `save`. */
export interface LeaveRowProps {
  lk: string;
  name: string;
  st?: { type: 'LEAVE' | 'HON' | 'SICK'; kind?: string };
  cadre?: { kind: string; label: string };
  auto: string;
  lists: UserLists;
  save: (lk: string, patch: Partial<LeaveText>, text: string) => void;
}

/** «Κείμενο στην ΗΚΑΙ» and «Κατεύθυνση στο κείμενο» of a leave kind, with a sample below. */
export function LeaveTextEdit({ lk, name, st, cadre, auto, lists, save }: LeaveRowProps) {
  const cur = lists.leaveText?.[lk] || {};
  const [t, setT] = useState(cur.t || '');
  const draft: UserLists = { ...lists, leaveText: { ...(lists.leaveText || {}), [lk]: { ...cur, t: t.trim() } } };
  const what = cadre ? cadreLeaveHk(cadre.kind, cadre.label, draft) : leaveHk(st!, draft);
  const dest = st ? leaveDest({ ...st, dest: 'Κόρινθο' }, draft) : '';
  const line = 'ΣΤΡ (ΠΖ) ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ: ' + (cadre ? '' : 'ΑΙΤΕΙΤΑΙ ') + what + ' ' + hkRange(SAMPLE) + dest + '.';
  const commit = () => {
    const v = t.trim().replace(/\s+/g, ' ');
    if (v !== (cur.t || ''))
      save(lk, { t: v }, name + ': κείμενο στην ' + HK() + (v ? ' «' + upper(v) + '»' : ' αυτόματο'));
  };
  return (
    <div className="lists__lt">
      <input
        className="ui-input"
        style={{ width: '230px' }}
        aria-label={'Κείμενο στην ' + HK() + ': ' + auto}
        data-tip={'Πώς γράφεται το είδος στην ' + HK() + '. Κενό = αυτόματο'}
        placeholder={auto}
        value={t}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setT(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {st && (
        <label className="ui-checkrow" data-tip="Η κατεύθυνση της άδειας γράφεται στο κείμενο: … ΜΕ ΚΑΤΕΥΘΥΝΣΗ ΚΟΡΙΝΘΟ">
          <input
            type="checkbox"
            className="ui-check"
            checked={!!cur.dest}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              save(
                lk,
                { dest: e.target.checked },
                name + ': ' + (e.target.checked ? 'κατεύθυνση στο κείμενο' : 'χωρίς κατεύθυνση στο κείμενο'),
              )
            }
          />
          {' Κατεύθυνση στο κείμενο'}
        </label>
      )}
      <span className="lists__prev">
        Στην {HK()}: <b>{line}</b>
      </span>
    </div>
  );
}
