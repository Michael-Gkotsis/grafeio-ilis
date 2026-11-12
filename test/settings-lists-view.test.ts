// The pure rules of the «Λίστες» card (pages/settings/model/listsView.ts and listsPlans.ts).
import { describe, expect, it } from 'vitest';
import {
  backChange,
  codeChange,
  leaveTextChange,
  noteChange,
  planAdd,
  removeChange,
  toggleChange,
  type AddForm,
} from '../src/renderer/pages/settings/model/listsPlans';
import { IDS, codeOk, listHelp, pickOf, usedBy } from '../src/renderer/pages/settings/model/listsView';
import { listRows, type ListId, type UserLists } from '../src/shared/ranks';
import { fakeState } from './fixtures';

const form = (extra: Partial<AddForm> = {}): AddForm => ({
  name: '',
  choice: null,
  acc: '',
  max: '',
  code: '',
  warn: false,
  note: false,
  nBadge: false,
  nXl: false,
  back: '',
  ltext: '',
  lduty: false,
  lout: false,
  ...extra,
});
const input = (id: ListId, n: string, f: Partial<AddForm>, lists: UserLists = {}) => ({
  id,
  lists,
  rows: listRows(lists, id),
  pick: pickOf(id, lists),
  curChoice: '',
  n,
  form: form(f),
});

describe('lists view', () => {
  it('has a help text for every list and a code rule', () => {
    expect(IDS.every((id) => listHelp()[id].length > 10)).toBe(true);
    expect([codeOk(''), codeOk('Ε.Γ'), codeOk('ΕΓ'), codeOk('Ε.Γ,')]).toEqual([true, true, false, false]);
  });

  it('refuses a comma, a repeat, a bad code and a bad day limit; empty name is nothing', () => {
    expect(planAdd(input('specs', '', {}))).toBeNull();
    expect(planAdd(input('specs', 'Α,Β', {}))).toMatchObject({ ok: false });
    const basic = listRows({}, 'specs')[0].name;
    expect(planAdd(input('specs', basic, {}))).toEqual({
      ok: false,
      error: 'Το «' + basic + '» υπάρχει ήδη στη λίστα.',
    });
    expect(planAdd(input('medKinds', 'ΧΧ', { code: 'ΧΧ' }))).toMatchObject({ ok: false });
    expect(planAdd(input('punKinds', 'ΧΧ', { max: '-3' }))).toMatchObject({ ok: false });
  });

  it('adds an own medical as ΕΑΡΒ with its flags and says what was chosen', () => {
    const r = planAdd(input('medKinds', 'ΕΛ ΠΟΔ', { warn: true, code: 'ε.π' }));
    expect(r).toMatchObject({ ok: true, change: { text: '+ ΕΛ ΠΟΔ (μόνο προειδοποίηση, κωδικός Ε.Π)' } });
    if (r?.ok) expect(r.change.next.medKinds?.add).toEqual([{ name: 'ΕΛ ΠΟΔ', like: 'EARV', warn: true, code: 'Ε.Π' }]);
  });

  it('hides, shows and deletes items', () => {
    const basic = listRows({}, 'specs')[0].name;
    const lists: UserLists = { specs: { add: [{ name: 'ΧΧ' }], hide: [basic] } };
    const rows = listRows(lists, 'specs');
    const hidden = rows.find((r) => r.name === basic)!;
    expect(toggleChange(lists, 'specs', hidden)).toMatchObject({
      text: 'ξανά το ' + basic,
      next: { specs: { hide: [] } },
    });
    const own = rows.find((r) => r.name === 'ΧΧ')!;
    expect(removeChange(lists, 'specs', own).next.specs?.add).toEqual([]);
    expect(
      noteChange(
        { medKinds: { add: [{ name: 'Μ', like: 'EA', warn: true }] } },
        'medKinds',
        { name: 'Μ' } as never,
        true,
      ).next.medKinds?.add?.[0],
    ).toEqual({ name: 'Μ', like: 'EA', note: true });
  });

  it('changes codes, reasons and leave texts, and does nothing when nothing changed', () => {
    const lists: UserLists = { weaponOut: { add: [{ name: 'ΧΧ' }] } };
    const r = listRows(lists, 'weaponOut').find((x) => x.name === 'ΧΧ')!;
    expect(backChange(lists, 'weaponOut', r, '')).toBeNull();
    expect(backChange(lists, 'weaponOut', r, ' λήξη ')?.next.weaponOut?.add?.[0].back).toBe(
      ' λήξη '.trim().toUpperCase(),
    );
    expect(codeChange(lists, 'weaponOut', { ...r, code: 'Α.Β' }, 'α.β')).toBeNull();
    expect(codeChange(lists, 'weaponOut', r, 'ΑΒ')).toMatchObject({ ok: false });
    const on = leaveTextChange({}, 'K', { t: 'Χ' }, 'τ');
    expect(on.next.leaveText).toEqual({ K: { t: 'Χ' } });
    expect(leaveTextChange(on.next, 'K', { t: '' }, 'τ').next.leaveText).toBeUndefined();
  });

  it('finds who has a value: soldiers by id', () => {
    const s = fakeState(4);
    const state = { ...s, people: s.people.map((p) => ({ ...p, spec: 'ΠΝ' })) };
    const used = usedBy('specs', state);
    expect([...(used.get('ΠΝ')?.pids ?? [])].length).toBe(4);
    expect(usedBy('siUnarmed', state).size).toBe(0);
  });
});
