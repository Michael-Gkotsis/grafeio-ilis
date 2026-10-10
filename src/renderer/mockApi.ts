// Μόνο για ανάπτυξη στον browser (χωρίς Electron): ίδιοι κανόνες, δεδομένα στη μνήμη, φανταστικά ονόματα.
import { apply, type Command } from '../shared/commands';
import { emptyState, type AppState, type AuditEntry, type Person } from '../shared/domain';
import { addDays, nowHM, today } from '../shared/dates';
import { fillDay } from '../shared/rules';
import type { Api, CmdResult } from '../shared/api';
import { preflight, hasErrors } from '../shared/preflight';

const SUR = ['ΔΟΚΙΜΙΟΣ', 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', 'ΥΠΟΘΕΤΙΔΗΣ', 'ΦΑΝΤΑΣΙΟΣ', 'ΠΛΑΣΜΑΤΙΚΟΣ', 'ΤΥΧΑΙΟΣ', 'ΑΓΝΩΣΤΟΠΟΥΛΟΣ', 'ΔΕΙΓΜΑΤΑΣ', 'ΕΙΚΟΝΙΚΟΣ', 'ΠΡΟΣΩΡΙΝΟΣ'];
const FIRST = ['ΑΛΦΑΣ', 'ΒΗΤΑΣ', 'ΓΑΜΜΑΣ', 'ΔΕΛΤΑΣ', 'ΕΨΙΛΟΝ', 'ΖΗΤΑΣ', 'ΘΗΤΑΣ', 'ΚΑΠΠΑΣ'];

function seed(): AppState {
  const s = emptyState();
  s.people = Array.from({ length: 120 }, (_, i): Person => ({
    id: i + 1, rank: i % 23 === 4 ? 'ΕΠΟΠ ΛΧΙΑΣ' : i % 9 === 2 ? 'ΔΝΕΑΣ' : 'ΣΤΡ', spec: ['ΤΘ', 'ΤΧ', 'ΔΒ', 'ΠΖ'][i % 4],
    last: SUR[i % SUR.length] + (i >= SUR.length ? ' ' + String.fromCharCode(913 + Math.floor(i / SUR.length)) : ''), first: FIRST[(i * 3) % FIRST.length], father: 'ΠΑΤΕΡΑΣ',
    asm: String(100000 + i * 37), phone: '6900' + String(100000 + i * 7919).slice(0, 6), room: (i % 8) + 1,
    si: i % 17 === 3 ? 'Ι3 ΑΟΠΛΟ' : i % 13 === 5 ? 'Ι4' : 'Ι1', post: i === 8 ? 'ΚΨΜ' : i === 50 ? 'ΙΑΤΡΟΣ ΣΤΕΠ' : null,
    role: i % 15 === 0 ? 'ΘΑΛΑΜΑΡΧΗΣ' : null, essos: '2026 Γ΄', attached: false, active: true, notes: ''
  }));
  const t = today(); let n = 0; const id = () => 'm' + ++n;
  const st = (pid: number, type: any, a: number, b: number, extra: any = {}) => ({ id: id(), pid, type, from: addDays(t, a), to: addDays(t, b), ...extra });
  s.statuses = [st(5, 'LEAVE', -3, 0), st(10, 'LEAVE', -4, 2), st(12, 'SICK', -1, 2), st(47, 'NOS', -2, 3), st(18, 'EY', 0, 0), st(21, 'EA', -5, 4), st(44, 'EO', -10, 20),
    st(27, 'PUN', -2, 3, { kind: 'Περιορισμός' }), st(88, 'PUN', 1, 5, { kind: 'Περιορισμός', pending: true }), st(23, 'OUT', 0, 0), st(31, 'DN', 0, 0), st(15, 'EA', -6, -1)];
  for (let i = -30; i <= 0; i++) s.guards = fillDay(s, addDays(t, i)).guards;
  return s;
}

export function mockApi(): Api {
  let state = seed(); let seq = 0; const audit: AuditEntry[] = []; const undo: { id: number; prev: AppState }[] = [];
  const res = (text: string): CmdResult => ({ ok: true, state, audit: [...audit], text });
  return {
    boot: async () => ({ state, audit, dataDir: '(δοκιμή)', outputDir: '(δοκιμή)', templatesDir: '(δοκιμή)', version: 'dev', lastUsb: null, seenUntil: 0, sessionStart: audit.length ? audit[0].id : 0, templates: [
      { id: 'froura', name: 'Κατάσταση υπηρεσιών (ΦΡΟΥΡΑ ΣΒΕΝ)', file: 'froura.xlsx', ok: true, custom: false },
      { id: 'hkai', name: 'ΗΚΑΙ (μπροστινο, πισω)', file: 'hkai.xlsx', ok: true, custom: false },
      { id: 'outs', name: 'Εξοδούχοι / Παραμένοντες', file: 'exodouxoi.xlsx', ok: true, custom: false },
      { id: 'check', name: 'Έλεγχος υπηρεσιών (μηνιαίο πλέγμα)', file: 'δημιουργείται από την εφαρμογή', ok: true, custom: false }] }),
    run: async (cmd: Command) => {
      try {
        const r = apply(state, cmd, { today: today(), newId: () => 'x' + ++seq });
        const prev = state; state = r.state;
        if (r.text) { const e: AuditEntry = { id: ++seq, at: nowHM(), day: today(), text: r.text, files: r.files, source: r.source || 'app', undoable: r.undoable !== false, undone: false }; audit.unshift(e); if (e.undoable) undo.push({ id: e.id, prev }); }
        return res(r.text);
      } catch (e: any) { return { ok: false, error: e.message }; }
    },
    undo: async () => {
      const u = undo.pop(); if (!u) return { ok: false, error: 'Δεν υπάρχει κάτι για αναίρεση' };
      state = u.prev; const e = audit.find(x => x.id === u.id); if (e) e.undone = true; return res('Αναιρέθηκε');
    },
    exportFile: async (kind, date, opts) => {
      const checks = preflight(kind, state, date);
      if (hasErrors(checks)) return { ok: false, error: 'Ο προέλεγχος βρήκε λάθη', checks };
      if (checks.length && !opts?.ack) return { ok: false, error: 'Θέλει επιβεβαίωση', checks, needAck: true };
      return { ok: true, file: '(δοκιμή) ' + kind + ' ' + date + '.xlsx', warnings: [] };
    },
    pickRoster: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν διαβάζονται αρχεία.' }),
    applyRoster: async () => ({ ok: false, error: 'δοκιμή' }),
    backup: async () => ({ ok: true, file: '(δοκιμή)' }),
    openFolder: async () => {},
    chooseOutputDir: async () => null,
    listBackups: async () => [{ name: 'ilh_' + today() + '_090000_ημερήσιο.db', day: today(), label: 'ημερήσιο', size: 123456 }],
    restoreBackup: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν γίνεται επαναφορά.' }),
    diag: async () => ({ startupMs: 0, procs: [{ type: 'Browser', kb: 0, cpu: 0 }], gpuDisabled: false, versions: { electron: '—', chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || '—', node: '—' }, dbKb: 0, people: state.people.length, statuses: state.statuses.length, guardDays: Object.keys(state.guards).length, dataDir: '(δοκιμή)', backups: 1 }),
    setGpu: async () => {},
    usbCopy: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν γράφονται αρχεία.' }),
    importBackup: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν διαβάζονται αρχεία.' })
  };
}
