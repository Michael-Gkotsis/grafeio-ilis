// The «Γραμμές (βαθμοί) της ΗΚΑΙ» card: every row of the form with the ranks that count in it, a rename per row, and
// the form for the user's own rows (e.g. Λοχαγοί).
// Purpose: `HkRowsCard` draws the card (or its body only, `bare`, inside a dialog); state and actions come from model/.
// Does NOT: hold logic or save by itself.
// Owner layer: renderer/features/hk-rows. Why: moved verbatim from screens/hkrows.ts (Phase 5.3b).
// Covering test: test/unit.test.ts, test/ux-names.test.ts.
import { HK, hkRowLabel, hkRowName } from '../../../../shared/unit';
import { Alert, Badge, Button, Card, Segmented, Select } from '../../../shared/ui';
import { EMPTY, GROUPS, hkRowsActions, useHkRowsState, type HkState } from '../model/useHkRows';

/** Props of `HkRowsCard`. `bare`: only the body, for the dialog of `HkRowsButton`. */
export interface HkRowsCardProps {
  bare?: boolean;
}
type Acts = ReturnType<typeof hkRowsActions>;

/** A row being renamed: the input (Enter saves, Esc cancels) and its buttons. */
function hkRenameRow(d: HkState, a: Acts, r: string, ren: { key: string; name: string }) {
  const { names, st, setRen, setErr } = d;
  const { rename } = a;
  return (
    <li key={r}>
      <div className="field-row" style={{ alignItems: 'center' }}>
        <input
          className="ui-input"
          style={{ flex: 1, minWidth: '180px' }}
          aria-label={'Άλλο όνομα για ' + hkRowLabel(r, st)}
          placeholder={hkRowName(r, st.unitKind === 'lochos' ? 'lochos' : 'ili')}
          value={ren.name}
          data-autofocus
          onChange={(e) => setRen({ key: r, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') rename();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setRen(null);
              setErr(null);
            }
          }}
        />
        <Button size="sm" onClick={rename}>
          Αποθήκευση
        </Button>
        {names[r] && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRen({ key: r, name: '' })}
            data-tip="Σβήνει το δικό σου όνομα"
          >
            Αρχικό
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setRen(null);
            setErr(null);
          }}
        >
          Άκυρο
        </Button>
      </div>
    </li>
  );
}

/** A row of the form: its name, how many people are there today, the ranks, and its buttons. */
function hkRowItem(d: HkState, a: Acts, r: string) {
  const { own, names, st, counts, ranksOf, setRen, setErr } = d;
  const { edit, drop } = a;
  const mine = own.find((x) => x.name === r);
  const rk = [...(ranksOf.get(r) || [])];
  return (
    <li key={r}>
      <b>{hkRowLabel(r, st)}</b>
      {mine && (
        <>
          {' '}
          <Badge tone="info">δική σου</Badge>
        </>
      )}
      {names[r] && (
        <>
          {' '}
          <span className="muted" data-tip="Το αρχικό όνομα">
            ({mine ? r : hkRowName(r, st.unitKind === 'lochos' ? 'lochos' : 'ili')})
          </span>
        </>
      )}{' '}
      <span className="muted">
        · {counts[r]?.n || 0} σήμερα{rk.length ? ' · ' + rk.join(', ') : ''}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setErr(null);
          setRen({ key: r, name: names[r] || '' });
        }}
      >
        Άλλο όνομα
      </Button>
      {mine && (
        <>
          <Button size="sm" variant="ghost" onClick={() => edit(mine)}>
            Αλλαγή
          </Button>
          <Button size="sm" variant="ghost" onClick={() => drop(r)}>
            Σβήσε
          </Button>
        </>
      )}
    </li>
  );
}

/** One group (Αξιωματικοί / Οπλίτες): its rows and the total line. */
function hkGroup(d: HkState, a: Acts, g: 'off' | 'nco', title: string, total: string) {
  const { R, ren } = d;
  return (
    <div key={g} className="field">
      <span className="field__label">{title}</span>
      <ul className="hist">
        {(g === 'off' ? R.off : R.nco).map((r) => (ren?.key === r ? hkRenameRow(d, a, r, ren) : hkRowItem(d, a, r)))}
        <li className="muted">{total}</li>
      </ul>
    </div>
  );
}

/** «Βαθμοί που μετρούν εδώ»: one chip per rank. */
function hkRankChips(d: HkState, a: Acts) {
  const { f, allRanks } = d;
  const { toggleRank } = a;
  return (
    <>
      <span className="field__label" style={{ marginTop: '6px' }}>
        Βαθμοί που μετρούν εδώ
      </span>
      <div className="filters" style={{ flexWrap: 'wrap', gap: '6px' }}>
        {allRanks.map((r) => (
          <button
            key={r}
            type="button"
            className="ui-chip ui-chip--sm"
            aria-pressed={f.ranks.includes(r)}
            onClick={() => toggleRank(r)}
          >
            {r}
          </button>
        ))}
      </div>
    </>
  );
}

/** The «Νέα γραμμή» / «Αλλαγή γραμμής» form. */
function hkNewRowForm(d: HkState, a: Acts, submit: () => void) {
  const { st, f, setF, err, setErr, ren } = d;
  const { groupRows } = a;
  return (
    <div className="field">
      <span className="field__label">{f.edit ? 'Αλλαγή γραμμής «' + f.edit + '»' : 'Νέα γραμμή'}</span>
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="hr-n">
            Όνομα
          </label>
          <input
            id="hr-n"
            className="ui-input"
            placeholder="π.χ. Λοχαγοί"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </div>
        <div className="field" style={{ flex: 'none' }}>
          <span className="field__label">Ομάδα</span>
          <Segmented
            value={f.grp}
            onChange={(grp: 'off' | 'nco') => setF({ ...f, grp, after: '' })}
            items={GROUPS.map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="hr-a">
            Κάτω από
          </label>
          <Select
            id="hr-a"
            className="ui-input"
            value={f.after}
            onChange={(e) => setF({ ...f, after: e.target.value })}
          >
            <option value="">
              {'Στο τέλος (πριν το ' + (f.grp === 'off' ? 'ΣΥΝΟΛΟ ΑΞΚΩΝ' : 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ') + ')'}
            </option>
            {groupRows(f.grp).map((r) => (
              <option key={r} value={r}>
                {hkRowLabel(r, st)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {hkRankChips(d, a)}
      <span className="field__help">
        Στελέχη και στρατιώτες με αυτούς τους βαθμούς μετρούν σε αυτή τη γραμμή (τα στελέχη μετακινούνται μόνα τους).
        Χωρίς βαθμό, η γραμμή μένει κενή ώσπου να τη διαλέξεις σε στέλεχος.
      </span>
      {err && !ren && (
        <Alert tone="bad">
          <span>{err}</span>
        </Alert>
      )}
      <div className="toolbar">
        <Button onClick={submit}>{f.edit ? 'Αποθήκευση' : 'Προσθήκη γραμμής'}</Button>
        {(f.edit || f.name) && (
          <Button
            variant="ghost"
            onClick={() => {
              setF(EMPTY);
              setErr(null);
            }}
          >
            Άκυρο
          </Button>
        )}
      </div>
    </div>
  );
}

/** Η κάρτα. */
export function HkRowsCard({ bare }: HkRowsCardProps) {
  const d = useHkRowsState();
  const a = hkRowsActions(d);
  const { err, ren } = d;
  const body = (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        Όλες οι γραμμές του εντύπου με τη σειρά τους, οι βαθμοί που μετρούν σε κάθε μία και πόσοι είναι σήμερα. Κάθε
        γραμμή παίρνει «Άλλο όνομα» (γράφεται έτσι και στην {HK()}). Μια νέα γραμμή (π.χ. Λοχαγοί, Ταγματάρχες) μπαίνει
        στην {HK()} με τους τύπους της και μετρά στο σύνολο της ομάδας της.
      </p>
      {GROUPS.map(([g, title, total]) => hkGroup(d, a, g, title, total))}
      {hkNewRowForm(d, a, a.submit)}
    </>
  );
  const all = (
    <>
      {ren && err && (
        <Alert tone="bad">
          <span>{err}</span>
        </Alert>
      )}
      {body}
    </>
  );
  return bare ? <div>{all}</div> : <Card title={'Γραμμές (βαθμοί) της ' + HK()}>{all}</Card>;
}
