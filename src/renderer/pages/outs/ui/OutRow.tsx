// One person's line in the «Εξοδούχοι» list: name, room and unit, a note field and the Μένει / Έξοδος / ΔΝ choice.
// Purpose: `OutRow`, memoised so a click re-renders only the line that changed.
// Does NOT: hold the draft (the screen does; `onSet` and `onNote` are stable callbacks).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6); same props, markup and text
//   nodes.
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { memo, type CSSProperties } from 'react';
import { RkName, rkFull } from '../../../entities/person';
import { cx } from '../../../shared/lib/cx';
import { TYPES, fullName, roomTxt, type Person, type Status } from '../../../../shared/domain';
import { awayName } from '../../../../shared/outsStay';
import { OUT_OPTS, OUT_OPTS_SAT, type OutVal, type SunWhy } from '../model/view';

const DNSK_TIP =
  'ΔΝ το Σάββατο και ΔΝ την Κυριακή (μπαίνει μόνη της). Αν την Κυριακή έχει υπηρεσία ή κάτι τον κρατά μέσα, μένει μόνο η ΔΝ του Σαββάτου και γυρίζει Κυριακή πρωί· αν ξεκινά άδεια, φεύγει για άδεια. Τη Δευτέρα γυρνά στην ώρα επιστροφής ΔΝ.';
/** Tip of the away label: a person on leave is neither out nor «Παραμένων». */
export const AWAY_TIP = 'Σε άδεια: δεν είναι ούτε εξοδούχος ούτε παραμένων. Για να μείνει μέσα, άλλαξε την άδεια.';

/** Props of {@link OutRow}. */
export interface OutRowProps {
  p: Person;
  unit: string;
  style: CSSProperties;
  /** Why the rules keep the person in (`null`: nothing). Such a person can still be picked, with a warning. */
  reason: string | null | undefined;
  /** Leave or hospital at the time of going out, and its sentence. */
  away: Status | undefined;
  awayTxt: string | undefined;
  value: OutVal | undefined;
  changed: boolean;
  onSet: (pid: number, v: OutVal | null) => void;
  onOpen: (pid: number) => void;
  /** ΔΝ rights are set for somebody, and not for this person. */
  noDn: boolean;
  sat: boolean;
  /** «ΔΝ ΣΚ»: what keeps the person in on Sunday, or that a leave starts then. */
  sun: SunWhy | null;
  /** Sunday: came in by themselves from Saturday's «ΔΝ ΣΚ». */
  wkNote: boolean;
  /** The day's note, written in brackets next to the status («ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)», Michael 18/10). */
  note: string;
  onNote: (pid: number, v: string) => void;
}

/** The line of one person. */
export const OutRow = memo(function OutRow(props: OutRowProps) {
  const { p, unit, style, reason, away, awayTxt, value, changed, onSet, onOpen, noDn, sat, sun, wkNote, note, onNote } =
    props;
  return (
    <div className={cx('orow', changed && 'is-changed', reason && !away && 'is-blocked')} style={style}>
      <div>
        <button type="button" className="linkish" onClick={() => onOpen(p.id)}>
          <b>
            <RkName p={p} fn={fullName} />
          </b>
        </button>
        <small>
          {roomTxt(p)} · {unit}
          {p.dn ? ' · δικαίωμα ΔΝ' : ''}
          {wkNote && ' · από ΔΝ ΣΚ'}
          {away ? (
            <>
              {' · '}
              <span className="orow__away" data-tip={AWAY_TIP}>
                {awayTxt}
              </span>
            </>
          ) : (
            reason && (
              <>
                {' · '}
                <span
                  className="orow__warn"
                  data-tip={
                    reason + '. Σύμφωνα με τους κανόνες δεν βγαίνει έξοδο· αν τον βγάλεις, θα ζητηθεί επιβεβαίωση'
                  }
                >
                  ⚠ {reason}
                </span>
              </>
            )
          )}
          {value === 'DNSK' && sun && (
            <>
              {' · '}
              <span
                className="orow__warn"
                data-tip={
                  'Κυριακή: ' +
                  sun.why +
                  '. ' +
                  (sun.leave
                    ? 'Την Κυριακή ξεκινά η άδειά του: μένει μόνο η ΔΝ του Σαββάτου'
                    : 'Την Κυριακή δεν μπαίνει ΔΝ: μένει μόνο η ΔΝ του Σαββάτου')
                }
              >
                Κυριακή: {sun.why}
                {sun.leave ? '' : ', γυρίζει Κυριακή πρωί'}
              </span>
            </>
          )}
        </small>
      </div>
      <input
        className="ui-input orow__note"
        aria-label={'Παρατήρηση ' + rkFull(p)}
        placeholder="Παρατήρηση"
        data-tip="Προαιρετική. Γράφεται σε παρένθεση δίπλα στην κατάσταση, π.χ. «ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)», και στο Excel"
        value={note}
        onChange={(e) => onNote(p.id, e.target.value)}
      />
      {/* biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="group" as before */}
      <div className="ui-seg ui-seg--sm" role="group" aria-label={'Έξοδος ' + rkFull(p)}>
        {(sat ? OUT_OPTS_SAT : OUT_OPTS).map((o) => {
          const warn =
            o.value && reason
              ? 'Δεν βγαίνει έξοδο (' + reason + '): θα ζητηθεί επιβεβαίωση'
              : (o.value === 'DN' || o.value === 'DNSK') && noDn
                ? 'Δεν έχει δικαίωμα ΔΝ: θα ζητηθεί επιβεβαίωση'
                : undefined;
          const aw: Status | null = o.value ? null : away || null;
          return (
            <button
              key={o.value}
              type="button"
              className={aw ? 'is-away is-away--' + TYPES[aw.type].tone : warn ? 'is-warn' : undefined}
              data-tip={aw ? AWAY_TIP : warn || (o.value === 'DNSK' ? DNSK_TIP : undefined)}
              aria-pressed={(value || '') === o.value}
              onClick={() => onSet(p.id, o.value || null)}
            >
              {aw ? awayName(aw) : o.label}
              {warn ? ' ⚠' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
});
