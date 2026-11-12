// «Ρυθμίσεις › Αρχεία Excel»: for each kind the file, sheet and columns the app reads and where it writes its changes.
// Purpose: `SourcesView`; the rows, the «Έντυπα» card and the dialogs that one click on a row opens.
// Does NOT: hold state (model/useSources.ts) or draw a dialog (one file each in this folder).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered. Recognition is automatic; what it does not find the sergeant
//   shows by clicking a cell, with the suggestion marked.
// Covering test: test/screens-settings-guide.test.ts, test/screens-dialogs-forms.test.ts.
import type { ListKind, SourceBinding } from '../../../../../shared/sources';
import { KINDS, sheetHost } from '../../../../../shared/sources';
import { Button, Card, Dialog } from '../../../../shared/ui';
import { useSources } from '../../model/useSources';
import { FormsCard } from './FormsCard';
import { ImportDialog } from './ImportDialog';
import { MapDialog } from './MapDialog';
import { MatchDialog } from './MatchDialog';
import { RosterPreview } from './RosterPreview';
import { SheetImportDialog } from './SheetImportDialog';
import { SourceRow } from './SourceRow';
import { WriteDialog } from './WriteDialog';

/** The «Αρχεία Excel ανά είδος» card, the «Έντυπα» card under it and the open dialog, if any. */
export function SourcesView() {
  const { sources, st, layer, setLayer, close, busy, saving, pick, edit, read, newFile, remove, toggle } = useSources();
  return (
    <div className="stack">
      <Card
        title="Αρχεία Excel ανά είδος"
        actions={
          <Button disabled={!!busy} onClick={() => pick(null)}>
            {busy === 'new' ? 'Ανάγνωση…' : 'Εισαγωγή νέου Excel…'}
          </Button>
        }
      >
        <p className="note" style={{ marginTop: 0 }}>
          Για κάθε είδος: από ποιο Excel, φύλλο και πίνακα διαβάζει η εφαρμογή, και πού γράφει τις αλλαγές σου. Αλλάζεις
          κάτι εδώ (π.χ. το Σ.Ι. κάποιου, μια ποινή) και γράφεται στο κελί του στο Excel. Η προηγούμενη έκδοση του
          αρχείου μένει στο <b>_προηγούμενα</b> δίπλα του.
        </p>
        <ul className="srclist">
          {KINDS.map((k) => (
            <SourceRow
              key={k.id}
              kind={k.id}
              b={sources[k.id]}
              st={st.sources.find((x) => x.kind === k.id)}
              busy={busy === k.id}
              saving={!!saving}
              onPick={() => pick(k.id)}
              onEdit={() => edit(k.id)}
              onRead={() => read(k.id)}
              onWrite={() => setLayer({ kind: 'write', list: k.id })}
              onNew={() => newFile(k.id)}
              host={!!(sheetHost(k.id) && sources[sheetHost(k.id)!])}
              onRemove={() => remove(k.id)}
              onToggle={(on: boolean) => toggle(k.id, { write: on })}
              onAuto={(on: boolean) => toggle(k.id, { autoRead: on })}
            />
          ))}
        </ul>
      </Card>
      <FormsCard outs={st.forms} />
      {layer?.kind === 'match' && (
        <MatchDialog
          book={layer.book}
          onClose={close}
          onMap={(list: ListKind, b: SourceBinding) =>
            setLayer({ kind: 'map', list, book: layer.book, b, back: layer })
          }
        />
      )}
      {layer?.kind === 'map' && (
        <MapDialog
          list={layer.list}
          book={layer.book}
          initial={layer.b}
          onClose={() => setLayer(layer.back || null)}
          onSaved={(b: SourceBinding, andRead: boolean) => {
            if (andRead) read(layer.list, b, layer.list === 'people' ? undefined : layer.book);
            else if (layer.list === 'people' && !layer.back) setLayer({ kind: 'write', list: 'people' });
            else setLayer(layer.back || null);
          }}
        />
      )}
      {layer?.kind === 'import' && <ImportDialog list={layer.list} book={layer.book} b={layer.b} onClose={close} />}
      {layer?.kind === 'sheet' && <SheetImportDialog list={layer.list} book={layer.book} b={layer.b} onClose={close} />}
      {layer?.kind === 'people' && (
        <Dialog size="lg" title="Ανάγνωση προσωπικού από το Excel" onClose={close}>
          <RosterPreview pv={layer.pv} onDone={close} onCancel={close} />
        </Dialog>
      )}
      {layer?.kind === 'write' && <WriteDialog list={layer.list} onClose={close} />}
    </div>
  );
}
