// The fields of one soldier, the same in the edit dialog and in the new-soldier one.
// Purpose: `PersonFields` draws rank, origin, Ο/Σ, names, ΑΣΜ, phone, room, Σ.Ι., post, role, ΕΣΣΟ, weapon, flags and notes.
// Does NOT: save anything; the dialog that holds it does.
// Owner layer: renderer/features/person-edit. Why: moved verbatim from screens/people.ts (Phase 5.3c).
// Covering test: test/ux-names.test.ts (texts), test/status-fix.test.ts.
import { useMemo, type ChangeEvent } from 'react';
import { HK } from '../../../../shared/unit';
import { listOf, optionsOf } from '../../../../shared/ranks';
import { isEpop } from '../../../../shared/rules';
import type { Cadre, Person } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import { ChoiceField } from '../../../shared/ui';
import { RoomField } from './RoomField';
import { SiField } from './SiField';

// Τα πεδία ενός στρατιώτη: ίδια στη διόρθωση και στον νέο
/** Props of `PersonFields`. */
export interface PersonFieldsProps {
  x: Person;
  setX: (x: Person) => void;
  id: string;
  isNew?: boolean;
}

/** Options of one text field (`F` below). */
interface FieldOpts {
  type?: string;
  placeholder?: string;
  focus?: boolean;
  num?: boolean;
  nullable?: boolean;
}

/** One text field of the form (`F` in `PersonFields`). */
function textField(
  { x, setX, id }: Pick<PersonFieldsProps, 'x' | 'setX' | 'id'>,
  k: keyof Person,
  label: string,
  opts: FieldOpts,
) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id + '-' + k}>
        {label}
      </label>
      <input
        id={id + '-' + k}
        className="ui-input"
        type={opts.type || 'text'}
        value={(x as unknown as Record<string, string | number | null | undefined>)[k] ?? ''}
        placeholder={opts.placeholder || ''}
        data-autofocus={opts.focus ? '' : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setX({
            ...x,
            [k]: opts.num
              ? e.target.value
                ? Number(e.target.value)
                : null
              : opts.nullable
                ? e.target.value || null
                : e.target.value,
          })
        }
      />
    </div>
  );
}

/** The lists a soldier's rank, origin and Ο/Σ are chosen from. */
interface RankLists {
  ranks: string[];
  origins: string[];
  specs: string[];
}

/** The row with rank, origin and Ο/Σ. */
function rankRow({ x, setX, id }: Pick<PersonFieldsProps, 'x' | 'setX' | 'id'>, { ranks, origins, specs }: RankLists) {
  return (
    <div className="field-row">
      <ChoiceField
        id={id + '-rank'}
        label="Βαθμός"
        value={x.rank}
        options={ranks}
        placeholder="π.χ. ΥΔΝΕΑΣ"
        otherLabel="+ Νέος βαθμός…"
        otherHelp="Μένει στη λίστα των βαθμών για την επόμενη φορά (Ρυθμίσεις › Λίστες)."
        onChange={(v: string) => setX({ ...x, rank: v })}
      />
      <ChoiceField
        id={id + '-origin'}
        label="Προέλευση"
        value={x.origin || ''}
        options={origins}
        placeholder="π.χ. ΕΠΟΠ"
        otherLabel="+ Νέα προέλευση…"
        otherHelp="Μένει στη λίστα των προελεύσεων για την επόμενη φορά (Ρυθμίσεις › Λίστες)."
        onChange={(v: string) => setX({ ...x, origin: v || undefined })}
      />
      <ChoiceField
        id={id + '-spec'}
        label="Ο/Σ (όπλο/σώμα)"
        value={x.spec}
        options={specs}
        placeholder="π.χ. ΠΖ"
        otherLabel="+ Νέο Ο/Σ…"
        otherHelp="Μένει στη λίστα για την επόμενη φορά."
        onChange={(v: string) => setX({ ...x, spec: v })}
      />
    </div>
  );
}

/** The «Υπηρεσίες τον μήνα» limit of a ΕΠΟΠ/ΟΒΑ soldier. */
function monthMaxField({ x, setX, id }: Pick<PersonFieldsProps, 'x' | 'setX' | 'id'>) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id + '-mm'}>
        Υπηρεσίες τον μήνα (το πολύ)
      </label>
      <input
        id={id + '-mm'}
        className="ui-input"
        type="number"
        min="1"
        max="31"
        style={{ maxWidth: '120px' }}
        placeholder="π.χ. 4"
        value={x.monthMax ?? ''}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setX({
            ...x,
            monthMax: e.target.value ? Math.max(0, Math.floor(+e.target.value)) || undefined : undefined,
          })
        }
      />
      <span className="field__help">
        ΕΠΟΠ/ΟΒΑ: δεν μπαίνει στην αυτόματη συμπλήρωση, μόνο με το χέρι. Πάνω από το όριο ζητά επιβεβαίωση. Κενό = χωρίς
        όριο.
      </span>
    </div>
  );
}

/** The «Προσκολλημένος» and «Εκτός δύναμης» switches. */
function flagRules({ x, setX }: Pick<PersonFieldsProps, 'x' | 'setX' | 'id'>, isNew: boolean | undefined) {
  return (
    <>
      <label className="rule">
        <input
          type="checkbox"
          className="ui-check"
          checked={x.attached}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setX({ ...x, attached: e.target.checked })}
        />
        <span>
          <b>Προσκολλημένος</b>
          <small>Μετράει στη στήλη «Προσκολλημένοι» της {HK()}.</small>
        </span>
      </label>
      {!isNew && (
        <label className="rule">
          <input
            type="checkbox"
            className="ui-check"
            checked={!x.active}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setX({ ...x, active: !e.target.checked })}
          />
          <span>
            <b>Εκτός δύναμης</b>
            <small>
              Περνά στους «Εκτός δύναμης» του Δυναμολογίου και στις ΔΙΑΓΡΑΦΕΣ της {HK()}. Βγαίνει από τις υπηρεσίες που
              έχει από σήμερα και μετά.
            </small>
          </span>
        </label>
      )}
    </>
  );
}

export function PersonFields({ x, setX, id, isNew }: PersonFieldsProps) {
  const { state } = useStore();
  const ranks = useMemo(
    () =>
      optionsOf(
        listOf(state.settings.lists, 'soldierRanks'),
        state.people.map((y: Person) => y.rank),
      ),
    [state.people, state.settings.lists],
  );
  const specs = useMemo(
    () =>
      optionsOf(
        listOf(state.settings.lists, 'specs'),
        state.people.map((y: Person) => y.spec),
      ),
    [state.people, state.settings.lists],
  );
  const origins = useMemo(
    () =>
      optionsOf(listOf(state.settings.lists, 'origins'), [
        ...state.people.map((y: Person) => y.origin),
        ...state.cadreList.map((c: Cadre) => c.origin),
      ]),
    [state.people, state.cadreList, state.settings.lists],
  );
  const F = (k: keyof Person, label: string, opts: FieldOpts = {}) => textField({ x, setX, id }, k, label, opts);
  return (
    <>
      {rankRow({ x, setX, id }, { ranks, origins, specs })}
      <div className="field-row">
        {F('last', isNew ? 'Επώνυμο *' : 'Επώνυμο', { focus: isNew })}
        {F('first', isNew ? 'Όνομα *' : 'Όνομα')}
        {F('father', 'Πατρώνυμο')}
      </div>
      <div className="field-row">
        {F('asm', 'ΑΣΜ')}
        {F('phone', 'Τηλέφωνο')}
        <RoomField id={id + '-room'} value={x.room} onChange={(v: number | null) => setX({ ...x, room: v })} />
      </div>
      <div className="field-row">
        <SiField
          id={id + '-si'}
          value={x.si}
          cat={x.siCat || ''}
          onChange={(v: string, c: string) => setX({ ...x, si: v, siCat: c || undefined })}
        />
        {F('post', 'Πόστο', { nullable: true })}
      </div>
      <div className="field-row">
        {F('role', 'Ρόλος', { nullable: true })}
        {isNew && F('essos', 'ΕΣΣΟ', { placeholder: 'π.χ. 2026 Γ΄' })}
        {F('weapon', 'Αριθμός όπλου (γράφεται μόνο όταν είναι Λ/Υ ή Δ/Υ)')}
      </div>
      {isEpop(x, state.settings.lists) && monthMaxField({ x, setX, id })}
      {flagRules({ x, setX, id }, isNew)}
      {F('notes', 'Σημειώσεις')}
    </>
  );
}
