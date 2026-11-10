// The local SQLite database (sql.js, no native module, so no build for Windows 7): the `Store` class.
//
// Purpose: the whole state is kept in memory (a few MB for one squadron), and every action writes only what changed,
//   together with what is needed to undo it. The file is written atomically (.tmp then rename, `writeDurable`).
//   Open, migrate, load, commit, undo (`revert`), audit rows, backups and `validate` all live in this one class.
// Does NOT: define the schema, the `kv` keys or the patch shape (schema.ts, kv.ts, patch.ts), list or prune backup
//   names (backups.ts), or decide what to do with a damaged file (main.ts shows the recovery screen).
// Owner layer: main (architecture), `shared/db`. Used by the app state, the IPC features and the benchmarks.
// Why: moved whole from src/main/db.ts (Phase 4.9c), bodies byte for byte; the class is not split because every method
//   shares `db`, `state` and `SQL`. It is an oversize file (see test/architecture/baseline.json) for that reason only.
// Covering test: test/db.test.ts, test/safety-flush.test.ts and the tests that open a `Store` (esso, notes, hkai...).
import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database } from 'sql.js';
import {
  emptyState,
  markOldRequests,
  migrateSettings,
  noPending,
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  type AppState,
  type AuditEntry,
} from '../../../shared/domain';
import { normNote } from '../../../shared/notes';
import { nowParts, today } from '../../../shared/dates';
import { STORE_AMBIENT, applyAmbient } from '../../../core/ambient';
import { capsPerService, ownKinds } from '../../../shared/rules';
import { writeDurable } from '../../files';
import { splitOrigins } from '../../../shared/ranks';
import { isStatusKind, type ListKind } from '../../../shared/sources';
import { CorruptDbError, quickCheck } from './errors';
import { backupsToDelete, listBackups } from './backups';
import { MIGRATIONS, SCHEMA_VERSION, UNDO_KEEP } from './schema';
import { KV_ENTRIES, KV_KEYS, entriesOf } from './kv';
import { diffMap, emptyPatch, type Patch } from './patch';

/**
 * The database of the app: state in memory, `data/ilh.db` on disk.
 *
 * `open()` must finish before any other method. Writes (`flush`, `backup`) go through `writeDurable`, which retries
 * when the antivirus holds the file. Undo patches follow the frozen format of patch.ts.
 */
export class Store {
  private db!: Database;
  state: AppState = emptyState();
  private file: string;
  constructor(
    private dataDir: string,
    private wasmPath: string,
  ) {
    this.file = path.join(dataDir, 'ilh.db');
  }

  async open(): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const SQL = await initSqlJs({ locateFile: () => this.wasmPath });
    const exists = fs.existsSync(this.file);
    this.SQL = SQL;
    const buf = exists ? fs.readFileSync(this.file) : null;
    // An empty file: sql.js would open it as a new empty database and write over it. It is damaged, not new.
    if (buf && !buf.length) throw new CorruptDbError('Το αρχείο της βάσης είναι άδειο (0 bytes)', true);
    this.db = buf ? new SQL.Database(buf) : new SQL.Database();
    // PRAGMA quick_check: if the file is damaged (for example a power cut), say so at once instead of losing data later
    const bad = exists ? quickCheck(this.db) : null;
    if (bad) {
      this.db.close();
      throw new CorruptDbError(bad);
    }
    if (exists && !this.hasTables()) {
      this.db.close();
      throw new CorruptDbError('Το αρχείο δεν έχει τους πίνακες της εφαρμογής', true);
    }
    this.migrate(exists);
    this.load();
    // Once: every own service (for example Πύλη) gets its own service capacity, with what applied until now through
    // its kind (rev 6, capsPerService), and then counts as its own (rev 7, ownKinds), so that nobody's numbers change
    const rev = this.state.settings.rev || 0;
    if (rev < 7) {
      const s0 = this.state;
      const caps = rev < 6 ? capsPerService(s0.settings, s0.caps) : null;
      const settings = { ...(ownKinds(s0.settings) || s0.settings), rev: 7 };
      this.commit({ ...s0, ...(caps ? { caps } : {}), settings });
      this.flush();
    }
    // rev 8 (Michael, 30/10: «γιατί δεν σβήνονται από το excel τα ιατρικά, άδειες, ποινές»): the status sheets
    // write only what applies from today on, so expired ones are removed from the Excel (they stay in the app)
    if ((this.state.settings.rev || 0) < 8) {
      const s0 = this.state;
      const src = s0.settings.sources || {};
      const sources = Object.fromEntries(
        Object.entries(src).map(([k, b]) => [
          k,
          b && isStatusKind(k as ListKind) ? { ...b, scope: 'active' as const } : b,
        ]),
      );
      this.commit({ ...s0, settings: { ...s0.settings, sources, rev: 8 } });
      this.flush();
    }
    // origin (Michael, 22/10): rank «ΕΠΟΠ ΛΧΙΑΣ» becomes rank ΛΧΙΑΣ with origin ΕΠΟΠ (only for those who have it)
    const so = splitOrigins(this.state);
    if (so) {
      this.commit(so);
      this.flush();
    }
    // approval on all requests (1/11): old requests (not leave) without an answer no longer count as «waiting»
    const mo = markOldRequests(this.state, today());
    if (mo) {
      this.commit(mo);
      this.flush();
    }
    // a new database (no people and no earlier duties): it has nothing from the old reading of the duty check, so the
    // check after the upgrade is never needed
    const st = this.state;
    if (!st.settings.baselineReviewed && !st.people.length && !Object.keys(st.baseline).length) {
      this.commit({ ...st, settings: { ...st.settings, baselineReviewed: true } });
      this.flush();
    }
  }
  private SQL!: Awaited<ReturnType<typeof initSqlJs>>;
  // A database that was already set up: it has our tables (the same check as validate)
  private hasTables(db: Database = this.db): boolean {
    const t = db.exec(
      "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('person','status','guard','kv','audit')",
    );
    return Number(t[0].values[0][0]) === 5;
  }

  // Checks a copy before a restore: it opens, passes quick_check and has our tables
  validate(file: string): string | null {
    try {
      const db = new this.SQL.Database(fs.readFileSync(file));
      try {
        const bad = quickCheck(db);
        if (bad) return bad;
        return this.hasTables(db) ? null : 'Δεν είναι βάση του Γραφείου Λοχία';
      } finally {
        db.close();
      }
    } catch (e) {
      return String(e instanceof Error ? e.message : e);
    }
  }

  private migrate(existed: boolean) {
    this.db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    const r = this.db.exec("SELECT value FROM meta WHERE key='schema'");
    let v = r.length ? Number(r[0].values[0][0]) : 0;
    if (v < SCHEMA_VERSION && existed) this.backup('πριν-αναβάθμιση');
    while (v < SCHEMA_VERSION) {
      this.db.run('BEGIN');
      this.db.run(MIGRATIONS[v]);
      v++;
      this.db.run("INSERT OR REPLACE INTO meta VALUES ('schema', ?)", [String(v)]);
      this.db.run('COMMIT');
    }
    // Once: the undo data that undo no longer reaches is deleted and the database is rewritten smaller
    if (this.pruneUndo(-1)) this.db.run('VACUUM');
    this.flush();
  }

  private all<T>(sql: string): T[] {
    const res = this.db.exec(sql);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])) as T);
  }

  private load() {
    const s = emptyState();
    s.people = this.all<{ data: string }>('SELECT data FROM person ORDER BY id').map((r) => JSON.parse(r.data));
    s.statuses = noPending({
      ...s,
      statuses: this.all<{ data: string }>('SELECT data FROM status').map((r) => JSON.parse(r.data)),
    }).statuses;
    for (const r of this.all<{ date: string; data: string }>('SELECT date, data FROM guard'))
      s.guards[r.date] = JSON.parse(r.data);
    for (const r of this.all<{ pid: number; data: string }>('SELECT pid, data FROM cap'))
      s.caps[r.pid] = JSON.parse(r.data);
    const kv = new Map(
      this.all<{ key: string; value: string }>('SELECT key, value FROM kv').map((r) => [r.key, JSON.parse(r.value)]),
    );
    s.rules = { ...DEFAULT_RULES, ...(kv.get('rules') || {}) };
    s.settings = migrateSettings({
      ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      rev: 0,
      ...(kv.get('settings') || {}),
    });
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
    s.imer = kv.get('imer') || {};
    s.hd = kv.get('hd') || {};
    s.dayPlan = kv.get('dayPlan') || {};
    s.backFix = kv.get('backFix') || [];
    s.lastExpire = kv.get('lastExpire') || '';
    s.requests = this.all<{ data: string }>('SELECT data FROM request').map((r) => JSON.parse(r.data));
    this.state = s;
    applyAmbient(s, STORE_AMBIENT);
  }

  // Writes the new state: only what changed, and returns the patch for undo
  commit(next: AppState): Patch {
    const prev = this.state;
    const patch = emptyPatch();
    const tables: [
      'person' | 'status' | 'request' | 'guard' | 'cap',
      Map<any, unknown>,
      Map<any, unknown>,
      string,
      string,
    ][] = [
      [
        'person',
        new Map(prev.people.map((p) => [p.id, p])),
        new Map(next.people.map((p) => [p.id, p])),
        'person',
        'id',
      ],
      [
        'status',
        new Map(prev.statuses.map((p) => [p.id, p])),
        new Map(next.statuses.map((p) => [p.id, p])),
        'status',
        'id',
      ],
      [
        'request',
        new Map(prev.requests.map((p) => [p.id, p])),
        new Map(next.requests.map((p) => [p.id, p])),
        'request',
        'id',
      ],
      ['guard', new Map(Object.entries(prev.guards)), new Map(Object.entries(next.guards)), 'guard', 'date'],
      [
        'cap',
        new Map(Object.entries(prev.caps).map(([k, v]) => [Number(k), v])),
        new Map(Object.entries(next.caps).map(([k, v]) => [Number(k), v])),
        'cap',
        'pid',
      ],
    ];
    this.db.run('BEGIN');
    try {
      for (const [name, b, a, table, key] of tables) {
        const d = diffMap(b, a);
        for (const k of [...d.changed, ...d.removed]) (patch[name]!.put as [unknown, unknown][]).push([k, b.get(k)]);
        for (const k of d.added) (patch[name]!.del as unknown[]).push(k);
        for (const k of [...d.changed, ...d.added])
          this.db.run(`INSERT OR REPLACE INTO ${table} (${key}, data) VALUES (?, ?)`, [
            k as any,
            JSON.stringify(a.get(k)),
          ]);
        for (const k of d.removed) this.db.run(`DELETE FROM ${table} WHERE ${key} = ?`, [k as any]);
      }
      for (const k of KV_KEYS)
        if (prev[k] !== next[k]) {
          if (KV_ENTRIES[k]) {
            const b = entriesOf(k, prev[k]),
              d = diffMap(b, entriesOf(k, next[k]));
            if (d.changed.length || d.removed.length || d.added.length)
              patch.kvd!.push({ key: k, put: [...d.changed, ...d.removed].map((x) => [x, b.get(x)]), del: d.added });
          } else patch.kv.put.push([k, prev[k]]);
          this.db.run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [k, JSON.stringify(next[k])]);
        }
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
    this.state = next;
    applyAmbient(next, STORE_AMBIENT);
    return patch;
  }

  // Undo: puts the previous values back
  revert(patch: Patch): void {
    const s = this.state;
    const people = new Map(s.people.map((p) => [p.id, p]));
    patch.person.del.forEach((k) => people.delete(k));
    patch.person.put.forEach(([k, v]) => people.set(k, v as any));
    const statuses = new Map(s.statuses.map((p) => [p.id, p]));
    patch.status.del.forEach((k) => statuses.delete(k));
    patch.status.put.forEach(([k, v]) => statuses.set(k, v as any));
    const guards = { ...s.guards };
    patch.guard.del.forEach((k) => delete guards[k]);
    patch.guard.put.forEach(([k, v]) => (guards[k] = v as any));
    const caps = { ...s.caps };
    patch.cap.del.forEach((k) => delete caps[k]);
    patch.cap.put.forEach(([k, v]) => (caps[k] = v as any));
    const requests = new Map(s.requests.map((p) => [p.id, p]));
    patch.request?.del.forEach((k) => requests.delete(k));
    patch.request?.put.forEach(([k, v]) => requests.set(k, v as any));
    const next: AppState = {
      ...s,
      people: [...people.values()].sort((a, b) => a.id - b.id),
      statuses: [...statuses.values()],
      guards,
      caps,
      requests: [...requests.values()],
    };
    patch.kv.put.forEach(([k, v]) => {
      (next as any)[k] = v;
    });
    for (const e of patch.kvd || []) {
      const m = entriesOf(e.key, (next as any)[e.key]);
      e.del.forEach((k) => m.delete(k));
      e.put.forEach(([k, v]) => m.set(k, v));
      (next as any)[e.key] = KV_ENTRIES[e.key] === 'ids' ? [...m.values()] : Object.fromEntries(m);
    }
    this.commit(next);
  }

  // flush=false: the caller writes once at the end (for example many history rows from one action)
  addAudit(e: Omit<AuditEntry, 'id' | 'undone'>, patch: Patch | null, flush = true): number {
    this.db.run('INSERT INTO audit (at, day, text, files, source, patch, undoable) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      e.at,
      e.day,
      e.text,
      JSON.stringify(e.files),
      e.source,
      patch ? JSON.stringify(patch) : null,
      e.undoable ? 1 : 0,
    ]);
    const id = Number(this.db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
    if (patch) this.pruneUndo(5);
    if (flush) this.flush();
    return id;
  }
  // Undo looks only at the UNDO_KEEP newest rows that have undo data (lastUndoable). The undo data of older rows is
  // never used, but it made the database grow (for example every save of the ΗΚΑΙ kept all the days).
  // n: how many older ones to clear (-1 = all, at open; after each new row at most one is left over).
  private pruneUndo(n: number): number {
    this.db.run(
      `UPDATE audit SET patch = NULL WHERE id IN (SELECT id FROM audit WHERE patch IS NOT NULL ORDER BY id DESC LIMIT ${Math.floor(n)} OFFSET ${UNDO_KEEP})`,
    );
    return this.db.getRowsModified();
  }
  lastUndoable(): { id: number; text: string; source: string; patch: Patch } | null {
    const r = this.all<{ id: number; text: string; source: string; patch: string; undoable: number; undone: number }>(
      'SELECT id, text, source, patch, undoable, undone FROM audit WHERE patch IS NOT NULL ORDER BY id DESC LIMIT ' +
        UNDO_KEEP,
    );
    const e = r.find((x) => x.undoable && !x.undone);
    return e ? { id: e.id, text: e.text, source: e.source, patch: JSON.parse(e.patch) } : null;
  }
  markUndone(id: number, flush = true, undone = true) {
    this.db.run('UPDATE audit SET undone = ? WHERE id = ?', [undone ? 1 : 0, id]);
    if (flush) this.flush();
  }
  // One action (a change, history rows, an undo) and one write to disk. If the disk does not accept it (antivirus, full
  // disk), everything is rolled back in memory too, so the screen does not show something that was not saved (and the
  // user does not do it again twice). The error reaches the caller. back: anything else that is rolled back (for
  // example the «αναιρέθηκε» mark).
  transact<T>(fn: () => T, write = true, back?: () => void): T {
    const prev = this.state;
    const mark = Number(this.db.exec('SELECT coalesce(max(id), 0) FROM audit')[0].values[0][0]);
    try {
      const r = fn();
      if (write) this.flush();
      return r;
    } catch (e) {
      try {
        this.commit(prev);
        this.db.run('DELETE FROM audit WHERE id > ?', [mark]);
        back?.();
      } catch (e2) {
        console.error('transact rollback', e2);
      }
      throw e;
    }
  }
  // after: only the rows written after this id (what the UI has not seen yet)
  audit(limit = 300, after = 0): AuditEntry[] {
    return this.all<any>(
      `SELECT id, at, day, text, files, source, undoable, undone FROM audit WHERE id > ${Math.floor(after) || 0} ORDER BY id DESC LIMIT ${Math.floor(limit)}`,
    ).map((r) => ({ ...r, files: JSON.parse(r.files || '[]'), undoable: !!r.undoable, undone: !!r.undone }));
  }
  // New ΕΣΣΟ: the history (and the undo data) of the previous one stays only in its file. Otherwise an undo would
  // bring soldiers or duties of the old ΕΣΣΟ back into the new one.
  clearAudit(): void {
    this.db.run('DELETE FROM audit');
    this.db.run('VACUUM');
    this.flush();
  }
  // The database as it is now (for the ΕΣΣΟ file)
  data(): Uint8Array {
    return this.db.export();
  }
  hasAuditToday(day: string, source: string): boolean {
    return (
      this.all(
        "SELECT 1 FROM audit WHERE day = '" +
          day.replace(/'/g, '') +
          "' AND source = '" +
          source.replace(/'/g, '') +
          "' LIMIT 1",
      ).length > 0
    );
  }

  // Atomic write to disk. On Windows the antivirus may hold the file for a moment: we retry.
  flush(): void {
    writeDurable(this.file, this.db.export());
  }

  backup(label: string, dir = path.join(this.dataDir, 'backups')): string {
    fs.mkdirSync(dir, { recursive: true });
    const d = nowParts();
    const stamp =
      today() + '_' + String(d.h).padStart(2, '0') + String(d.mi).padStart(2, '0') + String(d.s).padStart(2, '0');
    const out = path.join(dir, `ilh_${stamp}_${label}.db`);
    writeDurable(out, this.db.export());
    return out;
  }
  // Keeps: all backups of the last 14 days, one per week for another 8 weeks, one per month after that (research §4.2)
  pruneBackups(dir = path.join(this.dataDir, 'backups')): void {
    for (const f of backupsToDelete(
      listBackups(dir).map((b) => b.name),
      today(),
    ))
      fs.unlinkSync(path.join(dir, f));
  }
  close() {
    this.flush();
    this.db.close();
  }
}
