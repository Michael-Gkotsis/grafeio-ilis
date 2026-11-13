// The right column of the «Θέσεις» tab: who is not placed on the day (and why), and the Excel card.
// Purpose: `guardSide`, a plain function called as `{guardSide(G)}`.
// Does NOT: hold state (model/useGuard.ts) or decide who is excluded (model/guardView.ts `excludedOn`).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same markup, text nodes and
//   handlers.
// Covering test: test/screens-main.test.ts.
import { dayName, DOW_FULL, weekday } from '../../../../shared/dates';
import { KIND_LBL, TYPES, type DutyKind, type Person, type TypeKey } from '../../../../shared/domain';
import { statusLbl } from '../../../../shared/ranks';
import { RkName, rkShort } from '../../../entities/person';
import { Badge, Button } from '../../../shared/ui';
import { PrintButton, SigsButton, TemplateNote } from '../../../widgets/export';
import type { ExcludedBy } from '../model/guardView';
import type { Guard } from '../model/useGuard';

// A list of people with the status that keeps them out: a button per person that opens the card.
function pill(G: Guard, list: ExcludedBy[]) {
  const { state, nav } = G;
  return (
    <div className="avail">
      {list.map(({ p, s }) => (
        <button key={p.id} type="button" className="na linkish" onClick={() => nav.openPerson(p.id)}>
          {rkShort(p)}{' '}
          <Badge
            tone={TYPES[s.type as TypeKey].tone}
            data-tip={s.type === 'KOL' && s.note ? 'Κωλυόμενος: ' + s.note : TYPES[s.type as TypeKey].long}
          >
            {s.type === 'LEAVE' ? statusLbl(s, state.settings.lists) : TYPES[s.type as TypeKey].label}
          </Badge>
        </button>
      ))}
    </div>
  );
}

// One line of the summary; every line opens and closes the same detail.
function sumLine(G: Guard, n: number, label: string) {
  const { fold, flip } = G;
  return (
    <li>
      <button type="button" className="linkish" aria-expanded={!!fold.ex} onClick={() => flip('ex', !!fold.ex)}>
        <b>{n}</b>
        {label}
      </button>
    </li>
  );
}

function summary(G: Guard) {
  const { excluded, date, fold, flip } = G;
  return (
    <ul className="side__sum">
      {sumLine(G, excluded.noDuty.length, ' σε καμία υπηρεσία')}
      {sumLine(G, excluded.unarmed.length, ' μόνο σε άοπλες')}
      {excluded.posted.length > 0 && sumLine(G, excluded.posted.length, ' με πόστο')}
      {excluded.epop.length > 0 && sumLine(G, excluded.epop.length, ' ΕΠΟΠ/ΟΒΑ, μόνο με το χέρι')}
      {sumLine(G, excluded.capped.length, ' μόνιμα όχι σε κάποιες θέσεις')}
      {excluded.offDay.length > 0 && (
        <li>
          <button type="button" className="linkish" aria-expanded={!!fold.ex} onClick={() => flip('ex', !!fold.ex)}>
            <b>{excluded.offDay.length}</b> όχι υπηρεσία {DOW_FULL[weekday(date)]}
          </button>
        </li>
      )}
    </ul>
  );
}

// «Με πόστο» and «ΕΠΟΠ/ΟΒΑ»: only by hand, with their post or this month's count.
function postedPart(G: Guard) {
  const { excluded, nav } = G;
  return (
    excluded.posted.length > 0 && (
      <>
        <h3 className="minihd">Με πόστο, μόνο με το χέρι ({excluded.posted.length})</h3>
        <p className="note" style={{ margin: '0 0 6px' }}>
          Η αυτόματη συμπλήρωση δεν τους βάζει πουθενά, ούτε στο Λ/Υ και Δ/Υ. Με το χέρι μπαίνουν σε οποιαδήποτε θέση:
          διάλεξέ τον στη θέση και γράψε την αιτία.
        </p>
        <div className="avail">
          {excluded.posted.map((p: Person) => (
            <button
              key={p.id}
              type="button"
              className="na linkish"
              onClick={() => nav.openPerson(p.id)}
              data-tip="Από το φύλλο ΠΟΣΤΑ (Αρχεία Excel)"
            >
              {rkShort(p)} <Badge tone="outline">{p.post}</Badge>
            </button>
          ))}
        </div>
      </>
    )
  );
}

function epopPart(G: Guard) {
  const { excluded, nav, epopHint } = G;
  return (
    excluded.epop.length > 0 && (
      <>
        <h3 className="minihd">ΕΠΟΠ/ΟΒΑ, μόνο με το χέρι ({excluded.epop.length})</h3>
        <p className="note" style={{ margin: '0 0 6px' }}>
          Η αυτόματη συμπλήρωση δεν τους βάζει. Διάλεξέ τον στη θέση· πάνω από το όριο του μήνα ζητά αιτία. Την απαλλαγή
          του στελέχους τη γράφεις με το χέρι στα Στελέχη.
        </p>
        <div className="avail">
          {excluded.epop.map((p: Person) => (
            <button
              key={p.id}
              type="button"
              className="na linkish"
              onClick={() => nav.openPerson(p.id)}
              data-tip={
                p.cid
                  ? 'Το όριο αλλάζει στα «Στοιχεία» του στελέχους'
                  : 'Το όριο αλλάζει στη «Διόρθωση στοιχείων» της καρτέλας'
              }
            >
              {rkShort(p)} <Badge tone="outline">{epopHint(p)}</Badge>
            </button>
          ))}
        </div>
      </>
    )
  );
}

// The open detail: the lists, with the permanent «όχι» and the days without duty.
function more(G: Guard) {
  const { excluded, date, setProf, flip } = G;
  return (
    <div className="side__more">
      <h3 className="minihd">Σε καμία υπηρεσία ({excluded.noDuty.length})</h3>
      {pill(G, excluded.noDuty)}
      <h3 className="minihd">Μόνο σε άοπλες θέσεις ({excluded.unarmed.length})</h3>
      {pill(G, excluded.unarmed)}
      {postedPart(G)}
      {epopPart(G)}
      <h3 className="minihd">Μόνιμα όχι σε κάποιες θέσεις ({excluded.capped.length})</h3>
      <div className="avail">
        {excluded.capped.map(({ p, c }) => (
          <button
            key={p.id}
            type="button"
            className="na linkish"
            onClick={() => setProf(p.id)}
            data-tip={c.map((o) => o.col.label + ': ' + o.x.why).join(' · ') + ' · Πάτα: «Ποιος κάνει τι»'}
          >
            {rkShort(p)}{' '}
            <Badge tone="outline">
              όχι {c.map((o) => (o.col.block ? o.col.label : KIND_LBL[o.col.kind as DutyKind])).join(', ')}
            </Badge>
          </button>
        ))}
      </div>
      {excluded.offDay.length > 0 && (
        <>
          <h3 className="minihd">
            Όχι υπηρεσία {DOW_FULL[weekday(date)]} ({excluded.offDay.length})
          </h3>
          <div className="avail">
            {excluded.offDay.map(({ p }) => (
              <button
                key={p.id}
                type="button"
                className="na linkish"
                onClick={() => setProf(p.id)}
                data-tip="Πάτα: «Ποιος κάνει τι»"
              >
                <RkName p={p} />
              </button>
            ))}
          </div>
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => setProf(-1)}
        data-tip="Όλοι οι στρατιώτες: ποιες υπηρεσίες κάνει ο καθένας και ποιες μέρες (όπως το αρχείο «Δυνατότητα υπηρεσιών»)"
      >
        Ποιος κάνει τι…
      </Button>
      <p className="note" style={{ margin: '10px 0 0' }}>
        Βγαίνει από τα ιατρικά, τις άδειες και τις εξόδους. Όταν λήξει ένα ιατρικό, ο άνθρωπος ξαναμπαίνει μόνος του.
      </p>
      <Button size="sm" variant="ghost" onClick={() => flip('ex', true)}>
        Λιγότερα
      </Button>
    </div>
  );
}

// The Excel card: the file name, the preview button and the print and signature buttons.
function excelCard(G: Guard) {
  const { date, empty, fileName, setPreview } = G;
  return (
    <section className="xlcard">
      <h2 className="xlcard__hd">Excel</h2>
      <p>
        <span className="mono">{fileName}</span>
        {' · A4 οριζόντιο. '}
        {empty.length
          ? 'Με ' + empty.length + (empty.length === 1 ? ' κενή γράφεται' : ' κενές γράφεται') + ' «ΚΕΝΗ».'
          : 'Πλήρες.'}
      </p>
      <Button variant="outline" onClick={() => setPreview(true)}>
        Προεπισκόπηση
      </Button>
      <PrintButton kind="froura" date={date} label="η κατάσταση υπηρεσιών" />
      <SigsButton kind="froura" date={date} label="η κατάσταση υπηρεσιών" />
      <TemplateNote ids={['froura', 'check']} />
    </section>
  );
}

/** The column. */
export function guardSide(G: Guard) {
  const { date, today, fold, flip } = G;
  return (
    <div className="guard__right">
      <section className="ui-card side">
        <h2 className="side__hd">Δεν μπαίνουν {dayName(date, today).toLowerCase()}</h2>
        {summary(G)}
        {fold.ex ? (
          more(G)
        ) : (
          <button type="button" className="side__link" onClick={() => flip('ex', false)}>
            Ποιοι είναι
          </button>
        )}
      </section>
      {excelCard(G)}
    </div>
  );
}
