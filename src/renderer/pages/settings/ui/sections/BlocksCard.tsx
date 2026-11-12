// «Ρυθμίσεις › Υπηρεσίες και αργίες › Υπηρεσίες» card: the services of a ΦΡΟΥΡΑ form, active or not, armed or not.
// Purpose: `BlocksCard` (Michael, 20/10 and 22/10): turn a service on or off, arm it, move it up, edit it, add one.
// Does NOT: hold state (model/useBlocks.ts) or the texts (model/blocksView.ts); the dialogs are in
//   features/duty-blocks.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered. The service row is a plain function.
// Covering test: test/screens-settings-guide.test.ts, test/settings-blocks-view.test.ts.
import type { ChangeEvent } from 'react';
import { PHASE_NAME, phaseName, type BlockDef } from '../../../../../shared/domain';
import { AddBlockDialog, EditBlockDialog, PhaseDialog, PhaseSelect } from '../../../../features/duty-blocks';
import { Alert, Button, Card, Select, type ValueEvent } from '../../../../shared/ui';
import {
  WEAPON_TIP,
  activeTip,
  armedTip,
  codesText,
  isLy,
  postsWord,
  shapeText,
  shownPosts,
  stateWord,
} from '../../model/blocksView';
import { useBlocks } from '../../model/useBlocks';

type BlocksModel = ReturnType<typeof useBlocks>;

/** One service: its summary, the «Ενεργή» and «Ένοπλη» checkboxes, the weapon select, «↑» and «Επεξεργασία». */
function blockRow(m: BlocksModel, b: BlockDef) {
  const { run, phase, setEd } = m;
  const ps = shownPosts(b);
  const ly = isLy(b);
  return (
    <div
      key={b.id}
      className="rule"
      style={{ alignItems: 'center', padding: '3px 0', flexWrap: 'wrap', rowGap: '4px' }}
    >
      <span style={{ flex: '1 1 200px', minWidth: 0, ...(b.hidden ? { opacity: 0.6 } : {}) }}>
        <b>{b.name}</b>
        <small>
          {ps.length} {postsWord(ps.length)}
          {shapeText(b)}
          {' · '}
          {stateWord(b)}
          {b.custom ? ' · δική σου' : ''} · κωδικοί {codesText(ps)}
        </small>
      </span>
      <label className="ui-checkrow" data-tip={activeTip(b)}>
        <input
          type="checkbox"
          className="ui-check"
          aria-label={'Ενεργή: ' + b.name}
          disabled={ly}
          checked={!b.hidden}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            run({ t: 'setBlock', phase, id: b.id, patch: { hidden: !e.target.checked } })
          }
        />
        {' Ενεργή'}
      </label>
      <label className="ui-checkrow" data-tip={armedTip(b)}>
        <input
          type="checkbox"
          className="ui-check"
          aria-label={'Ένοπλη: ' + b.name}
          disabled={b.hidden || ly}
          checked={b.armed}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            run({ t: 'setBlock', phase, id: b.id, patch: { armed: e.target.checked } })
          }
        />
        {' Ένοπλη'}
      </label>
      {b.armed && !b.hidden && !ly && (
        <Select
          className="ui-select"
          aria-label={'Όπλο: ' + b.name}
          value={b.armWeapon === 'post' ? 'post' : 'own'}
          data-tip={WEAPON_TIP}
          onChange={(e: ValueEvent) =>
            run({ t: 'setBlock', phase, id: b.id, patch: { armWeapon: e.target.value as 'own' | 'post' } })
          }
        >
          <option value="own">Όπλο: δικό του</option>
          <option value="post">Όπλο: της θέσης</option>
        </Select>
      )}
      <span style={{ display: 'flex', ...(ly || b.hidden ? { visibility: 'hidden' } : {}) }}>
        <Button
          size="sm"
          variant="ghost"
          aria-label={'Πιο πάνω: ' + b.name}
          data-tip="Πιο πάνω (μπαίνει νωρίτερα στην αυτόματη συμπλήρωση)"
          onClick={() => run({ t: 'editBlock', phase, id: b.id, name: b.name, n: 0, hrs: {}, move: -1 })}
        >
          ↑
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEd(b.id)}>
          Επεξεργασία
        </Button>
      </span>
    </div>
  );
}

/** The toolbar of an own form: its description, «Μετονομασία…» and «Διαγραφή». */
function ownFormBar(m: BlocksModel) {
  const { cur, delWhy, del, setRen } = m;
  return (
    <div className="toolbar" style={{ marginBottom: '8px' }}>
      <span className="muted" style={{ fontSize: '13px' }}>
        Δικό σου έντυπο · βγαίνει στο Excel με το έντυπο της {PHASE_NAME[cur.base]}
      </span>
      <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => setRen(true)}>
        Μετονομασία…
      </Button>
      <Button size="sm" variant="ghost" disabled={!!delWhy} why={delWhy} onClick={del}>
        Διαγραφή
      </Button>
    </div>
  );
}

/** «Υπηρεσίες». */
export function BlocksCard() {
  const m = useBlocks();
  const { state, cur, phase, list, bad, setPick, add, setAdd, ed, setEd, ren, setRen } = m;
  return (
    <Card title="Υπηρεσίες" actions={<PhaseSelect value={phase} onChange={setPick} />}>
      {bad.length > 0 && (
        <Alert tone="warn">
          <span>
            <b>Κωδικοί που θέλουν διόρθωση</b> (Επεξεργασία στην υπηρεσία τους): {bad.join(' · ')}
          </span>
        </Alert>
      )}
      <p className="note" style={{ marginTop: 0 }}>
        Τώρα ισχύει η <b>ΦΡΟΥΡΑ {phaseName(state.settings)}</b> (αλλάζει από τις Θέσεις). Διάλεξε πάνω δεξιά ποιου
        εντύπου τις υπηρεσίες βλέπεις, ή «+ Νέο έντυπο υπηρεσιών…». Σε ένοπλη θέση δεν μπαίνει όποιος έχει ΕΑ, ΕΥ, ΕΟ,
        ΝΟΣ ή ΣΤΕΠ.
      </p>
      {cur.custom && ownFormBar(m)}
      {list.map((b) => blockRow(m, b))}
      <div style={{ marginTop: '8px' }}>
        <Button variant="outline" size="sm" onClick={() => setAdd(true)}>
          + Νέα υπηρεσία στη ΦΡΟΥΡΑ {cur.name}
        </Button>
      </div>
      {add && <AddBlockDialog phase={phase} onClose={() => setAdd(false)} />}
      {ren && <PhaseDialog edit={phase} onClose={() => setRen(false)} />}
      {ed && <EditBlockDialog phase={phase} b={list.find((x) => x.id === ed)!} onClose={() => setEd(null)} />}
    </Card>
  );
}
