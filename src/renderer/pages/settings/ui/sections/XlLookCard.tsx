// «Ρυθμίσεις › Γράμματα Excel» card: font, alignment, a size and style per part, and a live sample.
// Purpose: `XlLookCard` (Michael, 20/10 and 21/10), the look of every cell the app writes into Excel.
// Does NOT: hold state (model/useXlLook.ts) or the rules (model/xlLookView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered. The rows, the sample and the toolbar are plain functions.
// Covering test: test/screens-settings-guide.test.ts, test/settings-xl-look-view.test.ts.
import { HK } from '../../../../../shared/unit';
import {
  XL_FONTS,
  XL_H,
  XL_LOOK,
  XL_PARTS,
  XL_SIZES,
  XL_V,
  sameLook,
  type XlLook,
  type XlPartKey,
} from '../../../../../shared/xlLook';
import { Button, Card, Segmented, Select, type ValueEvent } from '../../../../shared/ui';
import {
  PART_LBL,
  STYLE_BTN,
  formLike,
  lookText,
  partNow,
  sampleCell,
  sampleLook,
  sampleUnits,
  sizeAuto,
} from '../../model/xlLookView';
import { useXlLook } from '../../model/useXlLook';
import { prefRow } from './prefRow';

type LookModel = ReturnType<typeof useXlLook>;

/** One text node, line break and indent included as the htm text had them (the snapshot keeps them). */
const NOTE_MID =
  " (π.χ. Ιατρικά, Ποινές, ΘΑΛΑΜΟΙ, νέος μήνας) και τα πρότυπα του «Φτιάξ' το εδώ» στα Έντυπα (εκεί το μέγεθος των " +
  'γραμμών το διαλέγεις στο πρότυπο).\n      Οι ';
/** One text node: after the ΗΚΑΙ title word, up to the space before «κεφαλίδα». */
const NOTE_END = ', ΦΡΟΥΡΑ και Εξοδούχοι κρατούν τη διάταξη του εντύπου· σε αυτά αλλάζουν μόνο η ';

/** The size options 8..20. */
const sizeOptions = () =>
  XL_SIZES.map((n) => (
    <option key={n} value={String(n)}>
      {n}
    </option>
  ));

/** The size select of one part: the rows' own size, or «automatic» and the sizes. */
function sizeSelect(m: LookModel, k: XlPartKey) {
  const { x, setX, setPart } = m;
  const own = x.parts?.[k];
  return k === 'data' ? (
    <Select
      className="ui-select"
      aria-label="Μέγεθος: γραμμές του πίνακα"
      value={String(x.sz)}
      onChange={(e: ValueEvent) => setX({ ...x, sz: +e.target.value })}
    >
      {sizeOptions()}
    </Select>
  ) : (
    <Select
      className="ui-select"
      aria-label={'Μέγεθος: ' + PART_LBL[k][0]}
      value={own?.sz ? String(own.sz) : ''}
      onChange={(e: ValueEvent) => setPart(k, { sz: e.target.value ? +e.target.value : undefined })}
    >
      <option value="">{sizeAuto(x, k)}</option>
      {sizeOptions()}
    </Select>
  );
}

/** One part: its label and help, the size, the Β Π Υ buttons and «Επαναφορά» for the header and signatures. */
function partRow(m: LookModel, k: XlPartKey) {
  const { x, setPart } = m;
  const p = partNow(x, k);
  const own = x.parts?.[k];
  const btns = STYLE_BTN.map(([f, t, tip, css]) => (
    <button
      key={f}
      type="button"
      className="ui-chip"
      style={{ ...css, minWidth: '34px', padding: '0 8px' }}
      aria-pressed={!!p[f]}
      aria-label={tip + ': ' + PART_LBL[k][0]}
      data-tip={tip}
      onClick={() => setPart(k, { [f]: !p[f] })}
    >
      {t}
    </button>
  ));
  const back = formLike(k) && own && (
    <Button
      variant="ghost"
      size="sm"
      data-tip="Ξανά όπως είναι στο έντυπο"
      onClick={() => setPart(k, { sz: undefined, b: undefined, i: undefined, u: undefined })}
    >
      Επαναφορά
    </Button>
  );
  return (
    <div key={k} className="pref">
      <div>
        <b>{PART_LBL[k][0]}</b>
        <small>{PART_LBL[k][1]}</small>
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        {sizeSelect(m, k)}
        {btns}
        {back}
      </div>
    </div>
  );
}

/** The sample: unit lines, title, a two-row table and the signature, each in its part's letters. */
function sample(x: XlLook, unit: readonly string[]) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: frozen DOM, the sample keeps its aria-label as before
    <div
      style={{
        overflowX: 'auto',
        margin: '8px 0 12px',
        background: '#fff',
        padding: '10px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}
      aria-label="Δείγμα"
    >
      <div style={sampleLook(x, 'hdr')}>
        {sampleUnits(unit).map((u: string, i: number) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: frozen DOM, the unit lines are keyed by position as before
          <div key={i}>{u.toUpperCase()}</div>
        ))}
      </div>
      <div style={{ ...sampleLook(x, 'title'), textAlign: 'center', margin: '6px 0' }}>ΚΑΤΑΣΤΑΣΗ ΠΡΟΣΩΠΙΚΟΥ</div>
      <table style={{ borderCollapse: 'collapse', minWidth: '360px', margin: '0 auto' }}>
        <tbody>
          <tr>
            {['Α/Α', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ'].map((t) => (
              <td key={t} style={sampleCell(x, 'head')}>
                {t}
              </td>
            ))}
          </tr>
          <tr>
            {['1', 'ΠΑΠΑΔΟΠΟΥΛΟΣ', 'ΓΕΩΡΓΙΟΣ'].map((t) => (
              <td key={t} style={sampleCell(x, 'data')}>
                {t}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div style={{ ...sampleLook(x, 'sig'), textAlign: 'right', marginTop: '10px' }}>
        Ο<br />
        ΔΙΟΙΚΗΤΗΣ
      </div>
    </div>
  );
}

/** Save, cancel and back to the default. */
function toolbar(m: LookModel) {
  const { x, setX, saved, changed, save } = m;
  return (
    <div className="toolbar">
      <Button disabled={!changed} why="Δεν άλλαξε κάτι" onClick={() => save(x)}>
        Αποθήκευση
      </Button>
      {changed && (
        <Button variant="ghost" onClick={() => setX(saved)}>
          Άκυρο
        </Button>
      )}
      {!sameLook(x, XL_LOOK) && (
        <Button
          variant="ghost"
          onClick={() => (sameLook(saved, XL_LOOK) ? setX(XL_LOOK) : save(XL_LOOK))}
          data-tip={'Προεπιλογή: ' + lookText(XL_LOOK)}
        >
          Προεπιλογή
        </Button>
      )}
    </div>
  );
}

/** «Γράμματα Excel». */
export function XlLookCard() {
  const m = useXlLook();
  const { state, x, setX } = m;
  return (
    <Card title="Γράμματα Excel">
      <p className="note" style={{ marginTop: 0 }}>
        Σε ό,τι φτιάχνει η εφαρμογή στο Excel: τα Excel που βγάζεις (Δυναμολόγιο και καταστάσεις, Συνολικό δυναμολόγιο,
        Στελέχη, Οπλισμός, Έλεγχος υπηρεσιών), τα νέα αρχεία και φύλλα στα <b>Αρχεία Excel</b>
        {NOTE_MID}
        {HK()}
        {NOTE_END}
        <b>κεφαλίδα</b> και οι <b>υπογραφές</b>, αν τους δώσεις δικά τους γράμματα. Στα δικά σου Excel οι νέες γραμμές
        παίρνουν τη μορφή της γραμμής από πάνω. Ό,τι δεν χωρά μικραίνει λίγο ή αναδιπλώνεται, για να μην κόβεται.
      </p>
      {prefRow(
        'Γραμματοσειρά',
        'Υπάρχουν σε κάθε PC με Windows 7.',
        <Segmented
          small={true}
          value={x.font}
          onChange={(font: string) => setX({ ...x, font })}
          items={XL_FONTS.map((f) => ({ value: f, label: f }))}
        />,
      )}
      {prefRow(
        'Οριζόντια στοίχιση',
        'Στα κελιά του πίνακα και στις επικεφαλίδες. Ο τίτλος μένει στο κέντρο.',
        <Segmented small={true} value={x.h} onChange={(h: XlLook['h']) => setX({ ...x, h })} items={XL_H} />,
      )}
      {prefRow(
        'Κάθετη στοίχιση',
        'Πού κάθεται το κείμενο όταν η γραμμή είναι ψηλότερη.',
        <Segmented small={true} value={x.v} onChange={(v: XlLook['v']) => setX({ ...x, v })} items={XL_V} />,
      )}
      <h3 style={{ fontSize: '15px', margin: '14px 0 2px' }}>Μέγεθος και μορφή ανά κομμάτι</h3>
      {XL_PARTS.map((k) => partRow(m, k))}
      {sample(x, state.settings.unit)}
      {toolbar(m)}
    </Card>
  );
}
