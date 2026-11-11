// The «Κατάσταση» dialog of a cadre member.
// Purpose: `StatusDialog` adds or changes one status (a ΗΚΑΙ column) of a cadre member; one per day, a clash is replaced.
// Does NOT: write anything itself (the `addCadreAbs` command does).
// Owner layer: renderer/features/cadre-edit. Why: moved verbatim from screens/cadre.ts (Phase 5.3c).
// Covering test: test/cadre.test.ts, test/dialog-cases.test.ts.
import { useState } from 'react';
import { addDays, dm } from '../../../../shared/dates';
import { cadreAbsKinds, rankTxt, type UserLists } from '../../../../shared/ranks';
import { HK, hkRowLabel } from '../../../../shared/unit';
import { cadreClash, cadreStatusOf, colShort, groupOfCol, type CadreGroup } from '../../../../shared/cadre';
import type { Cadre, CadreAbs } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import {
  Alert,
  Button,
  DateRangeField,
  Dialog,
  Select,
  Why,
  useDirty,
  useToast,
  type ValueEvent,
} from '../../../shared/ui';
import { absRange } from '../../../entities/person';

/** Props of `StatusDialog`. */
export interface StatusDialogProps {
  c: Cadre;
  abs?: CadreAbs;
  onClose: () => void;
}

/** The draft of the dialog. */
interface StatusDraft {
  kind: string;
  from: string;
  to: string;
  note: string;
}

/** What `kindField` needs. */
interface KindFieldProps {
  f: StatusDraft;
  setF: (f: StatusDraft) => void;
  group: (g: CadreGroup) => ReturnType<typeof cadreAbsKinds>;
  st: ReturnType<typeof cadreStatusOf>;
  c: Cadre;
}

/** The status dropdown (grouped) and the sentence that says how it counts in the ΗΚΑΙ. */
function kindField({ f, setF, group, st, c }: KindFieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="ca-k">
        Κατάσταση (στήλη της {HK()})
      </label>
      <Select
        id="ca-k"
        className="ui-input"
        data-autofocus=""
        value={f.kind}
        onChange={(e: ValueEvent) => setF({ ...f, kind: e.target.value })}
      >
        {(['kol', 'apo', 'list'] as CadreGroup[]).map(
          (g) =>
            group(g).length > 0 && (
              <optgroup key={g} label={g === 'kol' ? 'Κωλυόμενοι' : g === 'apo' ? 'Απόντες' : 'Μόνο στη λίστα'}>
                {group(g).map(([k, l, col]) => (
                  <option key={k} value={k}>
                    {l}
                    {col ? ' (' + colShort(col) + ')' : ''}
                  </option>
                ))}
              </optgroup>
            ),
        )}
      </Select>
      <span className="field__help">
        {st.group === 'list'
          ? 'Δεν μετρά στην ' + HK() + ', φαίνεται μόνο στη λίστα.'
          : 'Μετρά στην ' +
            HK() +
            ' στους ' +
            (st.group === 'kol' ? 'κωλυόμενους' : 'απόντες') +
            ', στήλη «' +
            colShort(st.col) +
            '», γραμμή «' +
            hkRowLabel(c.hk) +
            '».'}
      </span>
    </div>
  );
}

/** The warning when the new status falls on days that already have one. */
function clashAlert(clash: CadreAbs[], lists: UserLists | undefined) {
  return (
    <Alert tone="warn">
      <span>
        Έχει ήδη {clash.map((a) => cadreStatusOf(a, lists).label.toLowerCase() + ' ' + absRange(a)).join(', ')}. Στην{' '}
        {HK()} μετρά μία κατάσταση τη μέρα: με «Αποθήκευση στη θέση της» η παλιά κόβεται σε αυτές τις μέρες και κρατά
        τις υπόλοιπες.
      </span>
    </Alert>
  );
}

// Κατάσταση στελέχους = στήλη της ΗΚΑΙ. Μία τη μέρα: αν πέφτει πάνω σε άλλη, ρωτά και η νέα μπαίνει στη θέση της
export function StatusDialog({ c, abs, onClose }: StatusDialogProps) {
  const { run, today, state } = useStore();
  const toast = useToast();
  const lists = state.settings.lists;
  const [f, setF] = useState({
    kind: abs?.kind || 'ka',
    from: abs?.from || today,
    to: abs?.to || addDays(today, 4),
    note: abs?.note || '',
  });
  const kinds = cadreAbsKinds(lists);
  // η τωρινή μένει στη λίστα ακόμα κι αν κρύφτηκε στις Ρυθμίσεις
  const opts =
    abs && !kinds.some((k) => k[0] === abs.kind)
      ? [...kinds, ...cadreAbsKinds(lists, true).filter((k) => k[0] === abs.kind)]
      : kinds;
  const st = cadreStatusOf({ id: '', cid: c.id, ...f }, lists);
  const clash = cadreClash(state, { id: abs?.id, cid: c.id, from: f.from, to: f.to });
  const bad = f.to < f.from;
  const dirty = useDirty(f);
  const save = async () => {
    const r = await run(
      {
        t: 'addCadreAbs',
        abs: { id: abs?.id, cid: c.id, ...f, note: f.note.trim() || undefined },
        replace: clash.length > 0,
      },
      false,
    );
    if (r) {
      onClose();
      toast({
        text:
          rankTxt(c) +
          ' ' +
          c.last +
          ': ' +
          st.label.toLowerCase() +
          ' ' +
          dm(f.from) +
          (f.to !== f.from ? '–' + dm(f.to) : ''),
      });
    }
  };
  const group = (g: CadreGroup) => opts.filter((k) => groupOfCol(k[2]) === g);
  return (
    <Dialog
      title={(abs ? 'Αλλαγή κατάστασης: ' : 'Κατάσταση: ') + rankTxt(c) + ' ' + c.last}
      onClose={onClose}
      dirty={dirty && 'Η κατάσταση δεν αποθηκεύτηκε. Αν κλείσεις, χάνεται.'}
      footer={
        <>
          <Why text={bad && '«Έως» πριν από «Από»'} />
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={bad} why="«Έως» πριν από «Από»" onClick={save}>
            {clash.length ? 'Αποθήκευση στη θέση της' : 'Αποθήκευση'}
          </Button>
        </>
      }
    >
      {kindField({ f, setF, group, st, c })}
      <DateRangeField from={f.from} to={f.to} onChange={(from: string, to: string) => setF({ ...f, from, to })} />
      <div className="field">
        <label className="field__label" htmlFor="ca-n">
          Παρατήρηση
        </label>
        <input
          id="ca-n"
          className="ui-input"
          value={f.note}
          onChange={(e: ValueEvent) => setF({ ...f, note: e.target.value })}
        />
      </div>
      {clash.length > 0 && clashAlert(clash, lists)}
    </Dialog>
  );
}
