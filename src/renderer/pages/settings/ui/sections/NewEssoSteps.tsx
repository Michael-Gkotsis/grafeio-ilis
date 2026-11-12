// The four steps of the «Νέα ΕΣΣΟ» wizard and its footer buttons, as plain functions of the wizard model.
// Purpose: `stepOne` … `stepFour` and `wizardFooter`, called by `NewEssoWizard` as `{stepOne(m, info)}`.
// Does NOT: hold state (model/useNewEsso.ts) or open the dialog (NewEssoWizard.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/esso.ts (Phase 6); plain functions, not
//   components, so the render counts stay the ones of the htm version.
// Covering test: test/screens-dialogs-shell.test.ts (snapshot esso-NewEssoWizard), test/settings-esso-view.test.ts.
import type { ChangeEvent } from 'react';
import { dmy } from '../../../../../shared/dates';
import { essoName } from '../../../../../shared/esso';
import type { EssoInfo } from '../../../../../shared/api';
import { HK, UNIT_KINDS, reportOf, unitSettingsFor, type UnitKind } from '../../../../../shared/unit';
import { UnitKindField } from '../../../../features/hk-rows';
import { Alert, Badge, Button, Segmented, Why } from '../../../../shared/ui';
import type { useNewEsso } from '../../model/useNewEsso';
import { EssoFields } from './EssoFields';

type WizardModel = ReturnType<typeof useNewEsso>;

/** Step 1 «ΕΣΣΟ»: which ΕΣΣΟ starts, where the unit is and the header of the forms. */
export function stepOne(m: WizardModel, info: EssoInfo) {
  const { cur, e, setE, u, setU, same } = m;
  return (
    <>
      <div className="field">
        <span className="field__label">Ποια ΕΣΣΟ ξεκινά;</span>
        <EssoFields v={e} onChange={setE} id="ne-y" />
        <span className="field__help">Τωρινή: {cur ? essoName(cur) : 'δεν έχει οριστεί'}. Προτείνεται η επόμενη.</span>
      </div>
      <UnitKindField
        value={u.unitKind}
        onChange={(k: UnitKind) => setU({ ...u, unitKind: k, ...unitSettingsFor(u, k) })}
      />
      <div className="field">
        <span className="field__label">Κεφαλίδα εντύπων και μονάδα στον τίτλο της {reportOf(u)}</span>
        <div className="field-row">
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              className="ui-input"
              aria-label={'Κεφαλίδα, γραμμή ' + (i + 1)}
              style={{ flex: 1, minWidth: '140px' }}
              value={u.unit[i]}
              onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                const x = [...u.unit] as [string, string, string];
                x[i] = ev.target.value;
                setU({ ...u, unit: x });
              }}
            />
          ))}
          <input
            className="ui-input"
            aria-label="Μονάδα στον τίτλο"
            style={{ flex: 1, minWidth: '120px' }}
            value={u.unitName}
            onChange={(ev: ChangeEvent<HTMLInputElement>) => setU({ ...u, unitName: ev.target.value })}
          />
        </div>
        <span className="field__help">
          «ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ {u.unitName} ΤΗΣ …». Ισχύουν για όλα τα Excel της νέας ΕΣΣΟ· αλλάζουν και μετά από
          Ρυθμίσεις › Μονάδα και έντυπα.
        </span>
      </div>
      {same && (
        <Alert tone="warn">
          <span>Είναι η ίδια με την τωρινή. Αν θες μόνο να διορθώσεις το όνομα, κλείσε και πάτα «Διόρθωση».</span>
        </Alert>
      )}
      <Alert tone="warn">
        <span>
          <b>Η εφαρμογή θα ξεκινήσει χωρίς στρατιώτες.</b> Φεύγουν οι {info.people} στρατιώτες της τωρινής ΕΣΣΟ με τις
          καταστάσεις, τις υπηρεσίες, τις αιτήσεις, την {HK()} και το ιστορικό τους. Όλα κρατιούνται πρώτα στο αρχείο
          (επόμενο βήμα) και ξαναφορτώνονται από την «Επαναφορά ΕΣΣΟ».
        </span>
      </Alert>
      <p className="note">
        Μένουν: κεφαλίδα και μονάδα, υπηρεσίες και κωδικοί, κανόνες, λίστες, Σ.Ι., αργίες, στελέχη, templates εντύπων.
        Το έντυπο υπηρεσιών ξεκινά από τη ΦΡΟΥΡΑ ΣΒΕΝ.
      </p>
    </>
  );
}

/** Step 2 «Αρχείο τωρινής»: the archive folder and what goes into it. */
export function stepTwo(m: WizardModel, info: EssoInfo) {
  const { cur, today, root, setRoot, choose } = m;
  return (
    <>
      <div className="field">
        <span className="field__label">Φάκελος αρχείου ΕΣΣΟ</span>
        <div className="toolbar">
          <span className="plan__fn" title={root}>
            {root}
          </span>
          <Button size="sm" variant="outline" onClick={() => choose(root, setRoot)}>
            Άλλαξε…
          </Button>
        </div>
        <span className="field__help">
          Εκεί φτιάχνεται ο φάκελος «{cur ? essoName(cur) : 'ΕΣΣΟ'} (έως {dmy(today)})». Για σιγουριά διάλεξε USB ή άλλο
          δίσκο· αντίγραφο της βάσης κρατιέται και στα αντίγραφα ασφαλείας.
        </span>
      </div>
      <div className="field">
        <span className="field__label">Τι μπαίνει στο αρχείο</span>
        <ul className="hist">
          <li>Η βάση της εφαρμογής (στρατιώτες, καταστάσεις, υπηρεσίες, {HK()}, ιστορικό)</li>
          {info.files.map((f) => (
            <li key={f.label + f.file}>
              {f.label}
              {': '}
              <span className="plan__fn" title={f.file}>
                {f.file}
              </span>
              {!f.exists && (
                <>
                  {' '}
                  <Badge tone="bad">δεν βρέθηκε</Badge>
                </>
              )}
            </li>
          ))}
          {!info.files.length && <li className="muted">Κανένα Excel δεν είναι συνδεδεμένο.</li>}
        </ul>
        <span className="field__help">
          Τα έντυπα που βγήκαν (ΦΡΟΥΡΑ, {HK()}
          {', εξοδούχοι) δεν αντιγράφονται· μένουν εκεί που είναι: '}
          {info.outDirs.join(' · ')}.
        </span>
      </div>
    </>
  );
}

/** Step 3 «Excel νέας»: the folder of the new Excel files and the Δυναμολόγιο (empty, or the sergeant's file). */
export function stepThree(m: WizardModel, info: EssoInfo) {
  const { e, setE, dir, setDir, ros, setRos, target, rosEsso, choose, pickRoster } = m;
  return (
    <>
      <div className="field">
        <span className="field__label">Φάκελος για τα Excel της νέας ΕΣΣΟ</span>
        <div className="toolbar">
          <span className="plan__fn" title={target}>
            {target}
          </span>
          <Button size="sm" variant="outline" onClick={() => choose(dir || info.newRoot, setDir)}>
            Άλλαξε…
          </Button>
          {dir && (
            <Button size="sm" variant="ghost" onClick={() => setDir(null)}>
              Προεπιλογή
            </Button>
          )}
        </div>
        <span className="field__help">Γίνεται ο φάκελος των αρχείων: εκεί πηγαίνουν και τα έντυπα που βγάζεις.</span>
      </div>
      <div className="field">
        <span className="field__label">Δυναμολόγιο</span>
        <Segmented
          value={ros ? 'file' : 'new'}
          onChange={(v: string) => {
            if (v === 'new') setRos(null);
            else pickRoster();
          }}
          items={[
            { value: 'new', label: 'Νέο, χωρίς στρατιώτες' },
            { value: 'file', label: 'Έχω το Excel της νέας ΕΣΣΟ…' },
          ]}
        />
        {ros ? (
          <span className="field__help">
            <b>{ros.file}</b>: {ros.active} σε δύναμη από {ros.total}
            {ros.essos ? ' · ΕΣΣΟ ' + ros.essos : ''}
            {
              '. Αντιγράφεται στον φάκελο της νέας, οι στρατιώτες μπαίνουν στην εφαρμογή και τα φύλλα που λείπουν (ΤΙΜΩΡΗΜΕΝΟΙ, ΑΔΕΙΕΣ, ΠΟΣΤΑ…) προστίθενται εκεί. '
            }
            <Button variant="link" onClick={pickRoster}>
              Άλλο αρχείο
            </Button>
          </span>
        ) : (
          <span className="field__help">
            Φτιάχνεται κενό ΔΥΝΑΜΟΛΟΓΙΟ {essoName(e)} με όλα τα φύλλα του. Τους στρατιώτες τους γράφεις μετά σε πίνακα,
            τον έναν κάτω από τον άλλον (Γρήγορη εισαγωγή), ή με εισαγωγή.
          </span>
        )}
        {ros?.warnings.map((w) => (
          <Alert key={w} tone="warn">
            <span>{w}</span>
          </Alert>
        ))}
        {rosEsso && (rosEsso.s !== e.s || rosEsso.y !== e.y) && (
          <Alert tone="warn">
            <span>
              Το αρχείο γράφει {essoName(rosEsso)}, ενώ διάλεξες {essoName(e)}
              {'. '}
              <Button variant="link" onClick={() => setE(rosEsso)}>
                Κράτα {essoName(rosEsso)}
              </Button>
            </span>
          </Alert>
        )}
      </div>
      <p className="note">
        Φτιάχνεται επίσης ο ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ {essoName(e)} με το φύλλο του μήνα. Όλα συνδέονται μόνα τους στα «Αρχεία
        Excel».
      </p>
    </>
  );
}

/** Step 4 «Επιβεβαίωση»: the summary and the «Κατάλαβα» box that unlocks the start button. */
export function stepFour(m: WizardModel, info: EssoInfo) {
  const { cur, e, u, root, target, ros, ack, setAck } = m;
  return (
    <>
      <ul className="hist">
        <li>
          Ξεκινά η <b>{essoName(e)}</b>
          {cur ? ' (μετά την ' + essoName(cur) + ')' : ''}.
        </li>
        <li>
          Μονάδα: <b>{UNIT_KINDS.find((k) => k.id === u.unitKind)!.label}</b>, αναφορά <b>{reportOf(u)}</b>
          {' της '}
          {u.unitName}.
        </li>
        <li>
          Αρχείο της τωρινής στο <span className="plan__fn">{root}</span>
        </li>
        <li>
          Νέα Excel στο <span className="plan__fn">{target}</span>
          {': '}
          {ros ? ros.file + ' (' + ros.active + ' στρατιώτες)' : 'κενό Δυναμολόγιο'} και έλεγχος υπηρεσιών
        </li>
      </ul>
      <label className="rule">
        <input
          type="checkbox"
          className="ui-check"
          checked={ack}
          onChange={(ev: ChangeEvent<HTMLInputElement>) => setAck(ev.target.checked)}
        />
        <span>
          <b>Κατάλαβα: η εφαρμογή ξεκινά χωρίς τους {info.people} στρατιώτες της τωρινής ΕΣΣΟ</b>
          <small>Δεν αναιρείται με το «Αναίρεση»· γυρνά πίσω μόνο με την «Επαναφορά ΕΣΣΟ».</small>
        </span>
      </label>
    </>
  );
}

/** The buttons under the wizard: «Άκυρο» + «Συνέχεια» on step 1, «Πίσω» + «Συνέχεια», then «Πίσω» + the start button. */
export function wizardFooter(m: WizardModel, onClose: () => void) {
  const { e, step, setStep, setErr, ack, busy, start } = m;
  const back = (
    <Button
      variant="outline"
      disabled={busy}
      onClick={() => {
        setErr(null);
        setStep(step - 1);
      }}
    >
      Πίσω
    </Button>
  );
  return step === 1 ? (
    <>
      <Button variant="outline" onClick={onClose}>
        Άκυρο
      </Button>
      <Button onClick={() => setStep(2)}>Συνέχεια</Button>
    </>
  ) : step < 4 ? (
    <>
      {back}
      <Button onClick={() => setStep(step + 1)}>Συνέχεια</Button>
    </>
  ) : (
    <>
      <Why text={!ack && !busy && 'Τσέκαρε πρώτα το κουτάκι πιο πάνω'} />
      {back}
      <Button
        variant="destructive"
        disabled={!ack || busy}
        why={!ack ? 'Τσέκαρε πρώτα το κουτάκι πιο πάνω' : undefined}
        onClick={start}
      >
        {busy ? 'Γίνεται…' : 'Ξεκίνα τη ' + essoName(e)}
      </Button>
    </>
  );
}
