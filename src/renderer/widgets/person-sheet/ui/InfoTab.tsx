// The «Στοιχεία» tab of the soldier sheet.
// Purpose: `InfoTab` lists what the Δυναμολόγιο has for the soldier, with the «Δικαίωμα ΔΝ» switch.
// Does NOT: derive the texts (model/view.ts); the switch writes through the `updatePerson` command.
// Owner layer: renderer/widgets/person-sheet. Why: moved verbatim from screens/people.ts (Phase 5.3c).
// Covering test: test/people.test.ts.
import type { ChangeEvent } from 'react';
import { roomTxt, unitOf } from '../../../../shared/domain';
import { isEpop, monthTxt } from '../../../../shared/rules';
import { rkShort } from '../../../entities/person';
import type { PersonSheetModel } from '../model/usePersonSheet';
import type { PersonSheetView } from '../model/view';

/** The tab: a plain function the sheet calls, not a component (so it adds no render of its own). */
export function infoTab(m: PersonSheetModel, view: PersonSheetView) {
  const { state, today, run, toast } = m;
  const p = m.p!;
  const { lists, si } = view;
  return (
    <dl className="kv">
      <dt>Βαθμός</dt>
      <dd>{p.rank || '—'}</dd>
      <dt>Προέλευση</dt>
      <dd>{p.origin || '—'}</dd>
      <dt>Ο/Σ</dt>
      <dd>{p.spec || '—'}</dd>
      <dt>Επίθετο</dt>
      <dd>{p.last || '—'}</dd>
      <dt>Όνομα</dt>
      <dd>{p.first || '—'}</dd>
      <dt>Πατρώνυμο</dt>
      <dd>{p.father || '—'}</dd>
      <dt>ΑΣΜ</dt>
      <dd className="num">{p.asm || '—'}</dd>
      <dt>Τηλέφωνο</dt>
      <dd className="num">{p.phone || '—'}</dd>
      <dt>Θάλαμος</dt>
      <dd>
        {roomTxt(p)}{' '}
        <span className="muted" style={{ fontSize: '12px' }}>
          ({unitOf(p, state.settings)})
        </span>
      </dd>
      <dt>Πόστο</dt>
      <dd>{p.post || '—'}</dd>
      <dt>Ρόλος</dt>
      <dd>{p.role || '—'}</dd>
      <dt>
        <abbr data-tip="Σωματική ικανότητα (από το Δυναμολόγιο)">Σ.Ι.</abbr>
      </dt>
      <dd>
        {si ? si.text : '—'}
        {si && p.siCat && si.cat ? ' · ' + si.cat : ''}
      </dd>
      {isEpop(p, lists) && (
        <>
          <dt>Υπηρεσίες τον μήνα</dt>
          <dd>
            {monthTxt(state, today, p, true)}{' '}
            <span className="muted" style={{ fontSize: '12px' }}>
              (ΕΠΟΠ/ΟΒΑ: μόνο με το χέρι)
            </span>
          </dd>
        </>
      )}
      <dt>Δικαίωμα ΔΝ</dt>
      <dd>
        <label className="kv__check">
          <input
            type="checkbox"
            className="ui-check"
            checked={!!p.dn}
            onChange={async (e: ChangeEvent<HTMLInputElement>) => {
              const dn = e.target.checked;
              if (await run({ t: 'updatePerson', person: { ...p, dn } }, false))
                toast({ text: rkShort(p) + (dn ? ' έχει δικαίωμα ΔΝ' : ' δεν έχει δικαίωμα ΔΝ') });
            }}
          />
          <span>{p.dn ? 'Ναι' : 'Όχι'}</span>
        </label>
      </dd>
      {p.notes && (
        <>
          <dt>Σημ. Δυναμολογίου</dt>
          <dd>{p.notes}</dd>
        </>
      )}
    </dl>
  );
}
