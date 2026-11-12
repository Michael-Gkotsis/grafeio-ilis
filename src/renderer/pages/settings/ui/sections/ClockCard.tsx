// «Ρυθμίσεις › Ώρα και ζώνη ώρας» cards: what the app and Windows show now, the zone and the correction.
// Purpose: `ClockCard`, two cards (the clock, and its settings) that apply at once and are saved in the settings.
// Does NOT: hold state (model/useClock.ts) or the rules (model/clockView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered. The cards and the buttons are plain functions.
// Covering test: test/screens-settings-guide.test.ts, test/settings-clock-view.test.ts.
import { DOW_FULL, FIX_MAX, dmy, durLabel, utcLabel, weekday } from '../../../../../shared/dates';
import { Alert, Button, Card, Segmented, Select, type ValueEvent } from '../../../../shared/ui';
import { fixAfter, fixText, fixTxt, hm } from '../../model/clockView';
import { useClock } from '../../model/useClock';
import { prefRow } from './prefRow';

type ClockModel = ReturnType<typeof useClock>;

/** One text node: the clock's note. */
const CLOCK_NOTE =
  'Με αυτήν μετρούν όλα: ΗΚΑΙ 08:00, έξοδοι, επιστροφές, ΚΑ ως 06:00, ποιος είναι παρών τώρα, ' +
  'αλλαγή μέρας στα μεσάνυχτα.';

/** The first card: the time in the app's zone, the Windows time and the warning when they differ. */
function clockCard(m: ClockModel) {
  const { fix, now, os, vs, iso, zname, winOff, off, dst } = m;
  return (
    <Card title="Η ώρα της εφαρμογής">
      <div className="clockbig">
        {DOW_FULL[weekday(iso)]} {dmy(iso)} · {hm(now)}
        <small>{CLOCK_NOTE}</small>
      </div>
      <dl className="clockcmp">
        <dt>Ώρα Windows</dt>
        <dd>
          {hm(os)} (ζώνη Windows: {utcLabel(winOff)})
        </dd>
        <dt>Ζώνη εφαρμογής</dt>
        <dd>
          {zname}, {utcLabel(off)}
          {dst}
          {fix ? ' · διόρθωση ' + fixTxt(fix) : ''}
        </dd>
      </dl>
      {Math.abs(vs) >= 1 && (
        <Alert tone="warn">
          <span>
            Η ώρα των Windows διαφέρει {durLabel(vs)} από την ώρα της εφαρμογής. Η εφαρμογή μετρά με {zname}
            {fix ? ' και διόρθωση ' + fixTxt(fix) : ''}. Αν η ώρα πάνω είναι λάθος, διάλεξε «Όπως τα Windows» ή βάλε
            διόρθωση.
          </span>
        </Alert>
      )}
    </Card>
  );
}

/** One correction button: its label, the delta and whether the limit disables it. */
function fixButton(m: ClockModel, label: string, delta: -60 | -1 | 1 | 60) {
  const { fix, save } = m;
  const next = fixAfter(fix, delta);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={delta < 0 ? fix <= -FIX_MAX : fix >= FIX_MAX}
      why="Όριο ±12 ώρες"
      onClick={() => save({ clockFix: next }, fixText(next))}
    >
      {label}
    </Button>
  );
}

/** The correction control: −60′, −1′, the value, +1′, +60′ and «Μηδένισε». */
function fixControl(m: ClockModel) {
  const { fix, save } = m;
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      {fixButton(m, '−60′', -60)}
      {fixButton(m, '−1′', -1)}
      <b className="mono-lg" style={{ minWidth: '70px', textAlign: 'center' }}>
        {fixTxt(fix)}
      </b>
      {fixButton(m, '+1′', 1)}
      {fixButton(m, '+60′', 60)}
      {fix !== 0 && (
        <Button size="sm" variant="ghost" onClick={() => save({ clockFix: 0 }, 'Διόρθωση ώρας: καμία')}>
          Μηδένισε
        </Button>
      )}
    </div>
  );
}

/** The second card: the zone (Athens, Windows', another) and the correction. */
function settingsCard(m: ClockModel) {
  const { tz, mode, zones, pickMode, pickZone } = m;
  return (
    <Card title="Ρύθμιση">
      {prefRow(
        'Ζώνη ώρας',
        'Προεπιλογή: Ελλάδα. Μετρά σωστά τη θερινή ώρα ακόμα κι αν τα Windows 7 έχουν λάθος ζώνη.',
        <Segmented
          small={true}
          value={mode}
          onChange={pickMode}
          items={[
            { value: 'athens', label: 'Ελλάδα (Αθήνα)' },
            { value: 'win', label: 'Όπως τα Windows' },
            { value: 'other', label: 'Άλλη…' },
          ]}
        />,
      )}
      {mode === 'other' &&
        prefRow(
          'Άλλη ζώνη',
          'Όλες οι ζώνες του κόσμου· γράψε για να ψάξεις.',
          <Select
            search={true}
            value={tz && tz !== 'system' ? tz : ''}
            // Phase 6 moves code, not logic: `Select` hands over an event, the old handler read it as the zone
            // itself. Kept as it was; the fix is a behaviour change for its own PR (see the S4 report).
            onChange={(e: ValueEvent) => pickZone(e as unknown as string)}
          >
            <option value="">Διάλεξε ζώνη…</option>
            {zones.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>,
        )}
      {prefRow(
        'Διόρθωση ώρας',
        'Αν το ρολόι του PC πάει μπροστά ή πίσω και δεν μπορείς να το αλλάξεις (χωρίς δικαιώματα διαχειριστή). ' +
          '0 = χωρίς διόρθωση.',
        fixControl(m),
      )}
    </Card>
  );
}

/** «Ώρα και ζώνη ώρας». */
export function ClockCard() {
  const m = useClock();
  return (
    <div className="stack">
      {clockCard(m)}
      {settingsCard(m)}
    </div>
  );
}
