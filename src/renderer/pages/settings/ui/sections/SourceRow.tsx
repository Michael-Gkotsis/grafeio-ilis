// One row of «Αρχεία Excel ανά είδος»: the kind, its file and status badge, and the buttons that read, write and change it.
// Purpose: `SourceRow` (a component: it has its own hooks) and `statusBadge`, the plain function that picks the badge.
// Does NOT: call the main process; `SourcesView` passes every action in.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-settings-guide.test.ts.
import type { ChangeEvent } from 'react';
import type { SourceStatus } from '../../../../../shared/api';
import {
  KIND,
  bindingText,
  canCreate,
  isStatusKind,
  type ListKind,
  type SourceBinding,
} from '../../../../../shared/sources';
import { Badge, Button } from '../../../../shared/ui';
import { useStore, usePrintFile } from '../../../../shared/model';
import { WITH_PEOPLE } from '../../model/sourcesView';

export interface SourceRowProps {
  kind: ListKind;
  /** The stored binding of this kind, if a file was chosen. */
  b: SourceBinding | undefined;
  /** The status of the file, if the main process reported one. */
  st: SourceStatus | undefined;
  /** This kind is reading its file right now. */
  busy: boolean;
  /** A checkbox of some row is being saved. */
  saving: boolean;
  /** The Δυναμολόγιο (or the cadre file) hosts this kind as a sheet. */
  host: boolean;
  onPick: () => void;
  onEdit: () => void;
  onRead: () => void;
  onWrite: () => void;
  onNew: () => void;
  onRemove: () => void;
  onToggle: (on: boolean) => void;
  onAuto: (on: boolean) => void;
}

/** The status badge of a row: why the file needs attention, or that it is in sync; none without a binding. */
function statusBadge(kind: ListKind, b: SourceBinding | undefined, s: SourceStatus | undefined) {
  const canWrite = true;
  return !b ? null : !s ? (
    <Badge>…</Badge>
  ) : !s.exists ? (
    isStatusKind(kind) ? (
      <Badge tone="warn" data-tip="Θα φτιαχτεί με την πρώτη ενημέρωση">
        Δεν υπάρχει ακόμα
      </Badge>
    ) : (
      <Badge tone="bad">Δεν βρέθηκε</Badge>
    )
  ) : s.remap ? (
    <Badge
      tone="warn"
      data-tip={'Δεν διαβάζει ούτε γράφει μόνη της μέχρι να δείξεις τις στήλες («Στήλες…»): ' + s.remap}
    >
      Περιμένει αντιστοίχιση
    </Badge>
  ) : s.hold ? (
    <Badge tone="warn" data-tip={s.hold}>
      Περιμένει ανανέωση
    </Badge>
  ) : s.changed ? (
    <Badge tone="warn" data-tip="Κάποιος το άλλαξε στο Excel. Πάτα «Ανανέωση από Excel» για να περάσουν οι αλλαγές.">
      Άλλαξε στο Excel
    </Badge>
  ) : s.locked ? (
    <Badge tone="warn" data-tip={s.error}>
      Ανοιχτό στο Excel · περιμένει
    </Badge>
  ) : s.error ? (
    <Badge tone="bad" data-tip={s.error}>
      Δεν γράφτηκε
    </Badge>
  ) : s.synced ? (
    <Badge tone="ok" data-tip={'Τελευταία ανάγνωση/εγγραφή ' + s.at}>
      ✓ {s.at.slice(11)}
    </Badge>
  ) : (
    <Badge
      tone="info"
      data-tip={
        canWrite
          ? 'Δεν γράφει ακόμα μόνη της: πάτα μία φορά «Ενημέρωση Excel» για να δεις τι θα γραφτεί, ή «Ανανέωση από Excel»'
          : 'Δεν έχει διαβαστεί ακόμα'
      }
    >
      Νέο
    </Badge>
  );
}

/** The buttons of a kind that has no file yet: pick one, or let the app make one. */
function noFileButtons({ kind, busy, host, onPick, onNew }: SourceRowProps) {
  const k = KIND[kind];
  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} onClick={onPick}>
        {busy ? 'Ανάγνωση…' : 'Διάλεξε Excel…'}
      </Button>
      {canCreate(kind) && (
        <Button
          size="sm"
          variant="ghost"
          data-tip={
            host
              ? 'Η εφαρμογή προσθέτει φύλλο «' +
                k.title +
                '» στο ' +
                (kind === 'cadreAbs' ? 'αρχείο των στελεχών' : 'Δυναμολόγιο') +
                ' με ό,τι έχει και το κρατά ενημερωμένο'
              : 'Η εφαρμογή φτιάχνει καινούργιο Excel με ό,τι έχει και το κρατά ενημερωμένο'
          }
          onClick={onNew}
        >
          {host ? 'Νέο φύλλο…' : 'Νέο αρχείο…'}
        </Button>
      )}
    </>
  );
}

/** The buttons of a kind with a file: read, write, edit columns, change file, open, print and remove. */
function fileButtons(
  { kind, onPick, onEdit, onRead, onWrite, onNew, onRemove }: SourceRowProps,
  b: SourceBinding,
  s: SourceStatus | undefined,
  today: string,
  printFile: (file: string, sheet?: string) => void,
) {
  const k = KIND[kind];
  const canWrite = true;
  const withPeople = WITH_PEOPLE.includes(kind);
  return (
    <>
      <Button
        size="sm"
        variant={s?.changed ? 'default' : 'outline'}
        onClick={onRead}
        data-tip={
          'Διάβασε το Excel και δες τι αλλάζει πριν περάσει στην εφαρμογή' +
          (withPeople ? ' (διαβάζεται και μαζί με το προσωπικό)' : '')
        }
      >
        Ανανέωση από Excel
      </Button>
      {canWrite && (
        <Button
          size="sm"
          variant={s?.error ? 'default' : 'outline'}
          onClick={onWrite}
          data-tip="Γράψε στο Excel ό,τι έχει η εφαρμογή (με προεπισκόπηση)"
        >
          Ενημέρωση Excel
        </Button>
      )}
      {kind === 'duties' && s?.month && s.month < today.slice(0, 7) && (
        <Button
          size="sm"
          data-tip="Νέο φύλλο για τον τρέχοντα μήνα στο ίδιο αρχείο, με όλους τους ενεργούς, τους μετρητές και τις ΣΚ/αργίες· οι προηγούμενοι μήνες μένουν όπως είναι"
          onClick={onNew}
        >
          Νέος μήνας
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onEdit}>
        Στήλες…
      </Button>
      <Button size="sm" variant="ghost" onClick={onPick}>
        Άλλο αρχείο…
      </Button>
      {s?.exists && (
        <>
          <Button size="sm" variant="ghost" onClick={() => window.api.openPath(b.file)}>
            Άνοιξε
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-tip={
              'Προεπισκόπηση και εκτύπωση του φύλλου «' + b.sheet + '» χωρίς Excel (τσεκάρεις κι άλλα φύλλα αν θέλεις)'
            }
            onClick={() => printFile(b.file, b.sheet)}
          >
            Εκτύπωση
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        aria-label={'Αφαίρεση: ' + k.label}
        data-tip="Να μη διαβάζει ούτε να γράφει πια σε αυτό το αρχείο (το αρχείο μένει όπως είναι)"
        onClick={onRemove}
      >
        ✕
      </Button>
    </>
  );
}

/** The buttons of a row. */
function rowButtons(
  p: SourceRowProps,
  s: SourceStatus | undefined,
  today: string,
  printFile: (file: string, sheet?: string) => void,
) {
  return <div className="srcrow__act">{!p.b ? noFileButtons(p) : fileButtons(p, p.b, s, today, printFile)}</div>;
}

/** The two checkboxes of a row: write every change here, and (status kinds) read the simple changes by itself. */
function rowOptions({ kind, b, saving, onToggle, onAuto }: SourceRowProps) {
  const canWrite = true;
  return (
    <>
      {b && canWrite && (
        <label className="srcrow__opt">
          <input
            type="checkbox"
            className="ui-check"
            checked={b.write !== false}
            disabled={saving}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onToggle(e.target.checked)}
          />
          <span>Γράφει μόνη της κάθε αλλαγή εδώ</span>
        </label>
      )}
      {b && isStatusKind(kind) && (
        <label
          className="srcrow__opt"
          data-tip="Νέες εγγραφές και αλλαγές ημερομηνιών με γνωστά άτομα περνούν χωρίς κλικ και γράφονται στο Ιστορικό. Ό,τι άλλο (σβησμένα, άγνωστα άτομα, αλλαγές και στις δύο πλευρές) περιμένει την «Ανανέωση από Excel»."
        >
          <input
            type="checkbox"
            className="ui-check"
            checked={b.autoRead !== false}
            disabled={saving}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onAuto(e.target.checked)}
          />
          <span>Διαβάζει μόνη της τις απλές αλλαγές του Excel</span>
        </label>
      )}
    </>
  );
}

/** One kind of Excel file: its status, its buttons and the two checkboxes. */
export function SourceRow(p: SourceRowProps) {
  const { kind, b, st } = p;
  const { today } = useStore();
  const k = KIND[kind];
  const printFile = usePrintFile();
  const s: SourceStatus | undefined = st;
  const badge = statusBadge(kind, b, s);
  return (
    <li className="srcrow">
      <div className="srcrow__main">
        <b>{k.label}</b> {badge}
        <small>
          {b ? (
            <>
              <span className="plan__fn" title={b.file}>
                {bindingText(b)}
              </span>
              {b.write === false ? ' · δεν γράφει μόνη της' : ''}
            </>
          ) : (
            k.help + ' · δεν έχει οριστεί αρχείο'
          )}
        </small>
        {s?.error && !s.locked && <small className="txt-bad">{s.error}</small>}
      </div>
      {rowButtons(p, s, today, printFile)}
      {rowOptions(p)}
    </li>
  );
}
