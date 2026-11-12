// «Ρυθμίσεις › Φάκελοι αρχείων»: where the app makes its files: one general folder, and optionally one for each form
// and for the new Excel of each kind.
// Purpose: `FoldersCard`; a row is a plain function.
// Does NOT: hold state (model/useFolders.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-settings-guide.test.ts.
import type { ChangeEvent, ReactNode } from 'react';
import type { DirTarget } from '../../../../../shared/api';
import { KIND, NEW_KINDS } from '../../../../../shared/sources';
import { Badge, Button, Card } from '../../../../shared/ui';
import { formList } from '../../model/sourcesView';
import { useFolders } from '../../model/useFolders';

type FoldersModel = ReturnType<typeof useFolders>;

/** One folder row: the label, the folder in use, «Άλλαξε…», «Άνοιξε» and (when it has its own) the reset button. */
function folderRow(
  m: FoldersModel,
  key: string,
  t: DirTarget,
  label: string,
  own: string | undefined,
  extra?: ReactNode,
  sub = '',
) {
  const { general, choose, reset } = m;
  return (
    <li key={key} className="srcrow">
      <div className="srcrow__main">
        <b>{label}</b>
        {own && t !== 'output' && (
          <>
            {' '}
            <Badge tone="info">δικός του</Badge>
          </>
        )}
        <small>
          <span className="plan__fn" title={own || general}>
            {(own || general) + sub}
          </span>
          {!own && t !== 'output' ? ' (ο γενικός)' : ''}
        </small>
      </div>
      <div className="srcrow__act">
        <Button size="sm" variant="outline" onClick={() => choose(t, label)}>
          Άλλαξε…
        </Button>
        <Button size="sm" variant="ghost" onClick={() => window.api.dirOpen(t)}>
          Άνοιξε
        </Button>
        {own && (
          <Button
            size="sm"
            variant="ghost"
            data-tip={t === 'output' ? 'Ο φάκελος Έγγραφα\\Γραφείο Ίλης' : 'Να πηγαίνει στον γενικό φάκελο'}
            onClick={() => reset(t, label)}
          >
            {t === 'output' ? 'Προεπιλογή' : 'Στον γενικό'}
          </Button>
        )}
      </div>
      {extra}
    </li>
  );
}

/** The «Έντυπα» rows: one folder per form with the month-subfolder box. */
function formRows(m: FoldersModel) {
  const { state, forms, monthly } = m;
  return formList(state.settings).map(([f, label]) => {
    const b = forms[f] || {};
    return folderRow(
      m,
      f,
      { form: f },
      label,
      b.dir,
      <label className="srcrow__opt">
        <input
          type="checkbox"
          className="ui-check"
          checked={b.monthly !== false}
          onChange={(e: ChangeEvent<HTMLInputElement>) => monthly(f, e.target.checked)}
        />
        <span>Υποφάκελος ανά μήνα (ΕΕΕΕ-ΜΜ)</span>
      </label>,
      b.monthly === false ? '' : '\\ΕΕΕΕ-ΜΜ',
    );
  });
}

/** The «Νέα Excel ανά είδος» rows: one folder per kind, with the file in use. */
function newKindRows(m: FoldersModel) {
  const { st } = m;
  return NEW_KINDS.map((k) => {
    const file = st.sources?.[k]?.file;
    return folderRow(
      m,
      k,
      { kind: k },
      KIND[k].label,
      st.newDirs?.[k],
      file && (
        <small className="srcrow__opt" style={{ cursor: 'default' }}>
          {'Τωρινό αρχείο: '}
          <span className="plan__fn" title={file}>
            {file}
          </span>
        </small>
      ),
    );
  });
}

/** The «Φάκελοι αρχείων» card. */
export function FoldersCard() {
  const m = useFolders();
  const { st } = m;
  return (
    <Card title="Φάκελοι αρχείων">
      <p className="note" style={{ marginTop: 0 }}>
        Πού φτιάχνει η εφαρμογή τα αρχεία της. Ό,τι δεν έχει δικό του φάκελο πάει στον <b>γενικό</b>. Τα αρχεία που
        έχουν ήδη φτιαχτεί μένουν εκεί που είναι· στον νέο φάκελο πηγαίνουν τα επόμενα.
      </p>
      <ul className="srclist">{folderRow(m, 'output', 'output', 'Γενικός φάκελος', st.outputDir || undefined)}</ul>
      <h4 className="folders__h">Έντυπα</h4>
      <ul className="srclist">{formRows(m)}</ul>
      <h4 className="folders__h">Νέα Excel ανά είδος</h4>
      <p className="note" style={{ marginTop: 0 }}>
        Όταν πατάς «Νέο αρχείο…» σε ένα είδος στα Αρχεία Excel, το Excel φτιάχνεται κατευθείαν σε αυτόν τον φάκελο. Όταν
        έχει οριστεί Δυναμολόγιο, οι καταστάσεις, τα πόστα, τα εκτός δύναμης και οι δυνατότητες μπαίνουν ως νέο φύλλο
        εκεί («Νέο φύλλο…»).
      </p>
      <ul className="srclist">{newKindRows(m)}</ul>
    </Card>
  );
}
