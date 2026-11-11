// Hidden screen «Διάγνωση» (Ctrl+Shift+D or the search box): memory per process, start-up time, GPU switch, speed run.
// Purpose: `DiagScreen`, for checking the office PC (Win7, Atom, 2 GB): memory, speed, version.
// Does NOT: poll or time anything itself (model/useDiag.ts, model/speedRun.ts) or format numbers (model/view.ts).
// Owner layer: renderer/pages/diag. Why: moved verbatim from screens/diag.ts (Phase 6); the cards are plain functions,
//   not components, so React renders exactly what it rendered before.
// Covering test: test/screens-main.test.ts, test/diag-view.test.ts.
import type { Diag } from '../../../../shared/api';
import { Alert, Badge, Button, Card, PageHeader } from '../../../shared/ui';
import { getLastRun } from '../model/speedRun';
import { useDiag, type DiagModel } from '../model/useDiag';
import { MEM_WARN_KB, mb, memTotalKb, speedText, startupSecs, tone, writeText } from '../model/view';

function memoryCard(d: Diag, total: number) {
  return (
    <Card title="Μνήμη">
      <table className="kv">
        <tbody>
          {d.procs.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: process types repeat (several «renderer»), order is main's
            <tr key={i}>
              <th>{p.type}</th>
              <td className="diag__num">{mb(p.kb)}</td>
              <td className="muted diag__num">{p.cpu}% CPU</td>
            </tr>
          ))}
          <tr className="diag__total">
            <th>
              <b>Σύνολο</b>
            </th>
            <td className="diag__num">
              <b>{mb(total)}</b>
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function startCard(d: Diag, version: string) {
  return (
    <Card title="Εκκίνηση και δεδομένα">
      <table className="kv">
        <tbody>
          <tr>
            <th>Εκκίνηση ως το παράθυρο</th>
            <td>{startupSecs(d.startupMs)} δευτ.</td>
          </tr>
          <tr>
            <th>Βάση</th>
            <td>{d.dbKb} KB</td>
          </tr>
          <tr>
            <th>Άτομα / καταστάσεις / μέρες υπηρεσιών</th>
            <td>
              {d.people} / {d.statuses} / {d.guardDays}
            </td>
          </tr>
          <tr>
            <th>Αντίγραφα ασφαλείας</th>
            <td>{d.backups}</td>
          </tr>
          <tr>
            <th>Φάκελος δεδομένων</th>
            <td className="mono diag__path">{d.dataDir}</td>
          </tr>
          <tr>
            <th>Έκδοση</th>
            <td>
              {version} · Electron {d.versions.electron} · Chromium {d.versions.chrome}
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function writesCard(d: Diag) {
  return (
    <Card title="Εγγραφές στο Excel">
      <p className="diag__lead">
        {/* one text node before the choice, as the htm markup had it (no extra «<!-- -->» in the HTML) */}
        {'Οι τελευταίες εγγραφές που έκανε μόνη της η εφαρμογή. '}
        {d.worker ? 'Γίνονται σε ξεχωριστό νήμα, οπότε η οθόνη δεν κολλάει όσο γράφει.' : 'Γίνονται στο κύριο νήμα.'}
      </p>
      {d.writes.length ? (
        <table className="kv">
          <tbody>
            {d.writes.map((w, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the same write can repeat at the same minute
              <tr key={i}>
                <th>
                  {w.at} {w.what}
                </th>
                <td className="diag__num">{w.error ? <Badge tone="bad">δεν έγινε</Badge> : writeText(w.ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Καμία εγγραφή από τότε που άνοιξε η εφαρμογή.</p>
      )}
    </Card>
  );
}

function gpuCard(d: Diag, toggleGpu: DiagModel['toggleGpu']) {
  return (
    <Card title="Επιτάχυνση γραφικών (GPU)">
      <p className="diag__lead">
        Σε παλιές κάρτες γραφικών με Windows 7 η επιτάχυνση μπορεί να τρώει μνήμη ή να δίνει μαύρη οθόνη. Δοκίμασε και
        τα δύο και κράτα ό,τι δείχνει λιγότερη μνήμη. Η εφαρμογή ξανανοίγει.
      </p>
      <p className="diag__state">
        Τώρα: <b>{d.gpuDisabled ? 'κλειστή' : 'ανοιχτή'}</b>
      </p>
      <Button variant="outline" onClick={() => toggleGpu(!d.gpuDisabled)}>
        {d.gpuDisabled ? 'Άνοιξε την επιτάχυνση' : 'Κλείσε την επιτάχυνση'}
      </Button>
    </Card>
  );
}

function speedCard({ step, startSpeed }: DiagModel) {
  const lastRun = getLastRun();
  return (
    <Card title="Μέτρηση ταχύτητας">
      <p className="diag__lead">
        Ανοίγει μία μία τις οθόνες του μενού και τις καρτέλες τους και μετρά πόσο αργεί η καθεμία να εμφανιστεί. Δεν
        αλλάζει κανένα στοιχείο. Στο τέλος γυρίζει εδώ με τον πίνακα.
      </p>
      <Button disabled={!!step} onClick={startSpeed}>
        {step ? 'Μετράει: ' + step : lastRun ? 'Μέτρησε ξανά' : 'Μέτρηση ταχύτητας'}
      </Button>
      {lastRun && (
        <table className="diag__runs">
          <caption className="muted diag__caption">
            Μέτρηση στις {lastRun.at} (κάτω από 0,4 δευτ. είναι καλά)
          </caption>
          <tbody>
            {lastRun.rows.map((r) => (
              <tr key={r.name}>
                <th className={r.tab ? 'diag__sub' : undefined}>{r.name}</th>
                <td className="diag__num">
                  <Badge tone={tone(r.ms)}>{speedText(r.ms)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** The «Διάγνωση» screen; «Φόρτωση…» until main answers the first `diag()` call. */
export function DiagScreen() {
  const m = useDiag();
  const { d, boot } = m;
  if (!d) return <div className="boot">Φόρτωση…</div>;
  const total = memTotalKb(d.procs);
  return (
    <div className="diag">
      <PageHeader
        title="Διάγνωση"
        sub="Για τον έλεγχο στο μηχάνημα του γραφείου: μνήμη, ταχύτητα, έκδοση. Ενημερώνεται κάθε 3 δευτερόλεπτα."
      />
      {total > MEM_WARN_KB && (
        <Alert tone="warn">
          <span>Η μνήμη ξεπερνά τα 250 MB. Δοκίμασε να κλείσεις την επιτάχυνση γραφικών.</span>
        </Alert>
      )}
      <div className="diag__grid">
        {memoryCard(d, total)}
        {startCard(d, boot.version)}
        {writesCard(d)}
        {gpuCard(d, m.toggleGpu)}
      </div>
      <div className="diag__speed">{speedCard(m)}</div>
    </div>
  );
}
