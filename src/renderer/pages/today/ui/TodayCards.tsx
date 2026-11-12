// The cards of «Σήμερα»: onboarding, tasks, away, prevented (κωλυόμενοι), returns, endings and news.
// Purpose: plain functions that return the markup of one card each; `TodayScreen` calls them as `{card(x)}`.
// Does NOT: hold state (they read what `useToday()` returned), or become components (that would add renders).
// Owner layer: renderer/pages/today. Why: moved from screens/today.ts (Phase 6) to keep the screen under 150 lines.
// Covering test: test/screens-main.test.ts (HTML snapshot), test/notes.test.ts, test/today-page-view.test.ts.
import { RkName } from '../../../entities/person';
import { ReturnsList } from '../../../widgets/returns-list';
import { SRC } from '../../../shared/lib/auditSource';
import type { Nav } from '../../../shared/model';
import { Badge, Button, Card } from '../../../shared/ui';
import { TYPES, type AppState } from '../../../../shared/domain';
import { appTitle } from '../../../../shared/brand';
import { strengthAt } from '../../../../shared/rules';
import { statusLbl } from '../../../../shared/ranks';
import { UNIT, HK } from '../../../../shared/unit';
import type { useToday } from '../model/useToday';
import {
  kolBadge,
  kolBadgeTip,
  kolNote,
  newsDay,
  recordWhat,
  untilText,
  type EndRow,
  type TodayTask,
} from '../model/view';

/** What `useToday()` returns, passed to every card. */
type Today = ReturnType<typeof useToday>;

/** The welcome card shown while there are no soldiers yet. */
export function onboarding(state: AppState, nav: Nav) {
  return (
    <div className="onboard">
      <Card title={'Καλώς ήρθες στο ' + appTitle(state.settings)}>
        <p style={{ marginTop: 0 }}>
          Για να ξεκινήσεις χρειάζεται το προσωπικό {UNIT().nom === 'Λόχος' ? 'του Λόχου' : 'της Ίλης'}. Πάρ' το από το
          Δυναμολόγιο (το αρχείο .xlsm με το φύλλο «ΣΥΝΟΛΙΚΟ»).
        </p>
        <ol>
          <li>
            Πάτα <b>Εισαγωγή Δυναμολογίου</b> και διάλεξε το αρχείο.
          </li>
          <li>
            Δες τι βρέθηκε και πάτα <b>Εισαγωγή</b>.
          </li>
          <li>
            Στις <b>Ρυθμίσεις</b> βάλε τα στελέχη ανά βαθμό για την {HK()}.
          </li>
        </ol>
        <Button onClick={() => nav.go('templates', { tab: 'import' })}>Εισαγωγή Δυναμολογίου</Button>
      </Card>
    </div>
  );
}

/** «Πρέπει σήμερα»: the numbered tasks, or the all-clear line. */
export function tasksCard(tasks: TodayTask[]) {
  return (
    <Card
      flush={true}
      title="Πρέπει σήμερα"
      actions={<span className="card__meta">{tasks.length ? tasks.length + ' ανοιχτά' : 'όλα εντάξει'}</span>}
    >
      {tasks.length ? (
        <ol className="tasks">
          {tasks.map((t, i) => (
            <li key={t.key}>
              <span className="tasks__n">{i + 1}</span>
              <div>
                <b>{t.title}</b>
                <small className={t.urgent ? 'txt-bad' : undefined}>{t.sub}</small>
              </div>
              <Button variant={i === 0 ? 'default' : 'outline'} onClick={t.fn}>
                {t.btn}
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty">Όλα εντάξει. Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.</div>
      )}
    </Card>
  );
}

/** «Απόντες σήμερα»: the first 12 away, each with the reason and until when. */
export function awayCard({ state, today, nav, away, outUntil }: Today) {
  return (
    <Card
      flush={true}
      title={'Απόντες σήμερα · ' + away.length}
      actions={
        <Button size="sm" variant="ghost" onClick={() => nav.go('strength', { strengthDate: today, svCat: 'away' })}>
          Δύναμη
        </Button>
      }
    >
      {away.length ? (
        <>
          <ul className="rows">
            {away.slice(0, 12).map(({ p, s }) => (
              <li key={s.id}>
                <button type="button" className="linkish" onClick={() => nav.openPerson(p.id)}>
                  <RkName p={p} />
                </button>
                <Badge tone={TYPES[s.type].tone} className="tag" data-tip={TYPES[s.type].long} data-tip-side="left">
                  {statusLbl(s, state.settings.lists)} {TYPES[s.type].cat === 'out' ? outUntil(s) : untilText(s)}
                </Badge>
              </li>
            ))}
          </ul>
          {away.length > 12 && <p className="note rows__more">Και άλλοι {away.length - 12} στη Δύναμη.</p>}
        </>
      ) : (
        <div className="empty">Κανείς δεν λείπει σήμερα.</div>
      )}
    </Card>
  );
}

/** «Κωλυόμενοι»: prevented people declared today, and how many leave the present count. */
export function kolCard({ state, today, nav, kol }: Today) {
  return (
    <Card
      flush={true}
      title={'Κωλυόμενοι · ' + kol.man.length}
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => nav.go('strength', { strengthDate: today, svCat: kol.minus.length ? 'kol' : 'present' })}
          data-tip="Δύναμη, με τους κωλυόμενους και γιατί"
        >
          Δύναμη
        </Button>
      }
    >
      <ul className="rows">
        {kol.man.map(({ p, st, col, minus }) => (
          <li key={st.id}>
            <span style={{ minWidth: 0 }}>
              <button type="button" className="linkish" onClick={() => nav.openPerson(p.id)}>
                <RkName p={p} />
              </button>
              <small className="muted" style={{ display: 'block' }}>
                {kolNote(st, state.settings.lists)}
                {st.noOut || st.type === 'LEAVE' ? ' · χωρίς έξοδο' : ''} · {untilText(st)}
              </small>
            </span>
            <Badge
              tone={minus ? 'warn' : 'outline'}
              className="tag"
              data-tip={kolBadgeTip(minus, col)}
              data-tip-side="left"
            >
              {kolBadge(minus, col)}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="note rows__more">
        {kol.minus.length} αφαιρούνται από τους παρόντες
        {kol.keep.length ? ', ' + kol.keep.length + ' μένουν παρόντες' : ''}.
      </p>
    </Card>
  );
}

/** «Ποιοι γυρίζουν και πότε»: the returns list of today. */
export function returnsCard({ state, today, nav, now }: Today) {
  return (
    <Card
      flush={true}
      title="Ποιοι γυρίζουν και πότε"
      actions={
        <Button size="sm" variant="ghost" onClick={() => nav.go('outs', { outDate: today })}>
          Εξοδούχοι
        </Button>
      }
    >
      <ReturnsList date={today} limit={12} at={strengthAt(state.rules, today, today, now)} />
    </Card>
  );
}

/** «Λήγουν»: records that expired yesterday, end today or end tomorrow. */
export function endsCard({ state, nav, pm, scan }: Today, ends: EndRow[]) {
  return (
    <Card
      flush={true}
      title="Λήγουν"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => nav.go('records', { recTab: scan.expired.length ? 'expired' : 'med' })}
        >
          Ιατρικά
        </Button>
      }
    >
      <ul className="rows">
        {ends.map(({ s, when, tip }) => (
          <li key={s.id}>
            <button type="button" className="linkish" onClick={() => nav.openPerson(s.pid)}>
              <RkName p={pm.get(s.pid)!} />
            </button>
            <span className="muted" data-tip={tip || undefined} data-tip-side="left">
              {recordWhat(s, state.settings.lists)} · {when}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** «Από το προηγούμενο άνοιγμα»: the first 10 actions since the last visit. */
export function newsCard({ today, nav, news }: Today) {
  return (
    <Card
      flush={true}
      title="Από το προηγούμενο άνοιγμα"
      actions={
        <Button size="sm" variant="ghost" onClick={() => nav.go('history')}>
          Όλο το ιστορικό
        </Button>
      }
    >
      <ul className="log log--compact">
        {news.slice(0, 10).map((e) => (
          <li key={e.id}>
            <span className="log__time">
              {newsDay(e.day, today)}
              <b>{e.at}</b>
            </span>
            <div>{e.text}</div>
            <span className="log__src">{SRC[e.source][0]}</span>
          </li>
        ))}
      </ul>
      {news.length > 10 && (
        <p className="note" style={{ margin: '8px 0 0' }}>
          Και άλλες {news.length - 10} ενέργειες στο Ιστορικό.
        </p>
      )}
    </Card>
  );
}
