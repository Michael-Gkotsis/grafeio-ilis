// Αρχείο ΕΣΣΟ: ένας φάκελος με τη βάση (ilh.db), αντίγραφα των Excel της (πηγές και templates εντύπων), το sources.json
// και το ΕΣΣΟ.json. Γράφεται πριν από τη «Νέα ΕΣΣΟ» και ξαναφορτώνεται από το «Επαναφορά ΕΣΣΟ».
// Το ΕΣΣΟ.json γράφεται τελευταίο: φάκελος χωρίς αυτό είναι μισό αρχείο και δεν προτείνεται για επαναφορά.
import fs from 'fs';
import path from 'path';
import { copyDurable, writeDurable, writeJson } from './files';
import { MANIFEST, archiveDirName, isManifest, type ArchivedFile, type EssoManifest } from '../shared/esso';
import type { ISODate } from '../shared/dates';

export const DB_FILE = 'ilh.db';
export const SOURCES_FILE = 'sources.json';

// Νέος φάκελος μέσα στη ρίζα του αρχείου, χωρίς να πατήσει υπάρχοντα: «… (2)», «… (3)»
export function freeDir(root: string, name: string): string {
  for (let i = 1; ; i++) { const d = path.join(root, name + (i > 1 ? ' (' + i + ')' : '')); if (!fs.existsSync(d)) return d; }
}

export interface ArchiveInput {
  root: string; day: ISODate;
  manifest: Omit<EssoManifest, 'files'>;
  db: Uint8Array;                                        // η βάση όπως είναι τώρα
  files: { orig: string; kind?: string; form?: string }[];   // Excel της ΕΣΣΟ (πηγές, templates)
  sources: unknown;                                      // το sources.json (τι ήξερε η εφαρμογή για κάθε Excel)
}
// Γράφει όλο το αρχείο ή κανένα: αν κάτι αποτύχει, ο μισός φάκελος σβήνεται και το λάθος φτάνει στον καλούντα
export function writeArchive(a: ArchiveInput): { dir: string; manifest: EssoManifest; missing: string[] } {
  fs.mkdirSync(a.root, { recursive: true });
  const dir = freeDir(a.root, archiveDirName(a.manifest.name, a.day));
  try {
    fs.mkdirSync(dir, { recursive: true });
    const files: ArchivedFile[] = []; const missing: string[] = []; const used = new Set<string>(); const done = new Map<string, string>();
    for (const f of a.files) {
      const key = path.resolve(f.orig);
      // το ίδιο αρχείο για πολλά είδη (τα φύλλα του Δυναμολογίου): ένα αντίγραφο
      if (done.has(key)) { files.push({ ...f, copy: done.get(key)! }); continue; }
      if (!fs.existsSync(f.orig)) { missing.push(f.orig); continue; }
      const sub = f.form ? 'Templates' : 'Excel';
      const ext = path.extname(f.orig), stem = path.basename(f.orig, ext);
      let rel = ''; for (let i = 1; ; i++) { rel = sub + '/' + stem + (i > 1 ? ' (' + i + ')' : '') + ext; if (!used.has(rel.toLowerCase())) break; }
      used.add(rel.toLowerCase());
      fs.mkdirSync(path.join(dir, sub), { recursive: true });
      copyDurable(f.orig, path.join(dir, rel));
      done.set(key, rel); files.push({ ...f, copy: rel });
    }
    writeDurable(path.join(dir, DB_FILE), a.db);
    writeJson(path.join(dir, SOURCES_FILE), a.sources || {});
    const manifest: EssoManifest = { ...a.manifest, files };
    writeJson(path.join(dir, MANIFEST), manifest);
    return { dir, manifest, missing };
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ό,τι έμεινε */ }
    throw e;
  }
}

// Διαβάζει ένα αρχείο ΕΣΣΟ (ο φάκελος που διάλεξε ο χρήστης)
export function readArchive(dir: string): { ok: true; manifest: EssoManifest; db: string } | { ok: false; error: string } {
  const mf = path.join(dir, MANIFEST), db = path.join(dir, DB_FILE);
  if (!fs.existsSync(mf)) return { ok: false, error: 'Ο φάκελος δεν είναι αρχείο ΕΣΣΟ (δεν έχει ' + MANIFEST + '). Διάλεξε τον φάκελο μιας ΕΣΣΟ, π.χ. «Β΄ ΕΣΣΟ 2026 (έως …)».' };
  let m: unknown; try { m = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { return { ok: false, error: 'Δεν διαβάζεται το ' + MANIFEST + ': ' + (e instanceof Error ? e.message : String(e)) }; }
  if (!isManifest(m)) return { ok: false, error: 'Το ' + MANIFEST + ' δεν είναι της εφαρμογής' };
  if (!fs.existsSync(db)) return { ok: false, error: 'Λείπει η βάση (' + DB_FILE + ') από τον φάκελο' };
  return { ok: true, manifest: m, db };
}

// Τα αρχεία ΕΣΣΟ μέσα σε μια ρίζα (ένα επίπεδο), νεότερα πρώτα
export function listArchives(root: string): { dir: string; manifest: EssoManifest }[] {
  if (!root || !fs.existsSync(root)) return [];
  const out: { dir: string; manifest: EssoManifest }[] = [];
  for (const n of fs.readdirSync(root)) {
    const dir = path.join(root, n);
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
    const r = readArchive(dir); if (r.ok) out.push({ dir, manifest: r.manifest });
  }
  return out.sort((a, b) => b.manifest.at.localeCompare(a.manifest.at));
}
