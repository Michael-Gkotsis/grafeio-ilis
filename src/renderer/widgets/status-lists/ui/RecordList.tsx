// «Ιατρικά» and «ΗΚΑΙ › Ποινές»: one list of medical records or penalties, with tabs, search and corrections.
// Purpose: `RecordList` (mode 'med' or 'pun'), its tabs, kind filters and the «Λήξη νωρίτερα» / «Διόρθωση…» / «Κείμενο»
//   buttons.
// Does NOT: decide what each tab lists (model/view.ts does), write the records (the commands do) or draw the dialogs
//   it opens (features/leave-end, features/fix-status and ui/PunTextDialog.tsx do).
// Owner layer: renderer/widgets/status-lists. Why: moved verbatim from screens/other.ts (Phase 6.0); «Ιατρικά» and the
//   ΗΚΑΙ both drop it in as one piece. Ίδια λίστα, άλλο φίλτρο (Michael, 18/10).
// Covering test: test/screens-main.test.ts, test/screens-tabs.test.ts, test/note-only.test.ts.
import type { ChangeEvent } from 'react';
import { addDays, dayName, dm, dow } from '../../../../shared/dates';
import { TYPES, effects, fullName, type Status } from '../../../../shared/domain';
import { hasTimes } from '../../../../shared/hours';
import { medNote, statusLbl } from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';
import { RkName, rkShort } from '../../../entities/person';
import { StatusFixDialog } from '../../../features/fix-status';
import { LeaveEndDialog } from '../../../features/leave-end';
import { Badge, Button, DateBar, Dialog, PageHeader, Segmented, Strip } from '../../../shared/ui';
import { detailTxt, emptyTxt, punByTxt, skipTxt } from '../model/view';
import { useRecordList, type RecordListModel } from '../model/useRecordList';
import { PunTextDialog } from './PunTextDialog';

/** Props of `RecordList`. */
export interface RecordListProps {
  /** 'med' is the «Ιατρικά» screen, 'pun' the «Ποινές» tab of the ΗΚΑΙ. */
  mode: 'med' | 'pun';
}

/** Header, tab switch and (for «Μεταβολές ημέρας») the day bar. */
function recordHead(m: RecordListModel) {
  const { mode, nav, today, tab, hasNotes, nMed, nNote, nPun, chDay, y } = m;
  return mode === 'med' ? (
    <>
      <PageHeader title="Ιατρικά" sub="Όταν λήξει ένα ιατρικό, αφαιρείται μόνο του την επόμενη μέρα.">
        <Button onClick={() => nav.declare({ cat: 'med', from: today, to: addDays(today, 2) })}>+ Ιατρικό</Button>
      </PageHeader>
      <div style={{ marginBottom: '12px' }}>
        <Segmented
          value={tab}
          onChange={(v: string) => nav.set({ recTab: v })}
          items={[
            { value: 'med', label: 'Τώρα (' + nMed + ')', tip: 'Όσα ισχύουν τώρα' },
            { value: 'changes', label: 'Μεταβολές ημέρας', tip: 'Όσα ξεκινούν ή λήγουν τη μέρα που διαλέγεις' },
            { value: 'expired', label: 'Έληξαν', tip: 'Όσα έληξαν τις τελευταίες 14 μέρες' },
            ...(hasNotes
              ? [
                  {
                    value: 'notes',
                    label: 'Σημειώσεις (' + nNote + ')',
                    tip: 'Ιατρικά «μόνο σημείωση»: φαίνονται μόνο εδώ και στην καρτέλα του στρατιώτη',
                  },
                ]
              : []),
          ]}
        />
        {tab === 'changes' && (
          <span style={{ marginLeft: '12px' }}>
            <DateBar
              value={chDay}
              onChange={(d: string) => nav.set({ recDate: d })}
              days={[y, today, addDays(today, 1)]}
            />
          </span>
        )}
      </div>
    </>
  ) : (
    <>
      <PageHeader title="Ποινές" sub={'Ισχύουν αμέσως και γράφονται στην ' + HK() + ' της μέρας που επιβλήθηκαν.'}>
        <Button onClick={() => nav.declare({ cat: 'pun', from: today, to: addDays(today, 4) })}>+ Ποινή</Button>
      </PageHeader>
      <div style={{ marginBottom: '12px' }}>
        <Segmented
          value={tab}
          onChange={(v: string) => nav.set({ punTab: v })}
          items={[
            { value: 'pun', label: 'Τώρα (' + nPun + ')', tip: 'Όσες ισχύουν τώρα' },
            { value: 'expired', label: 'Έληξαν', tip: 'Όσες έληξαν τις τελευταίες 14 μέρες' },
            { value: 'allpun', label: 'Όλες', tip: 'Όλες οι ποινές, με αναζήτηση' },
          ]}
        />
      </div>
    </>
  );
}

/** The search box with the number found. */
function recordSearch(m: RecordListModel) {
  const { mode, pq, setPq, dpq, list } = m;
  return (
    <div className="toolbar">
      <input
        type="search"
        className="ui-input"
        aria-label="Αναζήτηση"
        placeholder={
          mode === 'med'
            ? 'Όνομα, κωδικός (π.χ. ΕΥ) ή σημείωση · Ctrl+F'
            : 'Όνομα, είδος ποινής, ποιος τιμώρησε ή λόγος · Ctrl+F'
        }
        value={pq}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setPq(e.target.value)}
      />
      {dpq.trim() && (
        <span className="toolbar__count">
          {list.length} {list.length === 1 ? 'βρέθηκε' : 'βρέθηκαν'}
        </span>
      )}
    </div>
  );
}

/** ΕΥ, ΕΑ, ΕΟ, ΣΤΕΠ… chips with how many people have each one (only when there is more than one kind). */
function medFilters(m: RecordListModel) {
  const { tab, medCnt, nMed, medF, nav } = m;
  return (
    tab === 'med' &&
    medCnt.length > 1 && (
      <div className="filters">
        <Strip role="group" aria-label="Είδος ιατρικού">
          {[
            ['', 'Όλα', nMed] as [string, string, number],
            ...medCnt.map(([l, n]) => [l, l, n] as [string, string, number]),
          ].map(([k, l, n]) => (
            <button
              key={k || 'all'}
              type="button"
              className="ui-chip"
              aria-pressed={medF === k}
              onClick={() => nav.set({ medF: medF === k ? '' : k })}
            >
              {l}
              <span className="cnt">{n}</span>
            </button>
          ))}
        </Strip>
      </div>
    )
  );
}

/** The last button of a line: «Αυτόματα» / «Έληξε» / «Ισχύει» or «Λήξη νωρίτερα…». */
function recordEnd(m: RecordListModel, s: Status) {
  const { tab, today, setEnd, setStop } = m;
  if (tab === 'expired') return <Badge tone="ok">Αυτόματα</Badge>;
  if (tab === 'allpun' || s.to < today)
    return <Badge tone={s.to < today ? 'outline' : 'warn'}>{s.to < today ? 'Έληξε' : 'Ισχύει'}</Badge>;
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => (hasTimes(s.type) ? setEnd(s) : setStop(s))}
      data-tip={'Μόνο αν σταμάτησε πριν από τις ' + dm(s.to) + ' (π.χ. τον έκοψε ο γιατρός). Αλλιώς λήγει μόνο του.'}
      data-tip-side="left"
    >
      Λήξη νωρίτερα…
    </Button>
  );
}

/** One record of the list: name link, kind, dates and when, and the buttons that act on it. */
function recordItem(m: RecordListModel, s: Status) {
  const { nav, state, pm, nl, tab, today, chDay, y, setFix, setTxt } = m;
  const t = TYPES[s.type];
  const p = pm.get(s.pid)!;
  return (
    <li key={s.id}>
      <div>
        <button type="button" className="linkish who" onClick={() => nav.openPerson(s.pid)}>
          <RkName p={p} fn={fullName} />
        </button>{' '}
        <Badge tone={medNote(s, nl) ? 'note' : t.tone} data-tip={t.long}>
          {statusLbl(s, state.settings.lists)}
        </Badge>
        <small>
          {dow(s.from)} {dm(s.from)} – {s.open ? '…' : dow(s.to) + ' ' + dm(s.to)} ·{' '}
          {detailTxt(s, tab, today, chDay, y)}
          {tab !== 'expired' && tab !== 'changes' && tab !== 'notes' && effects(t) ? ' · ' + effects(t) : ''}
          {s.note ? ' · ' + s.note : ''}
          {punByTxt(s)}
          {skipTxt(state, s)}
        </small>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setFix(s)}
        data-tip="Μπήκε λάθος; Άλλαξε ημερομηνίες και στοιχεία ή διάγραψέ το"
        data-tip-side="left"
      >
        Διόρθωση…
      </Button>
      {s.type === 'PUN' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setTxt(s)}
          data-tip="Έτοιμο κείμενο για το Word, με «Αντιγραφή»"
          data-tip-side="left"
        >
          Κείμενο
        </Button>
      )}
      {recordEnd(m, s)}
    </li>
  );
}

/** «Λήξη νωρίτερα;» for a record without times: ends it from today, after a question. */
function stopDialog(m: RecordListModel, stop: Status) {
  const { pm, today, run, act, setStop } = m;
  const t = TYPES[stop.type];
  const p = pm.get(stop.pid)!;
  const what = (stop.type === 'PUN' ? 'Η ποινή' : t.label) + ' του ' + rkShort(p);
  return (
    <Dialog
      role="alertdialog"
      title="Λήξη νωρίτερα;"
      description={what + ' · ' + dm(stop.from) + '–' + (stop.open ? 'χωρίς λήξη' : dm(stop.to))}
      onClose={() => setStop(null)}
      footer={
        <>
          <Button variant="outline" data-autofocus="" onClick={() => setStop(null)}>
            Όχι, να λήξει κανονικά
          </Button>
          <Button
            onClick={async () => {
              const x = stop;
              setStop(null);
              await act(() => run({ t: 'endStatus', id: x.id }, false), what + ': σταμάτησε, από σήμερα δεν ισχύει')();
            }}
          >
            Ναι, από σήμερα δεν ισχύει
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        {what}{' '}
        {stop.open ? (
          <>
            είναι <b>χωρίς λήξη</b>
          </>
        ) : (
          <>
            θα έληγε{' '}
            <b>
              {dayName(stop.to, today).toLowerCase()} {dm(stop.to)}
            </b>
          </>
        )}
        . Αν πατήσεις «Ναι», σταματά τώρα: από σήμερα{' '}
        {t.noDuty
          ? 'ξαναμπαίνει σε υπηρεσίες'
          : t.noArmed
            ? 'ξαναμπαίνει και σε ένοπλες θέσεις'
            : t.noOut
              ? 'μπορεί να βγει έξοδο'
              : 'δεν ισχύει'}
        .
      </p>
    </Dialog>
  );
}

export function RecordList({ mode }: RecordListProps) {
  const m = useRecordList(mode);
  const { list, tab, today, chDay, stop, txt, setTxt, end, setEnd, fix, setFix } = m;
  return (
    <div>
      {recordHead(m)}
      {recordSearch(m)}
      {medFilters(m)}
      <div className="ui-card">
        {list.length ? (
          <ul className="rec">{list.map((s) => recordItem(m, s))}</ul>
        ) : (
          <div className="empty">{emptyTxt(mode, tab, today, chDay)}</div>
        )}
      </div>
      {stop && stopDialog(m, stop)}
      {txt && <PunTextDialog st={txt} onClose={() => setTxt(null)} />}
      {end && <LeaveEndDialog st={end} onClose={() => setEnd(null)} />}
      {fix && <StatusFixDialog st={fix} onClose={() => setFix(null)} />}
      {tab === 'med' && (
        <p className="note" style={{ marginTop: '8px' }}>
          ΕΟ = ελεύθερος ορθοστασίας, ΕΑ = ελεύθερος ασκήσεων, ΕΥ = ελεύθερος υπηρεσίας. ΣΤΕΠ = εισαγωγή ΣΤΕΠ.
        </p>
      )}
    </div>
  );
}
