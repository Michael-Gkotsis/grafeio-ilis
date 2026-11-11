// Pure rules of the «Αιτήσεις» (requests) card and dialogs.
// Purpose: the sort order, the toast after an answer, the form of a request and what is missing from it.
// Does NOT: read the store, write commands or draw anything (model/useRequestsCard.ts and model/useRequestDialog.ts do).
// Owner layer: renderer/widgets/requests. Why: moved verbatim from screens/other.ts (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/requests.test.ts, test/screens-dialogs-forms.test.ts.
import { byName } from '../../../../shared/hkaiText';
import { reqText } from '../../../../shared/commands';
import type { LeaveAsk, Person, PersonRequest } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { rkShort } from '../../../entities/person';

/** The kind of leave that is written as an honorary leave (`type: 'HON'`), not as a kind of `LEAVE`. */
export const HON = 'Τιμητική';

/** The people's requests of a list, by name then by id; requests of people who are gone are left out. */
export const sortedRequests = (rs: PersonRequest[], pm: Map<number, Person>) =>
  rs.filter((r) => pm.has(r.pid)).sort((a, b) => byName(pm.get(a.pid)!, pm.get(b.pid)!) || a.id.localeCompare(b.id));

/**
 * The toast after the commander answers a request.
 * @param ok true approved, false rejected, null the answer was taken back
 */
export function decisionToast(r: PersonRequest, ok: boolean | null, p: Person): string {
  const who = rkShort(p);
  const what = r.leave ? 'άδεια' : 'αίτηση';
  if (ok === null) return 'Αναιρέθηκε η απόφαση για την ' + what + ' του ' + who;
  if (ok)
    return r.leave ? 'Εγκρίθηκε η άδεια του ' + who + ' και μπήκε στις Άδειες.' : 'Εγκρίθηκε η αίτηση του ' + who + '.';
  return 'Απορρίφθηκε η αίτηση ' + (r.leave ? 'άδειας ' : '') + 'του ' + who;
}

/** The fields of the request form. `pid` is null until a soldier is picked. */
export interface RequestForm {
  pid: number | null;
  /** ISODate of the ΗΚΑΙ the request is written in. */
  date: string;
  text: string;
  isLeave: boolean;
  kind: string;
  from: string;
  to: string;
  fromTime: string;
  toTime: string;
  dest: string;
}

/** The leave of the form as the command wants it: optional times are written only when valid. */
export function leaveOf(f: RequestForm): LeaveAsk | undefined {
  const ft = normTime(f.fromTime);
  const tt = normTime(f.toTime);
  const tms = { ...(ft ? { fromTime: ft } : {}), ...(tt ? { toTime: tt } : {}) };
  return f.isLeave
    ? {
        type: f.kind === HON ? 'HON' : 'LEAVE',
        ...(f.kind === HON ? {} : { kind: f.kind }),
        from: f.from,
        to: f.to,
        ...tms,
        ...(f.dest.trim() ? { dest: f.dest.trim() } : {}),
      }
    : undefined;
}

/** Is the form complete, and if not, what is missing (shown next to the disabled «Αποθήκευση»). */
export function formCheck(f: RequestForm, p: Person | undefined): { ok: boolean; miss: string } {
  const text = reqText(f.text);
  const ft = normTime(f.fromTime);
  const tt = normTime(f.toTime);
  const ok = !!p && (f.isLeave || !!text) && (!f.isLeave || (ft != null && tt != null));
  const miss = ok
    ? ''
    : !p
      ? 'Λείπει: Στρατιώτης'
      : !f.isLeave
        ? 'Λείπει: Τι αιτείται'
        : 'Μια ώρα δεν είναι σωστή (π.χ. 14:00)';
  return { ok, miss };
}
