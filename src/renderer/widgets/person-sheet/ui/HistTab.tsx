// The «Ιστορικό» tab of the soldier sheet.
// Purpose: `HistTab` lists the statuses with «Ώρες…», «Λήξη νωρίτερα…», «Διόρθωση…», and the last 5 requests.
// Does NOT: open the dialogs (it asks the sheet through the model setters).
// Owner layer: renderer/widgets/person-sheet. Why: moved verbatim from screens/people.ts (Phase 5.3c).
// Covering test: test/people.test.ts, test/status-fix.test.ts.
import { daysBetween, dm, dow } from '../../../../shared/dates';
import { RECORD_CATS, TYPES, type PersonRequest, type Status } from '../../../../shared/domain';
import { hasTimes, timeNames, timesTxt } from '../../../../shared/hours';
import { reqWhat } from '../../../../shared/hkaiText';
import { badgeLbl, medNote } from '../../../../shared/ranks';
import { awayNow } from '../../../../shared/rules';
import { upper } from '../../../../shared/text';
import { HK } from '../../../../shared/unit';
import { leaveStarted } from '../../../features/leave-end';
import { Badge, Button } from '../../../shared/ui';
import type { PersonSheetModel } from '../model/usePersonSheet';
import type { PersonSheetView } from '../model/view';

/** One line of the status history, with the links that open the leave-times, leave-end and fix dialogs. */
function histItem(m: PersonSheetModel, s: Status) {
  const { state, today, nowM, setTimes, setEnd, setFix } = m;
  const lists = state.settings.lists;
  return (
    <li key={s.id}>
      {medNote(s, lists) ? (
        <Badge tone="note">{badgeLbl(s, lists) + ' · σημείωση'}</Badge>
      ) : (
        <Badge tone={TYPES[s.type].tone}>{badgeLbl(s, state.settings.lists)}</Badge>
      )}
      <span className="num">
        {dow(s.from)} {dm(s.from)}
        {s.open ? ' – χωρίς λήξη' : s.to !== s.from ? ' – ' + dow(s.to) + ' ' + dm(s.to) : ''}
      </span>
      <span className="muted">
        ({daysBetween(s.from, s.to)} ημ.{timesTxt(s) ? ', ' + timesTxt(s) : ''}
        {s.dest ? ', → ' + s.dest : ''})
      </span>
      {hasTimes(s.type) && !s.pending && s.to >= today && (
        <Button
          variant="link"
          onClick={() => setTimes(s)}
          data-tip={
            'Ώρα ' + timeNames(s.type).fromG + ' την πρώτη μέρα και ώρα ' + timeNames(s.type).toG + ' την τελευταία'
          }
        >
          Ώρες…
        </Button>
      )}
      {TYPES[s.type].cat === 'abs' && awayNow(s, today, nowM) && (
        <Button
          variant="link"
          onClick={() => setEnd(s)}
          data-tip={
            leaveStarted(s, today)
              ? 'Γύρισε νωρίτερα: η άδεια τελειώνει τη μέρα και ώρα που λες'
              : 'Δεν θα φύγει: η άδεια φεύγει ολόκληρη'
          }
        >
          {leaveStarted(s, today) ? 'Λήξη νωρίτερα…' : 'Ακύρωση…'}
        </Button>
      )}
      {(RECORD_CATS.includes(TYPES[s.type].cat) || s.type === 'KOL' || TYPES[s.type].cat === 'abs') && (
        <Button
          variant="link"
          onClick={() => setFix(s)}
          data-tip={
            TYPES[s.type].cat === 'abs'
              ? 'Μπήκε λάθος; Άλλαξε είδος, ημερομηνίες, ώρες και κατεύθυνση'
              : 'Μπήκε λάθος; Άλλαξε ημερομηνίες και στοιχεία ή διάγραψέ το'
          }
        >
          Διόρθωση…
        </Button>
      )}
      {s.pending && <Badge tone="warn">αιτείται</Badge>}
      {s.to < today && RECORD_CATS.includes(TYPES[s.type].cat) && (
        <span className="muted" style={{ fontSize: '12px' }}>
          έληξε
        </span>
      )}
    </li>
  );
}

/** One request line, with the link to its ΗΚΑΙ day. */
function requestItem(m: PersonSheetModel, r: PersonRequest) {
  const { state, nav } = m;
  return (
    <li key={r.id}>
      <span className="num">
        {dow(r.date)} {dm(r.date)}
      </span>
      αιτείται {upper(reqWhat(r, state.settings.lists))}
      {r.decision && (
        <>
          {' '}
          <Badge tone={r.decision === 'ok' ? 'ok' : 'bad'}>{r.decision === 'ok' ? 'εγκρίθηκε' : 'απορρίφθηκε'}</Badge>
        </>
      )}
      {r.leave && r.decision === 'ok' && !(r.sid && state.statuses.some((x) => x.id === r.sid)) && (
        <>
          {' '}
          <Badge tone="bad">η άδεια ακυρώθηκε</Badge>
        </>
      )}
      {!r.decision && (
        <>
          {' '}
          <Badge tone={r.old ? 'outline' : 'warn'}>{r.old ? 'χωρίς απάντηση (παλιά)' : 'περιμένει'}</Badge>
        </>
      )}
      <Button variant="link" onClick={() => nav.go('hkai', { hkaiDate: r.date })}>
        {HK()}
      </Button>
    </li>
  );
}

/** The «Αιτήσεις» section. */
function requestsSection(m: PersonSheetModel, reqs: PersonRequest[]) {
  return (
    <section>
      <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Αιτήσεις</h3>
      <ul className="hist">{reqs.map((r) => requestItem(m, r))}</ul>
    </section>
  );
}

/** The tab: a plain function the sheet calls, not a component (so it adds no render of its own). */
export function histTab(m: PersonSheetModel, view: PersonSheetView) {
  const { hist, reqs } = view;
  return (
    <>
      <section>
        <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Καταστάσεις</h3>
        {hist.length ? (
          <ul className="hist">{hist.map((s) => histItem(m, s))}</ul>
        ) : (
          <span className="muted">Καμία καταχώρηση ακόμα.</span>
        )}
      </section>
      {reqs.length > 0 && requestsSection(m, reqs)}
    </>
  );
}
