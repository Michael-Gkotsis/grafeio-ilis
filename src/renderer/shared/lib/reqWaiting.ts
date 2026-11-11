// Requests that still wait for an answer.
// Purpose: `reqWaiting`, the one rule behind the «Αιτήσεις» badge, the ΗΚΑΙ summary line and the «Σήμερα» task.
// Does NOT: look at who the requester is (callers also filter by an active person).
// Owner layer: renderer/shared/lib. Why: moved down from screens/todayView.ts so the requests widget does not import a
//   screen (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/today-view.test.ts.
import { isWaiting, type PersonRequest } from '../../../shared/domain';

/** Requests that still wait for an answer («Εγκρίθηκε» / «Απορρίφθηκε»); old ones without an answer do not count. */
export const reqWaiting = (rs: PersonRequest[]) => rs.filter(isWaiting);
