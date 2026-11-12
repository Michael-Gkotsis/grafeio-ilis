// The «Στελέχη ανά βαθμό» card inside the «ΗΚΑΙ»: counts per rank, or the line built from the «Στελέχη» tab.
// Purpose: `CadreCard`; with named cadre in the tab it only shows how many per rank, otherwise it takes the counts.
// Does NOT: hold state (model/useCadreCard.ts).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// @decision clerk, 10/10: «δεν έχει κάπου να τους προσθέσω» (cadre per rank inside the ΗΚΑΙ).
// Covering test: test/screens-main.test.ts.
import { HkRowsButton } from '../../../features/hk-rows';
import { Alert, Button, Card } from '../../../shared/ui';
import { hkRowLabel } from '../../../../shared/unit';
import { useCadreCard } from '../model/useCadreCard';
import { cadreByRank } from '../model/view';

/** The card; `warn` = no cadre entered yet (starts open, with a warning). */
export function CadreCard({ warn }: { warn: boolean }) {
  const { state, nav, c, setC, open, setOpen, ranks, dirty, saveC, list } = useCadreCard(warn);
  if (list.length) {
    const by = cadreByRank(list);
    return (
      <Card
        title="Στελέχη ανά βαθμό"
        actions={
          <>
            <HkRowsButton />
            <Button size="sm" variant="outline" onClick={() => nav.go('cadre')}>
              Στελέχη
            </Button>
          </>
        }
      >
        <p className="note" style={{ margin: 0 }}>
          {[...by].map(([r, n]) => r + ' ' + n).join(' · ')}. Βγαίνουν από την καρτέλα «Στελέχη», μαζί με τις
          καταστάσεις τους (κωλυόμενοι, απόντες).
        </p>
      </Card>
    );
  }
  return (
    <Card
      title="Στελέχη ανά βαθμό"
      actions={
        <>
          <HkRowsButton />
          {!open && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Άλλαξε
            </Button>
          )}
        </>
      }
    >
      {warn && (
        <Alert tone="warn">
          <span>
            {'Δεν έχουν μπει ακόμα. Γράψε πόσοι είναι σε κάθε βαθμό και πάτα «Αποθήκευση», ' +
              'ή πέρασε τα στελέχη με ονόματα στο '}
            <button type="button" className="linkish" onClick={() => nav.go('cadre')}>
              καρτέλα «Στελέχη»
            </button>
            .
          </span>
        </Alert>
      )}
      {open ? (
        <>
          <div className="settings-grid">
            {ranks.map((r) => (
              <label key={r} className="field">
                <span className="field__help">{hkRowLabel(r)}</span>
                <input
                  className="ui-input"
                  type="number"
                  min="0"
                  value={c[r] || ''}
                  placeholder="0"
                  onChange={(e) => setC({ ...c, [r]: Math.max(0, +e.target.value || 0) })}
                />
              </label>
            ))}
          </div>
          <div className="toolbar" style={{ marginTop: '8px' }}>
            <Button disabled={!dirty} why="Δεν άλλαξε κάτι" onClick={saveC}>
              Αποθήκευση
            </Button>
            <span className="note">Λοχίες, δεκανείς και στρατιώτες μετρώνται από το προσωπικό.</span>
          </div>
        </>
      ) : (
        <p className="note" style={{ margin: 0 }}>
          {ranks
            .filter((r) => state.settings.cadre[r])
            .map((r) => hkRowLabel(r) + ' ' + state.settings.cadre[r])
            .join(' · ') || 'Κανένα'}
          . Ισχύουν για κάθε μέρα.
        </p>
      )}
    </Card>
  );
}
