// Step 4 of the declaration: what will change, and «Αποθήκευση».
// Purpose: `reviewStep` returns the Dialog of step 4; the groups of notes are plain helper functions in this file.
// Does NOT: hold state or logic; it reads the `Declare` bag from `useDeclare` and the shared pieces from `stepChrome`.
// Owner layer: renderer/features/declare-status. Why: step 4 was 200 lines of markup in one function
// Covering test: test/screens-dialogs-forms.test.ts, test/status-fix.test.ts.
import { dm, dow, dayName, addDays } from '../../../../shared/dates';
import { statusLbl } from '../../../../shared/ranks';
import { punLbl } from '../../../../shared/punish';
import { KOL_NO_COL, RECORD_CATS, TYPES, fullName, kolColName } from '../../../../shared/domain';
import { timesTxt } from '../../../../shared/hours';
import { upper } from '../../../../shared/text';
import { HK } from '../../../../shared/unit';
import { RkName, rkShort } from '../../../entities/person';
import { ChangePlanList } from '../../../entities/status';
import { Alert, Badge, Button, Dialog } from '../../../shared/ui';
import type { ChangeEvent } from 'react';
import type { Declare } from '../model/useDeclare';
import type { StepChrome } from './chrome';
import type { ReactNode } from 'react';

/** The correction notice and the sentence «Δηλώνεις … τον … από … έως …». */
function reviewIntro(d: Declare, stBadges: ReactNode) {
  const { state, today, pm, fix, cmd, t, hasKind, med, medPicks, open, full } = d;
  const one = cmd.pids.length === 1 && pm.get(cmd.pids[0]);
  return (
    <>
      {fix && (
        <Alert tone="info">
          <span>
            Η παλιά καταχώρηση (
            {fix.type === 'PUN' ? 'ποινή ' + punLbl(fix.kind) : statusLbl(fix, state.settings.lists)},{' '}
            {fix.open
              ? 'από ' + dm(fix.from) + ' χωρίς λήξη'
              : fix.from === fix.to
                ? dm(fix.from)
                : dm(fix.from) + '–' + dm(fix.to)}
            ) φεύγει και στη θέση της γράφεται η παρακάτω.
          </span>
        </Alert>
      )}
      <p style={{ margin: 0 }}>
        {fix ? 'Γράφεται' : 'Δηλώνεις'}{' '}
        {medPicks.length > 1 ? (
          stBadges
        ) : (
          <Badge tone={t.tone}>
            {hasKind
              ? cmd.type === 'PUN'
                ? 'Ποινή: ' + punLbl(cmd.kind)
                : 'Άδεια: ' + cmd.kind
              : med
                ? med.name + (med.warn ? '' : ' (σαν ' + t.label + ')')
                : t.long}
          </Badge>
        )}{' '}
        {one ? (
          <>
            τον{' '}
            <b>
              <RkName p={one} fn={fullName} />
            </b>{' '}
            του {one.father}
          </>
        ) : (
          <>
            <b>{cmd.pids.length} άτομα</b> ({cmd.pids.map((id) => rkShort(pm.get(id)!)).join(', ')})
          </>
        )}
        ,{' '}
        {open ? (
          <>
            από{' '}
            <b>
              {dow(cmd.from)} {dm(cmd.from)}
            </b>
            , <b>χωρίς λήξη</b>
          </>
        ) : cmd.from === cmd.to ? (
          <b>
            {dayName(cmd.from, today).toLowerCase()} {dm(cmd.from)}
          </b>
        ) : (
          <>
            από{' '}
            <b>
              {dow(cmd.from)} {dm(cmd.from)}
            </b>{' '}
            έως{' '}
            <b>
              {dow(cmd.to)} {dm(cmd.to)}
            </b>
          </>
        )}
        {timesTxt(full) ? ' (' + timesTxt(full) + ')' : ''}
        {full.dest ? ', κατεύθυνση ' + full.dest.trim() : ''}.
      </p>
    </>
  );
}

/** The lines written to the medical list, the deprivation end dates and the note-only notice. */
function reviewDetails(d: Declare) {
  const { pm, cmd, medPicks, noteInfo, open, depEnds } = d;
  // one line in the medical list for every medical kind and every soldier
  const rows =
    medPicks.length * cmd.pids.length > 1 ? medPicks.flatMap((x) => cmd.pids.map((pid) => ({ x, pid }))) : [];
  return (
    <>
      {rows.length > 0 && (
        <div className="field">
          <span className="field__label">
            Γράφονται {rows.length} γραμμές στα Ιατρικά, μία για κάθε {medPicks.length > 1 ? 'ιατρικό' : 'στρατιώτη'}
            {medPicks.length > 1 && cmd.pids.length > 1 ? ' και στρατιώτη' : ''}
          </span>
          <ul className="declrows">
            {rows.slice(0, 12).map((r) => (
              <li key={r.x.key + r.pid}>
                <Badge tone={TYPES[r.x.type].tone}>{r.x.short}</Badge> {fullName(pm.get(r.pid)!)} ·{' '}
                {open
                  ? dm(cmd.from) + ' – χωρίς λήξη'
                  : cmd.from === cmd.to
                    ? dm(cmd.from)
                    : dm(cmd.from) + '–' + dm(cmd.to)}
                {cmd.note ? ' · ' + upper(cmd.note) : ''}
              </li>
            ))}
          </ul>
          {rows.length > 12 && <span className="muted">και άλλες {rows.length - 12}</span>}
        </div>
      )}
      {depEnds.length > 0 && (
        <Alert tone="info">
          <span>
            {depEnds.map((x, i) => (
              <span key={x.pid}>
                {i > 0 && <br />}
                <b>
                  <RkName p={pm.get(x.pid)!} />
                </b>{' '}
                λήγει{' '}
                <b>
                  {dow(x.to)} {dm(x.to)}
                </b>
                , γιατί έχει υπηρεσία ή βραδινή εκπαίδευση μέσα στις μέρες της ποινής.
              </span>
            ))}
          </span>
        </Alert>
      )}
      {noteInfo && (
        <Alert tone="info">
          <span>
            Μόνο σημείωση: δεν αλλάζει υπηρεσίες, έξοδο, ΗΚΑΙ και Δύναμη. Φαίνεται στην καρτέλα του και στα Ιατρικά ›
            Σημειώσεις.
          </span>
        </Alert>
      )}
    </>
  );
}

/** What the plan changes, its conflicts, the unlock of past days and the other statuses alongside. */
function reviewPlan(d: Declare) {
  const { state, pm, unlock, setUnlock, plan } = d;
  return (
    <>
      {plan && plan.files.length > 0 && (
        <div className="field">
          <span className="field__label">Επηρεάζει</span>
          <ChangePlanList plan={plan} />
        </div>
      )}
      {plan && plan.conflicts.length > 0 && (
        <Alert tone="warn">Μετά την αποθήκευση θα σου προταθεί αντικαταστάτης στις Υπηρεσίες.</Alert>
      )}
      {plan && (plan.past.length > 0 || unlock) && (
        <label className="rule">
          <input
            type="checkbox"
            className="ui-check"
            checked={unlock}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setUnlock(e.target.checked)}
          />
          <span>
            <b>Ξεκλείδωσε τις περασμένες μέρες</b>
            <small>
              Βγαίνει και από υπηρεσίες που έχουν ήδη γίνει (π.χ. διόρθωση λάθους). Αλλιώς αυτές μένουν όπως έγιναν.
            </small>
          </span>
        </label>
      )}
      {plan && plan.alongside.length > 0 && (
        <Alert tone="info">
          <span>
            {plan.alongside.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: plan rows have no id and are rebuilt with the plan
              <span key={i}>
                {i > 0 && <br />}
                <b>
                  <RkName p={pm.get(a.pid)!} />
                </b>{' '}
                έχει ήδη {statusLbl(a.status, state.settings.lists)}{' '}
                {a.status.open ? 'χωρίς λήξη' : dm(a.status.from) + '–' + dm(a.status.to)}.
              </span>
            ))}
            <br />
            Ισχύουν και τα δύο· στις υπηρεσίες και στην έξοδο μετρά ο πιο αυστηρός περιορισμός.
          </span>
        </Alert>
      )}
    </>
  );
}

/** The closing notes of the review. */
function reviewNotes(d: Declare) {
  const { ack, cmd, t, isKol, open } = d;
  return (
    <>
      {isKol && (
        <span className="note">
          <b>{cmd.note.trim()}</b>.{' '}
          {cmd.minus
            ? 'Αφαιρείται από τους παρόντες' +
              (cmd.hkCol === KOL_NO_COL
                ? ' και μετρά στους κωλυόμενους της Δύναμης, δεν μπαίνει στην ' + HK() + '.'
                : ' και μετρά στην ' + HK() + ', στη στήλη «' + kolColName(cmd.hkCol) + '».')
            : 'Μένει στους παρόντες και δεν μπαίνει στην ' + HK() + '.'}{' '}
          {cmd.noOut ? 'Δεν βγαίνει έξοδο.' : 'Βγαίνει κανονικά έξοδο.'} Δεν μπαίνει στις δικές μας υπηρεσίες.
        </span>
      )}
      {RECORD_CATS.includes(t.cat) && cmd.type !== 'PUN' && (
        <span className="note">
          {open
            ? 'Χωρίς λήξη: μένει μέχρι να πατήσεις «Λήξη νωρίτερα…» στα Ιατρικά.'
            : 'Στις ' + dm(addDays(cmd.to, 1)) + ' αφαιρείται αυτόματα και γράφεται στο Ιστορικό.'}
        </span>
      )}
      {ack && (
        <Alert tone="warn">
          <span>Δηλώνεται παρά την προειδοποίηση (επικάλυψη ή «δεν βγαίνει έξοδο»).</span>
        </Alert>
      )}
      <span className="note">Μπορείς να το αναιρέσεις αμέσως μετά ή από το Ιστορικό.</span>
    </>
  );
}

/** Step 4: what will change, then «Αποθήκευση». */
export function reviewStep(d: Declare, chrome: StepChrome) {
  const { setStep, onClose, apply } = d;
  const { desc, dirty, stBadges } = chrome;
  return (
    <Dialog
      title="Τι θα αλλάξει"
      description={desc}
      dirty={dirty}
      onClose={onClose}
      closeOnOverlay={false}
      footer={
        <>
          <Button variant="outline" onClick={() => setStep(3)}>
            Πίσω
          </Button>
          <Button onClick={apply}>Αποθήκευση</Button>
        </>
      }
    >
      {reviewIntro(d, stBadges)}
      {reviewDetails(d)}
      {reviewPlan(d)}
      {reviewNotes(d)}
    </Dialog>
  );
}
