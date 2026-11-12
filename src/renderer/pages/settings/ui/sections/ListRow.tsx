// One row of the «Λίστες» card: the item, its editor, who has it, hide/delete and the leave-text editors.
// Purpose: `listRow` and `baseLeaveRows`: plain functions (not components) that build the `<li>` of an item.
// Does NOT: hold state (model/useLists.ts) or know how a change is saved (model/listsPlans.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/lists.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered.
// Covering test: test/screens-settings-guide.test.ts, test/lists.test.ts.
import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';
import { TYPES } from '../../../../../shared/domain';
import { cadreLeaveHk, leaveHk } from '../../../../../shared/hkaiText';
import {
  LEAVE_NO_COL,
  cadreAbsOf,
  cadreLeaveKey,
  leaveEffect,
  leaveKey,
  leaveNameKey,
  type ListRow,
} from '../../../../../shared/ranks';
import { upper } from '../../../../../shared/text';
import { HK } from '../../../../../shared/unit';
import { Badge, Button, Select, type ValueEvent } from '../../../../shared/ui';
import { STAT_IDS, current, isUsed, rowInfo, usedCount } from '../../model/listsView';
import type { useLists } from '../../model/useLists';
import { LeaveTextEdit } from './LeaveTextEdit';
import { WhoHas } from './WhoHas';

type ListsModel = ReturnType<typeof useLists>;

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

// The editor of a weapon exit reason: the reason of the entry that returns the weapon.
function backInput(m: ListsModel, r: ListRow) {
  return (
    <input
      key={r.name + '|' + (r.back || '')}
      className="ui-input"
      style={{ width: '200px' }}
      aria-label={'Λόγος εισαγωγής: ' + r.name}
      data-tip="Μπαίνει μόνος του όταν επιστρέφει το όπλο"
      placeholder={'ΛΗΞ ' + r.name}
      defaultValue={r.back || ''}
      onBlur={(e: FocusEvent<HTMLInputElement>) => m.setBackOf(r, e.target.value)}
      onKeyDown={blurOnEnter}
    />
  );
}

// The editor of an own medical: code, the two «Μόνο …» ticks, «Τι κάνει», and the note options.
function medicalEditor(m: ListsModel, r: ListRow) {
  return (
    <>
      <input
        key={r.name + '|' + (r.code || '')}
        className="ui-input"
        style={{ width: '90px' }}
        aria-label={'Κωδικός ημερολογίου: ' + r.name}
        data-tip="Κωδικός στις μέρες του Excel «Έλεγχος υπηρεσιών»"
        placeholder={(r.like && TYPES[r.like]?.code) || 'κωδικός'}
        defaultValue={r.code || ''}
        onBlur={(e: FocusEvent<HTMLInputElement>) => m.setCodeOf(r, e.target.value)}
        onKeyDown={blurOnEnter}
      />
      <label className="ui-checkrow">
        <input
          type="checkbox"
          className="ui-check"
          checked={!!r.warn && !r.note}
          disabled={!!r.note}
          onChange={(e: ChangeEvent<HTMLInputElement>) => m.setWarnOf(r, e.target.checked)}
        />
        {' Μόνο προειδοποίηση'}
      </label>
      <label className="ui-checkrow">
        <input
          type="checkbox"
          className="ui-check"
          checked={!!r.note}
          onChange={(e: ChangeEvent<HTMLInputElement>) => m.setNoteOf(r, e.target.checked)}
        />
        {' Μόνο σημείωση'}
      </label>
      {!r.note && (
        <Button
          size="sm"
          variant="outline"
          data-tip={'Σε ποιες υπηρεσίες μπαίνει, έξοδος και ' + HK()}
          onClick={m.toDuty}
        >
          Τι κάνει
        </Button>
      )}
      {r.note && (
        <div
          style={{
            flexBasis: '100%',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px 16px',
            paddingLeft: '6px',
            fontSize: '13px',
          }}
          className="muted"
        >
          Φαίνεται και:
          <label className="ui-checkrow">
            <input
              type="checkbox"
              className="ui-check"
              checked={!!r.noteBadge}
              onChange={(e: ChangeEvent<HTMLInputElement>) => m.setNoteFlag(r, 'noteBadge', e.target.checked)}
            />
            {' σαν σήμα στις οθόνες (Σήμερα, Υπηρεσίες, Προσωπικό)'}
          </label>
          <label className="ui-checkrow">
            <input
              type="checkbox"
              className="ui-check"
              checked={!!r.noteXl}
              onChange={(e: ChangeEvent<HTMLInputElement>) => m.setNoteFlag(r, 'noteXl', e.target.checked)}
            />
            {' στο Excel ΕΑ-ΕΥ'}
          </label>
        </div>
      )}
    </>
  );
}

// The editor next to the name: by list and by basic/own item.
function rowEditor(m: ListsModel, r: ListRow) {
  const { id, pick, lists } = m;
  if (id === 'weaponOut' && !r.builtin) return backInput(m, r);
  if (id === 'medKinds' && !r.builtin) return medicalEditor(m, r);
  if (pick && !r.builtin)
    return (
      <Select
        className="ui-select"
        aria-label={pick.label + ': ' + r.name}
        value={current(id, r, lists)}
        onChange={(e: ValueEvent) => m.setPick(r, e.target.value)}
      >
        {pick.opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    );
  return (
    <span className="muted" style={{ fontSize: '12px' }}>
      {rowInfo(id, r, lists, m.people, pick)}
    </span>
  );
}

// «Το έχουν N» (or «Κανείς»): opens the list of holders.
function holdersButton(m: ListsModel, r: ListRow) {
  const { id, who, used } = m;
  const k = m.key(r.name);
  const n = usedCount(used, id, r);
  if (!n) return <span className="muted lists__n">Κανείς</span>;
  return (
    <button
      type="button"
      className="linkish lists__n"
      aria-expanded={who === k}
      data-tip={who === k ? 'Κλείσε' : 'Δες ποιοι'}
      onClick={() => m.setWho(who === k ? null : k)}
    >
      {(STAT_IDS.includes(id) ? 'Δηλώθηκε σε ' : 'Το έχουν ') + n}
    </button>
  );
}

// The tip of «Απόκρυψη» / «Εμφάνιση».
function hideTip(m: ListsModel, r: ListRow) {
  const { id } = m;
  if (id === 'siUnarmed') return r.hidden ? 'Να ισχύει ξανά' : 'Να μη θεωρείται άοπλος όποιος έχει αυτό το Σ.Ι.';
  return r.hidden
    ? 'Να προτείνεται ξανά'
    : 'Να μην προτείνεται στις φόρμες' +
        (id === 'soldierRanks' || id === 'origins' || id === 'specs' ? ' και στο Excel' : '');
}

// «Απόκρυψη» for a basic item or one somebody has; «✕» for an own item nobody has.
function hideOrRemove(m: ListsModel, r: ListRow) {
  const { id, used } = m;
  if (id === 'medKinds' && r.builtin)
    return (
      <span className="muted" style={{ fontSize: '12px' }}>
        βασικός τύπος
      </span>
    );
  if (r.builtin || isUsed(used, id, r))
    return (
      <Button size="sm" variant="ghost" onClick={() => m.toggle(r)} data-tip={hideTip(m, r)}>
        {id === 'siUnarmed' ? (r.hidden ? 'Να ισχύει' : 'Να μην ισχύει') : r.hidden ? 'Εμφάνιση' : 'Απόκρυψη'}
      </Button>
    );
  return (
    <Button size="sm" variant="ghost" aria-label={'Σβήσε ' + r.name} onClick={() => m.remove(r)}>
      ✕
    </Button>
  );
}

// The line of an own leave kind: what it does, the two ticks («Πουθενά» only) and the calendar code.
function leaveKindLine(m: ListsModel, r: ListRow) {
  const { id, lists } = m;
  return (
    id === 'leaveKinds' &&
    !r.builtin &&
    !r.hidden && (
      <div className="lists__lt">
        <span className="lists__prev">
          <b>{leaveEffect(r.name, lists, HK())}</b>
        </span>
        {current(id, r, lists) === LEAVE_NO_COL && (
          <>
            <label className="ui-checkrow">
              <input
                type="checkbox"
                className="ui-check"
                checked={!!r.duty}
                onChange={(e: ChangeEvent<HTMLInputElement>) => m.setFlag(r, 'duty', e.target.checked)}
              />
              {' Μπαίνει σε υπηρεσίες'}
            </label>
            <label className="ui-checkrow">
              <input
                type="checkbox"
                className="ui-check"
                checked={!!r.out}
                onChange={(e: ChangeEvent<HTMLInputElement>) => m.setFlag(r, 'out', e.target.checked)}
              />
              {' Βγαίνει έξοδο'}
            </label>
          </>
        )}
        <input
          key={r.name + '|' + (r.code || '')}
          className="ui-input"
          style={{ width: '110px' }}
          aria-label={'Κωδικός στον Έλεγχο υπηρεσιών: ' + r.name}
          data-tip="Κωδικός στις μέρες του Excel «Έλεγχος υπηρεσιών». Κενό = το όνομα του είδους"
          placeholder={upper(r.name).slice(0, 8)}
          defaultValue={r.code || ''}
          onBlur={(e: FocusEvent<HTMLInputElement>) => m.setCodeOf(r, e.target.value)}
          onKeyDown={blurOnEnter}
        />
      </div>
    )
  );
}

// The «Κείμενο στην ΗΚΑΙ» editor of a leave kind.
function leaveKindText(m: ListsModel, r: ListRow) {
  const { id, lists } = m;
  return (
    id === 'leaveKinds' &&
    !r.hidden && (
      <LeaveTextEdit
        key={'lt|' + r.name + '|' + (lists.leaveText?.[leaveNameKey(r.name)]?.t || '')}
        lk={leaveNameKey(r.name)}
        name={r.name}
        st={{ type: 'LEAVE' as const, kind: r.name }}
        auto={leaveHk({ type: 'LEAVE', kind: r.name })}
        lists={lists}
        save={m.saveLeaveText}
      />
    )
  );
}

// The same for a cadre absence that counts as a leave (Κ.Άδ., Ειδ., Αναρρ.).
function cadreAbsText(m: ListsModel, r: ListRow) {
  const { id, lists } = m;
  return (
    id === 'cadreAbs' &&
    !r.hidden &&
    ['ka', 'eid', 'an'].includes(current(id, r, lists)) && (
      <LeaveTextEdit
        key={'lt|' + r.name + '|' + (lists.leaveText?.[cadreLeaveKey(cadreAbsOf(r.name, lists)![0])]?.t || '')}
        lk={cadreLeaveKey(cadreAbsOf(r.name, lists)![0])}
        name={r.name}
        cadre={{ kind: r.name, label: cadreAbsOf(r.name, lists)![1] }}
        auto={cadreLeaveHk(r.name, cadreAbsOf(r.name, lists)![1])}
        lists={lists}
        save={m.saveLeaveText}
      />
    )
  );
}

/** The `<li>` of an item of the list. */
export function listRow(m: ListsModel, r: ListRow) {
  const { id, used } = m;
  return (
    <li key={r.name} className={r.hidden ? 'muted' : ''}>
      <b style={r.hidden ? { textDecoration: 'line-through' } : undefined}>{r.name}</b>
      {r.builtin ? <Badge tone="outline">βασικό</Badge> : <Badge tone="info">δικό σου</Badge>}
      {rowEditor(m, r)}
      <span style={{ flex: 1 }} />
      {id !== 'siUnarmed' && holdersButton(m, r)}
      {hideOrRemove(m, r)}
      {leaveKindLine(m, r)}
      {leaveKindText(m, r)}
      {cadreAbsText(m, r)}
      {m.who === m.key(r.name) && <WhoHas e={used.get(m.key(r.name))} />}
    </li>
  );
}

/** The two basic leave kinds that are not in the list (Τιμητική, Αναρρωτική), under the rows of «Είδη άδειας». */
export function baseLeaveRows(m: ListsModel) {
  const { id, lists } = m;
  return (
    id === 'leaveKinds' &&
    (
      [
        ['HON', 'Τιμητική'],
        ['SICK', 'Αναρρωτική'],
      ] as const
    ).map(([type, name]) => (
      <li key={type}>
        <b>{name}</b> <Badge tone="outline">βασικό</Badge>
        <span className="muted" style={{ fontSize: '12px' }}>
          {HK()}: {type === 'HON' ? 'Ειδ.' : 'Αναρρ.'}
        </span>
        <LeaveTextEdit
          key={'lt|' + type + '|' + (lists.leaveText?.[leaveKey({ type })]?.t || '')}
          lk={leaveKey({ type })}
          name={name}
          st={{ type }}
          auto={leaveHk({ type })}
          lists={lists}
          save={m.saveLeaveText}
        />
      </li>
    ))
  );
}
