// «ΗΚΑΙ › Ημερήσια Διαταγή» (Michael, 3/11): fills from the duties and the day's changes, you write only what the app does not know.
// Purpose: `HdTab`: comes out as Word (ready or your own template) or as a print; each line is changed or removed only
//   here, the ΗΚΑΙ does not change.
// Does NOT: fill the document (shared/hd.ts does), write the Word file (main/hdDocx.ts does) or hold the state (model/useHd.tsx).
// Owner layer: renderer/widgets/hd. Why: moved verbatim from screens/hd.ts (Phase 6.0); the «Καταστάσεις» hub drops it in as
//   one piece.
// Covering test: test/screens-main.test.ts, test/hd.test.ts, test/screens-dialogs-forms.test.ts.
import type { ChangeEvent } from 'react';
import { dayName, dm } from '../../../../shared/dates';
import { HD_SECTIONS, hdDefaultDay, hdPageHtml } from '../../../../shared/hd';
import { sigsText, type Sig } from '../../../../shared/sigs';
import { HK } from '../../../../shared/unit';
import { SigsDialog } from '../../../features/sigs-edit';
import { cx } from '../../../shared/lib/cx';
import { Alert, Button, Card, Combo, DateBar, Dialog, PageHeader, type ValueEvent } from '../../../shared/ui';
import { useHd, type HdModel } from '../model/useHd';
import { KEEP_SIGS_TEXT, hdUpper } from '../model/view';
import { Lines } from './Lines';
import { Preview } from './Preview';

type ComboEvent = ChangeEvent<HTMLInputElement> | ValueEvent;

/** Title, the four buttons, the day bar and the two notices («κρατιέται όπως βγήκε» / «αλλαγές που δεν έχουν βγει»). */
function hdHead(m: HdModel) {
  const { date, today, nav, busy, go, setSigs, setPrev, setEdit, days, saved, dirty, again, sigList } = m;
  return (
    <>
      <PageHeader
        title={'Ημερήσια Διαταγή της ' + dm(date) + '/' + date.slice(0, 4)}
        sub="Γεμίζει μόνη της από τις υπηρεσίες και τις μεταβολές της μέρας. Γράφεις μόνο ό,τι δεν ξέρει η εφαρμογή."
      >
        <Button
          disabled={busy}
          onClick={() => go(false)}
          data-tip="Βγαίνει .docx και ανοίγει στο Word. Κρατιέται όπως βγήκε"
        >
          {busy ? 'Δημιουργία…' : 'Βγάλε Word'}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => go(true)}
          data-tip="Ανοίγει την προεπισκόπηση εκτύπωσης, όπως στα Excel, χωρίς Word"
        >
          Εκτύπωση
        </Button>
        <Button variant="outline" onClick={() => setSigs(true)} data-tip={'Υπογραφή: ' + sigsText(sigList)}>
          Υπογραφή…
        </Button>
        <Button variant="outline" onClick={() => setPrev(true)}>
          Προεπισκόπηση
        </Button>
      </PageHeader>
      <div className="toolbar">
        <DateBar
          value={date}
          onChange={(d: string) => {
            setEdit(null);
            nav.set({ hdDate: d === hdDefaultDay(today) ? undefined : d });
          }}
          days={days}
        />
        <span className="muted">{dayName(date, today)} · μεταβολές της μέρας</span>
      </div>
      {saved && !dirty && (
        <Alert tone="info">
          Αυτή η Ημερήσια Διαταγή έχει βγει και κρατιέται όπως βγήκε, ακόμα κι αν αλλάξουν τα δεδομένα.{' '}
          <Button variant="link" onClick={again}>
            Ξανά από τα δεδομένα
          </Button>
        </Alert>
      )}
      {dirty && (
        <Alert tone="warn">
          Αλλαγές που δεν έχουν βγει ακόμα (μόνο εδώ, η {HK()} δεν αλλάζει).{' '}
          <Button variant="link" onClick={again}>
            Άκυρο, ξανά από τα δεδομένα
          </Button>
        </Alert>
      )}
    </>
  );
}

/** «Όργανα υπηρεσίας»: ΑΥΔΜ, Δ/Ν and ΙΛΧΟΣ ΕΒΔΟΜΑΔΟΣ, each a field with the cadre names to pick from. */
function organsCard(m: HdModel) {
  const { state, names, doc, auto, set } = m;
  return (
    <Card title="Όργανα υπηρεσίας">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the Combo input is inside the label */}
      <label className="hd__f">
        <span>
          ΑΥΔΜ <small>· διάλεξε στέλεχος ή γράψε</small>
        </span>
        <Combo
          className="ui-input"
          options={names}
          value={doc.aydm}
          onChange={(e: ComboEvent) => set({ aydm: hdUpper(e.target.value) })}
          placeholder="π.χ. από άλλη μονάδα"
        />
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the Combo input is inside the label */}
      <label className="hd__f">
        <span>
          Δ/Ν {state.settings.unitName ? state.settings.unitName.toUpperCase() : ''}{' '}
          <small>· {doc.dn && doc.dn === auto.dn ? 'από Υπηρεσίες στελεχών' : 'γράψε αν δεν βρέθηκε'}</small>
        </span>
        <Combo
          className="ui-input"
          options={names}
          value={doc.dn}
          onChange={(e: ComboEvent) => set({ dn: hdUpper(e.target.value) })}
        />
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the Combo input is inside the label */}
      <label className="hd__f">
        <span>
          ΙΛΧΟΣ ΕΒΔΟΜΑΔΟΣ <small>· κρατιέται όλη την εβδομάδα</small>
        </span>
        <Combo
          className="ui-input"
          options={names}
          value={doc.ilxos}
          onChange={(e: ComboEvent) => set({ ilxos: hdUpper(e.target.value) })}
        />
      </label>
    </Card>
  );
}

/** The two cards of changes: officers («Μεταβολές αξιωματικών») and soldiers («Μεταβολές οπλιτών»). */
function changeCards(m: HdModel) {
  const { doc, setSec } = m;
  return (
    <>
      <Card title="Μεταβολές αξιωματικών">
        {HD_SECTIONS.map((n, i) => (
          <Lines
            key={n}
            label={i + 1 + '. ' + n}
            lines={doc.ax[i] || []}
            from={i === 2 ? 'από Στελέχη' : undefined}
            onChange={(l: string[]) => setSec('ax', i, l)}
          />
        ))}
      </Card>
      <Card title="Μεταβολές οπλιτών">
        {HD_SECTIONS.map((n, i) => (
          <Lines
            key={n}
            label={i + 1 + '. ' + n}
            lines={doc.op[i] || []}
            from={i < 4 ? 'από ' + HK() : undefined}
            onChange={(l: string[]) => setSec('op', i, l)}
          />
        ))}
      </Card>
    </>
  );
}

/** Τμήμα 2 (public material) and Τμήμα 3 (payroll): free text that starts from the previous order. */
function sectionCards(m: HdModel) {
  const { doc, set } = m;
  return (
    <>
      <Card title="Τμήμα 2 · Καταλογισμός δημόσιου υλικού">
        <textarea
          className="ui-input hd__ta"
          rows={3}
          aria-label="Τμήμα 2"
          value={doc.t2}
          placeholder="Ø"
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set({ t2: hdUpper(e.target.value) })}
        />
      </Card>
      <Card title="Τμήμα 3 · Μισθοδοσία">
        <textarea
          className="ui-input hd__ta"
          rows={3}
          aria-label="Τμήμα 3"
          value={doc.t3}
          placeholder="Ø"
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set({ t3: hdUpper(e.target.value) })}
        />
        <p className="note" style={{ marginBottom: 0 }}>
          Τα Τμήματα 2 και 3 ξεκινούν από την προηγούμενη Ημερήσια Διαταγή.
        </p>
      </Card>
    </>
  );
}

/** «Πρότυπο Word»: the ready template of the app or your own .docx with tags. */
function templateCard(m: HdModel) {
  const { tpl, pickTpl, run } = m;
  return (
    <Card title="Πρότυπο Word">
      <p className="note" style={{ marginTop: 0 }}>
        {tpl ? (
          <>
            Δικό σου πρότυπο: <b>{tpl.name}</b>.
          </>
        ) : (
          'Χρησιμοποιείται το έτοιμο πρότυπο της εφαρμογής (όπως το έγγραφό σου).'
        )}{' '}
        Δικό σου .docx με ετικέτες, π.χ. <code>{'{ΗΜΕΡΟΜΗΝΙΑ}'}</code>, <code>{'{ΟΠ3}'}</code>: δες τη λίστα στον Οδηγό.
      </p>
      <Button variant="outline" size="sm" onClick={pickTpl}>
        Δικό μου πρότυπο Word…
      </Button>{' '}
      {tpl && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            run(
              { t: 'setSettings', settings: { hdTpl: undefined }, text: 'πρότυπο Ημερήσιας Διαταγής: πίσω στο έτοιμο' },
              false,
            )
          }
        >
          Πίσω στο έτοιμο
        </Button>
      )}
    </Card>
  );
}

/** «Υπογραφή…»: saves the signatures for the next times when asked, then comes out. */
function sigsDialog(m: HdModel) {
  const { state, run, sigList, setSigs, go } = m;
  return (
    <SigsDialog
      title="Ημερήσια Διαταγή"
      initial={sigList}
      keepText={KEEP_SIGS_TEXT}
      onClose={() => setSigs(false)}
      onGo={async (l: Sig[], keep: boolean, pr: boolean) => {
        if (keep)
          await run(
            {
              t: 'setSettings',
              settings: { sigs: { ...(state.settings.sigs || {}), hd: l } },
              text: 'υπογραφή Ημερήσιας Διαταγής: ' + sigsText(l),
            },
            false,
          );
        go(pr, keep ? undefined : l);
      }}
    />
  );
}

export function HdTab() {
  const m = useHd();
  const { narrow, tags, prev, setPrev, sigs } = m;
  const pageHtml = (fs: number) => hdPageHtml(tags, fs);
  return (
    <div>
      {hdHead(m)}
      <div className={cx('hd', !narrow && 'hd--wide')}>
        <div className="hd__left">
          {organsCard(m)}
          {changeCards(m)}
          {sectionCards(m)}
          {templateCard(m)}
        </div>
        {!narrow && (
          <div className="hd__right">
            <button type="button" className="hd__zoom" data-tip="Μεγάλη προεπισκόπηση" onClick={() => setPrev(true)}>
              <Preview html={pageHtml(9)} />
            </button>
          </div>
        )}
      </div>
      {prev && (
        <Dialog size="lg" title="Προεπισκόπηση" onClose={() => setPrev(false)}>
          <Preview html={pageHtml(12)} />
        </Dialog>
      )}
      {sigs && sigsDialog(m)}
    </div>
  );
}
