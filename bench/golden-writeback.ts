/**
 * Golden hashes, part 3: write-backs into the unit's Excel files (`src/main/sources.ts`: `writeSource`, `writeGroup`,
 * `placeSheets`), in a throw-away temp folder.
 *
 * Purpose: the app writes person changes into the unit's own Δυναμολόγιο (cells, new rows, new sheets) and creates
 * new files/sheets («Νέο αρχείο…»). Those bytes are user data, so they are hashed like every other output.
 * Cases: create every list kind (one Δυναμολόγιο, one sheet per kind), edit person fields (group write, single write,
 * with "tidy"), new status rows, create the monthly duty check and a next-month sheet, create ΣΤΕΛΕΧΗ.xlsx and its
 * ΚΑΤΑΣΤΑΣΕΙΣ sheet, write into a workbook made by another program (ExcelJS) and place a report sheet into it.
 *
 * What it does NOT do: it does not read the clock (callers pass `GOLDEN_END` as "today"). The result of a write-back
 * also carries `meta` (mtime/size of the temp file); that is NOT hashed (volatile), only the file content is.
 * Covering test: test/golden-outputs.test.ts.
 */
import ExcelJS from 'exceljs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply } from '../src/shared/commands';
import { addDays } from '../src/shared/dates';
import type { AppState, Person } from '../src/shared/domain';
import { defaultPick, withBuilt, PRESETS, type Report } from '../src/shared/reports';
import {
  KIND, STATUS_KINDS, bestFor, defaultBinding, dutiesBinding, type ListKind, type SourceBinding
} from '../src/shared/sources';
import { buildTemplate, fillReport, placeSheets } from '../src/main/reports';
import { readBook, writeGroup, writeSource, type SourceMeta, type WriteOutcome } from '../src/main/sources';
import { GOLDEN_END, PRINT_LAYOUTS, bookEntries, textHash, zipHash, type GoldenEntry } from './golden-lib';

/** Kinds written into the shared Δυναμολόγιο, in the order «Νέο αρχείο…» offers them. */
const ROSTER_KINDS: ListKind[] = ['people', ...STATUS_KINDS, 'posts', 'outside', 'caps'];
type Made = { file: string; bindings: Record<string, SourceBinding>; metas: Record<string, SourceMeta> };
type OkOutcome = Extract<WriteOutcome, { ok: true }>;

/** Unwrap a write result; a failed write is a bug in the golden setup, not an output. */
function okOf(result: WriteOutcome, what: string): OkOutcome {
  if (!result.ok) throw new Error('golden write-back "' + what + '" failed: ' + result.error);
  return result;
}
/** Fail the setup when any result of a group write failed (kinds are in `ROSTER_KINDS` order). */
const allOk = (results: WriteOutcome[], what: string) =>
  results.some((result, i) => !okOf(result, what + ' ' + ROSTER_KINDS[i]));
const metaOf = (result: OkOutcome): SourceMeta => ({ at: 'x', keys: [], ...result.meta } as SourceMeta);
const fileEntry = async (key: string, file: string): Promise<GoldenEntry> =>
  ({ key, hash: await zipHash(await fs.promises.readFile(file)) });
/** Print rendering (default layout only) of a written file; the xlsx hash is already taken after each write. */
async function printEntries(key: string, file: string): Promise<GoldenEntry[]> {
  const all = await bookEntries(key, await fs.promises.readFile(file), [PRINT_LAYOUTS[0]]);
  return all.filter(entry => entry.key.includes('/print.'));
}

/** A workbook as another program writes it: title row, header on row 2, formulas in Α/Α, fills, numeric ΑΣΜ. */
async function foreignRoster(state: AppState): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); wb.creator = 'ΜΟΝΑΔΑ'; wb.created = wb.modified = new Date(Date.UTC(2026, 9, 1));
  const ws = wb.addWorksheet('ΔΥΝΑΜΟΛΟΓΙΟ');
  ws.addRow(['ΔΥΝΑΜΟΛΟΓΙΟ ΙΛΗΣ']); ws.mergeCells('A1:I1'); ws.getCell('A1').font = { bold: true, size: 14 };
  const head = ws.addRow(['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΤΗΛΕΦΩΝΟ', 'ΘΑΛΑΜΟΣ']);
  head.eachCell(cell => {
    cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  });
  for (const [i, p] of state.people.slice(0, 40).entries()) {
    const aa = { formula: 'ROW()-2', result: i + 1 };
    ws.addRow([aa, p.rank, p.spec, p.last, p.first, p.father, Number(p.asm), p.phone, p.room]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Create every kind into one Δυναμολόγιο; hash the whole file after each kind (new file, then new sheets). */
async function createRoster(state: AppState, dir: string, key: string, entries: GoldenEntry[]): Promise<Made> {
  const file = path.join(dir, 'Δ.xlsx'); const bindings: Made['bindings'] = {}; const metas: Made['metas'] = {};
  for (const kind of ROSTER_KINDS) {
    const sheet = kind === 'people' ? 'ΣΥΝΟΛΙΚΟ' : KIND[kind].title.slice(0, 31);
    bindings[kind] = { ...defaultBinding(kind, file, sheet), write: true };
    const result = await writeSource(kind, bindings[kind], state, undefined, GOLDEN_END, { create: true });
    metas[kind] = metaOf(okOf(result, 'create ' + kind)); entries.push(await fileEntry(key + '/create.' + kind, file));
  }
  entries.push(...await printEntries(key + '/create.roster', file));
  return { file, bindings, metas };
}

/** Person changes written into copies of the roster: group write, single write, tidy write, and a new status. */
async function editRoster(
  state: AppState, dir: string, key: string, entries: GoldenEntry[], made: Made
): Promise<void> {
  // ids 1-5 exist in every golden size; each change really differs from the benchState value
  const edits: Record<number, Partial<Person>> = {
    1: { last: 'ΑΛΛΑΓΜΕΝΟΣ' }, 2: { rank: 'ΔΝΕΑΣ' }, 4: { si: 'Ι2', room: 3 }, 5: { phone: '6999999999' }
  };
  const people = state.people.map(p => (edits[p.id] ? { ...p, ...edits[p.id] } : p));
  const changed: AppState = { ...state, people };
  const leave = { type: 'LEAVE' as const, kind: 'Κανονική', pids: [4], from: GOLDEN_END, to: addDays(GOLDEN_END, 3) };
  const withLeave = apply(changed, { t: 'declare', cmd: leave }, { today: GOLDEN_END, newId: () => 'g1' }).state;
  const copyOf = async (name: string) => {
    const copy = path.join(dir, name); await fs.promises.copyFile(made.file, copy); return copy;
  };
  const jobs = (file: string) =>
    ROSTER_KINDS.map(kind => ({ kind, b: { ...made.bindings[kind], file }, meta: made.metas[kind] }));
  const peopleAt = (file: string) => ({ ...made.bindings.people, file });

  const group = await copyOf('group.xlsx');
  allOk(await writeGroup(jobs(group), changed, GOLDEN_END), 'group');
  entries.push(await fileEntry(key + '/edit.person-fields.group', group));
  const single = await copyOf('single.xlsx');
  okOf(await writeSource('people', peopleAt(single), changed, made.metas.people, GOLDEN_END), 'single');
  entries.push(await fileEntry(key + '/edit.person-fields.single', single));
  const tidy = await copyOf('tidy.xlsx');
  okOf(await writeSource('people', peopleAt(tidy), changed, made.metas.people, GOLDEN_END, { tidy: true }), 'tidy');
  entries.push(await fileEntry(key + '/edit.person-fields.tidy', tidy));
  const status = await copyOf('status.xlsx');
  allOk(await writeGroup(jobs(status), withLeave, GOLDEN_END), 'status');
  entries.push(await fileEntry(key + '/edit.new-status', status));
}

/** Monthly duty check file: new file, new month sheet in the same file, then an edit of the first month. */
async function dutyFiles(state: AppState, dir: string, key: string, entries: GoldenEntry[]): Promise<void> {
  const file = path.join(dir, 'ΕΛΕΓΧΟΣ.xlsx'); const month = GOLDEN_END.slice(0, 7);
  const binding = (ym: string) => dutiesBinding(file, ym, undefined, state.settings);
  okOf(await writeSource('duties', binding(month), state, undefined, GOLDEN_END, { create: true }), 'duties');
  entries.push(await fileEntry(key + '/duties.create-month', file));
  okOf(await writeSource('duties', binding('2026-11'), state, undefined, GOLDEN_END, { create: true }), 'next month');
  entries.push(await fileEntry(key + '/duties.new-month-sheet', file));
  const day = addDays(GOLDEN_END, -5);   // inside the October sheet, and a day that has guards
  // every guard of that day goes to the next person id: a real change in the grid
  const shifted = Object.fromEntries(
    Object.entries(state.guards[day] || {}).map(([post, pid]) => [post, (pid % state.people.length) + 1])
  );
  const moved: AppState = { ...state, guards: { ...state.guards, [day]: shifted } };
  okOf(await writeSource('duties', binding(month), moved, undefined, GOLDEN_END), 'duties edit');
  entries.push(await fileEntry(key + '/duties.edit-month', file), ...await printEntries(key + '/duties.print', file));
}

/** ΣΤΕΛΕΧΗ.xlsx (cadre list) and its ΚΑΤΑΣΤΑΣΕΙΣ sheet: create, then rewrite after a new absence and a phone. */
async function cadreFiles(state: AppState, dir: string, key: string, entries: GoldenEntry[]): Promise<void> {
  const file = path.join(dir, 'ΣΤΕΛΕΧΗ.xlsx');
  const cadres = defaultBinding('cadres', file); const absences = defaultBinding('cadreAbs', file);
  const created = okOf(await writeSource('cadres', cadres, state, undefined, GOLDEN_END, { create: true }), 'cadres');
  entries.push(await fileEntry(key + '/cadre.create-list', file));
  okOf(await writeSource('cadreAbs', absences, state, undefined, GOLDEN_END, { create: true }), 'cadreAbs');
  entries.push(await fileEntry(key + '/cadre.create-absences', file));
  const absence = { cid: 's1', kind: 'ka', from: GOLDEN_END, to: addDays(GOLDEN_END, 1) } as const;
  const more = apply(state, { t: 'addCadreAbs', abs: absence }, { today: GOLDEN_END, newId: () => 'g2' }).state;
  const cadreList = more.cadreList.map(c => (c.id === 's2' ? { ...c, phone: '6911111111' } : c));
  okOf(await writeSource('cadres', cadres, { ...more, cadreList }, metaOf(created), GOLDEN_END), 'cadre edit');
  entries.push(await fileEntry(key + '/cadre.edit', file));
  okOf(await writeSource('cadreAbs', absences, more, undefined, GOLDEN_END), 'cadreAbs edit');
  entries.push(await fileEntry(key + '/cadre.edit-absences', file), ...await printEntries(key + '/cadre.print', file));
}

/** A workbook written by another program: write person changes into it, and place a report sheet into it. */
async function foreignFile(state: AppState, dir: string, key: string, entries: GoldenEntry[]): Promise<void> {
  const file = path.join(dir, 'ξένο.xlsx'); await fs.promises.writeFile(file, await foreignRoster(state));
  entries.push(await fileEntry(key + '/foreign.source', file));
  const found = bestFor('people', (await readBook(file)).sheets);
  if (!found) throw new Error('golden: the foreign roster is not recognised as a Δυναμολόγιο');
  const binding: SourceBinding = { ...defaultBinding('people', file, found.sheet), ...found, write: true };
  const edits: Record<number, Partial<Person>> = { 2: { phone: '6988888888', room: 7 }, 5: { last: 'ΑΛΛΑΓΜΕΝΟΣ' } };
  const people = state.people.map(p => (edits[p.id] ? { ...p, ...edits[p.id] } : p));
  okOf(await writeSource('people', binding, { ...state, people }, undefined, GOLDEN_END), 'foreign');
  entries.push(await fileEntry(key + '/foreign.person-fields', file));

  const preset = PRESETS[0]; const kind = (preset as { kind?: Report['kind'] }).kind || 'people';
  const built = await buildTemplate(preset.opts, kind);
  const blank = {
    id: 'r', name: preset.id, tpl: 't', kind, sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(),
    sort: 'name', day: 'today', out: 'file'
  } as Report;
  const report = withBuilt(blank, built, preset.opts);
  const out = await fillReport(built.data, state, report, state.people.map(p => p.id), GOLDEN_END);
  const placed = await placeSheets(await fs.promises.readFile(file), out.data, [[out.sheets[0], 'ΕΝΤΥΠΟ']], null);
  if (!placed.data) throw new Error('golden: placeSheets refused');
  entries.push(
    { key: key + '/foreign.place-report-sheet', hash: await zipHash(placed.data) },
    { key: key + '/foreign.place-report-sheet.sheets', hash: textHash(out.sheets.join('|')) }
  );
}

/**
 * All write-back outputs for one unit size. Each case runs in its own folder under the OS temp dir, removed afterwards;
 * the hashes are stable because the files hold no path or time (the test checks that by running twice, see its header).
 */
export async function writebackEntries(state: AppState, n: number): Promise<GoldenEntry[]> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'golden-wb-'));
  const entries: GoldenEntry[] = []; const key = 'writeback/n=' + n;
  try {
    const sub = async (name: string) => {
      const dir = path.join(root, name); await fs.promises.mkdir(dir); return dir;
    };
    const roster = await createRoster(state, await sub('roster'), key, entries);
    await editRoster(state, await sub('edit'), key, entries, roster);
    await dutyFiles(state, await sub('duties'), key, entries);
    await cadreFiles(state, await sub('cadre'), key, entries);
    await foreignFile(state, await sub('foreign'), key, entries);
    return entries;
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
}
