// The «Ξεκίνησε η <ΕΣΣΟ>» dialog shown after the wizard: where the archive and the new folder are, and what to do next.
// Purpose: `EssoDone`.
// Does NOT: start or restore anything; the wizard already did.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/esso.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered.
// Covering test: test/screens-dialogs-shell.test.ts (snapshot esso-EssoDone).
import { essoName } from '../../../../../shared/esso';
import { Alert, Button, Dialog, GoLink } from '../../../../shared/ui';
import { useNav, useStore } from '../../../../shared/model';
import type { EssoStarted } from '../../model/useEsso';

// A constant, not inline: the link label must not read as plain «Ρυθμίσεις › …» text in a hint (test/ux-names.test.ts).
const FILES_SETTINGS = 'Ρυθμίσεις › Αρχεία Excel';

export interface EssoDoneProps {
  /** What the wizard returned. */
  r: EssoStarted;
  onClose: () => void;
}

/** The dialog that says the new ΕΣΣΟ started, with «Άνοιξε» links and the way on to the Δυναμολόγιο. */
export function EssoDone({ r, onClose }: EssoDoneProps) {
  const { state } = useStore();
  const nav = useNav();
  const name = state.settings.essos ? essoName(state.settings.essos) : 'νέα ΕΣΣΟ';
  const n = state.people.filter((p) => p.active).length;
  return (
    <Dialog
      title={'Ξεκίνησε η ' + name}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Κλείσιμο
          </Button>
          <Button
            onClick={() => {
              onClose();
              if (n) nav.go('people');
              else nav.go('people', { quickAdd: true });
            }}
          >
            {n ? 'Στο Δυναμολόγιο (' + n + ')' : 'Γράψε τους στρατιώτες'}
          </Button>
        </>
      }
    >
      <dl className="kv">
        <dt>Αρχείο</dt>
        <dd>
          <span className="plan__fn">{r.archive}</span>{' '}
          <Button variant="link" onClick={() => window.api.essoOpen(r.archive)}>
            Άνοιξε
          </Button>
        </dd>
        <dt>Φάκελος</dt>
        <dd>
          <span className="plan__fn">{r.dir}</span>{' '}
          <Button variant="link" onClick={() => window.api.essoOpen(r.dir)}>
            Άνοιξε
          </Button>
        </dd>
        <dt>Excel</dt>
        <dd>
          {r.files.length
            ? r.files.map((f: string) => (
                <div key={f}>
                  <Button variant="link" onClick={() => window.api.openPath(f)}>
                    {f.split(/[\\/]/).pop()}
                  </Button>
                </div>
              ))
            : 'κανένα'}
        </dd>
      </dl>
      {r.warnings.map((w: string) => (
        <Alert key={w} tone="warn">
          <span>{w}</span>
        </Alert>
      ))}
      {r.warnings.length > 0 && (
        <p className="note">
          {'Ό,τι δεν φτιάχτηκε το φτιάχνεις από '}
          <GoLink view="templates" params={{ tab: 'files' }}>
            {FILES_SETTINGS}
          </GoLink>
          {' › «Νέο αρχείο…».'}
        </p>
      )}
    </Dialog>
  );
}
