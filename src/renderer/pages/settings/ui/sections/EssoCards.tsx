// «Ρυθμίσεις › ΕΣΣΟ»: the current ΕΣΣΟ with its correction form, «Νέα ΕΣΣΟ…», and the list of archived ΕΣΣΟ to restore.
// Purpose: `EssoCards` (Michael, 17/10); the two cards and the three dialogs they open.
// Does NOT: hold state (model/useEsso.ts) or run the wizard (NewEssoWizard.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/esso.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered. The two cards are plain functions.
// Covering test: test/screens-settings-guide.test.ts, test/settings-esso-view.test.ts.
import { dmy } from '../../../../../shared/dates';
import { essoName, nextEsso } from '../../../../../shared/esso';
import { Button, Card } from '../../../../shared/ui';
import { atTxt } from '../../model/essoView';
import { useEsso } from '../../model/useEsso';
import { EssoDone } from './EssoDone';
import { EssoFields } from './EssoFields';
import { NewEssoWizard } from './NewEssoWizard';
import { RestoreDialog } from './RestoreDialog';

type EssoModel = ReturnType<typeof useEsso>;

/** The «ΕΣΣΟ» card: which one is current, how many soldiers, the correction form and the «Νέα ΕΣΣΟ…» button. */
function currentCard(m: EssoModel) {
  const { state, today, edit, setEdit, setWiz, cur, own, saveEdit } = m;
  return (
    <Card title="ΕΣΣΟ">
      <dl className="kv">
        <dt>Τωρινή</dt>
        <dd>
          {cur ? <b>{essoName(cur)}</b> : <span className="muted">δεν έχει οριστεί</span>}
          {!own && cur && (
            <>
              {' '}
              <span className="muted">(από το Δυναμολόγιο)</span>
            </>
          )}
          {own?.from && (
            <>
              {' '}
              <span className="muted">· από {dmy(own.from)}</span>
            </>
          )}
          {!edit && (
            <>
              {' '}
              <Button variant="link" onClick={() => setEdit(cur || nextEsso(null, today))}>
                Διόρθωση
              </Button>
            </>
          )}
        </dd>
        <dt>Σε δύναμη</dt>
        <dd>{state.people.filter((p) => p.active).length} στρατιώτες</dd>
      </dl>
      {edit && (
        <div className="field">
          <EssoFields v={edit} onChange={setEdit} id="es-y" />
          <span className="field__help">
            Αλλάζει μόνο το όνομα που δείχνει η εφαρμογή (πάνω δεξιά, νέος στρατιώτης, νέα Excel). Για νέα σειρά
            νεοσυλλέκτων πάτα «Νέα ΕΣΣΟ».
          </span>
          <div className="toolbar">
            <Button size="sm" onClick={saveEdit}>
              Αποθήκευση
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
              Άκυρο
            </Button>
          </div>
        </div>
      )}
      <p className="note">
        Η <b>Νέα ΕΣΣΟ</b> κρατά όλη την τωρινή (βάση, Excel, ιστορικό) σε φάκελο αρχείου, ξεκινά την εφαρμογή χωρίς
        στρατιώτες και φτιάχνει σε νέο φάκελο τα Excel της νέας ΕΣΣΟ, συνδεδεμένα. Οι ρυθμίσεις, οι υπηρεσίες, οι
        λίστες, οι αργίες, τα στελέχη και τα templates μένουν.
      </p>
      <div>
        <Button variant="destructive" onClick={() => setWiz(true)}>
          Νέα ΕΣΣΟ…
        </Button>
      </div>
    </Card>
  );
}

/** The «Επαναφορά ΕΣΣΟ» card: the archived ΕΣΣΟ (newest 20) with «Άνοιξε» and «Επαναφορά». */
function restoreCard(m: EssoModel) {
  const { info, setRestore, pick } = m;
  return (
    <Card
      title="Επαναφορά ΕΣΣΟ"
      actions={
        <Button size="sm" variant="outline" onClick={pick}>
          Διάλεξε φάκελο…
        </Button>
      }
    >
      <p className="note" style={{ marginTop: 0 }}>
        Ξαναφορτώνει μια παλιά ΕΣΣΟ από τον φάκελο του αρχείου της (π.χ. «Β΄ ΕΣΣΟ 2026 (έως …)», και από USB). Πριν από
        αυτό η τωρινή μπαίνει κι αυτή στο αρχείο, για να γυρίσεις πίσω.
      </p>
      {!info ? (
        'Φόρτωση…'
      ) : !info.archives.length ? (
        <p className="note">Δεν υπάρχει ακόμα αρχείο ΕΣΣΟ. Φτιάχνεται με τη «Νέα ΕΣΣΟ».</p>
      ) : (
        <ul className="hist">
          {info.archives.slice(0, 20).map((a) => (
            <li key={a.dir}>
              <b>{a.name}</b>{' '}
              <span className="muted">
                {atTxt(a.at)} · {a.people} σε δύναμη · {a.files} Excel
              </span>
              <Button size="sm" variant="ghost" onClick={() => window.api.essoOpen(a.dir)}>
                Άνοιξε
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRestore(a)}>
                Επαναφορά
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The «ΕΣΣΟ» and «Επαναφορά ΕΣΣΟ» cards with the wizard, the «started» dialog and the restore dialog. */
export function EssoCards() {
  const m = useEsso();
  const { info, wiz, setWiz, done, setDone, restore, setRestore, load } = m;
  return (
    <div className="stack">
      {currentCard(m)}
      {restoreCard(m)}
      {wiz && info && (
        <NewEssoWizard
          info={info}
          onClose={() => setWiz(false)}
          onDone={(r) => {
            setWiz(false);
            setDone(r);
            load();
          }}
        />
      )}
      {done && <EssoDone r={done} onClose={() => setDone(null)} />}
      {restore && <RestoreDialog a={restore} onClose={() => setRestore(null)} />}
    </div>
  );
}
