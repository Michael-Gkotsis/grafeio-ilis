// Τοπική βάση SQLite (sql.js, χωρίς native module, άρα χωρίς build για Windows 7).
// Ολόκληρη η κατάσταση κρατιέται στη μνήμη (λίγα MB για μία Ίλη) και κάθε ενέργεια γράφει μόνο ό,τι άλλαξε,
// μαζί με ό,τι χρειάζεται για αναίρεση. Το αρχείο γράφεται ατομικά (.tmp → rename).
import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database } from 'sql.js';
import { emptyState, migrateSettings, noPending, noteNamesakes, DEFAULT_RULES, DEFAULT_SETTINGS, type AppState, type AuditEntry } from '../shared/domain';
import { normNote } from '../shared/notes';
import { daysBetween, today } from '../shared/dates';
import { capsPerService, ownKinds } from '../shared/rules';
import { writeDurable } from './files';
import { splitOrigins } from '../shared/ranks';

// empty: το αρχείο είναι άδειο (0 bytes) ή δεν έχει τους πίνακές μας (κόψιμο ρεύματος, μισή αντιγραφή φακέλου)
export class CorruptDbError extends Error { constructor(msg: string, public empty = false) { super(msg); } }
function quickCheck(db: Database): string | null {
  try {
    const r = db.exec('PRAGMA quick_check');
    const v = r.length ? String(r[0].values[0][0]) : 'ok';
    return v === 'ok' ? null : v;
  } catch (e) { return String(e instanceof Error ? e.message : e); }
}

export interface BackupInfo { name: string; day: string; label: string; size: number }
export function listBackups(dir: string): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^ilh_\d{4}-\d{2}-\d{2}_.*\.db$/.test(f)).sort().reverse()
    .map(f => ({ name: f, day: f.slice(4, 14), label: f.replace(/^ilh_\d{4}-\d{2}-\d{2}_\d+_?/, '').replace(/\.db$/, ''), size: fs.statSync(path.join(dir, f)).size }));
}
// Καθαρή συνάρτηση για να ελέγχεται με τεστ. names: νεότερα πρώτα.
export function backupsToDelete(names: string[], now: string): string[] {
  const del: string[] = []; const weeks = new Set<number>(); const months = new Set<string>();
  for (const f of [...names].sort().reverse()) {
    const day = f.slice(4, 14); const age = daysBetween(day, now) - 1;
    if (age < 14) continue;
    const week = Math.floor(age / 7);
    if (age < 14 + 56) { if (!weeks.has(week)) { weeks.add(week); continue; } del.push(f); continue; }
    const m = day.slice(0, 7);
    if (!months.has(m)) { months.add(m); continue; }
    del.push(f);
  }
  return del;
}

const SCHEMA_VERSION = 2;
const UNDO_KEEP = 50;
const MIGRATIONS: string[] = [
  `CREATE TABLE person (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE status (id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE guard (date TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE cap (pid INTEGER PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, day TEXT, text TEXT, files TEXT, source TEXT,
                       patch TEXT, undoable INTEGER, undone INTEGER DEFAULT 0);
   CREATE INDEX audit_day ON audit(day);`,
  // 2: αιτήσεις στρατιωτών (ΗΚΑΙ, 5. ΑΙΤΗΣΕΙΣ)· η παλιά έκδοση της εφαρμογής απλώς δεν τον διαβάζει
  `CREATE TABLE request (id TEXT PRIMARY KEY, data TEXT NOT NULL);`
];

// Διαφορά για αναίρεση: για κάθε πίνακα, οι προηγούμενες τιμές όσων άλλαξαν/σβήστηκαν (put) και τα κλειδιά όσων προστέθηκαν (del)
// request και kvd λείπουν από τα patch που γράφτηκαν πριν την αναβάθμιση: η αναίρεσή τους δουλεύει και χωρίς αυτά
type Rows<K> = { put: [K, unknown][]; del: K[] };
export interface Patch { person: Rows<number>; status: Rows<string>; guard: Rows<string>; cap: Rows<number>; kv: Rows<string>; request?: Rows<string>; kvd?: (Rows<string> & { key: string })[] }
const emptyPatch = (): Patch => ({ person: { put: [], del: [] }, status: { put: [], del: [] }, guard: { put: [], del: [] }, cap: { put: [], del: [] }, kv: { put: [], del: [] }, request: { put: [], del: [] }, kvd: [] });

function diffMap<K>(before: Map<K, unknown>, after: Map<K, unknown>): { changed: K[]; removed: K[]; added: K[] } {
  const changed: K[] = [], removed: K[] = [], added: K[] = [];
  before.forEach((v, k) => { if (!after.has(k)) removed.push(k); else if (after.get(k) !== v) changed.push(k); });
  after.forEach((_, k) => { if (!before.has(k)) added.push(k); });
  return { changed, removed, added };
}
const KV_KEYS = ['rules', 'settings', 'printed', 'baseline', 'hkaiManual', 'cadreList', 'cadreAbs', 'dutyLog', 'nightTraining', 'weaponLog', 'dutyFix', 'notes', 'outNotes', 'lastExpire'] as const;
// Τιμές που μεγαλώνουν κάθε μέρα: η αναίρεση κρατά μόνο ό,τι άλλαξε (μία μέρα της ΗΚΑΙ, μία απουσία), όχι όλη την τιμή.
// obj: αντικείμενο ανά ημερομηνία· ids: λίστα με id.
// dutyLog: υπηρεσίες χωρίς θέση ανά μέρα (από Excel), nightTraining: μέρες με βραδινή εκπαίδευση· η παλιά έκδοση της εφαρμογής απλώς δεν τα διαβάζει
const KV_ENTRIES: Partial<Record<string, 'obj' | 'ids'>> = { hkaiManual: 'obj', printed: 'obj', cadreAbs: 'ids', dutyLog: 'obj', nightTraining: 'obj', weaponLog: 'ids', dutyFix: 'ids', notes: 'ids', outNotes: 'obj' };
const entriesOf = (k: string, v: unknown): Map<string, unknown> =>
  KV_ENTRIES[k] === 'ids' ? new Map(((v as { id: string }[]) || []).map(x => [x.id, x])) : new Map(Object.entries((v as Record<string, unknown>) || {}));

export class Store {
  private db!: Database;
  state: AppState = emptyState();
  private file: string;
  constructor(private dataDir: string, private wasmPath: string) {
    this.file = path.join(dataDir, 'ilh.db');
  }

  async open(): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const SQL = await initSqlJs({ locateFile: () => this.wasmPath });
    const exists = fs.existsSync(this.file);
    this.SQL = SQL;
    const buf = exists ? fs.readFileSync(this.file) : null;
    // Άδειο αρχείο: το sql.js θα το άνοιγε ως καινούργια κενή βάση και θα έγραφε από πάνω. Είναι χαλασμένο, όχι νέο.
    if (buf && !buf.length) throw new CorruptDbError('Το αρχείο της βάσης είναι άδειο (0 bytes)', true);
    this.db = buf ? new SQL.Database(buf) : new SQL.Database();
    // PRAGMA quick_check: αν το αρχείο χάλασε (π.χ. κόπηκε το ρεύμα), το λέμε αμέσως αντί να χαθούν δεδομένα αργότερα
    const bad = exists ? quickCheck(this.db) : null;
    if (bad) { this.db.close(); throw new CorruptDbError(bad); }
    if (exists && !this.hasTables()) { this.db.close(); throw new CorruptDbError('Το αρχείο δεν έχει τους πίνακες της εφαρμογής', true); }
    this.migrate(exists);
    this.load();
    // μία φορά: κάθε δική σου υπηρεσία (π.χ. Πύλη) παίρνει δική της δυνατότητα υπηρεσιών, με ό,τι ίσχυε ως τώρα μέσω
    // του είδους της (rev 6, capsPerService), και μετά μετρά ως δική της (rev 7, ownKinds), ώστε να μην αλλάξει κανείς
    const rev = this.state.settings.rev || 0;
    if (rev < 7) {
      const s0 = this.state; const caps = rev < 6 ? capsPerService(s0.settings, s0.caps) : null;
      const settings = { ...(ownKinds(s0.settings) || s0.settings), rev: 7 };
      this.commit({ ...s0, ...(caps ? { caps } : {}), settings }); this.flush();
    }
    // προέλευση (Michael, 22/10): «ΕΠΟΠ ΛΧΙΑΣ» στον βαθμό γίνεται βαθμός ΛΧΙΑΣ με προέλευση ΕΠΟΠ (μόνο όσοι το έχουν)
    const so = splitOrigins(this.state); if (so) { this.commit(so); this.flush(); }
    // καινούργια βάση (χωρίς άτομα και προηγούμενες υπηρεσίες): δεν έχει τίποτα από την παλιά ανάγνωση του ελέγχου
    // υπηρεσιών, οπότε ο έλεγχος μετά την αναβάθμιση δεν χρειάζεται ποτέ
    const st = this.state;
    if (!st.settings.baselineReviewed && !st.people.length && !Object.keys(st.baseline).length) { this.commit({ ...st, settings: { ...st.settings, baselineReviewed: true } }); this.flush(); }
  }
  private SQL!: Awaited<ReturnType<typeof initSqlJs>>;
  // Βάση που έχει ήδη στηθεί: έχει τους πίνακές μας (ο ίδιος έλεγχος με το validate)
  private hasTables(db: Database = this.db): boolean {
    const t = db.exec("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('person','status','guard','kv','audit')");
    return Number(t[0].values[0][0]) === 5;
  }

  // Ελέγχει ένα αντίγραφο πριν την επαναφορά: ανοίγει, quick_check, έχει τους πίνακες μας
  validate(file: string): string | null {
    try {
      const db = new this.SQL.Database(fs.readFileSync(file));
      try {
        const bad = quickCheck(db); if (bad) return bad;
        return this.hasTables(db) ? null : 'Δεν είναι βάση του Γραφείου Λοχία';
      } finally { db.close(); }
    } catch (e) { return String(e instanceof Error ? e.message : e); }
  }

  private migrate(existed: boolean) {
    this.db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    const r = this.db.exec("SELECT value FROM meta WHERE key='schema'");
    let v = r.length ? Number(r[0].values[0][0]) : 0;
    if (v < SCHEMA_VERSION && existed) this.backup('πριν-αναβάθμιση');
    while (v < SCHEMA_VERSION) {
      this.db.run('BEGIN'); this.db.run(MIGRATIONS[v]); v++;
      this.db.run("INSERT OR REPLACE INTO meta VALUES ('schema', ?)", [String(v)]); this.db.run('COMMIT');
    }
    // Μία φορά: τα στοιχεία αναίρεσης που δεν φτάνει πια η αναίρεση σβήνονται και η βάση ξαναγράφεται μικρότερη
    if (this.pruneUndo(-1)) this.db.run('VACUUM');
    this.flush();
  }

  private all<T>(sql: string): T[] {
    const res = this.db.exec(sql);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])) as T);
  }

  private load() {
    const s = emptyState();
    s.people = this.all<{ data: string }>('SELECT data FROM person ORDER BY id').map(r => JSON.parse(r.data));
    s.statuses = noPending({ ...s, statuses: this.all<{ data: string }>('SELECT data FROM status').map(r => JSON.parse(r.data)) }).statuses;
    for (const r of this.all<{ date: string; data: string }>('SELECT date, data FROM guard')) s.guards[r.date] = JSON.parse(r.data);
    for (const r of this.all<{ pid: number; data: string }>('SELECT pid, data FROM cap')) s.caps[r.pid] = JSON.parse(r.data);
    const kv = new Map(this.all<{ key: string; value: string }>('SELECT key, value FROM kv').map(r => [r.key, JSON.parse(r.value)]));
    s.rules = { ...DEFAULT_RULES, ...(kv.get('rules') || {}) };
    s.settings = migrateSettings({ ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), rev: 0, ...(kv.get('settings') || {}) });
    s.printed = kv.get('printed') || {};
    s.baseline = kv.get('baseline') || {};
    s.hkaiManual = kv.get('hkaiManual') || {};
    s.cadreList = kv.get('cadreList') || [];
    s.cadreAbs = kv.get('cadreAbs') || [];
    s.dutyLog = kv.get('dutyLog') || {};
    s.nightTraining = kv.get('nightTraining') || {};
    s.weaponLog = kv.get('weaponLog') || [];
    s.dutyFix = kv.get('dutyFix') || [];
    s.notes = (kv.get('notes') || []).map(normNote);
    s.outNotes = kv.get('outNotes') || {};
    s.lastExpire = kv.get('lastExpire') || '';
    s.requests = this.all<{ data: string }>('SELECT data FROM request').map(r => JSON.parse(r.data));
    this.state = s; noteNamesakes(s.people);
  }

  // Γράφει τη νέα κατάσταση: μόνο ό,τι άλλαξε, και επιστρέφει το patch για αναίρεση
  commit(next: AppState): Patch {
    const prev = this.state; const patch = emptyPatch();
    const tables: ['person' | 'status' | 'request' | 'guard' | 'cap', Map<any, unknown>, Map<any, unknown>, string, string][] = [
      ['person', new Map(prev.people.map(p => [p.id, p])), new Map(next.people.map(p => [p.id, p])), 'person', 'id'],
      ['status', new Map(prev.statuses.map(p => [p.id, p])), new Map(next.statuses.map(p => [p.id, p])), 'status', 'id'],
      ['request', new Map(prev.requests.map(p => [p.id, p])), new Map(next.requests.map(p => [p.id, p])), 'request', 'id'],
      ['guard', new Map(Object.entries(prev.guards)), new Map(Object.entries(next.guards)), 'guard', 'date'],
      ['cap', new Map(Object.entries(prev.caps).map(([k, v]) => [Number(k), v])), new Map(Object.entries(next.caps).map(([k, v]) => [Number(k), v])), 'cap', 'pid']
    ];
    this.db.run('BEGIN');
    try {
      for (const [name, b, a, table, key] of tables) {
        const d = diffMap(b, a);
        for (const k of [...d.changed, ...d.removed]) (patch[name]!.put as [unknown, unknown][]).push([k, b.get(k)]);
        for (const k of d.added) (patch[name]!.del as unknown[]).push(k);
        for (const k of [...d.changed, ...d.added]) this.db.run(`INSERT OR REPLACE INTO ${table} (${key}, data) VALUES (?, ?)`, [k as any, JSON.stringify(a.get(k))]);
        for (const k of d.removed) this.db.run(`DELETE FROM ${table} WHERE ${key} = ?`, [k as any]);
      }
      for (const k of KV_KEYS) if (prev[k] !== next[k]) {
        if (KV_ENTRIES[k]) {
          const b = entriesOf(k, prev[k]), d = diffMap(b, entriesOf(k, next[k]));
          if (d.changed.length || d.removed.length || d.added.length) patch.kvd!.push({ key: k, put: [...d.changed, ...d.removed].map(x => [x, b.get(x)]), del: d.added });
        } else patch.kv.put.push([k, prev[k]]);
        this.db.run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [k, JSON.stringify(next[k])]);
      }
      this.db.run('COMMIT');
    } catch (e) { this.db.run('ROLLBACK'); throw e; }
    this.state = next; noteNamesakes(next.people);
    return patch;
  }

  // Αναίρεση: επαναφέρει τις προηγούμενες τιμές
  revert(patch: Patch): void {
    const s = this.state;
    const people = new Map(s.people.map(p => [p.id, p])); patch.person.del.forEach(k => people.delete(k)); patch.person.put.forEach(([k, v]) => people.set(k, v as any));
    const statuses = new Map(s.statuses.map(p => [p.id, p])); patch.status.del.forEach(k => statuses.delete(k)); patch.status.put.forEach(([k, v]) => statuses.set(k, v as any));
    const guards = { ...s.guards }; patch.guard.del.forEach(k => delete guards[k]); patch.guard.put.forEach(([k, v]) => (guards[k] = v as any));
    const caps = { ...s.caps }; patch.cap.del.forEach(k => delete caps[k]); patch.cap.put.forEach(([k, v]) => (caps[k] = v as any));
    const requests = new Map(s.requests.map(p => [p.id, p])); patch.request?.del.forEach(k => requests.delete(k)); patch.request?.put.forEach(([k, v]) => requests.set(k, v as any));
    const next: AppState = { ...s, people: [...people.values()].sort((a, b) => a.id - b.id), statuses: [...statuses.values()], guards, caps, requests: [...requests.values()] };
    patch.kv.put.forEach(([k, v]) => { (next as any)[k] = v; });
    for (const e of patch.kvd || []) {
      const m = entriesOf(e.key, (next as any)[e.key]); e.del.forEach(k => m.delete(k)); e.put.forEach(([k, v]) => m.set(k, v));
      (next as any)[e.key] = KV_ENTRIES[e.key] === 'ids' ? [...m.values()] : Object.fromEntries(m);
    }
    this.commit(next);
  }

  // flush=false: ο καλών γράφει μία φορά στο τέλος (π.χ. πολλές γραμμές ιστορικού από μία ενέργεια)
  addAudit(e: Omit<AuditEntry, 'id' | 'undone'>, patch: Patch | null, flush = true): number {
    this.db.run('INSERT INTO audit (at, day, text, files, source, patch, undoable) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [e.at, e.day, e.text, JSON.stringify(e.files), e.source, patch ? JSON.stringify(patch) : null, e.undoable ? 1 : 0]);
    const id = Number(this.db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
    if (patch) this.pruneUndo(5);
    if (flush) this.flush();
    return id;
  }
  // Η αναίρεση κοιτά μόνο τις UNDO_KEEP πιο πρόσφατες γραμμές με στοιχεία αναίρεσης (lastUndoable). Των παλιότερων τα
  // στοιχεία δεν χρησιμοποιούνται ποτέ, αλλά μεγάλωναν τη βάση (π.χ. κάθε αποθήκευση της ΗΚΑΙ κρατούσε όλες τις μέρες).
  // n: πόσες παλιότερες να καθαριστούν (-1 = όλες, στο άνοιγμα· μετά από κάθε νέα γραμμή περισσεύει το πολύ μία).
  private pruneUndo(n: number): number {
    this.db.run(`UPDATE audit SET patch = NULL WHERE id IN (SELECT id FROM audit WHERE patch IS NOT NULL ORDER BY id DESC LIMIT ${Math.floor(n)} OFFSET ${UNDO_KEEP})`);
    return this.db.getRowsModified();
  }
  lastUndoable(): { id: number; text: string; source: string; patch: Patch } | null {
    const r = this.all<{ id: number; text: string; source: string; patch: string; undoable: number; undone: number }>('SELECT id, text, source, patch, undoable, undone FROM audit WHERE patch IS NOT NULL ORDER BY id DESC LIMIT ' + UNDO_KEEP);
    const e = r.find(x => x.undoable && !x.undone);
    return e ? { id: e.id, text: e.text, source: e.source, patch: JSON.parse(e.patch) } : null;
  }
  markUndone(id: number, flush = true, undone = true) { this.db.run('UPDATE audit SET undone = ? WHERE id = ?', [undone ? 1 : 0, id]); if (flush) this.flush(); }
  // Μία ενέργεια (αλλαγή, γραμμές ιστορικού, αναίρεση) και μία εγγραφή στον δίσκο. Αν ο δίσκος δεν τη δεχτεί (antivirus,
  // γεμάτος δίσκος), όλα γυρίζουν πίσω και στη μνήμη, ώστε η οθόνη να μη δείχνει κάτι που δεν σώθηκε (και ο χρήστης να
  // μην το ξανακάνει διπλό). Το λάθος φτάνει στον καλούντα. back: ό,τι άλλο γυρίζει πίσω (π.χ. το «αναιρέθηκε»).
  transact<T>(fn: () => T, write = true, back?: () => void): T {
    const prev = this.state; const mark = Number(this.db.exec('SELECT coalesce(max(id), 0) FROM audit')[0].values[0][0]);
    try { const r = fn(); if (write) this.flush(); return r; }
    catch (e) {
      try { this.commit(prev); this.db.run('DELETE FROM audit WHERE id > ?', [mark]); back?.(); } catch (e2) { console.error('transact rollback', e2); }
      throw e;
    }
  }
  // after: μόνο όσες γραμμές γράφτηκαν μετά από αυτό το id (ό,τι δεν έχει δει ακόμα το UI)
  audit(limit = 300, after = 0): AuditEntry[] {
    return this.all<any>(`SELECT id, at, day, text, files, source, undoable, undone FROM audit WHERE id > ${Math.floor(after) || 0} ORDER BY id DESC LIMIT ${Math.floor(limit)}`)
      .map(r => ({ ...r, files: JSON.parse(r.files || '[]'), undoable: !!r.undoable, undone: !!r.undone }));
  }
  // Νέα ΕΣΣΟ: το ιστορικό (και τα στοιχεία αναίρεσης) της προηγούμενης μένει μόνο στο αρχείο της. Αλλιώς μια αναίρεση
  // θα ξανάφερνε στρατιώτες ή υπηρεσίες της παλιάς ΕΣΣΟ στη νέα.
  clearAudit(): void { this.db.run('DELETE FROM audit'); this.db.run('VACUUM'); this.flush(); }
  // Η βάση όπως είναι τώρα (για το αρχείο ΕΣΣΟ)
  data(): Uint8Array { return this.db.export(); }
  hasAuditToday(day: string, source: string): boolean {
    return this.all('SELECT 1 FROM audit WHERE day = \'' + day.replace(/'/g, '') + '\' AND source = \'' + source.replace(/'/g, '') + '\' LIMIT 1').length > 0;
  }

  // Ατομική εγγραφή στον δίσκο. Στα Windows το antivirus μπορεί να κρατά το αρχείο για λίγο: ξαναδοκιμάζουμε.
  flush(): void { writeDurable(this.file, this.db.export()); }

  backup(label: string, dir = path.join(this.dataDir, 'backups')): string {
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const stamp = today() + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
    const out = path.join(dir, `ilh_${stamp}_${label}.db`);
    writeDurable(out, this.db.export());
    return out;
  }
  // Κρατά: όλα τα αντίγραφα των 14 τελευταίων ημερών, ένα ανά εβδομάδα για άλλες 8 εβδομάδες, ένα ανά μήνα μετά (έρευνα §4.2)
  pruneBackups(dir = path.join(this.dataDir, 'backups')): void {
    for (const f of backupsToDelete(listBackups(dir).map(b => b.name), today())) fs.unlinkSync(path.join(dir, f));
  }
  close() { this.flush(); this.db.close(); }
}
