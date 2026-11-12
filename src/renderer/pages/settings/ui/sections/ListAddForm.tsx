// The «Νέο: …» form under the rows of the «Λίστες» card: the name and the fields each list adds.
// Purpose: `addForm`: a plain function (not a component) that builds the row of boxes and the «Πρόσθεσε» button.
// Does NOT: hold state (model/useLists.ts) or decide what is added (model/listsPlans.ts `planAdd`).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/lists.ts (Phase 6); the markup, keys, ids and
//   text nodes are exactly what the htm version rendered (the ids `ls-n` and `ls-k` repeat as before).
// Covering test: test/screens-settings-guide.test.ts, test/lists.test.ts.
import type { ChangeEvent, KeyboardEvent } from 'react';
import { leaveHk } from '../../../../../shared/hkaiText';
import { LEAVE_NO_COL, LIST_NAME } from '../../../../../shared/ranks';
import { HK } from '../../../../../shared/unit';
import { Alert, Button, Select, type ValueEvent } from '../../../../shared/ui';
import { PH } from '../../model/listsView';
import type { useLists } from '../../model/useLists';

type ListsModel = ReturnType<typeof useLists>;

const onEnter = (add: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') add();
};

// A tick in the form, in its own field box.
function tick(
  label: string,
  checked: boolean,
  set: (v: boolean) => void,
  extra: { id?: string; disabled?: boolean } = {},
) {
  return (
    <div className="field" style={{ flex: 'none' }}>
      <label className="ui-checkrow" style={{ height: '38px' }}>
        <input
          id={extra.id}
          type="checkbox"
          className="ui-check"
          checked={checked}
          disabled={extra.disabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set(e.target.checked)}
        />
        {label}
      </label>
    </div>
  );
}

// The calendar code box of a leave kind or a medical.
function codeField(m: ListsModel, ph: string) {
  const { form } = m;
  return (
    <div className="field" style={{ maxWidth: '130px' }}>
      <label className="field__label" htmlFor="ls-k">
        Κωδικός
      </label>
      <input
        id="ls-k"
        className="ui-input"
        placeholder={ph}
        value={form.values.code}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          form.setCode(e.target.value);
          form.setErr(null);
        }}
        onKeyDown={onEnter(m.add)}
      />
    </div>
  );
}

// Penalty: the text and the day limit.
function penaltyFields(m: ListsModel) {
  const { form, n } = m;
  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor="ls-a">
          Κείμενο ποινής
        </label>
        <input
          id="ls-a"
          className="ui-input"
          placeholder={n ? n.toLowerCase() : 'π.χ. επίπληξη'}
          value={form.values.acc}
          onChange={(e: ChangeEvent<HTMLInputElement>) => form.setAcc(e.target.value)}
        />
      </div>
      <div className="field" style={{ maxWidth: '130px' }}>
        <label className="field__label" htmlFor="ls-m">
          Ως ημέρες
        </label>
        <input
          id="ls-m"
          className="ui-input"
          type="number"
          min="1"
          placeholder="χωρίς όριο"
          value={form.values.max}
          onChange={(e: ChangeEvent<HTMLInputElement>) => form.setMax(e.target.value)}
        />
      </div>
    </>
  );
}

// Medical: code, the two «Μόνο …» ticks and, for a note, where else it shows.
function medicalFields(m: ListsModel) {
  const { form } = m;
  const { warn, note, nBadge, nXl } = form.values;
  return (
    <>
      {codeField(m, 'π.χ. Ε.Γ')}
      {tick(' Μόνο προειδοποίηση', warn && !note, form.setWarn, { id: 'ls-w', disabled: note })}
      <div className="field" style={{ flex: 'none' }}>
        <label className="ui-checkrow" style={{ height: '38px' }}>
          <input
            id="ls-n"
            type="checkbox"
            className="ui-check"
            checked={note}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              form.setNote(e.target.checked);
              if (e.target.checked) form.setWarn(false);
            }}
          />
          {' Μόνο σημείωση'}
        </label>
      </div>
      {note && (
        <div className="field" style={{ flex: 'none' }}>
          <span className="ui-checkrow muted" style={{ height: '38px' }}>
            Φαίνεται και:
            <label className="ui-checkrow">
              <input
                type="checkbox"
                className="ui-check"
                checked={nBadge}
                onChange={(e: ChangeEvent<HTMLInputElement>) => form.setNBadge(e.target.checked)}
              />
              {' σαν σήμα'}
            </label>
            <label className="ui-checkrow">
              <input
                type="checkbox"
                className="ui-check"
                checked={nXl}
                onChange={(e: ChangeEvent<HTMLInputElement>) => form.setNXl(e.target.checked)}
              />
              {' στο Excel ΕΑ-ΕΥ'}
            </label>
          </span>
        </div>
      )}
    </>
  );
}

// Leave kind: the two ticks, which exist only for «Πουθενά».
function leaveTicks(m: ListsModel) {
  const { id, form, curChoice } = m;
  return (
    id === 'leaveKinds' &&
    curChoice === LEAVE_NO_COL && (
      <>
        {tick(' Μπαίνει σε υπηρεσίες', form.values.lduty, form.setLduty)}
        {tick(' Βγαίνει έξοδο', form.values.lout, form.setLout)}
      </>
    )
  );
}

// Leave kind: the text in the ΗΚΑΙ.
function leaveText(m: ListsModel) {
  const { id, form, n } = m;
  return (
    id === 'leaveKinds' && (
      <div className="field">
        <label className="field__label" htmlFor="ls-t">
          Κείμενο στην {HK()}
        </label>
        <input
          id="ls-t"
          className="ui-input"
          placeholder={n ? leaveHk({ type: 'LEAVE', kind: n }) : 'κενό = αυτόματο'}
          value={form.values.ltext}
          onChange={(e: ChangeEvent<HTMLInputElement>) => form.setLtext(e.target.value)}
          onKeyDown={onEnter(m.add)}
        />
      </div>
    )
  );
}

/** The «Νέο: …» row. */
export function addRow(m: ListsModel) {
  const { id, form, pick, n, curChoice } = m;
  const f = form.values;
  return (
    <div className="field-row" style={{ alignItems: 'flex-end', marginTop: '12px' }}>
      <div className="field">
        <label className="field__label" htmlFor="ls-n">
          Νέο: {LIST_NAME[id].toLowerCase()}
        </label>
        <input
          id="ls-n"
          className="ui-input"
          placeholder={PH[id]}
          value={f.name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            form.setName(e.target.value);
            form.setErr(null);
          }}
          onKeyDown={onEnter(m.add)}
        />
      </div>
      {pick && (
        <div className="field">
          <label className="field__label" htmlFor="ls-c">
            {pick.label}
          </label>
          <Select
            id="ls-c"
            className="ui-input"
            value={curChoice}
            onChange={(e: ValueEvent) => form.setChoice(e.target.value)}
          >
            {pick.opts.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      )}
      {id === 'punKinds' && penaltyFields(m)}
      {leaveTicks(m)}
      {id === 'leaveKinds' && codeField(m, 'π.χ. Α.Ι')}
      {leaveText(m)}
      {id === 'weaponOut' && (
        <div className="field">
          <label className="field__label" htmlFor="ls-b">
            Λόγος εισαγωγής
          </label>
          <input
            id="ls-b"
            className="ui-input"
            placeholder={n ? 'ΛΗΞ ' + n : 'π.χ. ΛΗΞ ΦΡΟΥΡΑΣ'}
            value={f.back}
            onChange={(e: ChangeEvent<HTMLInputElement>) => form.setBack(e.target.value)}
            onKeyDown={onEnter(m.add)}
          />
        </div>
      )}
      {id === 'medKinds' && medicalFields(m)}
      <div className="field" style={{ flex: 0 }}>
        <Button disabled={!f.name.trim()} why="Γράψε πρώτα το όνομα" onClick={m.add}>
          Πρόσθεσε
        </Button>
      </div>
    </div>
  );
}

/** The error line under the form. */
export function addError(m: ListsModel) {
  const { err } = m.form;
  return (
    err && (
      <Alert tone="bad">
        <span>{err}</span>
      </Alert>
    )
  );
}
