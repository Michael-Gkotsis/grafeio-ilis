// «ΗΚΑΙ › Άδειες» (Michael, 18/10): regular, honorary and sick leaves, who is away and when they come back.
// Purpose: `LeavesTab`, the list of leaves with «Ώρες και κατεύθυνση…», «Διόρθωση…» and «Λήξη νωρίτερα…».
// Does NOT: decide which leaves show (model/leaveView.ts does) or edit them (the leave-end and fix-status features do).
// Owner layer: renderer/widgets/status-lists. Why: moved verbatim from screens/leaves.ts (Phase 6.0); the «Καταστάσεις»
//   hub and the ΗΚΑΙ both drop it in as one piece.
// Covering test: test/screens-main.test.ts, test/leaves.test.ts.
import type { ChangeEvent } from 'react';
import { dm, dow } from '../../../../shared/dates';
import { TYPES, fullName, type Status } from '../../../../shared/domain';
import { hasTimes, timesTxt } from '../../../../shared/hours';
import { badgeLbl } from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';
import { RkName } from '../../../entities/person';
import { StatusFixDialog } from '../../../features/fix-status';
import { LeaveEndDialog, LeaveTimesDialog, leaveStarted } from '../../../features/leave-end';
import { Badge, Button, PageHeader, Segmented } from '../../../shared/ui';
import { useLeaves, type LeavesModel } from '../model/useLeaves';
import { whenTxt } from '../model/leaveView';

/** One leave of the list: name link, kind, dates and when, and the buttons that act on it (only in «Τώρα»). */
function leaveItem(m: LeavesModel, s: Status) {
  const { state, today, nav, pm, view, away, setTimes, setFix, setEnd } = m;
  const t = TYPES[s.type];
  const p = pm.get(s.pid)!;
  const tt = timesTxt(s);
  return (
    <li key={s.id}>
      <div>
        <button type="button" className="linkish who" onClick={() => nav.openPerson(s.pid)}>
          <RkName p={p} fn={fullName} />
        </button>{' '}
        <Badge tone={t.tone} data-tip={t.long}>
          {badgeLbl(s, state.settings.lists)}
        </Badge>
        <small>
          {dow(s.from)} {dm(s.from)} – {s.open ? '…' : dow(s.to) + ' ' + dm(s.to)} · {whenTxt(s, today, away)}
          {tt ? ' · ' + tt : ''}
          {s.dest ? ' · → ' + s.dest : ''}
          {s.req ? ' · από αίτηση' : ''}
          {s.note ? ' · ' + s.note : ''}
        </small>
      </div>
      {view === 'now' && hasTimes(s.type) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setTimes(s)}
          data-tip="Ώρα αναχώρησης την πρώτη μέρα, ώρα επιστροφής την τελευταία και κατεύθυνση"
          data-tip-side="left"
        >
          Ώρες και κατεύθυνση…
        </Button>
      )}
      {view === 'now' && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setFix(s)}
          data-tip="Μπήκε λάθος; Άλλαξε είδος, ημερομηνίες, ώρες και κατεύθυνση"
          data-tip-side="left"
        >
          Διόρθωση…
        </Button>
      )}
      {view === 'now' &&
        (leaveStarted(s, today) ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEnd(s)}
            data-tip="Γύρισε νωρίτερα: η άδεια τελειώνει τη μέρα και ώρα που λες"
            data-tip-side="left"
          >
            Λήξη νωρίτερα…
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEnd(s)}
            data-tip="Δεν θα φύγει: η άδεια φεύγει ολόκληρη"
            data-tip-side="left"
          >
            Ακύρωση…
          </Button>
        ))}
    </li>
  );
}

/** Page header, «Τώρα / Έληξαν» switch and the search box. */
function leavesHead(m: LeavesModel) {
  const { nav, view, nNow, nSoon, q, setQ, dq, list } = m;
  return (
    <>
      <PageHeader
        title="Άδειες"
        sub={'Κανονικές, τιμητικές και αναρρωτικές· γράφονται στην ' + HK() + ' και στη Δύναμη.'}
      >
        <Button variant="outline" onClick={() => nav.set({ hkTab: 'req' })}>
          Αιτήσεις
        </Button>
        <Button onClick={() => nav.declare({ cat: 'abs' })}>+ Άδεια</Button>
      </PageHeader>
      <div style={{ marginBottom: '12px' }}>
        <Segmented
          value={view}
          onChange={(v: string) => nav.set({ leaveTab: v })}
          items={[
            {
              value: 'now',
              label: 'Τώρα (' + nNow + (nSoon ? ' + ' + nSoon + ' φεύγουν' : '') + ')',
              tip:
                nNow +
                ' σε άδεια τώρα' +
                (nSoon ? ' και ' + nSoon + ' που φεύγουν τις επόμενες μέρες (δεν μετρούν ακόμα στους απόντες)' : ''),
            },
            { value: 'back', label: 'Έληξαν', tip: 'Όσοι γύρισαν τις τελευταίες 14 μέρες' },
          ]}
        />
      </div>
      <div className="toolbar">
        <input
          type="search"
          className="ui-input"
          aria-label="Αναζήτηση"
          placeholder="Όνομα, είδος άδειας, κατεύθυνση ή σημείωση · Ctrl+F"
          value={q}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
        />
        {dq.trim() && (
          <span className="toolbar__count">
            {list.length} {list.length === 1 ? 'βρέθηκε' : 'βρέθηκαν'}
          </span>
        )}
      </div>
    </>
  );
}

export function LeavesTab() {
  const m = useLeaves();
  const { view, list, times, setTimes, fix, setFix, end, setEnd } = m;
  return (
    <div>
      {leavesHead(m)}
      <div className="ui-card">
        {list.length ? (
          <ul className="rec">{list.map((s) => leaveItem(m, s))}</ul>
        ) : (
          <div className="empty">
            {view === 'now'
              ? 'Κανείς σε άδεια τώρα ή στις επόμενες μέρες.'
              : 'Κανείς δεν γύρισε από άδεια τις τελευταίες 14 μέρες.'}
          </div>
        )}
      </div>
      {times && <LeaveTimesDialog st={times} onClose={() => setTimes(null)} />}
      {fix && <StatusFixDialog st={fix} onClose={() => setFix(null)} />}
      {end && <LeaveEndDialog st={end} onClose={() => setEnd(null)} />}
    </div>
  );
}
