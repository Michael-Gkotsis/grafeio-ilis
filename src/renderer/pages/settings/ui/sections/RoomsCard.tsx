// «Ρυθμίσεις › Θάλαμοι και ουλαμοί» card: room count, rooms per platoon, platoon editor, weekend out-rooms.
// Purpose: `RoomsCard` (Michael, 17/10): the number of rooms becomes the list of the «Θάλαμος» field of a soldier.
// Does NOT: hold state (model/useRooms.ts) or the rules (model/roomsView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/units.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered. The chips and rows are plain functions, not components.
// Covering test: test/screens-settings-guide.test.ts, test/settings-rooms-view.test.ts.
import type { ChangeEvent } from 'react';
import type { Platoon } from '../../../../../shared/domain';
import { makePlatoons } from '../../../../../shared/domain';
import { Alert, Button, Card } from '../../../../shared/ui';
import { MAX_ROOMS, num, range, same, type OutDay } from '../../model/roomsView';
import { useRooms } from '../../model/useRooms';

type RoomsModel = ReturnType<typeof useRooms>;

const WEEKEND: [OutDay, string][] = [
  [6, 'Σάββατο'],
  [0, 'Κυριακή'],
];

/** One room button: pressed when the room belongs to the platoon (or goes out that day). */
function chip(m: RoomsModel, r: number, on: boolean, fn: () => void, label: string) {
  return (
    <button
      key={r}
      type="button"
      className="ui-chip ui-chip--sm"
      aria-pressed={on}
      aria-label={label}
      data-tip={m.perRoom.get(r) ? m.perRoom.get(r) + ' στρατιώτες' : 'Κανένας στρατιώτης ακόμα'}
      onClick={fn}
    >
      Θ{r}
    </button>
  );
}

/** The two number boxes on top. */
function counts(m: RoomsModel) {
  const { n, per, renum } = m;
  return (
    <div className="field-row">
      <div className="field">
        <label className="field__label" htmlFor="rm-n">
          Αριθμός θαλάμων
        </label>
        <input
          id="rm-n"
          className="ui-input"
          type="number"
          min="1"
          max={MAX_ROOMS}
          value={n}
          onChange={(e: ChangeEvent<HTMLInputElement>) => renum(num(e.target.value, MAX_ROOMS), per)}
        />
        <span className="field__help">Γίνεται η λίστα του πεδίου «Θάλαμος» όταν βάζεις ή διορθώνεις στρατιώτη.</span>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="rm-p">
          Θάλαμοι ανά ουλαμό
        </label>
        <input
          id="rm-p"
          className="ui-input"
          type="number"
          min="1"
          max={MAX_ROOMS}
          value={per}
          onChange={(e: ChangeEvent<HTMLInputElement>) => renum(n, num(e.target.value, MAX_ROOMS))}
        />
        <span className="field__help">Οι ουλαμοί φτιάχνονται μόνοι τους με τη σειρά των θαλάμων.</span>
      </div>
    </div>
  );
}

/** One platoon: its name, its room chips and the remove button. */
function platoonRow(m: RoomsModel, u: Platoon, i: number) {
  return (
    <div key={i} className="field-row" style={{ alignItems: 'center' }}>
      <input
        className="ui-input"
        style={{ width: '170px', flex: 'none' }}
        aria-label={'Όνομα ουλαμού ' + (i + 1)}
        value={u.name}
        onChange={(e: ChangeEvent<HTMLInputElement>) => m.rename(i, e.target.value)}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
        {range(m.n).map((r) =>
          chip(m, r, u.rooms.includes(r), () => m.toggle(i, r), 'Θάλαμος ' + r + ' στον ' + u.name),
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        aria-label={'Αφαίρεση: ' + u.name}
        data-tip="Αφαίρεση ουλαμού (οι θάλαμοί του μένουν χωρίς ουλαμό)"
        onClick={() => m.delPl(i)}
      >
        ✕
      </Button>
    </div>
  );
}

/** The «Ουλαμοί» field: platoon rows, the add and rebuild buttons, and the rooms without a platoon. */
function platoons(m: RoomsModel) {
  const { n, per, pl, free } = m;
  return (
    <div className="field">
      <span className="field__label">Ουλαμοί</span>
      <span className="field__help">
        Πάτα έναν θάλαμο για να τον βάλεις σε αυτόν τον ουλαμό· ξαναπάτα για να τον βγάλεις. Ο ουλαμός φαίνεται στο
        Δυναμολόγιο, στην καρτέλα και στο φίλτρο «Ουλαμός».
      </span>
      <div className="stack" style={{ gap: '10px', marginTop: '8px' }}>
        {pl.map((u, i) => platoonRow(m, u, i))}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={m.addPl}>
          + Ουλαμός
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-tip={'Από την αρχή: ανά ' + per + ' θαλάμους'}
          disabled={same(pl, makePlatoons(n, per))}
          onClick={() => m.setPl(makePlatoons(n, per))}
        >
          Ξαναφτιάξε τους ουλαμούς
        </Button>
      </div>
      {free.length > 0 && (
        <span className="field__help" style={{ color: 'var(--warn)' }}>
          Χωρίς ουλαμό: {free.map((r) => 'Θ' + r).join(', ')}
        </span>
      )}
    </div>
  );
}

/** The «Θάλαμοι εξόδου το Σαββατοκύριακο» field. */
function weekendOut(m: RoomsModel) {
  return (
    <div className="field">
      <span className="field__label">Θάλαμοι εξόδου το Σαββατοκύριακο (Κ-16)</span>
      {WEEKEND.map(([d, l]) => (
        <div key={d} className="field-row" style={{ alignItems: 'center' }}>
          <span style={{ width: '80px', flex: 'none', fontSize: '13px' }}>{l}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
            {range(m.n).map((r) =>
              chip(m, r, m.out[d].includes(r), () => m.togOut(d, r), 'Θάλαμος ' + r + ' βγαίνει ' + l),
            )}
          </div>
        </div>
      ))}
      <span className="field__help">Από αυτούς προτείνει τους εξοδούχους στις Εξόδους.</span>
    </div>
  );
}

/** The «Θάλαμοι και ουλαμοί» card of «Ρυθμίσεις». */
export function RoomsCard() {
  const m = useRooms();
  const { n, beyond, bad } = m;
  return (
    <Card title="Θάλαμοι και ουλαμοί">
      {counts(m)}
      {beyond.length > 0 && (
        <Alert tone="warn">
          <span>
            {beyond.length === 1 ? '1 στρατιώτης είναι' : beyond.length + ' στρατιώτες είναι'}
            {' σε θάλαμο μεγαλύτερο από '}
            {n} ({[...new Set(beyond.map((p) => 'Θ' + p.room))].join(', ')}). Δεν ανήκουν σε ουλαμό μέχρι να τους
            αλλάξεις θάλαμο ή να αυξήσεις τους θαλάμους.
          </span>
        </Alert>
      )}
      {platoons(m)}
      {weekendOut(m)}
      {bad && <Alert tone="bad">{bad}</Alert>}
      <div>
        <Button disabled={!!bad} why={bad || undefined} onClick={m.save}>
          Αποθήκευση
        </Button>
      </div>
    </Card>
  );
}
