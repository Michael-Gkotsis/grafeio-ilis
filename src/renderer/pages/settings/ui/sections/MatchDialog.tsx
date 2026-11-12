// The «Τι έχει το <αρχείο>» dialog: which tables a new Excel file has and which kind each one is.
// Purpose: `MatchDialog`; the suggestion of the recognition is already selected, «Στήλες…» opens the mapping.
// Does NOT: hold state (model/useMatch.ts) or map the columns (MapDialog.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered. One table row is a plain function.
// Covering test: test/screens-dialogs-forms.test.ts (snapshot sources-MatchDialog).
import type { SourceBook } from '../../../../../shared/api';
import {
  KIND,
  KINDS,
  bindingText,
  defaultBinding,
  suggestCols,
  tableRows,
  type ListKind,
  type SourceBinding,
} from '../../../../../shared/sources';
import { Alert, Button, Dialog, Select, type ValueEvent } from '../../../../shared/ui';
import { useMatch } from '../../model/useMatch';

export interface MatchDialogProps {
  /** The new Excel file, as read by the main process. */
  book: SourceBook;
  onClose: () => void;
  /** Open the mapping for `list` with this starting binding. */
  onMap: (k: ListKind, b: SourceBinding) => void;
}

type MatchModel = ReturnType<typeof useMatch>;

/** One found table: its place in the file, the kind select and «Στήλες…». */
function hitRow(m: MatchModel, book: SourceBook, onMap: MatchDialogProps['onMap'], i: number) {
  const { state, pick, setPick } = m;
  const h = book.hits[i];
  const k = pick[i];
  const cur = k ? state.settings.sources?.[k] : undefined;
  const sh = book.sheets.find((s) => s.name === h.sheet)!;
  const n = k ? tableRows(sh, h.header, suggestCols(k, sh, h.header)).records.length : h.rows;
  return (
    <li key={i} className="srcrow">
      <div className="srcrow__main">
        <b>
          {h.sheet}
          {h.title && h.title !== h.sheet ? ' › ' + h.title : ''}
        </b>
        <small>
          γραμμή {h.header + 1} · {n} {n === 1 ? 'εγγραφή' : 'εγγραφές'}
          {cur && k ? ' · αντικαθιστά: ' + bindingText(cur) : ''}
        </small>
      </div>
      <div className="srcrow__act">
        <Select
          className="ui-select"
          aria-label={'Είδος για ' + h.sheet}
          value={k}
          onChange={(e: ValueEvent) => setPick({ ...pick, [i]: e.target.value as ListKind | '' })}
        >
          <option value="">Δεν χρειάζεται</option>
          {[...KINDS]
            .sort((a, b) => (h.score[b.id] || 0) - (h.score[a.id] || 0))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
                {x.id === h.best ? ' (προτείνεται)' : ''}
              </option>
            ))}
        </Select>
        {k && (
          <Button size="sm" variant="ghost" onClick={() => onMap(k, m.bindingOf(i, k))}>
            Στήλες…
          </Button>
        )}
      </div>
    </li>
  );
}

/** The dialog that lets the sergeant give each table of a new Excel file its kind. */
export function MatchDialog({ book, onClose, onMap }: MatchDialogProps) {
  const m = useMatch(book, onClose);
  const { chosen, dupe, save } = m;
  return (
    <Dialog
      size="lg"
      title={'Τι έχει το ' + book.name}
      description="Η εφαρμογή βρήκε αυτούς τους πίνακες. Διάλεξε σε ποιο είδος πάει ο καθένας· η πρόταση της αναγνώρισης είναι ήδη επιλεγμένη."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button
            disabled={!chosen.length || !!dupe}
            why={
              dupe
                ? 'Το «' + KIND[dupe].label + '» διαλέχτηκε σε δύο πίνακες'
                : 'Διάλεξε είδος σε τουλάχιστον έναν πίνακα'
            }
            onClick={save}
          >
            Αποθήκευση ({chosen.length})
          </Button>
        </>
      }
    >
      {!book.hits.length && (
        <>
          <Alert tone="warn">
            <span>
              Δεν βρέθηκε πίνακας με επικεφαλίδες ατόμων (Επώνυμο, Όνομα, ΑΣΜ). Διάλεξε είδος και δείξε τις στήλες με το
              χέρι:
            </span>
          </Alert>
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <Button
                key={k.id}
                size="sm"
                variant="outline"
                onClick={() => onMap(k.id, defaultBinding(k.id, book.file, book.sheets[0]?.name || k.title))}
              >
                {k.label}
              </Button>
            ))}
          </div>
        </>
      )}
      <ul className="srclist">{book.hits.map((_, i) => hitRow(m, book, onMap, i))}</ul>
      {dupe && (
        <Alert tone="bad">
          <span>Το «{KIND[dupe].label}» διαλέχτηκε σε δύο πίνακες. Κράτα έναν.</span>
        </Alert>
      )}
    </Dialog>
  );
}
