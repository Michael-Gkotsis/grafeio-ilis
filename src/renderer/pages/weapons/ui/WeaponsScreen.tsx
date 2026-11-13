// Screen «Οπλισμός»: everyone in strength with a weapon number, rack and position written straight into the row, and
// the log of weapons going out of and back into the rack.
// Purpose: `WeaponsScreen`, route `weapons`; tab «Όπλα» is the table, tab «Κινήσεις» is `MovesView`.
// Does NOT: hold state (model/useWeapons.ts), hold the rules (model/view.ts) or build the Excel (main). The tab parts are
//   plain functions called as `{weaponTable(s)}`, not components.
// Owner layer: renderer/pages/weapons. Why: moved from screens/weapons.ts (Phase 6); htm became TSX with the same
//   markup, text nodes, keys and hook order. Michael, 17/10: the weapon number left the soldier's card for its own
//   screen. Michael, 18/10: exit and entry of weapons with reason and time, one button per row or tick many.
// Covering test: test/screens-main.test.ts, test/perf.test.ts, test/weapons-page-view.test.ts.
import { Fragment } from 'react';
import { Icon, PageHeader, Tabs, Button, DateBar } from '../../../shared/ui';
import { WeaponInDialog, WeaponOutDialog } from '../../../features/weapon-move';
import { SigsMenu } from '../../../widgets/export';
import { dm, dow } from '../../../../shared/dates';
import { HK } from '../../../../shared/unit';
import { useWeapons } from '../model/useWeapons';
import { askDialog } from './AskDialog';
import { MovesView } from './MovesView';
import { bulkBar, filtersBar, reasonStrip } from './WeaponFilters';
import { weaponTable } from './WeaponTable';
import { pickBar, weaponToolbar } from './WeaponToolbar';

/** The «Οπλισμός» page. */
export function WeaponsScreen() {
  const s = useWeapons();
  const { nav, date, today, tomorrow, xl, exportXl, tab, armedN, total, outN, info, pm } = s;
  const { outFor, setOutFor, outReason, setLastReason, setSel, setOnlySel, inFor, setInFor } = s;
  return (
    <div>
      <PageHeader
        title="Οπλισμός"
        quote="«Το θέμα είναι ο οπλισμός» - Λοχαγός Μ. Γ' ΕΣΣΟ 2026"
        sub={
          'Με όπλο ' +
          armedN +
          ' από ' +
          total +
          ' σε δύναμη, εκτός οπλοβαστού ' +
          (date === today ? 'τώρα' : dow(date) + ' ' + dm(date)) +
          ' ' +
          outN +
          '. Πάτα ΕΚΤΟΣ ή ΕΝΤΟΣ στη γραμμή.'
        }
      >
        <div className="page-head__acts weapons__acts">
          <DateBar
            value={date}
            onChange={(d: string) => nav.set({ wdate: d === today ? null : d })}
            days={[today, tomorrow]}
          />
          <Button
            variant="outline"
            disabled={xl}
            onClick={() => exportXl(false)}
            data-tip="Κατάσταση οπλισμού με στήλη υπογραφής, και ένα φύλλο για κάθε φίλτρο (χωρίς όπλο, άοπλοι με όπλο, ίδιος αριθμός, να παραδώσουν)"
          >
            {xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}
          </Button>
          <Button
            variant="outline"
            disabled={xl}
            onClick={() => exportXl(true)}
            data-tip={'Κατάσταση οπλισμού με την κεφαλίδα της ' + HK() + ' και στήλη υπογραφής'}
            data-tip-side="left"
          >
            {Icon.print}Εκτύπωση
          </Button>
          <SigsMenu form="weapons" date={date} label="ο Οπλισμός" disabled={xl} go={exportXl} />
        </div>
      </PageHeader>
      <div style={{ marginBottom: '12px' }}>
        <Tabs
          value={tab}
          onChange={(v: string) => nav.set({ wtab: v })}
          items={[
            { value: 'weapons', label: 'Όπλα (' + armedN + ')' },
            { value: 'moves', label: 'Κινήσεις' + (outN ? ' · εκτός ' + outN : '') },
          ]}
        />
      </div>
      {tab === 'moves' ? (
        <MovesView date={date} info={info} pm={pm} outN={outN} />
      ) : (
        <Fragment>
          {weaponToolbar(s)}
          {pickBar(s)}
          {reasonStrip(s)}
          {filtersBar(s)}
          {bulkBar(s)}
          {weaponTable(s)}
        </Fragment>
      )}
      {outFor && (
        <WeaponOutDialog
          pids={outFor}
          reason={outReason}
          onClose={() => setOutFor(null)}
          onDone={(r: string) => {
            if (r) setLastReason(r);
            setSel(new Set());
            setOnlySel(false);
          }}
        />
      )}
      {inFor && <WeaponInDialog ids={inFor} onClose={() => setInFor(null)} onDone={() => setSel(new Set())} />}
      {askDialog(s)}
    </div>
  );
}
