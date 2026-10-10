// Τοπική βάση SQLite (sql.js, χωρίς native module, άρα χωρίς build για Windows 7).
// Ολόκληρη η κατάσταση κρατιέται στη μνήμη (λίγα MB για μία Ίλη) και κάθε ενέργεια γράφει μόνο ό,τι άλλαξε,
// μαζί με ό,τι χρειάζεται για αναίρεση. Το αρχείο γράφεται ατομικά (.tmp → rename).
import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database } from 'sql.js';
import { emptyState, DEFAULT_RULES, DEFAULT_SETTINGS, type AppState, type AuditEntry } from '../shared/domain';
import { daysBetween, today } from '../shared/dates';

export class CorruptDbError extends Error {}
function quickCheck(db: Database): string | null {
  try {
    const r = db.exec('PRAGMA quick_check');
    const v = r.length ? String(r[0].values[0][0]) : 'ok';
    return v === 'ok' ? null : v;
  } catch (e) { return String(e instanceof Error ? e.message : e); }
}
const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

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

const SCHEMA_VERSION = 1;
const MIGRATIONS: string[] = [
  `CREATE TABLE person (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE status (id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE guard (date TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE cap (pid INTEGER PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, day TEXT, text TEXT, files TEXT, source TEXT,
                       patch TEXT, undoable INTEGER, undone INTEGER DEFAULT 0);
   CREATE INDEX audit_day ON audit(day);`
];

// Διαφορά για αναίρεση: για κάθε πίνακα, οι προηγούμενες τιμές όσων άλλαξαν/σβήστηκαν (put) και τα κλειδιά όσων προστέθηκαν (del)
type Rows<K> = { put: [K, unknown][]; del: K[] };
export interface Patch { person: Rows<number>; status: Rows<string>; guard: Rows<string>; cap: Rows<number>; kv: Rows<string> }
const emptyPatch = (): Patch => ({ person: { put: [], del: [] }, status: { put: [], del: [] }, guard: { put: [], del: [] }, cap: { put: [], del: [] }, kv: { put: [], del: [] } });

function diffMap<K>(before: Map<K, unknown>, after: Map<K, unknown>): { changed: K[]; removed: K[]; added: K[] } {
  const changed: K[] = [], removed: K[] = [], added: K[] = [];
  before.forEach((v, k) => { if (!after.has(k)) removed.push(k); else if (after.get(k) !== v) changed.push(k); });
  after.forEach((_, k) => { if (!before.has(k)) added.push(k); });
  return { changed, removed, added };
}
const KV_KEYS = ['rules', 'settings', 'printed'] as const;

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
    this.db = exists ? new SQL.Database(fs.readFileSync(this.file)) : new SQL.Database();
    // PRAGMA quick_check: αν το αρχείο χάλασε (π.χ. κόπηκε το ρεύμα), το λέμε αμέσως αντί να χαθούν δεδομένα αργότερα
    const bad = exists ? quickCheck(this.db) : null;
    if (bad) { this.db.close(); throw new CorruptDbError(bad); }
    this.migrate(exists);
    this.load();
  }
  private SQL!: Awaited<ReturnType<typeof initSqlJs>>;

  // Ελέγχει ένα αντίγραφο πριν την επαναφορά: ανοίγει, quick_check, έχει τους πίνακες μας
  validate(file: string): string | null {
    try {
      const db = new this.SQL.Database(fs.readFileSync(file));
      try {
        const bad = quickCheck(db); if (bad) return bad;
        const t = db.exec("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('person','status','guard','kv','audit')");
        return Number(t[0].values[0][0]) === 5 ? null : 'Δεν είναι βάση του Γραφείου Ίλης';
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
    s.statuses = this.all<{ data: string }>('SELECT data FROM status').map(r => JSON.parse(r.data));
    for (const r of this.all<{ date: string; data: string }>('SELECT date, data FROM guard')) s.guards[r.date] = JSON.parse(r.data);
    for (const r of this.all<{ pid: number; data: string }>('SELECT pid, data FROM cap')) s.caps[r.pid] = JSON.parse(r.data);
    const kv = new Map(this.all<{ key: string; value: string }>('SELECT key, value FROM kv').map(r => [r.key, JSON.parse(r.value)]));
    s.rules = { ...DEFAULT_RULES, ...(kv.get('rules') || {}) };
    s.settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...(kv.get('settings') || {}) };
    s.printed = kv.get('printed') || {};
    this.state = s;
  }

  // Γράφει τη νέα κατάσταση: μόνο ό,τι άλλαξε, και επιστρέφει το patch για αναίρεση
  commit(next: AppState): Patch {
    const prev = this.state; const patch = emptyPatch();
    const tables: [keyof Patch, Map<any, unknown>, Map<any, unknown>, string, string][] = [
      ['person', new Map(prev.people.map(p => [p.id, p])), new Map(next.people.map(p => [p.id, p])), 'person', 'id'],
      ['status', new Map(prev.statuses.map(p => [p.id, p])), new Map(next.statuses.map(p => [p.id, p])), 'status', 'id'],
      ['guard', new Map(Object.entries(prev.guards)), new Map(Object.entries(next.guards)), 'guard', 'date'],
      ['cap', new Map(Object.entries(prev.caps).map(([k, v]) => [Number(k), v])), new Map(Object.entries(next.caps).map(([k, v]) => [Number(k), v])), 'cap', 'pid']
    ];
    this.db.run('BEGIN');
    try {
      for (const [name, b, a, table, key] of tables) {
        const d = diffMap(b, a);
        for (const k of [...d.changed, ...d.removed]) (patch[name].put as [unknown, unknown][]).push([k, b.get(k)]);
        for (const k of d.added) (patch[name].del as unknown[]).push(k);
        for (const k of [...d.changed, ...d.added]) this.db.run(`INSERT OR REPLACE INTO ${table} (${key}, data) VALUES (?, ?)`, [k as any, JSON.stringify(a.get(k))]);
        for (const k of d.removed) this.db.run(`DELETE FROM ${table} WHERE ${key} = ?`, [k as any]);
      }
      for (const k of KV_KEYS) if (prev[k] !== next[k]) {
        patch.kv.put.push([k, prev[k]]);
        this.db.run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [k, JSON.stringify(next[k])]);
      }
      this.db.run('COMMIT');
    } catch (e) { this.db.run('ROLLBACK'); throw e; }
    this.state = next;
    return patch;
  }

  // Αναίρεση: επαναφέρει τις προηγούμενες τιμές
  revert(patch: Patch): void {
    const s = this.state;
    const people = new Map(s.people.map(p => [p.id, p])); patch.person.del.forEach(k => people.delete(k)); patch.person.put.forEach(([k, v]) => people.set(k, v as any));
    const statuses = new Map(s.statuses.map(p => [p.id, p])); patch.status.del.forEach(k => statuses.delete(k)); patch.status.put.forEach(([k, v]) => statuses.set(k, v as any));
    const guards = { ...s.guards }; patch.guard.del.forEach(k => delete guards[k]); patch.guard.put.forEach(([k, v]) => (guards[k] = v as any));
    const caps = { ...s.caps }; patch.cap.del.forEach(k => delete caps[k]); patch.cap.put.forEach(([k, v]) => (caps[k] = v as any));
    const next: AppState = { ...s, people: [...people.values()].sort((a, b) => a.id - b.id), statuses: [...statuses.values()], guards, caps };
    patch.kv.put.forEach(([k, v]) => { (next as any)[k] = v; });
    this.commit(next);
  }

  addAudit(e: Omit<AuditEntry, 'id' | 'undone'>, patch: Patch | null): number {
    this.db.run('INSERT INTO audit (at, day, text, files, source, patch, undoable) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [e.at, e.day, e.text, JSON.stringify(e.files), e.source, patch ? JSON.stringify(patch) : null, e.undoable ? 1 : 0]);
    const id = Number(this.db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
    this.flush();
    return id;
  }
  lastUndoable(): { id: number; text: string; patch: Patch } | null {
    const r = this.all<{ id: number; text: string; patch: string; undoable: number; undone: number }>('SELECT id, text, patch, undoable, undone FROM audit WHERE patch IS NOT NULL ORDER BY id DESC LIMIT 50');
    const e = r.find(x => x.undoable && !x.undone);
    return e ? { id: e.id, text: e.text, patch: JSON.parse(e.patch) } : null;
  }
  markUndone(id: number) { this.db.run('UPDATE audit SET undone = 1 WHERE id = ?', [id]); this.flush(); }
  audit(limit = 300): AuditEntry[] {
    return this.all<any>(`SELECT id, at, day, text, files, source, undoable, undone FROM audit ORDER BY id DESC LIMIT ${limit}`)
      .map(r => ({ ...r, files: JSON.parse(r.files || '[]'), undoable: !!r.undoable, undone: !!r.undone }));
  }
  hasAuditToday(day: string, source: string): boolean {
    return this.all('SELECT 1 FROM audit WHERE day = \'' + day.replace(/'/g, '') + '\' AND source = \'' + source.replace(/'/g, '') + '\' LIMIT 1').length > 0;
  }

  // Ατομική εγγραφή στον δίσκο. Στα Windows το antivirus μπορεί να κρατά το αρχείο για λίγο: ξαναδοκιμάζουμε.
  flush(): void {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, this.file); return; }
      catch (e: any) { if (i >= 20 || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e; sleepSync(50); }
    }
  }

  backup(label: string, dir = path.join(this.dataDir, 'backups')): string {
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const stamp = today() + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
    const out = path.join(dir, `ilh_${stamp}_${label}.db`);
    fs.writeFileSync(out, Buffer.from(this.db.export()));
    return out;
  }
  // Κρατά: όλα τα αντίγραφα των 14 τελευταίων ημερών, ένα ανά εβδομάδα για άλλες 8 εβδομάδες, ένα ανά μήνα μετά (έρευνα §4.2)
  pruneBackups(dir = path.join(this.dataDir, 'backups')): void {
    for (const f of backupsToDelete(listBackups(dir).map(b => b.name), today())) fs.unlinkSync(path.join(dir, f));
  }
  close() { this.flush(); this.db.close(); }
}
