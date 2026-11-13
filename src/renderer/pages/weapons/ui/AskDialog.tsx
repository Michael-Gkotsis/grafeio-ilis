// The question «this weapon number is already in use».
// Purpose: `askDialog(s)`: a dialog with three answers: cancel, keep it on both, or move it to the person.
// Does NOT: write anything itself except through `save`. A plain function called as `{askDialog(s)}`.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/weapons.test.ts.
import type { ReactNode } from 'react';
import { RkName, rkShort } from '../../../entities/person';
import { Button, Dialog } from '../../../shared/ui';
import { plainName, shortName } from '../../../../shared/domain';
import { siOf } from '../../../../shared/si';
import type { WeaponsApi } from '../model/useWeapons';

/** The three answers: cancel, keep on both, move. */
function askFooter(s: WeaponsApi) {
  const { ask, setAsk, setReset, save, info, lists } = s;
  if (!ask) return null;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setAsk(null);
          setReset((n) => n + 1);
        }}
      >
        Άκυρο
      </Button>
      <Button
        variant="outline"
        onClick={async () => {
          const a = ask;
          setAsk(null);
          await save([{ pid: a.p.id, weapon: a.w }], {
            warn: 'ο ίδιος αριθμός μένει και σε ' + a.others.map(shortName).join(', ') + '.',
          });
        }}
      >
        Κράτα και στους δύο
      </Button>
      <Button
        data-autofocus=""
        onClick={async () => {
          const a = ask;
          setAsk(null);
          await save([...a.others.map((x) => ({ pid: x.id, weapon: '' })), { pid: a.p.id, weapon: a.w }], {
            what: 'μεταφορά όπλου ' + a.w,
            msg:
              'Το όπλο ' +
              a.w +
              ' πήγε στον ' +
              rkShort(a.p) +
              ' (σβήστηκε από ' +
              a.others.map(shortName).join(', ') +
              ')',
            warn: info.unarmed.has(a.p.id) ? 'είναι άοπλος κατά τη Σ.Ι. (' + siOf(a.p, lists).text + ').' : undefined,
          });
        }}
      >
        Μεταφορά
      </Button>
    </>
  );
}

/** The dialog, or `false` when there is no open question. */
export function askDialog(s: WeaponsApi) {
  const { ask, setAsk, setReset } = s;
  if (!ask) return false;
  // Each owner is [name, ' (εκτός δύναμης)' or ''], joined with commas: the same nested arrays as always.
  const owners = ask.others.map((x) => [
    <b key={x.id}>
      <RkName p={x} fn={plainName} keep={true} />
    </b>,
    x.active ? '' : ' (εκτός δύναμης)',
  ]);
  // biome-ignore lint/performance/noAccumulatingSpread: frozen structure, two or three owners at most
  const joined = owners.reduce<ReactNode[]>((a, x, j) => (j ? [...a, ', ', x] : [x]), []);
  return (
    <Dialog
      title={'Το όπλο ' + ask.w + ' είναι ήδη χρεωμένο'}
      onClose={() => {
        setAsk(null);
        setReset((n) => n + 1);
      }}
      description={
        <span>
          {'Ο αριθμός '}
          <b>{ask.w}</b>
          {' είναι στον '}
          {joined}
          {'. Να μεταφερθεί στον '}
          <RkName p={ask.p} fn={plainName} keep={true} />
          {';'}
        </span>
      }
      footer={askFooter(s)}
    >
      <p className="muted" style={{ margin: 0 }}>
        {'Με τη μεταφορά σβήνεται από '}
        {ask.others.length === 1 ? 'τον άλλον' : 'τους άλλους'}
        {'. Αναιρείται με Ctrl+Z.'}
      </p>
    </Dialog>
  );
}
