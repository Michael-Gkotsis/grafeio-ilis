// The header of the ΗΚΑΙ (2 lines top left on the form): the fields, and the card in Ρυθμίσεις.
// Purpose: `HkHeadFields` edits the two lines (empty = what the form has: ΚΕΤΘ / 2Η ΕΠΧΙΑ); `HkHeadCard` saves them.
// Does NOT: write the Excel (main/exports.ts does).
// Owner layer: renderer/features/hk-rows. Why: moved verbatim from screens/hkrows.ts (Phase 5.3b).
// Covering test: test/unit.test.ts, test/ux-names.test.ts.
import { useEffect, useState } from 'react';
import { HK, HK_HEAD_FORM, formText, type UnitKind } from '../../../../shared/unit';
import { usePending } from '../../../shared/lib/pending';
import { useStore } from '../../../shared/model';
import { Button, Card, GoLink, useToast } from '../../../shared/ui';

/** Props of `HkHeadFields`. `inSettings`: the other forms' header is right above (UX Χ5). */
export interface HkHeadFieldsProps {
  value: string[];
  onChange: (v: string[]) => void;
  kind?: UnitKind;
  inSettings?: boolean;
}

// Κεφαλίδα της ΗΚΑΙ (Michael, 18/10): οι 2 γραμμές πάνω αριστερά στο έντυπο. Κενό = ό,τι έχει το έντυπο (ΚΕΤΘ / 2Η ΕΠΧΙΑ).
// inSettings: στις Ρυθμίσεις › Μονάδα και έντυπα η κεφαλίδα των άλλων εντύπων είναι ακριβώς πιο πάνω (UX Χ5)
/** The two header lines. */
export function HkHeadFields({ value, onChange, kind, inSettings }: HkHeadFieldsProps) {
  // one line on purpose: test/ux-names.test.ts reads the source and wants a GoLink, never plain text
  const settingsLink = (
    <GoLink view="templates" params={{ tab: 'unit' }}>
      Ρυθμίσεις › Μονάδα και έντυπα
    </GoLink>
  );
  return (
    <div className="field">
      <span className="field__label">Κεφαλίδα της {HK()} (2 γραμμές πάνω αριστερά)</span>
      <div className="field-row">
        {[0, 1].map((i) => (
          <input
            key={i}
            className="ui-input"
            style={{ flex: 1, minWidth: '160px' }}
            aria-label={'Κεφαλίδα της ' + HK() + ', γραμμή ' + (i + 1)}
            placeholder={formText({ unitKind: kind }, HK_HEAD_FORM[i])}
            value={value[i] || ''}
            onChange={(e) => {
              const v = [value[0] || '', value[1] || ''];
              v[i] = e.target.value;
              onChange(v);
            }}
          />
        ))}
      </div>
      <span className="field__help">
        Κενό: μένει αυτή του εντύπου (φαίνεται αχνά). Η κεφαλίδα των άλλων εντύπων (ΦΡΟΥΡΑ, εξοδούχοι){' '}
        {inSettings ? 'είναι τα τρία πεδία πιο πάνω.' : <>είναι στις {settingsLink}.</>}
      </span>
    </div>
  );
}
/** The card with Αποθήκευση / Άκυρο when something changed. */
export function HkHeadCard() {
  const { state, run } = useStore();
  const toast = useToast();
  const cur = state.settings.hkai || {};
  const saved = [cur.head?.[0] || '', cur.head?.[1] || ''];
  const [v, setV] = useState(saved);
  useEffect(() => setV(saved), [saved.join('\n')]);
  const dirty = v.some((x, i) => x !== saved[i]);
  const save = async () => {
    const head = v.map((x) => x.trim());
    const hkai = { ...cur };
    if (head.some(Boolean)) hkai.head = head;
    else delete hkai.head;
    const ok = await run({ t: 'setSettings', settings: { hkai }, text: 'κεφαλίδα της ' + HK() }, false);
    if (ok)
      toast({
        text: head.some(Boolean)
          ? 'Η ' + HK() + ' θα βγαίνει με κεφαλίδα «' + head.filter(Boolean).join(' / ') + '».'
          : 'Η ' + HK() + ' κρατά την κεφαλίδα του εντύπου.',
      });
    return ok;
  };
  usePending(dirty, { label: 'Κεφαλίδα της ' + HK(), save, discard: () => setV(saved) });
  return (
    <Card title={'Κεφαλίδα της ' + HK()}>
      <HkHeadFields value={v} onChange={setV} kind={state.settings.unitKind} />
      {dirty && (
        <div className="toolbar" style={{ marginTop: '6px' }}>
          <Button size="sm" onClick={save}>
            Αποθήκευση
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setV(saved)}>
            Άκυρο
          </Button>
        </div>
      )}
    </Card>
  );
}
