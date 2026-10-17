// Μόνο για ανάπτυξη στον browser (χωρίς Electron): ίδιοι κανόνες, δεδομένα στη μνήμη, φανταστικά ονόματα.
import { apply, type Command } from '../shared/commands';
import { emptyState, type AppState, type AuditEntry, type Person } from '../shared/domain';
import { addDays, nowHM, today } from '../shared/dates';
import { fillDay } from '../shared/rules';
import type { Api, CmdResult, DirTarget, SourceBook } from '../shared/api';
import type { RawSheet } from '../shared/roster';
import { KIND, ambiguousLines, describeSets, detectTables, diffStatuses, hkaiMapOf, parseStatuses, planSource, type ListKind, type SourceBinding } from '../shared/sources';
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
  s.statuses = [st(5, 'LEAVE', -3, 0), st(10, 'LEAVE', -4, 2), st(12, 'SICK', -1, 2), st(47, 'NOS', -2, 3), st(18, 'EY', 0, 0), st(21, 'EA', -5, 4), st(44, 'EO', -10, 20), st(52, 'EA', -3, 0, { open: true }),
    st(27, 'PUN', -2, 3, { kind: 'Περιορισμός' }), st(88, 'PUN', 1, 5, { kind: 'Περιορισμός', pending: true, on: t, by: 'ΛΧΙΑ ΔΟΚΙΜΙΟ', reason: 'απουσίασε από το προσκλητήριο' }), st(23, 'OUT', 0, 0), st(31, 'DN', 0, 0), st(15, 'EA', -6, -1)];
  s.requests = [{ id: id(), pid: 33, date: t, text: 'μετάθεση στην 2η ΕΠΧΙΑ' }, { id: id(), pid: 61, date: t, text: 'για οικογενειακούς λόγους', leave: { type: 'LEAVE', kind: 'Κανονική', from: addDays(t, 1), to: addDays(t, 3) } }];
  s.people[99] = { ...s.people[99], active: false, outOn: t, notes: 'μετάθεση στο 2ο ΣΠ' };
  for (let i = -30; i <= 0; i++) s.guards = fillDay(s, addDays(t, i)).guards;
  // υπηρεσίες χωρίς θέση από τον έλεγχο υπηρεσιών (σκέτο Θ ή Μ) και παλιές «προηγούμενες υπηρεσίες» για τον έλεγχο μετά την αναβάθμιση
  s.dutyLog = { [addDays(t, -2)]: [{ pid: 40, kind: 'th' }, { pid: 41, kind: 'mg' }] };
  s.baseline = { 7: { th: 3, mg: 1, hol: 1 }, 19: { th: 2 } };
  return s;
}

// Φανταστικό βιβλίο με τη δομή του Δυναμολογίου (ΣΥΝΟΛΙΚΟ, ΤΙΜΩΡΗΜΕΝΟΙ, IATRIKA με 3 πίνακες): μόνο ψεύτικα ονόματα
function fakeBook(s: AppState): SourceBook {
  const head = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Τηλέφωνο', 'Θάλαμος'];
  const pr = (p: AppState['people'][number], i: number) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm || null, p.phone || null, p.room];
  const D = (iso: string) => new Date(iso + 'T00:00:00Z');
  const ppl = s.people.slice(0, 60);
  const sheets: RawSheet[] = [
    { name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΔΥΝΑΜΟΛΟΓΙΟ Β\' ΕΣΣΟ 2026'], ['ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ 4ης ΙΛΗΣ'], [...head, 'Σ.Ι', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], ...ppl.map((p, i) => [...pr(p, i), i % 9 === 0 ? 'Ι3 ΑΟΠΛΟ' : 'Ι1', p.role || null])] },
    { name: 'ΤΙΜΩΡΗΜΕΝΟΙ', rows: [['ΤΙΜΩΡΗΜΕΝΟΙ'], [...head, 'ΑΠΌ', 'ΕΩΣ', 'ΕΙΔΟΣ\nΠΟΙΝΗΣ'], [...pr(ppl[3], 0), D(addDays(today(), -1)), D(addDays(today(), 2)), 'ΠΕΡΙΟΡΙΣΜΟΣ'], [2], [3]] },
    { name: 'IATRIKA', rows: [['ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ-ΑΝ.ΑΔ.'], [...head, 'Εισαγωγή', 'ΕΙΣ', 'ΕΞ', 'Παρατηρήσεις'], [1, 'ΣΤΡ'], [], ['ΕΙΣΑΓΩΓΕΣ ΣΤΕΠ'], [...head, 'ΕΙΣ', 'ΕΞ', 'Παρατηρήσεις'], [...pr(ppl[7], 0), D(addDays(today(), -2)), D(addDays(today(), -1))], [], [], ['ΕΑ-ΕΥ'],
      [...head, 'ΕΑ-ΕΥ', 'ΑΠΌ', 'ΕΩΣ', 'Παρατηρήσεις'], [...pr(ppl[10], 0), 'ΕΑ', D(addDays(today(), -3)), D(addDays(today(), 4)), 'ΓΟΝΑΤΟ'], [...pr(ppl[11], 1), 'ΕΛ ΑΡΒ', D(addDays(today(), -1)), D(addDays(today(), 6)), ''],
      [2, 'ΣΤΡ', 'ΠΖ', 'ΚΑΝΕΝΑΣ', 'ΑΓΝΩΣΤΟΣ', '', null, null, 3, 'ΕΥ', D(today()), D(addDays(today(), 1)), '']] },
    { name: 'ΠΟΣΤΑ', rows: [['ΠΟΣΤΑ'], [...head, 'Πόστο'], [...pr(ppl[20], 0), 'ΚΨΜ'], [...pr(ppl[21], 1), 'ΙΑΤΡΟΣ ΣΤΕΠ'], [...pr(ppl[22], 2), 'ΓΡΑΦΕΙΟ']] },
    { name: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', rows: [['ΕΚΤΟΣ ΔΥΝΑΜΗΣ'], [...head, 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], [...pr(ppl[30], 0), 'ΑΝΑΒΟΛΗ'], [...pr(ppl[31], 1), 'ΑΠΟΣΠΑΣΗ']] },
    { name: 'ΔΥΝΑΤΟΤΗΤΑ', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', 'ΟΠΛΟΦΥΛΑΚΑΣ', 'ΜΑΓΕΙΡΙΑ', 'ΣΚΟΠΙΑ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'],
      ...ppl.slice(40, 46).map((p, i) => [p.last, p.first, p.father, null, i === 2 ? '-' : null, i % 2 ? '-' : null, '-', i < 3 ? 'ΛΟΓΩ Ι' : null])] },
    (() => {
      const prev = addDays(today().slice(0, 8) + '01', -1); const ym = prev.slice(0, 7); const nd = +prev.slice(8);
      const mon = ['ΙΑΝΟΥΑΡΙΟΥ', 'ΦΕΒΡΟΥΑΡΙΟΥ', 'ΜΑΡΤΙΟΥ', 'ΑΠΡΙΛΙΟΥ', 'ΜΑΪΟΥ', 'ΙΟΥΝΙΟΥ', 'ΙΟΥΛΙΟΥ', 'ΑΥΓΟΥΣΤΟΥ', 'ΣΕΠΤΕΜΒΡΙΟΥ', 'ΟΚΤΩΒΡΙΟΥ', 'ΝΟΕΜΒΡΙΟΥ', 'ΔΕΚΕΜΒΡΙΟΥ'][+ym.slice(5) - 1];
      const days = Array.from({ length: nd }, (_, i) => i + 1);
      return { name: 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ', rows: [['ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + mon + ' ' + ym.slice(0, 4)], ['Α/Α', 'ΒΘΜ', 'Ο-Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', 'ΑΡΓΕΙΑ', 'ΚΑΘΗΜΕΡΙΝΗ', 'ΣΥΝΟΛΟ', ...days.map(String)],
        ...ppl.map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.room, null, null, null, ...days.map(d => ((d * 7 + i) % 13 === 0 ? (i % 3 ? 'Θ' + ((d + i) % 4 + 1) + 'α' : 'Θ') : (d * 5 + i) % 17 === 0 ? (i % 2 ? 'Μ' + ((d + i) % 5 + 1) : 'Μ') : null))])] };
    })()
  ];
  return { ok: true, file: 'C:\\Γραφείο\\ΔΥΝΑΜΟΛΟΓΙΟ Β ΕΣΣΟ 2026.xlsm', name: 'ΔΥΝΑΜΟΛΟΓΙΟ Β ΕΣΣΟ 2026.xlsm', mtime: 0, size: 0, sheets, hits: detectTables(sheets) };
}

export function mockApi(): Api {
  let state = seed(); let seq = 0; const audit: AuditEntry[] = []; const undo: { id: number; prev: AppState }[] = [];
  const setDirMock = (t: DirTarget, d: string | undefined) => {
    const st = state.settings;
    if (t === 'output') state = { ...state, settings: { ...st, outputDir: d || '' } };
    else if ('form' in t) state = { ...state, settings: { ...st, forms: { ...(st.forms || {}), [t.form]: { ...(st.forms?.[t.form] || {}), dir: d } } } };
    else { const n = { ...(st.newDirs || {}) }; if (d) n[t.kind] = d; else delete n[t.kind]; state = { ...state, settings: { ...st, newDirs: n } }; }
  };
  const res = (text: string): CmdResult => ({ ok: true, changes: state, newAudit: [], audit: [...audit], text });
  return {
    boot: async () => ({ state, audit, dataDir: '(δοκιμή)', outputDir: '(δοκιμή)', templatesDir: '(δοκιμή)', version: 'dev', lastUsb: null, seenUntil: 0, sessionStart: audit.length ? audit[0].id : 0, templates: [
      { id: 'froura', name: 'Κατάσταση υπηρεσιών (ΦΡΟΥΡΑ ΣΒΕΝ)', file: 'froura.xlsx', ok: true, custom: false },
      { id: 'froura', name: 'Κατάσταση υπηρεσιών (ΦΡΟΥΡΑ ΣΠΕΝ)', file: 'froura-spen.xlsx', ok: true, custom: false },
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
    sync: async () => res(''),
    dayCheck: async () => res(''),
    undo: async id => {
      const u = undo[undo.length - 1]; if (!u) return { ok: false, error: 'Δεν υπάρχει κάτι για αναίρεση' };
      if (typeof id === 'number' && u.id !== id) return { ok: false, error: 'Έγινε άλλη ενέργεια μετά από αυτή, οπότε δεν αναιρείται από εδώ.' };
      undo.pop();
      state = u.prev; const e = audit.find(x => x.id === u.id); if (e) e.undone = true; return res('Αναιρέθηκε');
    },
    exportFile: async (kind, date, opts) => {
      const checks = preflight(kind, state, date);
      if (hasErrors(checks)) return { ok: false, error: 'Ο προέλεγχος βρήκε λάθη', checks };
      if (checks.length && !opts?.ack) return { ok: false, error: 'Θέλει επιβεβαίωση', checks, needAck: true };
      return { ok: true, file: '(δοκιμή) ' + kind + ' ' + date + '.xlsx', warnings: [] };
    },
    exportLists: async date => ({ ok: true, file: '(δοκιμή) ΔΥΝΑΜΟΛΟΓΙΟ ΚΑΤΑΣΤΑΣΕΙΣ ' + date + '.xlsx', warnings: [] }),
    exportRoster: async date => ({ ok: true, file: '(δοκιμή) ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ' + date + '.xlsx', warnings: [] }),
    pickRoster: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν διαβάζονται αρχεία.' }),
    applyRoster: async () => ({ ok: false, error: 'δοκιμή' }),
    backup: async () => ({ ok: true, file: '(δοκιμή)' }),
    openFolder: async () => {},
    chooseOutputDir: async () => null,
    dirChoose: async t => { const d = 'D:\\Δοκιμή\\' + (t === 'output' ? 'Γενικός' : 'form' in t ? t.form : t.kind); setDirMock(t, d); return res(''); },
    dirReset: async t => { setDirMock(t, undefined); return res(''); },
    dirOpen: async () => '',
    listBackups: async () => [{ name: 'ilh_' + today() + '_090000_ημερήσιο.db', day: today(), label: 'ημερήσιο', size: 123456 }],
    restoreBackup: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν γίνεται επαναφορά.' }),
    diag: async () => ({ startupMs: 0, procs: [{ type: 'Browser', kb: 0, cpu: 0 }], gpuDisabled: false, versions: { electron: '—', chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || '—', node: '—' }, dbKb: 0, people: state.people.length, statuses: state.statuses.length, guardDays: Object.keys(state.guards).length, dataDir: '(δοκιμή)', backups: 1 }),
    setGpu: async () => {},
    usbCopy: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν γράφονται αρχεία.' }),
    importBackup: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν διαβάζονται αρχεία.' }),
    // Αρχεία Excel: ένα φανταστικό Δυναμολόγιο από τα ψεύτικα άτομα, για να δοκιμάζεται η αντιστοίχιση στον browser
    srcPick: async () => fakeBook(state),
    srcRead: async () => fakeBook(state),
    srcSave: async (kind, b) => { const sources = { ...(state.settings.sources || {}) }; if (b) sources[kind] = b; else delete sources[kind]; state = { ...state, settings: { ...state.settings, sources } }; return res(''); },
    srcKeys: async () => ({ keys: [], base: {} }),
    srcApply: async (kind, b, cmd) => {
      state = { ...state, settings: { ...state.settings, sources: { ...(state.settings.sources || {}), [kind]: b } } };
      const r = apply(state, cmd, { today: today(), newId: () => 'x' + ++seq }); state = r.state; return res(r.text || 'Δεν βρέθηκε κάτι νέο');
    },
    srcImport: async (kind, b, choices) => {
      const book = fakeBook(state); const sh = book.sheets.find(x => x.name === b.sheet)!;
      const d = diffStatuses(kind, state, parseStatuses(kind, sh, b, state.people, today(), state.settings.lists), b, choices);
      state = { ...state, settings: { ...state.settings, sources: { ...(state.settings.sources || {}), [kind]: b } } };
      const r = apply(state, { t: 'importRecords', adds: d.add, updates: d.update, source: book.name, what: KIND[kind].label.toLowerCase() }, { today: today(), newId: () => 'x' + ++seq });
      state = r.state; return res(r.text || 'Δεν βρέθηκε κάτι νέο');
    },
    srcPeople: async () => ({ ok: false, error: 'Στη δοκιμή στον browser η εισαγωγή προσωπικού δεν γίνεται.' }),
    srcPlan: async kind => {
      const b = state.settings.sources?.[kind]; if (!b) return { ok: false, error: 'Δεν έχει οριστεί αρχείο' };
      const book = fakeBook(state); const sh = book.sheets.find(x => x.name === b.sheet) || { name: b.sheet, rows: [] };
      const plan = planSource(kind, sh, b, state, undefined, today());
      return { ok: true, file: b.file, create: false, lines: describeSets(kind, sh, b, plan.sets), total: plan.added + plan.changed + plan.cleared, foreign: plan.foreign, notFound: plan.notFound, ambiguous: ambiguousLines(sh, b, plan.ambiguous) };
    },
    srcWrite: async kind => ({ ok: true, text: 'Δοκιμή: δεν γράφτηκε αρχείο (' + kind + ')', file: '(δοκιμή)' }),
    srcNewFile: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν γράφονται αρχεία.' }),
    srcStatus: async () => ({ sources: (Object.entries(state.settings.sources || {}) as [ListKind, SourceBinding][]).map(([kind, b]) => ({ kind, file: b.file, exists: true, changed: kind === 'medical', synced: true, at: today() + ' 09:12' })), forms: [] }),
    onSources: () => () => {},
    formPick: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν διαβάζονται αρχεία.' }),
    formInfo: async f => ({ ok: true, file: f + '.xlsx', custom: false, sheets: f === 'hkai' ? ['μπροστινο', 'πισω'] : f === 'outs' ? ['ΕΞΟΔΟΥΧΟΙ', 'ΠΑΡΑΜΕΝΟΝΤΕΣ'] : ['ΦΡΟΥΡΑ ΣΒΕΝ'], sheet: f === 'hkai' ? 'μπροστινο' : f === 'outs' ? 'ΕΞΟΔΟΥΧΟΙ' : 'ΦΡΟΥΡΑ ΣΒΕΝ', sheet2: f === 'hkai' ? 'πισω' : f === 'outs' ? 'ΠΑΡΑΜΕΝΟΝΤΕΣ' : undefined, hkai: f === 'hkai' ? { map: hkaiMapOf(), found: 40, total: 40, missing: [] } : undefined }),
    formSave: async (f, b) => { const forms = { ...(state.settings.forms || {}) }; if (b) forms[f] = b; else delete forms[f]; state = { ...state, settings: { ...state.settings, forms } }; return res(''); },
    formDir: async () => null,
    openPath: async () => {},
    printFile: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν τυπώνονται αρχεία.' }),
    essoInfo: async () => ({ people: state.people.filter(p => p.active).length, files: (Object.entries(state.settings.sources || {}) as [ListKind, SourceBinding][]).map(([k, b]) => ({ label: KIND[k].label, file: b.file, exists: true })), outDirs: ['C:\\Έγγραφα\\Γραφείο Ίλης'], archiveRoot: 'C:\\Έγγραφα\\Γραφείο Ίλης\\Αρχείο ΕΣΣΟ', newRoot: 'C:\\Έγγραφα\\Γραφείο Ίλης', archives: [{ dir: 'C:\\Έγγραφα\\Γραφείο Ίλης\\Αρχείο ΕΣΣΟ\\Β΄ ΕΣΣΟ 2026 (έως 10-08-2026)', name: 'Β΄ ΕΣΣΟ 2026', at: '2026-08-10 09:12', people: 118, files: 2 }] }),
    essoDir: async () => 'D:\\USB',
    essoRoster: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν διαβάζονται αρχεία.' }),
    essoStart: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν ξεκινά νέα ΕΣΣΟ.' }),
    essoPick: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν διαβάζονται αρχεία.' }),
    essoRestore: async () => ({ ok: false, error: 'Στη δοκιμή στον browser δεν γίνεται επαναφορά.' }),
    essoOpen: async () => {}
  };
}
