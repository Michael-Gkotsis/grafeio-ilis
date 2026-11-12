// «Κωδικοί που δεν αναγνωρίστηκαν» of the duty-check import: what each unknown code means.
// Purpose: `DutyAliases`; the choice is kept in the settings and applies to the next reads too.
// Does NOT: read the sheet; `SheetImportDialog` passes the unknown codes in.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); stays a component
//   (it reads the store).
// Covering test: test/screens-dialogs-forms.test.ts (snapshots sources-SheetImportDialog*).
import { KIND_NAME, codeKey, type DutyKind } from '../../../../../shared/domain';
import { postsOf } from '../../../../../shared/rules';
import { GoLink, Select, type ValueEvent } from '../../../../shared/ui';
import { useStore } from '../../../../shared/model';
import { aliasText } from '../../model/sourcesView';

// A constant, not inline: the link label must not read as plain «Ρυθμίσεις › …» text in a hint (test/ux-names.test.ts).
const DUTY_SETTINGS = 'Ρυθμίσεις › Υπηρεσίες';

/** One select per unknown code: ignore it, a duty kind without a post, or a post. */
export function DutyAliases({ codes }: { codes: string[] }) {
  const { state, run } = useStore();
  if (!codes.length) return null;
  const posts = postsOf(state.settings);
  const save = (raw: string, v: string) => {
    if (!v) return;
    run(
      {
        t: 'setSettings',
        settings: { dutyCodeAliases: { ...(state.settings.dutyCodeAliases || {}), [codeKey(raw)]: v } },
        text: aliasText(state, raw, v),
      },
      false,
    );
  };
  return (
    <div className="field">
      <span className="field__label">Κωδικοί που δεν αναγνωρίστηκαν: τι σημαίνει ο καθένας;</span>
      {codes.map((u) => (
        <div key={u} className="field-row" style={{ alignItems: 'center' }}>
          <span className="plan__fn" style={{ minWidth: '120px' }}>
            {u}
          </span>
          <Select
            className="ui-select"
            aria-label={'Τι σημαίνει ο κωδικός ' + u}
            value=""
            onChange={(e: ValueEvent) => save(u, e.target.value)}
          >
            <option value="">Παραλείπεται (διάλεξε…)</option>
            <option value="ignore">Δεν είναι υπηρεσία</option>
            <optgroup label="Υπηρεσία χωρίς θέση">
              {(Object.keys(KIND_NAME) as DutyKind[]).map((k) => (
                <option key={k} value={'kind:' + k}>
                  {KIND_NAME[k]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Θέση">
              {posts.map((x) => (
                <option key={x.k} value={x.k}>
                  {x.label}
                  {x.code ? ' (' + x.code + ')' : ''}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
      ))}
      <span className="field__help">
        Η επιλογή κρατιέται για τις επόμενες αναγνώσεις. Οι κωδικοί των θέσεων αλλάζουν στις{' '}
        <GoLink view="templates" params={{ tab: 'duty', dsub: 'blocks' }}>
          {DUTY_SETTINGS}
        </GoLink>
        .
      </span>
    </div>
  );
}
