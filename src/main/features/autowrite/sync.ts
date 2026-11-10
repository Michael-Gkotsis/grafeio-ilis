// Writing one list kind (or all kinds of one file) back into its Excel file, and what is recorded afterwards.
//
// Purpose: `syncOut` («Ενημέρωση Excel» and the creation of a new file), `syncFileAuto` (the automatic write of all
//   dirty kinds of one file in one open and one save), `autoCheck` (is it safe to write by itself now?),
//   `afterWrite` (new binding, sync memory, History line) and the History text of a write.
// Does NOT: decide when to write (run.ts, schedule.ts), build the cells (`main/sources.ts` `writeSource` and
//   `writeGroup`), or read a file into the app (the import side, still in main.ts).
// Owner layer: main (architecture), `features/autowrite`. Imports app/*, shared/*, `sources`, `offload`.
// Why: the manual and the automatic write must record the same things in the same way, so they share one place. Moved
//   verbatim from main.ts (Phase 4.3a).
// Covering test: test/sources*.test.ts and test/excel*.test.ts (the write itself); `npm run bench:golden`.
import path from 'path';
import { nowHM, today } from '../../../shared/dates';
import { CADRE_OPT } from '../../../shared/cadreSource';
import { PKEYS, type PKey } from '../../../shared/personal';
import { KIND, baseOf, isStatusKind, type ListKind, type SourceBinding } from '../../../shared/sources';
import { off } from '../../offload';
import { locateCheck, tableState, writeGroup, writeSource, type SourceMeta, type WriteOutcome } from '../../sources';
import { bindingOf, current, moveBinding, srcMeta, stampNow } from '../../app/bindings';
import { serial } from '../../app/serial';
import { store } from '../../app/state';
import type { SyncOut } from '../../app/types';

// The format that was put in, in short (for the History)
const tidyWhat = (t: string[]) =>
  [
    t.some((x) => x.startsWith('Ο τίτλος')) && 'τίτλος στο κέντρο',
    t.some((x) => x.startsWith('Λίστα')) && 'λίστες επιλογής',
  ]
    .filter(Boolean)
    .join(' και ');

function writeText(
  kind: ListKind,
  file: string,
  r: {
    added: number;
    changed: number;
    cleared: number;
    notFound: string[];
    warn?: string[];
    created: boolean;
    rooms?: { n: number; added: number; placed?: number; sheet: string };
    tidy?: string[];
  },
  b: SourceBinding,
) {
  const parts = [
    r.created && 'φτιάχτηκε',
    r.added &&
      r.added +
        (kind === 'people'
          ? r.added === 1
            ? ' νέος στρατιώτης'
            : ' νέοι στρατιώτες'
          : kind === 'cadres'
            ? r.added === 1
              ? ' νέο στέλεχος'
              : ' νέα στελέχη'
            : r.added === 1
              ? ' νέα'
              : ' νέες'),
    r.changed && r.changed + (r.changed === 1 ? ' αλλαγή' : ' αλλαγές'),
    r.cleared && r.cleared + ' σβήστηκαν',
    r.tidy?.length && 'μορφή: ' + tidyWhat(r.tidy),
  ]
    .filter(Boolean)
    .join(', ');
  return (
    'Excel ' +
    KIND[kind].label.toLowerCase() +
    ': ' +
    path.basename(file) +
    ' › ' +
    b.sheet +
    (parts ? ' (' + parts + ')' : '') +
    (r.notFound.length ? '. Δεν βρέθηκαν στο φύλλο: ' + r.notFound.slice(0, 5).join(', ') : '') +
    (r.warn?.length ? '. ' + r.warn.join(' ') : '') +
    (r.rooms?.n
      ? '. Άλλαξε θάλαμος σε ' +
        (r.rooms.n === 1 ? '1 άτομο' : r.rooms.n + ' άτομα') +
        ': μετακίνησέ ' +
        (r.rooms.n === 1 ? 'τον' : 'τους') +
        ' και στο φύλλο ' +
        r.rooms.sheet +
        ' (δεν ενημερώνεται μόνο του)'
      : '') +
    (r.rooms?.placed
      ? '. ' +
        (r.rooms.placed === 1 ? 'Ο νέος γράφτηκε' : 'Οι ' + r.rooms.placed + ' νέοι γράφτηκαν') +
        ' και στο φύλλο ' +
        r.rooms.sheet +
        ', στον θάλαμό ' +
        (r.rooms.placed === 1 ? 'του' : 'τους')
      : '') +
    (r.rooms?.added
      ? '. ' +
        (r.rooms.added === 1 ? "Νέος στρατιώτης: γράψ' τον" : r.rooms.added + " νέοι στρατιώτες: γράψ' τους") +
        ' και στο φύλλο ' +
        r.rooms.sheet +
        ', στον θάλαμό ' +
        (r.rooms.added === 1 ? 'του' : 'τους') +
        ' (δεν ενημερώνεται μόνο του)'
      : '')
  );
}

/**
 * Writes one kind into its Excel file, one write at a time (the shared `serial` queue).
 * @param auto true: only if the file was written or read before and has not changed since (the automatic rules)
 * @param create true: the file is new and is made by this write
 * @returns the History text and file, or `{ ok: false, error }`; never throws for an expected failure.
 */
export const syncOut = (kind: ListKind, auto: boolean, create = false): Promise<SyncOut> =>
  serial(() => syncOutNow(kind, auto, create));

// Before an automatic write: does it write by itself here? where are the table and its columns now? did the file
// change outside the app? Returns the binding to write with, or the result when nothing is written now.
async function autoCheck(kind: ListKind): Promise<{ b: SourceBinding; m?: SourceMeta } | SyncOut> {
  let b = bindingOf(kind);
  if (!b) return { ok: false, error: 'Δεν έχει οριστεί αρχείο για ' + KIND[kind].label };
  const m = srcMeta.get(kind);
  if (b.write === false || !m?.at || m.hold) return { ok: true, text: '', file: b.file, unchanged: true };
  // the columns as they are now (as in «Ενημέρωση Excel»); without a sure match it does not write by itself
  const loc = await locateCheck(kind, b);
  if (loc.b !== b) {
    moveBinding(kind, loc.b);
    b = bindingOf(kind) || loc.b;
  }
  if (loc.need) return { ok: false, error: 'Περιμένει αντιστοίχιση: ' + loc.need };
  const t = await tableState(b, m, kind);
  if (t.header != null) {
    moveBinding(kind, { ...b, header: t.header });
    b = bindingOf(kind)!;
  }
  if (t.refresh) srcMeta.set(kind, t.refresh);
  if (t.changed) {
    srcMeta.set(kind, {
      pending: true,
      error: 'Το αρχείο άλλαξε εκτός εφαρμογής. Πάτα «Ανανέωση από Excel» και μετά «Ενημέρωση Excel».',
    });
    return { ok: false, error: 'changed' };
  }
  return { b, m };
}

// After one kind was written: the new binding (time columns, a table that moved down), what we know about the file,
// the History
function afterWrite(kind: ListKind, b: SourceBinding, r: WriteOutcome): SyncOut {
  if (!r.ok) {
    srcMeta.set(kind, { pending: true, error: r.error, locked: !!r.locked });
    return r;
  }
  if (r.binding) {
    moveBinding(
      kind,
      r.binding,
      r.timeCols
        ? kind === 'caps'
          ? 'στήλες για τις δικές σου υπηρεσίες στο φύλλο «' + b.sheet + '»'
          : 'μπήκαν στήλες ' +
            KIND[kind].fields
              .filter(
                (f) =>
                  (f.k === 'tout' ||
                    f.k === 'tin' ||
                    f.k === 'dest' ||
                    PKEYS.includes(f.k as PKey) ||
                    (CADRE_OPT as readonly string[]).includes(f.k)) &&
                  b.cols[f.k] == null &&
                  r.binding!.cols[f.k] != null,
              )
              .map((f) => '«' + f.head + '»')
              .join(' και ') +
            ' στο φύλλο «' +
            b.sheet +
            '» (' +
            (kind === 'people'
              ? 'στοιχεία που έχεις στις καρτέλες'
              : kind === 'cadres'
                ? 'στοιχεία που έχεις στις καρτέλες των στελεχών'
                : kind === 'leave'
                  ? 'άδειες με ώρα ή κατεύθυνση'
                  : 'εγγραφές με ώρα') +
            ')'
        : undefined,
    );
    b = bindingOf(kind) || r.binding;
  }
  srcMeta.set(kind, {
    ...r.meta,
    ...(isStatusKind(kind) ? { base: baseOf(kind, store.state, r.meta.keys || []) } : {}),
    at: stampNow(),
    pending: false,
    error: undefined,
    locked: false,
    hold: undefined,
  });
  if (r.unchanged)
    return { ok: true, text: 'Το ' + path.basename(r.file) + ' είχε ήδη τα ίδια', file: r.file, unchanged: true };
  const text = writeText(kind, r.file, r, b);
  store.addAudit(
    { at: nowHM(), day: today(), text, files: [path.basename(r.file)], source: 'excel', undoable: false },
    null,
  );
  return { ok: true, text, file: r.file, unchanged: false };
}

async function syncOutNow(kind: ListKind, auto: boolean, create = false): Promise<SyncOut> {
  let b = bindingOf(kind);
  if (!b) return { ok: false, error: 'Δεν έχει οριστεί αρχείο για ' + KIND[kind].label };
  let m = srcMeta.get(kind);
  if (auto) {
    const c = await autoCheck(kind);
    if ('ok' in c) return c;
    b = c.b;
    m = c.m;
  } else b = (await current(kind, b))!;
  return afterWrite(kind, b, await writeSource(kind, b, store.state, m, today(), { tidy: !auto, create }));
}

/**
 * Automatic write of all the kinds of one file together (P2): one open and one save, not one per kind. Kinds that
 * are not to be written now (see `autoCheck`) are left out.
 * @param kinds the dirty kinds whose binding points at the same file
 */
export async function syncFileAuto(kinds: ListKind[]) {
  const jobs: { kind: ListKind; b: SourceBinding; meta?: SourceMeta }[] = [];
  for (const k of kinds) {
    const c = await autoCheck(k);
    if (!('ok' in c)) jobs.push({ kind: k, b: c.b, meta: c.m });
  }
  if (!jobs.length) return;
  // in the Excel thread: the window does not freeze while the Δυναμολόγιο is written
  const s = store.state,
    t = today();
  const rs = await off('writeGroup', [jobs, t, { tidy: false }], () => writeGroup(jobs, s, t, { tidy: false }), s);
  // same order and effect as the former `jobs.forEach(...)` (a plain loop, as new files have no forEach)
  for (const [i, j] of jobs.entries()) afterWrite(j.kind, j.b, rs[i]);
}
