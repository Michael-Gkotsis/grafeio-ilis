// Screen «Στελέχη» (Michael, 17/10): their own card in the menu, apart from the «Δυναμολόγιο» of the soldiers.
// Purpose: `CadreScreen`, route `cadre`. Their statuses are the columns of the ΗΚΑΙ (obstructed, absent) and feed it as
//   before.
// Does NOT: hold state (model/useCadre.ts), the rules (model/view.ts) or the member's card (a side card of the Shell).
// Owner layer: renderer/pages/cadre. Why: moved verbatim from screens/cadre.ts (Phase 6); htm became TSX with the same
//   markup, text nodes, keys and hook order.
// Covering test: test/screens-main.test.ts, test/layout-fit.test.ts, test/cadre-page-view.test.ts.
import type { ChangeEvent } from 'react';
import type { Sig } from '../../../../shared/sigs';
import { CADRE_FILTERS } from '../../../../shared/cadre';
import { dayName } from '../../../../shared/dates';
import { HK } from '../../../../shared/unit';
import { CadreDialog, StatusDialog } from '../../../features/cadre-edit';
import { ActiveFilter, Button, PageHeader, Select, Strip, type ValueEvent } from '../../../shared/ui';
import { SigsMenu } from '../../../widgets/export';
import { GRID } from '../model/view';
import { useCadre } from '../model/useCadre';
import { cadreRow } from './CadreRow';

/** The «Στελέχη» page: header with the exports, search and day, filter chips and the roster table. */
export function CadreScreen() {
  const m = useCadre();
  const { today, q, setQ, filter, date, days, edit, setEdit, stFor, setStFor, xl, all, counts, rows, active } = m;
  const { setFilter, clear, dateLbl, exportXl, sub, parts, nav } = m;
  return (
    <div>
      <PageHeader title="Στελέχη" sub={sub}>
        <Button
          variant="outline"
          disabled={xl || !all.length}
          why={!all.length ? 'Δεν υπάρχουν στελέχη' : undefined}
          onClick={() => exportXl()}
          data-tip="Ένα Excel: στελέχη με την κατάσταση της μέρας, όλες οι καταστάσεις από τη μέρα αυτή και μετά, εκτός δύναμης"
        >
          {xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}
        </Button>
        <SigsMenu
          form="cadre"
          date={date}
          label="τα Στελέχη"
          print={false}
          disabled={xl || !all.length}
          go={(_: boolean, sigs?: Sig[]) => exportXl(sigs)}
        />
        <Button onClick={() => setEdit({ hk: 'Λοχίες' })}>+ Νέο στέλεχος</Button>
      </PageHeader>
      <div className="toolbar">
        <input
          type="search"
          className="ui-input"
          aria-label="Αναζήτηση στα στελέχη"
          placeholder="Όνομα, βαθμός, Ο/Σ, ΑΜ, θέση, τηλέφωνο (χωρίς τόνους) · Ctrl+F"
          value={q}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
        />
        <Select
          className="ui-select"
          aria-label="Καταστάσεις στην ημερομηνία"
          data-tip="Η κατάσταση αυτής της μέρας, και στο Excel"
          value={date}
          onChange={(e: ValueEvent) => nav.set({ cdate: e.target.value === today ? undefined : e.target.value })}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {dayName(d, today)}
            </option>
          ))}
        </Select>
      </div>
      <div className="filters">
        <Strip role="group" aria-label="Γρήγορα φίλτρα">
          {CADRE_FILTERS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              className="ui-chip"
              aria-pressed={filter === k}
              data-tip={
                k === 'kol' || k === 'apo'
                  ? 'Στην ' + HK() + ' ' + (dateLbl ? dateLbl.toLowerCase() : 'σήμερα')
                  : undefined
              }
              onClick={() => setFilter(filter === k && k !== 'all' ? 'all' : k)}
            >
              {l}
              <span className="cnt">{counts[k] || 0}</span>
            </button>
          ))}
        </Strip>
        <ActiveFilter parts={parts} onClear={clear} />
        <span className="toolbar__count">
          {rows.length} από {filter === 'inactive' ? counts.inactive || 0 : active}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="ui-card empty">
          {!all.length ? (
            <>
              Δεν έχουν μπει στελέχη. Αν δεν τα περάσεις, η {HK()} παίρνει τους αριθμούς ανά βαθμό που γράφεις στην
              οθόνη της.{' '}
              <Button variant="link" onClick={() => setEdit({ hk: 'Λοχίες' })}>
                Πέρασε το πρώτο
              </Button>
            </>
          ) : (
            <>
              Κανείς δεν ταιριάζει.{' '}
              <Button variant="link" onClick={clear}>
                Καθάρισε αναζήτηση και φίλτρα
              </Button>
            </>
          )}
        </div>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="table" as before
        <div className="ptable ptable--roster" role="table" aria-rowcount={rows.length}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: '840px' }}>
              {/* biome-ignore lint/a11y/useFocusableInteractive: frozen DOM, the header row is not focusable */}
              {/* biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="row" as before */}
              <div className="ptable__head" role="row" style={{ gridTemplateColumns: GRID }}>
                <span />
                <span>Α/Α</span>
                <span>Βαθμός</span>
                <span>Ο/Σ</span>
                <span>Επίθετο</span>
                <span>Όνομα</span>
                <span>ΑΜ</span>
                <span>Τηλέφωνο</span>
                <span>Θέση</span>
                <span>{'Κατάσταση' + (dateLbl ? ' · ' + dateLbl : '')}</span>
                <span />
              </div>
              {rows.map((c, i) => cadreRow(c, i, m))}
            </div>
          </div>
        </div>
      )}
      {edit && <CadreDialog c={edit} onClose={() => setEdit(null)} />}
      {stFor && <StatusDialog c={stFor.c} abs={stFor.abs} onClose={() => setStFor(null)} />}
    </div>
  );
}
