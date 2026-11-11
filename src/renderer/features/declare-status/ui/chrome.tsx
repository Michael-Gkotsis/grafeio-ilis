// What every step of the declaration dialog shares: the title line with the steps, the summary of earlier choices.
// Purpose: `stepChrome` builds `ttl`, `desc` (the «1 Στρατιώτης › 2 Κατάσταση …» line), `who`, `dirty`, `stBadges`,
//   `sum` (the «Αλλαγή» summary bar) and `errNode` (the error, with the «Προσοχή» warning written out).
// Does NOT: use hooks or hold state; it is a plain function called once per render by `DeclareStatusDialog`.
// Owner layer: renderer/features/declare-status. Why: these pieces were local `const`s of the dialog and each step reads them.
// Covering test: test/screens-dialogs-forms.test.ts, test/status-fix.test.ts.
import type { ReactNode } from 'react';
import { TYPES } from '../../../../shared/domain';
import { Badge, Button } from '../../../shared/ui';
import { statusLbl } from '../../../../shared/ranks';
import { rkFull } from '../../../entities/person';
import type { Declare } from '../model/useDeclare';
import { STEPS } from '../model/statusPicks';
import { declareWarning } from './warning';

/** The pieces every step puts into its dialog. */
export interface StepChrome {
  /** The dialog title: «Δήλωση κατάστασης» or «Διόρθωση: …». */
  ttl: string;
  /** The small line under the title; the current step is bold. */
  desc: ReactNode;
  /** The person's full name, or «N άτομα». */
  who: string;
  /** What is lost when the dialog closes (a string for the question), or false while nobody is chosen. */
  dirty: string | false;
  /** The chosen status as badges. */
  stBadges: ReactNode;
  /** «Στρατιώτης · Κατάσταση · Αλλαγή» bar of the earlier steps. */
  sum: JSX.Element;
  /** The error text, or the written-out warning; null when there is none. */
  errNode: ReactNode;
}

/**
 * Builds the shared pieces of the current render.
 * @decision Michael, 18/10: with a person chosen, Esc, ✕ and a click outside ask before the declaration is thrown away.
 */
export function stepChrome(d: Declare): StepChrome {
  const { state, today, pm, fix, order, step, cmd, medPicks, cur, t, setErr, setStep, err } = d;
  const ttl = fix
    ? 'Διόρθωση: ' + (fix.type === 'PUN' ? 'ποινή' : statusLbl(fix, state.settings.lists))
    : 'Δήλωση κατάστασης';
  const desc = (
    <>
      {order.map((n, i) => (
        <span key={n}>
          {i > 0 && ' › '}
          <span style={{ fontWeight: step === n ? 700 : 400 }}>
            {i + 1} {STEPS[n - 1]}
          </span>
        </span>
      ))}
    </>
  );
  const who = cmd.pids.length === 1 && pm.get(cmd.pids[0]) ? rkFull(pm.get(cmd.pids[0])!) : cmd.pids.length + ' άτομα';
  // με διαλεγμένο άτομο: Esc, ✕ και κλικ έξω ρωτούν πριν πεταχτεί η δήλωση
  const dirty =
    cmd.pids.length > 0 &&
    (fix
      ? 'Η διόρθωση δεν αποθηκεύτηκε. Αν κλείσεις, μένει όπως ήταν.'
      : 'Η δήλωση δεν αποθηκεύτηκε. Αν κλείσεις, χάνονται όσα διάλεξες.');
  const stBadges =
    medPicks.length > 1 ? (
      <>
        {medPicks.map((x, i) => (
          <span key={x.key}>
            {i > 0 && ' + '}
            <Badge tone={TYPES[x.type].tone}>{x.short}</Badge>
          </span>
        ))}
      </>
    ) : cur ? (
      <>
        <Badge tone={TYPES[cur.type].tone}>{cur.short}</Badge> {cur.long}
      </>
    ) : (
      t.long
    );
  // τι διάλεξες στα προηγούμενα βήματα, με «Αλλαγή» για να γυρίσεις
  const sum = (
    <div className="declsum">
      {cmd.pids.length > 0 && (
        <>
          <span>
            <b>{who}</b>
          </span>
          <Button
            variant="link"
            onClick={() => {
              setErr(null);
              setStep(1);
            }}
          >
            Αλλαγή
          </Button>
        </>
      )}
      {step === 3 && (
        <>
          {cmd.pids.length > 0 && <span className="declsum__sep">·</span>}
          <span>{stBadges}</span>
          <Button
            variant="link"
            onClick={() => {
              setErr(null);
              setStep(2);
            }}
          >
            Αλλαγή
          </Button>
        </>
      )}
    </div>
  );
  const errNode = err && typeof err !== 'string' ? declareWarning(err, pm, state.settings.lists, today) : err;
  return { ttl, desc, who, dirty, stBadges, sum, errNode };
}
