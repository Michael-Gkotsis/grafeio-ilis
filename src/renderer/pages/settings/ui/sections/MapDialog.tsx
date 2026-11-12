// The «πού βρίσκεται στο Excel» dialog: the sheet, the header row and the column of each field. Click a field, then a
// cell of the table.
// Purpose: `MapDialog`; the field list and the grid are plain functions.
// Does NOT: hold state (model/useMap.ts) or the rules (model/mapView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-dialogs-forms.test.ts (snapshots sources-MapDialog*).
import type { ChangeEvent } from 'react';
import type { SourceBook } from '../../../../../shared/api';
import { KIND, isStatusKind, type ListKind, type SourceBinding } from '../../../../../shared/sources';
import { cx } from '../../../../shared/lib/cx';
import { Alert, Badge, Button, Dialog, Select, type ValueEvent } from '../../../../shared/ui';
import { NEW_SHEET } from '../../model/sourcesView';
import { useMap } from '../../model/useMap';
import { mapGrid, mapSampleBox } from './MapGrid';

export interface MapDialogProps {
  list: ListKind;
  /** The Excel file as read by the main process. */
  book: SourceBook;
  /** The binding to start from. */
  initial: SourceBinding;
  onClose: () => void;
  /** Called after the save; `andRead` is true for «Αποθήκευση και ανάγνωση». */
  onSaved: (b: SourceBinding, andRead: boolean) => void;
}

type MapModel = ReturnType<typeof useMap>;

/** The row of three controls on top: the sheet, the header row number and (status kinds) what the app writes. */
function mapControls(m: MapModel, list: ListKind, book: SourceBook) {
  const { b, setB, isNew, setSheet, setHeader } = m;
  return (
    <div className="field-row" style={{ alignItems: 'flex-end' }}>
      <div className="field">
        <label className="field__label" htmlFor="mp-sh">
          Φύλλο
        </label>
        <Select
          id="mp-sh"
          className="ui-input"
          value={isNew ? NEW_SHEET : b.sheet}
          onChange={(e: ValueEvent) => setSheet(e.target.value)}
        >
          {book.sheets.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
          {isStatusKind(list) && <option value={NEW_SHEET}>+ Νέο φύλλο «{KIND[list].title.slice(0, 31)}»</option>}
        </Select>
      </div>
      {!isNew && (
        <div className="field" style={{ maxWidth: '170px' }}>
          <label className="field__label" htmlFor="mp-hd">
            Γραμμή επικεφαλίδων
          </label>
          <input
            id="mp-hd"
            type="number"
            min="1"
            className="ui-input"
            value={b.header + 1}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setHeader(Math.max(0, (+e.target.value || 1) - 1))}
          />
        </div>
      )}
      {isStatusKind(list) && (
        <div className="field">
          <span className="field__label">Τι γράφει η εφαρμογή</span>
          <Select
            className="ui-input"
            aria-label="Ποιες εγγραφές γράφονται"
            value={b.scope || 'all'}
            onChange={(e: ValueEvent) => setB({ ...b, scope: e.target.value as SourceBinding['scope'] })}
          >
            <option value="active">Μόνο όσες ισχύουν από σήμερα και μετά (τα ληγμένα σβήνονται)</option>
            <option value="all">Όλες τις εγγραφές (και τα ληγμένα)</option>
          </Select>
        </div>
      )}
    </div>
  );
}

/** The left list: a button and a column select for each field, with its «λείπει» / «αναγνωρίστηκε» tag. */
function mapFieldList(m: MapModel) {
  const { b, active, setActive, fields, sugg, maxCol, setCol, colName } = m;
  return (
    <ul className="mapper__fields" aria-label="Πεδία">
      {fields.map((f) => {
        const c = b.cols[f.k];
        const rec = sugg[f.k];
        const tag =
          c == null ? (
            f.req ? (
              <Badge tone="bad">λείπει</Badge>
            ) : null
          ) : c === rec ? (
            <Badge tone="ok" data-tip="Βρέθηκε από την επικεφαλίδα">
              αναγνωρίστηκε
            </Badge>
          ) : (
            <Badge tone="info">δική σου επιλογή</Badge>
          );
        return (
          <li key={f.k} className={cx('mapper__f', active === f.k && 'is-active')}>
            <button
              type="button"
              className="mapper__fb"
              aria-pressed={active === f.k}
              onClick={() => setActive(active === f.k ? null : f.k)}
            >
              <b>{f.label}</b>
              {tag}
            </button>
            <Select
              className="ui-select"
              aria-label={'Στήλη για ' + f.label}
              value={c == null ? '' : String(c)}
              onChange={(e: ValueEvent) => setCol(f.k, e.target.value === '' ? null : +e.target.value)}
            >
              <option value="">—</option>
              {Array.from({ length: maxCol + 1 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: frozen DOM, the list is positional and keyed by index as before
                <option key={i} value={String(i)}>
                  {colName(i)}
                  {i === rec ? ' (προτείνεται)' : ''}
                </option>
              ))}
            </Select>
          </li>
        );
      })}
    </ul>
  );
}

/** The dialog that maps the columns of one sheet to the fields of a kind. */
export function MapDialog({ list, book, initial, onClose, onSaved }: MapDialogProps) {
  const m = useMap(list, book, initial, onSaved);
  const { active, fields, isNew, miss, sample, count, save } = m;
  return (
    <Dialog
      size="xl"
      title={KIND[list].label + ': πού βρίσκεται στο Excel'}
      description={book.name}
      onClose={onClose}
      footer={
        <>
          <span className="note" style={{ marginRight: 'auto' }}>
            {isNew
              ? 'Το φύλλο θα φτιαχτεί με την πρώτη ενημέρωση.'
              : count + ' ' + (count === 1 ? 'εγγραφή' : 'εγγραφές') + ' στον πίνακα'}
          </span>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button
            variant="outline"
            disabled={miss.length > 0}
            why={'Λείπει: ' + miss.join(', ')}
            onClick={() => save(false)}
          >
            Αποθήκευση
          </Button>
          {!isNew && (
            <Button disabled={miss.length > 0} why={'Λείπει: ' + miss.join(', ')} onClick={() => save(true)}>
              Αποθήκευση και ανάγνωση
            </Button>
          )}
        </>
      }
    >
      {mapControls(m, list, book)}
      {miss.length > 0 && (
        <Alert tone="bad">
          <span>
            Λείπει: <b>{miss.join(', ')}</b>. Πάτα το πεδίο αριστερά και μετά ένα κελί της στήλης του στον πίνακα.
          </span>
        </Alert>
      )}
      <div className="mapper">
        {mapFieldList(m)}
        <div className="mapper__grid">
          {active && (
            <div className="mapper__hint">
              Κάνε κλικ σε ένα κελί της στήλης για «{fields.find((f) => f.k === active)?.label}»
            </div>
          )}
          {mapGrid(m)}
          {mapSampleBox(sample)}
        </div>
      </div>
    </Dialog>
  );
}
