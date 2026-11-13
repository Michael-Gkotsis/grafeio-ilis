// The two dialogs of the «Ημερολόγιο κωλυομένων»: one cell by hand, and the codes / title / sheets settings.
// Purpose: `CellDialog` (type a code for one soldier and day, or go back to the automatic one) and `CodesDialog`.
// Does NOT: compute the grid or make the Excel (src/shared/imer.ts, main).
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/imerologio.ts (Phase 6), next to the tab that
//   opens them (screens/imerologio.ts re-exports both for the dialog test cases).
// Covering test: test/imer.test.ts, test/dialog-*.test.ts (people dialog cases).
import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { Command } from '../../../../shared/commands';
import { dm, dow, type ISODate } from '../../../../shared/dates';
import type { Person } from '../../../../shared/domain';
import {
  IMER_ROWS,
  IMER_TITLES,
  handChoices,
  handOf,
  imerCode,
  imerCount,
  imerSheets,
  type Count,
  type ImerSettings,
  type ImerSheets,
  type ImerTitle,
} from '../../../../shared/imer';
import { upper } from '../../../../shared/text';
import { useStore, type StoreValue } from '../../../shared/model';
import { Button, Dialog, Segmented, useToast, type Toast } from '../../../shared/ui';
import { autoCode } from '../model/view';

/** Props of {@link CellDialog}. `d` is an ISODate, local time. */
export interface CellDialogProps {
  p: Person;
  d: ISODate;
  onClose: () => void;
  run: StoreValue['run'];
  undoMark: StoreValue['undoMark'];
  toast: Toast;
}

/** Sets the text of one cell by hand, or clears it (back to the automatic code). */
export function CellDialog({ p, d, onClose, run, undoMark, toast }: CellDialogProps) {
  const { state } = useStore();
  const cur = handOf(state, d, p.id);
  const [text, setText] = useState(cur);
  const auto = autoCode(state, p, d) || 'κενό (στην εκπαίδευση)';
  const save = async (v: string) => {
    if (await run({ t: 'setImer', date: d, cells: [{ pid: p.id, text: v }] }, false)) {
      onClose();
      toast({
        text: v
          ? 'Ημερολόγιο: ' + p.last + ' ' + dm(d) + ' → ' + upper(v)
          : 'Ημερολόγιο: ' + p.last + ' ' + dm(d) + ' πίσω στο αυτόματο',
        actions: [undoMark()],
      });
    }
  };
  const ch = handChoices(state.settings);
  return (
    <Dialog
      title={p.last + ' ' + p.first + ' · ' + dow(d) + ' ' + dm(d)}
      description={'Αυτόματα: ' + auto + (cur ? ' · Με το χέρι: ' + cur : '')}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" disabled={!cur} onClick={() => save('')}>
            Πίσω στο αυτόματο
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={upper(text.trim()) === cur} onClick={() => save(text)}>
            Κράτα
          </Button>
        </>
      }
    >
      <div className="imer__ch">
        {ch.map((c) => (
          <button
            key={c}
            type="button"
            className="ui-chip"
            aria-pressed={upper(text.trim()) === c}
            onClick={() => setText(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <input
        className="ui-input"
        data-autofocus
        aria-label="Άλλο κείμενο"
        placeholder="Άλλο κείμενο (π.χ. ΑΣΚΗΣΗ)"
        maxLength={24}
        value={text}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setText(upper(e.target.value))}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') save(text);
        }}
        style={{ marginTop: '12px' }}
      />
      <p className="muted" style={{ fontSize: '13px' }}>
        Αλλάζει μόνο το ημερολόγιο. Ό,τι είναι δηλωμένο (άδεια, υπηρεσία) μένει όπως είναι.
      </p>
    </Dialog>
  );
}

/** Props of {@link CodesDialog}. */
export interface CodesDialogProps {
  onClose: () => void;
  onPrint: () => void;
}

type CodeRow = { code: string; count: Count };

// The `codes` object saved in the settings: only what differs from the defaults.
function changedCodes(codes: Record<string, CodeRow>): NonNullable<ImerSettings['codes']> {
  const out: NonNullable<ImerSettings['codes']> = {};
  for (const r of IMER_ROWS) {
    const c = codes[r.key];
    const o: { code?: string; count?: Count } = {};
    const code = upper(c.code.trim());
    if (r.edit && code && code !== r.def) o.code = code;
    if (c.count !== r.count) o.count = c.count;
    if (o.code || o.count) out[r.key] = o;
  }
  return out;
}

/** Title, sheets and the code and Π / Α of every kind of absence. */
export function CodesDialog({ onClose, onPrint }: CodesDialogProps) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const cur: ImerSettings = state.settings.imer || {};
  const [title, setTitle] = useState<ImerTitle>(cur.title === 'ekp' ? 'ekp' : 'imer');
  const [sheets, setSheets] = useState<ImerSheets>(imerSheets(state.settings));
  const [codes, setCodes] = useState<Record<string, CodeRow>>(() =>
    Object.fromEntries(
      IMER_ROWS.map((r) => [r.key, { code: imerCode(state.settings, r.key), count: imerCount(state.settings, r.key) }]),
    ),
  );
  const set = (k: string, v: Partial<CodeRow>) => setCodes((c) => ({ ...c, [k]: { ...c[k], ...v } }));
  const save = async () => {
    const out = changedCodes(codes);
    const imer: ImerSettings = {
      ...(title === 'ekp' ? { title } : {}),
      ...(sheets !== 'unit' ? { sheets } : {}),
      ...(Object.keys(out).length ? { codes: out } : {}),
    };
    const cmd: Command = {
      t: 'setSettings',
      settings: { imer },
      text: 'Ημερολόγιο κωλυομένων: τίτλος, φύλλα και κωδικοί',
    };
    if (await run(cmd, false)) {
      onClose();
      toast({ text: 'Αποθηκεύτηκαν οι κωδικοί του ημερολογίου.', actions: [undoMark()] });
    }
  };
  return (
    <Dialog
      size="lg"
      title="Κωδικοί ημερολογίου"
      description="Ισχύουν για την οθόνη, το Excel και την εκτύπωση. Όποιος έχει δύο πράγματα την ίδια μέρα παίρνει το πρώτο της λίστας (π.χ. άδεια πριν από υπηρεσία)."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Άκυρο
          </Button>
          <Button variant="outline" onClick={onPrint}>
            Εκτύπωση
          </Button>
          <Button onClick={save}>Αποθήκευση</Button>
        </>
      }
    >
      <div className="imer__opt">
        <span>Τίτλος</span>
        <Segmented
          small={true}
          value={title}
          onChange={setTitle}
          items={(Object.keys(IMER_TITLES) as ImerTitle[]).map((k) => ({ value: k, label: IMER_TITLES[k] }))}
        />
      </div>
      <div className="imer__opt">
        <span>Φύλλα</span>
        <Segmented
          small={true}
          value={sheets}
          onChange={setSheets}
          items={[
            { value: 'unit', label: 'Ένα ανά ουλαμό' },
            { value: 'all', label: 'Ένα για όλη την ίλη' },
            { value: 'both', label: 'Και τα δύο' },
          ]}
        />
      </div>
      <table className="imer__codes">
        <thead>
          <tr>
            <th scope="col">Κατάσταση στην εφαρμογή</th>
            <th scope="col">Κωδικός</th>
            <th scope="col">Μετρά ως</th>
            <th scope="col">Από πού</th>
          </tr>
        </thead>
        <tbody>
          {IMER_ROWS.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td>
                {r.edit ? (
                  <input
                    className="ui-input"
                    aria-label={'Κωδικός: ' + r.label}
                    maxLength={8}
                    value={codes[r.key].code}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => set(r.key, { code: upper(e.target.value) })}
                  />
                ) : (
                  <span className="muted">{r.def}</span>
                )}
              </td>
              <td>
                <Segmented
                  small={true}
                  value={codes[r.key].count}
                  onChange={(v: Count) => set(r.key, { count: v })}
                  items={[
                    { value: 'P', label: 'Π', tip: 'Παρών' },
                    { value: 'A', label: 'Α', tip: 'Απών' },
                  ]}
                />
              </td>
              <td className="muted">{r.from}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: '13px' }}>
        Κενό κελί = στην εκπαίδευση = Π. Άλλες άδειες και ιατρικά (π.χ. τιμητική) βγαίνουν με τον κωδικό τους και
        μετράνε Α αν είναι άδεια.
      </p>
    </Dialog>
  );
}
