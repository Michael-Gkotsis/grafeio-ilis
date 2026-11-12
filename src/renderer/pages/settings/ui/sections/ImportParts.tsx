// The blocks of the «ανανέωση από Excel» dialog of the status kinds, as plain functions of the dialog model.
// Purpose: `unknownTypes`, `unmatchedPeople`, `addedList`, `bothSides`, `removedList` and `importNotes`, called by
//   `ImportDialog` as `{unknownTypes(x)}`.
// Does NOT: hold state (model/useImport.ts) or open the dialog (ImportDialog.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); plain functions, not
//   components, so the render counts stay the ones of the htm version.
// Covering test: test/screens-dialogs-forms.test.ts (snapshot sources-ImportDialog).
import type { ChangeEvent } from 'react';
import { dm } from '../../../../../shared/dates';
import { TYPES, type TypeKey } from '../../../../../shared/domain';
import { DEFAULT_TYPE, KIND, valueKey, type StatusKind } from '../../../../../shared/sources';
import { PersonPicker, rkFull } from '../../../../entities/person';
import { Badge, Button, Segmented, Select, type ValueEvent } from '../../../../shared/ui';
import type { ImportDerived, StatusDiff } from '../../model/importView';
import type { useImport } from '../../model/useImport';

type ImportModel = ReturnType<typeof useImport>;

/** What the parts need: the model, the parsed rows, the diff and the derived values (all non-null). */
export interface ImportView {
  list: StatusKind;
  m: ImportModel;
  parsed: NonNullable<ImportModel['parsed']>;
  d: StatusDiff;
  v: ImportDerived;
}

/** «Είδη που δεν αναγνωρίστηκαν»: a select per unknown text of the Excel, saved with the binding. */
export function unknownTypes({ list, m, parsed }: ImportView) {
  const { b, setB } = m;
  const types = KIND[list].types!;
  return (
    parsed.unknown.length > 0 && (
      <div className="field">
        <span className="field__label">Είδη που δεν αναγνωρίστηκαν: τι είναι το καθένα;</span>
        {parsed.unknown.map((u) => (
          <div key={u} className="field-row" style={{ alignItems: 'center' }}>
            <span className="plan__fn" style={{ minWidth: '160px' }}>
              {u}
            </span>
            <Select
              className="ui-select"
              aria-label={'Είδος για ' + u}
              value={b.values?.[valueKey(u)] || DEFAULT_TYPE[list]}
              onChange={(e: ValueEvent) =>
                setB({ ...b, values: { ...(b.values || {}), [valueKey(u)]: e.target.value as TypeKey } })
              }
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {TYPES[t].label}: {TYPES[t].long}
                  {t === DEFAULT_TYPE[list] ? ' (προτείνεται)' : ''}
                </option>
              ))}
            </Select>
          </div>
        ))}
        <span className="field__help">
          Το κείμενο του Excel κρατιέται ως «είδος» (π.χ. ΕΛ ΑΡΒ). Η επιλογή αποθηκεύεται για την επόμενη φορά.
        </span>
      </div>
    )
  );
}

/** «Δεν βρέθηκαν στην εφαρμογή»: for each row without a person, the candidates, a picker and «Παράλειψη». */
export function unmatchedPeople({ m, v }: ImportView) {
  const { all, choices, setChoices } = m;
  const { pm } = v;
  return (
    all.length > 0 && (
      <div className="field">
        <span className="field__label">Δεν βρέθηκαν στην εφαρμογή: ποιος είναι;</span>
        {all.map((c) => (
          <div key={c.r} className="unm">
            <span>
              <b>{c.who}</b>
              <small>
                γραμμή {c.r + 1} · {dm(c.from)}–{dm(c.to)}
              </small>
            </span>
            {choices[c.r] != null ? (
              <span>
                {pm.get(choices[c.r]!) ? rkFull(pm.get(choices[c.r]!)!) : ''}{' '}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const x = { ...choices };
                    delete x[c.r];
                    setChoices(x);
                  }}
                >
                  Αλλαγή
                </Button>
              </span>
            ) : (
              <div className="unm__pick">
                {c.cands.map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant="outline"
                    onClick={() => setChoices({ ...choices, [c.r]: p.id })}
                  >
                    {p.last} {p.first}
                    {p.father ? ' του ' + p.father : ''}
                  </Button>
                ))}
                <div style={{ minWidth: '200px' }}>
                  <PersonPicker
                    placeholder="Άλλος…"
                    onChange={(pid: number) => setChoices({ ...choices, [c.r]: pid })}
                  />
                </div>
                {c.r in choices ? (
                  <Badge>παραλείπεται</Badge>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setChoices({ ...choices, [c.r]: null })}>
                    Παράλειψη
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  );
}

/** «Νέες (n)»: the new records (first 60). */
export function addedList({ d, v }: ImportView) {
  const { pm, noDn } = v;
  return (
    d.add.length > 0 && (
      <details className="note" open={d.add.length <= 8}>
        <summary>Νέες ({d.add.length})</summary>
        <ul>
          {d.add.slice(0, 60).map((a, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: frozen DOM, the list is positional and keyed by index as before
            <li key={i}>
              {pm.get(a.pid) ? rkFull(pm.get(a.pid)!) : ''} · {TYPES[a.type].label}
              {a.kind && a.kind !== TYPES[a.type].label ? ' (' + a.kind + ')' : ''} · {dm(a.from)}–
              {a.open ? 'χωρίς λήξη' : dm(a.to)}
              {noDn(a.pid) ? ' · ⚠ χωρίς δικαίωμα ΔΝ' : ''}
            </li>
          ))}
        </ul>
      </details>
    )
  );
}

/** «Άλλαξαν και στο Excel και στην εφαρμογή»: a Του Excel / Της εφαρμογής switch per record. */
export function bothSides({ m, v }: ImportView) {
  const { keepApp, toggleKeep } = m;
  const { both } = v;
  return (
    both.length > 0 && (
      <div className="field">
        <span className="field__label">Άλλαξαν και στο Excel και στην εφαρμογή ({both.length}): ποιο κρατάς;</span>
        {both.map((u) => (
          <div key={u.id} className="unm">
            <span>
              <b>{u.who}</b>
              <small>
                Excel: {u.what} · Εφαρμογή: {u.conflict}
              </small>
            </span>
            <Segmented
              small={true}
              value={keepApp.has(u.id) ? 'app' : 'excel'}
              onChange={(x: string) => toggleKeep(u.id, x === 'app')}
              items={[
                { value: 'excel', label: 'Του Excel' },
                { value: 'app', label: 'Της εφαρμογής' },
              ]}
            />
          </div>
        ))}
        <span className="field__help">Ό,τι κρατήσεις από την εφαρμογή γράφεται μετά στο Excel.</span>
      </div>
    )
  );
}

/** «Σβήστηκαν από το Excel»: the removed records (first 40) and the box that removes them from the app too. */
export function removedList({ m, d, v }: ImportView) {
  const { del, setDel } = m;
  const { pm } = v;
  return (
    d.removed.length > 0 && (
      <div className="field">
        <span className="field__label">Σβήστηκαν από το Excel ({d.removed.length})</span>
        <ul className="note" style={{ margin: 0 }}>
          {d.removed.slice(0, 40).map((x) => (
            <li key={x.id}>
              {pm.get(x.pid) ? rkFull(pm.get(x.pid)!) : ''} · {TYPES[x.type].label}
              {x.kind && x.kind !== TYPES[x.type].label ? ' (' + x.kind + ')' : ''} · {dm(x.from)}–{dm(x.to)}
            </li>
          ))}
        </ul>
        <label className="rule">
          <input
            type="checkbox"
            className="ui-check"
            checked={del}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDel(e.target.checked)}
          />
          <span>
            <b>Σβήσε τες και από την εφαρμογή</b>
            <small>Αλλιώς μένουν στην εφαρμογή και ξαναγράφονται στο Excel.</small>
          </span>
        </label>
      </div>
    )
  );
}

/** The skipped rows and the four closing notes. */
export function importNotes({ m, parsed, d }: ImportView) {
  const { b } = m;
  return (
    <>
      {parsed.skipped.length > 0 && (
        <details className="note">
          <summary>Παραλείπονται {parsed.skipped.length} γραμμές</summary>
          <ul>
            {parsed.skipped.map((x) => (
              <li key={x.r}>
                Γραμμή {x.r + 1} · {x.who}: {x.why}
              </li>
            ))}
          </ul>
        </details>
      )}
      {parsed.cands.some((c) => c.noEnd) && (
        <p className="note">
          Όσοι δεν έχουν «έως» μπαίνουν χωρίς λήξη: ισχύουν κάθε μέρα μέχρι να γράψεις «έως» στο Excel, και η εφαρμογή
          δεν γράφει ημερομηνία εκεί.
        </p>
      )}
      {d.appOnly.length > 0 && (
        <p className="note">
          {d.appOnly.length}{' '}
          {d.appOnly.length === 1 ? 'εγγραφή της εφαρμογής δεν είναι' : 'εγγραφές της εφαρμογής δεν είναι'}
          {' στο Excel. Δεν σβήνονται· '}
          {b.write !== false
            ? 'γράφονται στο Excel μόνες τους μόλις περάσει η ανανέωση'
            : 'γράφονται στο Excel με την «Ενημέρωση Excel»'}
          .
        </p>
      )}
      {d.kept.length > 0 && (
        <p className="note">
          {d.kept.length === 1 ? '1 εγγραφή άλλαξε' : d.kept.length + ' εγγραφές άλλαξαν'} μόνο στην εφαρμογή (το Excel
          έχει ό,τι είχε): μένουν όπως είναι και γράφονται στο Excel.
        </p>
      )}
      {d.dup.length > 0 && (
        <p className="note">
          {d.dup.length === 1 ? '1 γραμμή είναι διπλή' : d.dup.length + ' γραμμές είναι διπλές'} (ίδιο άτομο, ίδια
          έναρξη) και κρατήθηκε η πρώτη.
        </p>
      )}
    </>
  );
}
