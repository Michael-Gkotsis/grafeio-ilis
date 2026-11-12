// «Ρυθμίσεις › Έντυπα: template και φάκελος»: for each form its own template, folder and month-subfolder box.
// Purpose: `FormsCard` (shown inside «Αρχεία Excel»); a form row is a plain function.
// Does NOT: hold state (model/useForms.ts) or edit a template (FormDialog.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-settings-guide.test.ts, test/screens-dialogs-forms.test.ts.
import type { ChangeEvent } from 'react';
import type { FormOut } from '../../../../../shared/api';
import type { FormKind } from '../../../../../shared/sources';
import { Badge, Button, Card } from '../../../../shared/ui';
import { base } from '../../../../widgets/sources-alert';
import { formList } from '../../model/sourcesView';
import { useForms } from '../../model/useForms';
import { FormDialog } from './FormDialog';

type FormsModel = ReturnType<typeof useForms>;

/** One form: its template and folder, the files it made, the buttons and the month-subfolder box. */
function formRow(m: FormsModel, outs: FormOut[], f: FormKind, label: string) {
  const { state, boot, forms, printFile, save, pickTpl, editTpl, pickDir } = m;
  const b = forms[f] || {};
  const out = outs.filter((o) => o.form === f);
  return (
    <li key={f} className="srcrow">
      <div className="srcrow__main">
        <b>{label}</b>
        {b.file && (
          <>
            {' '}
            <Badge tone="info">δικό σου</Badge>
          </>
        )}
        <small>
          {f === 'check' ? (
            'Φτιάχνεται από την εφαρμογή'
          ) : b.file ? (
            <span className="plan__fn" title={b.file}>
              {base(b.file)}
              {b.sheet ? ' › ' + b.sheet : ''}
            </span>
          ) : (
            'Template της εφαρμογής'
          )}
          {' · φάκελος: '}
          {(b.dir || state.settings.outputDir || boot.outputDir) + (b.monthly === false ? '' : '\\ΕΕΕΕ-ΜΜ')}
        </small>
        {out.map((o) => (
          <small key={o.file} className={o.error ? 'txt-bad' : ''}>
            {base(o.file)}
            {': '}
            {o.error ? o.error : o.pending ? 'περιμένει (ανοιχτό στο Excel)' : 'ενημερωμένο ' + o.at}
            {' · '}
            <Button size="sm" variant="link" onClick={() => printFile(o.file)}>
              Εκτύπωση
            </Button>
          </small>
        ))}
      </div>
      <div className="srcrow__act">
        {f !== 'check' && (
          <Button size="sm" variant="outline" onClick={() => pickTpl(f)}>
            Template…
          </Button>
        )}
        {f !== 'check' && (b.file || f === 'hkai' || f === 'outs') && (
          <Button size="sm" variant="ghost" onClick={() => editTpl(f)}>
            {f === 'hkai' ? 'Κελιά…' : 'Φύλλα…'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => pickDir(f)}>
          Φάκελος…
        </Button>
        {(b.file || b.dir) && (
          <Button
            size="sm"
            variant="ghost"
            data-tip="Template και φάκελος της εφαρμογής"
            onClick={() => save(f, null, label + ': ξανά με το template και τον φάκελο της εφαρμογής')}
          >
            Προεπιλογή
          </Button>
        )}
      </div>
      <label className="srcrow__opt">
        <input
          type="checkbox"
          className="ui-check"
          checked={b.monthly !== false}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            save(
              f,
              { ...b, monthly: e.target.checked },
              e.target.checked ? 'Υποφάκελος ανά μήνα' : 'Χωρίς υποφάκελο ανά μήνα',
            )
          }
        />
        <span>Υποφάκελος ανά μήνα (ΕΕΕΕ-ΜΜ)</span>
      </label>
    </li>
  );
}

/** The card with one row per form and the template dialog. */
export function FormsCard({ outs }: { outs: FormOut[] }) {
  const m = useForms();
  const { state, forms, dlg, setDlg, saveTemplate } = m;
  return (
    <Card title="Έντυπα: template και φάκελος">
      <p className="note" style={{ marginTop: 0 }}>
        Κάθε έντυπο μπορεί να βγαίνει από δικό σου template (αρχείο και φύλλο) σε δικό του φάκελο. Ό,τι έχει ήδη βγει
        για σήμερα ή επόμενη μέρα <b>ενημερώνεται μόνο του</b> όταν αλλάξεις κάτι στην εφαρμογή.
      </p>
      <ul className="srclist">{formList(state.settings).map(([f, label]) => formRow(m, outs, f, label))}</ul>
      {dlg && (
        <FormDialog
          form={dlg.form}
          info={dlg.info}
          current={forms[dlg.form] || {}}
          onClose={() => setDlg(null)}
          onSave={(b) => saveTemplate(dlg.form, b)}
        />
      )}
    </Card>
  );
}
