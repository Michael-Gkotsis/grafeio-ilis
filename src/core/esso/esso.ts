// ΕΣΣΟ (the series of conscripts): which one runs now, which follows, and what stays when a new one starts.
//
// Purpose: the series and the names (`ESSO_SERIES`, `essoName`, `essoPersonTxt`, `sameEsso`), reading one from text
//   (`parseEsso`), the current and next one (`currentEsso`, `essoOfPeople`, `essoLabel`, `nextEsso`), the state of a
//   new ΕΣΣΟ (`freshState`) and the archive manifest (`EssoManifest`, `isManifest`, `archiveDirName`, `restoredPath`).
// Does NOT: touch any file (src/main copies the archive), or decide when a new ΕΣΣΟ starts.
// Owner layer: core/esso (no fs, no Electron, no React); imports core/notes (normNote).
// Why: the header of the app, the Δυναμολόγιο reader and the «new ΕΣΣΟ» wizard must name a series the same way.
// Covering tests: test/esso.test.ts, test/notes.test.ts.
import { emptyState, type AppState } from '../model/state';
import type { Person } from '../model/person';
import type { Settings } from '../model/settings';
import { normNote } from '../notes/notes';
import type { ISODate } from '../lib/dates';
import { norm } from '../lib/text';
import type { Esso, EssoSeries } from '../model/documents';
export type { Esso, EssoSeries } from '../model/documents';

/** The four series of a year, in order. */
export const ESSO_SERIES: EssoSeries[] = ['Α', 'Β', 'Γ', 'Δ'];

/** The name as the app shows it: «Γ΄ ΕΣΣΟ 2026». */
export const essoName = (e: Esso) => e.s + '΄ ΕΣΣΟ ' + e.y;
/** The form in `Person.essos` and in the Δυναμολόγιο: «2026 Γ΄». */
export const essoPersonTxt = (e: Esso) => e.y + ' ' + e.s + '΄';
/** True when both are given and have the same series and year. */
export const sameEsso = (a: Esso | null | undefined, b: Esso | null | undefined) =>
  !!a && !!b && a.s === b.s && a.y === b.y;

/** «2026 Γ΄», «Γ' ΕΣΣΟ 2026», «Γ 2026», «ΔΥΝΑΜΟΛΟΓΙΟ Β ΕΣΣΟ 2026» become { s, y }; null when it is not one. */
export function parseEsso(raw: unknown): Esso | null {
  const t = norm(raw).replace(/[A-D]/g, (c) => 'ΑΒΓΔ'['ABCD'.indexOf(c)]);
  const m = /(?:^|[^Α-Ω])([Α-Δ])\s*['΄’`]?\s*(?:ΕΣΣΟ)?\s*(20\d\d)\b/.exec(t) || /\b(20\d\d)\s*([Α-Δ])(?![Α-Ω])/.exec(t);
  if (!m) return null;
  const [s, y] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
  return { s: s as EssoSeries, y: +y };
}

/** The most frequent ΕΣΣΟ of the people in strength. */
export function essoOfPeople(people: Person[]): Esso | null {
  const n = new Map<string, number>();
  for (const p of people) if (p.active && p.essos) n.set(p.essos, (n.get(p.essos) || 0) + 1);
  const top = [...n].sort((a, b) => b[1] - a[1])[0];
  return top ? parseEsso(top[0]) : null;
}
/**
 * The current ΕΣΣΟ. It is kept in Ρυθμίσεις (`settings.essos`); when it is not set, it is the most frequent ΕΣΣΟ of
 * the people in strength (the «2026 Γ΄» that the Δυναμολόγιο writes).
 * @decision Michael 17/10: which ΕΣΣΟ runs now, which follows, and what stays when a new one starts.
 */
export const currentEsso = (s: { settings: Settings; people: Person[] }): Esso | null =>
  s.settings.essos || essoOfPeople(s.people);
/** What the app shows (top right etc.): the name of the current ΕΣΣΟ, or '' when there is none. */
export const essoLabel = (s: { settings: Settings; people: Person[] }): string => {
  const e = currentEsso(s);
  return e ? essoName(e) : '';
};

/**
 * The next one: after Δ΄ comes Α΄ of the next year. Without a current one it comes from the month (Jan-Mar Α΄,
 * Apr-Jun Β΄, Jul-Sep Γ΄, Oct-Dec Δ΄).
 */
export function nextEsso(cur: Esso | null, today: ISODate): Esso {
  if (!cur) return { s: ESSO_SERIES[Math.floor((+today.slice(5, 7) - 1) / 3)], y: +today.slice(0, 4) };
  const i = ESSO_SERIES.indexOf(cur.s);
  return i === 3 ? { s: 'Α', y: cur.y + 1 } : { s: ESSO_SERIES[i + 1], y: cur.y };
}

/**
 * The state of the new ΕΣΣΟ. Everything that belongs to the soldiers of the previous one goes (people, statuses,
 * duties, capabilities, requests, ΗΚΑΙ, duty check); the rules, the settings of the unit, the duties, the lists, the
 * holidays, the templates of the forms and the cadre stay. The Excel files of the old one are no longer sources; the
 * folder of the files becomes the folder of the new one (`outputDir`) and the forms go there (without a folder of their
 * own). The duty form starts from ΣΒΕΝ, like every new series. Notes: the general ones and those of the cadre stay;
 * those of the soldiers of the old ΕΣΣΟ stay in its archive.
 * @param unit unit kind, header and unit of the title as set in the first step (empty = as it was)
 */
export function freshState(
  s: AppState,
  e: Esso,
  today: ISODate,
  outputDir: string,
  unit?: Pick<Settings, 'unitKind' | 'unit' | 'unitName'>,
): AppState {
  const st = s.settings;
  const forms = Object.fromEntries(
    Object.entries(st.forms || {})
      .map(([k, b]) => {
        const c = { ...b };
        delete c.dir;
        return [k, c];
      })
      .filter(([, b]) => Object.values(b as object).some((v) => v !== undefined && v !== '')),
  );
  const settings: Settings = {
    ...st,
    essos: { s: e.s, y: e.y, from: today },
    sources: {},
    newDirs: {},
    forms,
    outputDir,
    fixed: {},
    phase: 'sven',
    baselineReviewed: true,
    ...(unit || {}),
  };
  return {
    ...emptyState(),
    rules: s.rules,
    settings,
    cadreList: s.cadreList,
    cadreAbs: s.cadreAbs,
    notes: (s.notes || [])
      .map(normNote)
      .filter((n) => !n.pids || n.cids)
      .map(({ pids: _x, ...n }) => n),
  };
}

// ---------------------------------------------------------------------------
// ΕΣΣΟ archive (a folder with the database, the Excel files and ΕΣΣΟ.json)
// ---------------------------------------------------------------------------
/** File name of the manifest inside the folder of an archived ΕΣΣΟ. */
export const MANIFEST = 'ΕΣΣΟ.json';
/** A file in the archive. `copy` is relative to the folder of the archive. */
export interface ArchivedFile {
  orig: string;
  copy: string;
  kind?: string;
  form?: string;
}
/** The manifest `ΕΣΣΟ.json` of an archived ΕΣΣΟ. */
export interface EssoManifest {
  app: 'grafeio-ilis';
  v: 1;
  name: string; // «Β΄ ΕΣΣΟ 2026» (or «ΕΣΣΟ» when it was not known)
  esso?: Esso;
  at: string; // when it was archived (YYYY-MM-DD HH:MM)
  version: string; // version of the app
  people: number; // in strength at that moment
  files: ArchivedFile[];
  outDirs: string[]; // where the forms that were produced stayed (they are not copied)
}
/** True when `x` has the shape of an `EssoManifest` written by this app. */
export function isManifest(x: unknown): x is EssoManifest {
  const m = x as EssoManifest;
  return !!m && m.app === 'grafeio-ilis' && m.v === 1 && typeof m.name === 'string' && Array.isArray(m.files);
}
/** The name of a folder in the archive: «Β΄ ΕΣΣΟ 2026 (έως 17-10-2026)». Characters not allowed become '-'. */
export const archiveDirName = (name: string, day: ISODate) =>
  (name + ' (έως ' + day.slice(8, 10) + '-' + day.slice(5, 7) + '-' + day.slice(0, 4) + ')').replace(
    /[\\/:*?"<>|]/g,
    '-',
  );
/**
 * On restore: the file stays where it was if it still exists; otherwise (e.g. another PC) the copy in the ΕΣΣΟ archive.
 * @param copyPath turns the relative `copy` of a file into a full path
 * @param exists tells whether a file exists
 */
export function restoredPath(
  orig: string,
  m: EssoManifest,
  copyPath: (rel: string) => string,
  exists: (f: string) => boolean,
): string {
  if (exists(orig)) return orig;
  const f = m.files.find((x) => x.orig === orig);
  return f && exists(copyPath(f.copy)) ? copyPath(f.copy) : orig;
}
