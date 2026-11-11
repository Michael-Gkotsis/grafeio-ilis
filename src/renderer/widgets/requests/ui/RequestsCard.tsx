// «5. Αιτήσεις (μέρα)»: the soldiers' requests of the day, numbered as they come out in the ΗΚΑΙ.
// Purpose: `RequestsCard`: every request waits for «Εγκρίθηκε» or «Απορρίφθηκε» (1/11); a leave request with the approval
//   becomes a leave (the ΗΚΑΙ keeps only the request). Old ones without an answer (old) do not count.
// Does NOT: write the commands (model/useRequestsCard.ts does) or edit a request (ui/RequestDialog.tsx does).
// Owner layer: renderer/widgets/requests. Why: moved verbatim from screens/other.ts (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/requests.test.ts.
import { addDays, dm } from '../../../../shared/dates';
import type { PersonRequest } from '../../../../shared/domain';
import { reqWhat } from '../../../../shared/hkaiText';
import { upper } from '../../../../shared/text';
import { HK } from '../../../../shared/unit';
import { RkName } from '../../../entities/person';
import { Badge, Button, Card } from '../../../shared/ui';
import { useRequestsCard, type RequestsCardModel } from '../model/useRequestsCard';
import { ApproveDialog } from './ApproveDialog';
import { RequestDialog } from './RequestDialog';

/** Props of `RequestsCard`. */
export interface RequestsCardProps {
  /** ISODate of the ΗΚΑΙ whose requests are listed. */
  date: string;
}

/** The badge after the sentence: approved, leave cancelled, rejected, waiting, or old without an answer. */
function decisionBadges(m: RequestsCardModel, r: PersonRequest) {
  const gone = r.leave && r.decision === 'ok' && !(r.sid && m.state.statuses.some((x) => x.id === r.sid));
  return (
    <>
      {r.decision === 'ok' && (
        <>
          {' '}
          <Badge
            tone="ok"
            data-tip={r.leave ? 'Έγινε άδεια· στην ' + HK() + ' μένει μόνο η αίτηση' : 'Εγκρίθηκε από τον Διοικητή'}
          >
            Εγκρίθηκε {dm(r.decided!)}
          </Badge>
        </>
      )}
      {gone && (
        <>
          {' '}
          <Badge tone="bad" data-tip="Η άδεια ακυρώθηκε ή διαγράφηκε μετά την έγκριση· η αίτηση έμεινε εγκεκριμένη">
            η άδεια ακυρώθηκε
          </Badge>
        </>
      )}
      {r.decision === 'no' && (
        <>
          {' '}
          <Badge tone="bad">Απορρίφθηκε {dm(r.decided!)}</Badge>
        </>
      )}
      {!r.decision &&
        (r.old ? (
          <>
            {' '}
            <Badge
              tone="outline"
              data-tip="Από πριν την έγκριση σε όλες τις αιτήσεις· δεν μετρά στις αιτήσεις που περιμένουν"
            >
              χωρίς απάντηση (παλιά)
            </Badge>
          </>
        ) : (
          <>
            {' '}
            <Badge tone="warn">Περιμένει απάντηση</Badge>
          </>
        ))}
    </>
  );
}

/** The buttons of a request: answer, take the answer back or change, and delete. */
function requestActions(m: RequestsCardModel, r: PersonRequest) {
  const { decide, approve, setEdit, del } = m;
  return (
    <span className="hk-req__acts">
      {!r.decision && (
        <>
          <Button
            size="sm"
            onClick={() => (r.leave ? approve(r) : decide(r, true))}
            data-tip={
              r.leave
                ? 'Γίνεται άδεια· στην ' + HK() + ' μένει μόνο η αίτηση, δεν ξαναγράφεται'
                : 'Ο Διοικητής ενέκρινε την αίτηση'
            }
          >
            Εγκρίθηκε
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide(r, false)}>
            Απορρίφθηκε
          </Button>
        </>
      )}
      {r.decision ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => decide(r, null)}
          data-tip={
            r.decision === 'ok' && r.leave
              ? 'Η αίτηση ξαναπεριμένει απάντηση και η άδεια βγαίνει'
              : 'Η αίτηση ξαναπεριμένει απάντηση'
          }
        >
          Αναίρεση απόφασης
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>
          Αλλαγή
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => del(r)}>
        Διαγραφή
      </Button>
    </span>
  );
}

/** One request: the sentence, its badge and its buttons. `showDate` adds the day (requests of other days). */
function requestItem(m: RequestsCardModel, r: PersonRequest, showDate: boolean) {
  const p = m.pm.get(r.pid)!;
  return (
    <li key={r.id}>
      <div className="hk-req__row">
        <span>
          {showDate && <span className="num">{dm(r.date)} </span>}
          <button type="button" className="linkish" onClick={() => m.nav.openPerson(p.id)}>
            <RkName p={p} />
          </button>{' '}
          αιτείται {upper(reqWhat(r, m.state.settings.lists))}.{decisionBadges(m, r)}
        </span>
        {requestActions(m, r)}
      </div>
    </li>
  );
}

/** Requests of other days that wait for an answer, and the old ones without an answer below them. */
function otherDays(m: RequestsCardModel) {
  const { other, waitN } = m;
  return (
    other.length > 0 && (
      <div className="field" style={{ marginTop: '10px' }}>
        <span className="field__label">
          Αιτήσεις άλλων ημερών που περιμένουν απάντηση
          {waitN < other.length ? (waitN ? ' και παλιές χωρίς απάντηση' : ': μόνο παλιές χωρίς απάντηση') : ''}
        </span>
        <ul className="hk-req" style={{ listStyle: 'none', paddingLeft: 0 }}>
          {other.map((r) => requestItem(m, r, true))}
        </ul>
      </div>
    )
  );
}

export function RequestsCard({ date }: RequestsCardProps) {
  const m = useRequestsCard(date);
  const { today, list, edit, setEdit, ask, setAsk, decide } = m;
  return (
    <Card
      title={'5. Αιτήσεις (' + (date === today ? 'σήμερα' : dm(date)) + ')'}
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEdit({ date, leave: { type: 'LEAVE', from: addDays(date, 1), to: addDays(date, 1) } })}
          >
            + Αίτηση άδειας
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit({ date })}>
            + Άλλη αίτηση
          </Button>
        </>
      }
    >
      {list.length ? (
        <ol className="hk-req">{list.map((r) => requestItem(m, r, false))}</ol>
      ) : (
        <p className="note" style={{ margin: 0 }}>
          Καμία αίτηση για {dm(date)}. Γράφονται στην {HK()} ως «1. ΣΤΡ (ΠΖ) … : ΑΙΤΕΙΤΑΙ …». Γράφονται μία φορά· με το
          «Εγκρίθηκε» η άδεια μπαίνει στις Άδειες χωρίς να ξαναγραφτεί.
        </p>
      )}
      {otherDays(m)}
      {edit && <RequestDialog req={edit} onClose={() => setEdit(null)} />}
      {ask && (
        <ApproveDialog
          r={ask.r}
          plan={ask.plan}
          onClose={() => setAsk(null)}
          onGo={() => {
            const r = ask.r;
            setAsk(null);
            decide(r, true);
          }}
        />
      )}
    </Card>
  );
}
