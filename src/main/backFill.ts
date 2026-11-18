// The back side and the loose texts of the front in the adaptive ΗΚΑΙ/ΗΚΑΛ (the unit's own template). Called by fillAdaptive; every write is a planned write
// that goes through safeWrite, so a formula, a label or the middle of a merge is never touched. Never written, in any case:
//   the columns of ΕΙΣΗΓΗΣΗ / ΑΠΟΦΑΣΗ (ΥΔΚΤΟΥ / ΔΚΤΟΥ) and «ΕΛΑΒΑ ΓΝΩΣΗ» (the bug of a unit's file: lines written over «ΕΙΣΗΓΗΣΗ»)
//   a category the form has no section for: it is counted and reported, not put in another section
// Lines that do not fit the rows of a section continue on a copy of the template's own continuation sheet («ΕΠΕΚΤΑΣΗ ΣΕΛΙΔΑΣ»), if it has one, else they are reported.
import type { Workbook } from './xlsx';
import { colName, splitRef, toSerial, type XlValue } from './xlsx';
import { mapHkBack } from './tplmap';
import { textPx } from './textfit';
import type { PlannedWrite } from './safeWrite';
import type { SheetModel } from '../shared/sheetModel';
import type { Lexicon } from '../shared/lexicon';
import { phraseKey } from '../shared/lexicon';
import type { TplProfile } from '../shared/tplStore';
import type { AppState } from '../shared/domain';
import { fullName, hkOn, type Person } from '../shared/domain';
import { hkDate, type ISODate } from '../shared/dates';
import { movesOn, hkOrgans, hkaiAdikLines, hkaiDiaLines, hkaiEgrLines, hkaiLeaveLines, hkaiPunLines, hkaiReqLines, lineText, outReason, personLine } from '../shared/hkaiText';
import { hkWho } from '../shared/punish';
import { postBy, seatMap } from '../shared/rules';
import { rankTxt } from '../shared/ranks';
import { hkOffText } from '../shared/cadre';
import { hkaiVeh } from '../shared/vehicles';
import { upper } from '../shared/text';
import { SEC_NAME, continuationOf, dateIn, formatOf, frontTexts, numLabel, pickBack, slotsOfContinuation, wrapText, type BackForm, type BackFormat, type BackSection, type SecId, type Slot } from '../shared/backForm';
import { sigsCustom, sigsFor, sigsSaved, type Sig } from '../shared/sigs';

export interface Entry { sec: SecId; text: string; numbered: boolean }
export interface SecReport { id: SecId; text: string; ref: string; state: 'sure' | 'suggest'; layout: 'right' | 'below'; rows: number; entries: number; lines: number; placed: number; moved: number; unplaced: number; comment?: string }
export interface BackReport {
  sheet: string | null; sections: SecReport[]; missing: { id: SecId; n: number }[]; continuation: { sheet: string; pages: string[] } | null;
  blocks: BackForm['blocks'] | null; front: { title: boolean; date: boolean; sigs: number };
}
export const emptyBack = (): BackReport => ({ sheet: null, sections: [], missing: [], continuation: null, blocks: null, front: { title: false, date: false, sigs: 0 } });

// ------------------------------------------------------------------ what the app writes in each section of the back side
const stripNo = (t: string) => t.replace(/^\d{1,3}\.\s+/, '');
export function backEntries(s: AppState, d: ISODate, f: BackFormat): Entry[] {
  const out: Entry[] = []; const hasNo = (t: string) => /^\d{1,3}\.\s/.test(t);
  const add = (sec: SecId, lines: { t: string }[][], mk?: (i: number, t: string) => string | null) => {
    lines.forEach((l, i) => { const raw = lineText(l); const numbered = hasNo(raw); const t0 = stripNo(raw); const t = (numbered && mk ? mk(i, t0) : null) ?? t0; out.push({ sec, text: dateIn(t, f.date), numbered }); });
  };
  // person format of the unit's form: «<ΒΑΘΜΟΣ> (<ΟΠΛΟ>) <ΕΠΩΝΥΜΟ> <ΟΝΟΜΑ> (<ΣΑ|ΑΜ|ΕΠΟ> :<αριθμός>) : <πρόταση>»
  const person = f.line === 'person';
  const spaced = (t: string) => { const i = t.indexOf(': '); return i > 0 ? t.slice(0, i) + ' : ' + t.slice(i + 2) : t; };
  const moves = (sec: 'enroll' | 'delete') => {
    const field = sec === 'enroll' ? 'inOn' : 'outOn'; const ps = movesOn(s, field, d); const ls = sec === 'enroll' ? hkaiEgrLines(s, d) : hkaiDiaLines(s, d);
    add(sec, ls, !person ? undefined : (i, t) => {
      const p = ps[i]; if (!p) return spaced(t);
      const tag = p.origin === 'ΕΠΟΠ' ? 'ΕΠΟ' : 'ΣΑ'; const who = upper([rankTxt(p), p.spec ? '(' + p.spec + ')' : '', p.last, p.first].filter(Boolean).join(' '));
      const why = sec === 'delete' ? outReason(p).replace(/[.\s]+$/, '') : personLine(p).includes(': ') ? '' : (t.split(': ')[1] || '').replace(/\.$/, '');
      const base = (sec === 'enroll' ? 'ΕΓΓΡΑΦΕΤΑΙ ΣΤΗΝ ΔΥΝΑΜΗ ΤΗΝ ' : 'ΔΙΑΓΡΑΦΕΤΑΙ ΑΠΟ ΤΗΝ ΔΥΝΑΜΗ ΤΗΝ ') + hkDate(d);
      return who + (p.asm ? ' (' + tag + ' :' + p.asm + ')' : '') + ' : ' + base + (why ? ', ' + upper(why) : '') + '.';
    });
  };
  moves('enroll'); moves('delete');
  add('leaves', hkaiLeaveLines(s, d), person ? (_i, t) => spaced(t) : undefined);
  add('punish', hkaiPunLines(s, d), person ? (_i, t) => spaced(t) : undefined);
  add('requests', hkaiReqLines(s, d), person ? (_i, t) => spaced(t) : undefined);
  add('misc', hkaiAdikLines(s, d), person ? (_i, t) => spaced(t) : undefined);
  const pm = new Map(s.people.map(p => [p.id, p] as const));
  for (const x of s.statuses) if (x.type === 'NOS' && x.from === d && pm.get(x.pid)?.active) {
    const t = upper(hkWho(pm.get(x.pid)!)) + (person ? ' : ' : ': ') + 'ΕΙΣΗΧΘΗ ΣΕ ΝΟΣΟΚΟΜΕΙΟ ΤΗΝ ' + hkDate(d) + '.';
    out.push({ sec: 'misc', text: dateIn(t, f.date), numbered: true });
  }
  const loi = s.hkaiManual?.[d]?.text?.loi?.trim(); if (loi) out.push({ sec: 'misc', text: loi, numbered: false });
  return out;
}

// ------------------------------------------------------------------ the plan
export interface ExtraPlan { plan: PlannedWrite[]; warnings: string[]; report: BackReport; blocked: (w: PlannedWrite) => boolean }
const FONT = { name: 'Calibri', sz: 11, b: false };
const MDW = 7;
const ref0 = (r: number, c: number) => colName(c + 1) + (r + 1);
export async function planExtras(wb: Workbook, sheets: SheetModel[], front: string, lex: Lexicon, s: AppState, d: ISODate, profile: TplProfile | null, o: { sigs?: Sig[] | null }): Promise<ExtraPlan> {
  const fmt = formatOf(profile?.back); const warnings: string[] = []; const plan: PlannedWrite[] = []; const rep = emptyBack();
  const bo = { lex, ...(profile?.back?.accepted ? { accepted: profile.back.accepted } : {}), ...(profile?.ours ? { ours: profile.ours } : {}) };
  const pick = pickBack(sheets, bo, front);
  const entries = backEntries(s, d, fmt);
  const protectedCols = pick?.form.protectedCols ?? new Set<number>();
  const blocked = (w: PlannedWrite) => !!pick && w.sheet === pick.sheet.name && protectedCols.has(w.c);
  // ---- title, date and signatures (the blank parts of the template's own lines)
  const sigsIn = o.sigs ?? (sigsCustom(s.settings, 'hkai') ? sigsSaved(s.settings, 'hkai') : null);
  const sigs = sigsIn ? sigsFor(s.settings, sigsIn) : [];
  const texts = new Set<string>([front]); if (pick) texts.add(pick.sheet.name);
  const sigFound = new Set<string>(); const frontDates: { r: number; c: number; old: Date }[] = [];
  for (const name of texts) {
    const sh = sheets.find(x => x.name === name)!;
    const fp = frontTexts(sh, { unit: s.settings.unitName || '', place: s.settings.place || '', d, fmt: fmt.date, sigs, serial: toSerial(d, wb.date1904) });
    for (const w of fp.writes) plan.push({ sheet: w.sheet, r: w.r, c: w.c, value: w.value, exact: true, over: w.over });
    warnings.push(...fp.warnings); for (const t of fp.sigsDone) sigFound.add(t);
    rep.front.title ||= fp.found.title; rep.front.date ||= fp.found.date; rep.front.sigs = Math.max(rep.front.sigs, fp.found.sigs);
    if (name === front) frontDates.push(...fp.dates);
    if (name === front && !fp.found.title) warnings.push('Δεν βρέθηκε τίτλος «Ημερήσια αναφορά…» στο έντυπο: η ημερομηνία δεν γράφτηκε στον τίτλο');
  }
  // η ίδια ημερομηνία στην ίδια θέση των άλλων φύλλων (π.χ. η πίσω όψη με ημερομηνία στο U4 όπως η μπροστινή): μόνο κελί ημερομηνίας,
  // όχι τύπος, ως έναν μήνα από την παλιά ημερομηνία της μπροστινής
  if (frontDates.length) for (const x of sheets) {
    if (x.name === front) continue;
    for (const f of frontDates) {
      const v = x.rows[f.r]?.[f.c]; if (!(v instanceof Date) || x.fx.has(f.r + ':' + f.c) || Math.abs(v.getTime() - f.old.getTime()) > 31 * 86400000) continue;
      if (plan.some(w => w.sheet === x.name && w.r === f.r && w.c === f.c)) continue;
      plan.push({ sheet: x.name, r: f.r, c: f.c, value: toSerial(d, wb.date1904), exact: true, over: '' });
    }
  }
  for (const x of sigs) if (x.name && x.title && !sigFound.has(x.title)) warnings.push('Η υπογραφή «' + [x.art, x.title].filter(Boolean).join(' ') + '» δεν βρέθηκε στο έντυπο (ή δεν έχει γραμμή για το όνομα): το όνομα δεν γράφτηκε');
  if (!pick) { if (entries.length) warnings.push('Δεν βρέθηκε πίσω όψη με ενότητες (Εγγραφές, Διαγραφές, Αιτήσεις…): ' + entries.length + ' γραμμές δεν γράφτηκαν'); return { plan, warnings, report: rep, blocked }; }
  const { form } = pick; rep.sheet = form.sheet; rep.blocks = form.blocks;
  const ws = await wb.sheet(form.sheet);
  // the rows of a section are the rows of the printed form: cells that carry a style (borders). A first row that has none = a form without formatting: nothing is cut.
  const styled = (w: typeof ws, sl: Slot) => { const x = w.styleOf(ref0(sl.r, sl.c)); return x != null && x !== 0; };
  const trim = (w: typeof ws, slots: Slot[]) => { if (!slots.length || !styled(w, slots[0])) return slots; const i = slots.findIndex(x => !styled(w, x)); return i < 0 ? slots : slots.slice(0, i); };
  for (const sec of form.sections) if (sec.layout === 'below') sec.slots = trim(ws, sec.slots);
  const widthOf = (sl: Slot, w: Sheet0) => { let px = 0; for (let c = sl.c; c <= sl.c2; c++) px += Math.floor(w.colWidth(c + 1) * MDW); return Math.max(40, px - 8); };
  type Sheet0 = typeof ws;
  // ---- which section gets which category
  const secOf = (id: SecId): BackSection | undefined => form.sections.find(x => x.id === id && x.state === 'sure');
  const target = (id: SecId): SecId | null => (id === 'leaves' ? (secOf('leaves') ? 'leaves' : secOf('absences') ? 'absences' : null) : secOf(id) ? id : null);
  const by = new Map<SecId, Entry[]>(); const lost = new Map<SecId, number>();
  for (const e of entries) { const t = target(e.sec); if (!t) { lost.set(e.sec, (lost.get(e.sec) || 0) + 1); continue; } by.set(t, [...(by.get(t) || []), e]); }
  for (const [id, n] of lost) {
    const sug = form.sections.find(x => (x.id === id || (id === 'leaves' && x.id === 'absences')) && x.state === 'suggest');
    rep.missing.push({ id, n });
    warnings.push(sug ? 'Η ενότητα «' + sug.text + '» του εντύπου δεν είναι σίγουρη (Πρόταση στην οθόνη «Πρότυπο μονάδας»): ' + n + ' γραμμές «' + SEC_NAME[id] + '» δεν γράφτηκαν'
      : 'Το έντυπο δεν έχει ενότητα «' + SEC_NAME[id] + '»: ' + n + ' γραμμές δεν γράφτηκαν');
  }
  // ---- the lines of each section into its rows
  const over: { sec: BackSection; lines: string[][] }[] = [];   // entries (as wrapped rows) that did not fit
  for (const sec of form.sections.filter(x => x.state === 'sure')) {
    const es = by.get(sec.id) || []; const sr: SecReport = { id: sec.id, text: sec.text, ref: ref0(sec.r, sec.c), state: sec.state, layout: sec.layout, rows: sec.slots.length, entries: es.length, lines: 0, placed: 0, moved: 0, unplaced: 0, ...(sec.comment ? { comment: sec.comment } : {}) };
    rep.sections.push(sr); if (!es.length) continue;
    let n = 0; const rows: string[][] = es.map(e => { const t = (e.numbered ? numLabel(++n, fmt) + ' ' : '') + e.text; return [t]; });
    if (sec.layout === 'right') {
      const sl = sec.slots[0]; plan.push({ sheet: form.sheet, r: sl.r, c: sl.c, value: rows.map(x => x[0]).join('\n') }); sr.lines = es.length; sr.placed = es.length; continue;
    }
    const sl0 = sec.slots[0]; const max = sl0 ? widthOf(sl0, ws) : 0; const meas = (t: string) => textPx(t, FONT);
    const wrapped = rows.map(x => (max ? wrapText(x[0], meas, max) : [x[0]]));
    sr.lines = wrapped.reduce((a, x) => a + x.length, 0);
    let at = 0; let spilled = false; const rest: string[][] = [];
    for (const w of wrapped) {
      if (!spilled && at + w.length <= sec.slots.length) { w.forEach((t, i) => plan.push({ sheet: form.sheet, r: sec.slots[at + i].r, c: sec.slots[at + i].c, value: t })); at += w.length; sr.placed += 1; }
      else { spilled = true; rest.push(w); }
    }
    if (rest.length) over.push({ sec, lines: rest });
    sr.unplaced = rest.length;
  }
  // ---- the rest on copies of the continuation sheet
  const cont = form.continuation; const pages: string[] = []; const left = new Map<SecId, number>();
  if (over.length) {
    const csh = cont ? sheets.find(x => x.name === cont) : null; const cws = cont ? await wb.sheet(cont) : null;
    const cslots = csh && cws ? trim(cws, slotsOfContinuation(csh)) : [];
    if (csh && cws && cslots.length >= 2) {
      let page: string | null = null; let at = 0; const cap = cslots.length;
      const newPage = async () => { const nm = (cont!.length > 20 ? cont!.slice(0, 20) : cont!) + ' (' + (pages.length + 1) + ')'; const w = await wb.cloneSheet(cont!, nm); pages.push(w.name); page = w.name; at = 0; };
      for (const { sec, lines } of over) {
        const sr = rep.sections.find(x => x.id === sec.id)!; let head = false;
        for (const w of lines) {
          if (w.length + 1 > cap) { left.set(sec.id, (left.get(sec.id) || 0) + w.length); continue; }
          if (!page || at + w.length + (head ? 0 : 1) > cap) { if (pages.length >= 8) { left.set(sec.id, (left.get(sec.id) || 0) + w.length); continue; } await newPage(); head = false; }
          if (!head) { plan.push({ sheet: page!, r: cslots[at].r, c: cslots[at].c, value: sec.text.replace(/\s+/g, ' ').trim() }); at++; head = true; }
          w.forEach((t, i) => plan.push({ sheet: page!, r: cslots[at + i].r, c: cslots[at + i].c, value: t })); at += w.length; sr.moved++; sr.unplaced--;
        }
      }
      rep.continuation = { sheet: cont!, pages };
    }
    if (!rep.continuation) for (const { sec, lines } of over) left.set(sec.id, lines.reduce((a, w) => a + w.length, 0));
    for (const x of rep.sections) if (x.unplaced > 0) { const n = left.get(x.id) || 0; warnings.push('Στην ενότητα «' + x.text + '» δεν χωράνε ' + n + ' γραμμές' + (cont ? '' : ' (το έντυπο δεν έχει σελίδα συνέχειας)') + ': δεν γράφτηκαν'); }
  }
  // ---- the left column: officers of the day, guards, vehicles (found by their labels, as the bundled form does)
  const rows = await wb.values(form.sheet, 400, 40) as XlValue[][];
  const B = mapHkBack(rows, ws.merges(), s.settings.place);
  const put = (refS: string | undefined, v: string | number | null, what: string) => {
    if (!refS) { if (v != null && v !== '') warnings.push('Το έντυπο δεν έχει «' + what + '»: δεν γράφτηκε'); return; }
    const { r, c } = splitRef(refS); plan.push({ sheet: form.sheet, r: r - 1, c: c - 1, value: v });
  };
  const off = hkOffText(s, d); if (off) put(B.off, off, 'Αξιωματικοί:');
  const pm = seatMap(s); const og = hkOrgans(s, d); const ly = og.ly != null ? pm.get(og.ly) : undefined, dy = og.dy != null ? pm.get(og.dy) : undefined;
  const who = (p: Person) => [rankTxt(p), p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
  if (ly) put(B.ly, 'Λ/Υ: ' + who(ly), 'Υπαξιωματικοί:'); if (dy) put(B.dy, 'Δ/Υ: ' + who(dy), 'Υπαξιωματικοί:');
  const g = s.guards[d] || {}; let night = 0, day24 = 0;
  for (const k in g) { const p = postBy(s, k); if (!p) continue; if (p.kind === 'th' || p.kind === 'sk' || p.kind === 'op') night++; else day24++; }
  if (hkOn(s.settings, 'grd')) { put(B.night, night || null, 'Νυκτοφρουρές'); put(B.day24, day24 || null, '24ώρες'); }
  const v = hkaiVeh(s, d);
  if (hkOn(s.settings, 'veh') && v) {
    // the table of the unit has its OWN vehicle types: the numbers go only to the row whose type is the one given, never to another type's row
    const typeCell = B.vType ? splitRef(B.vType) : null; const have = typeCell ? String(rows[typeCell.r - 1]?.[typeCell.c - 1] ?? '').trim() : '';
    if (have && v.type && phraseKey(have) !== phraseKey(v.type)) warnings.push('Στον πίνακα οχημάτων η πρώτη γραμμή είναι «' + have + '», όχι «' + v.type + '»: τα οχήματα δεν γράφτηκαν');
    else if (have && !v.type) warnings.push('Στον πίνακα οχημάτων δεν ξέρω ποιο είδος είναι τα νούμερα: δεν γράφτηκαν');
    else {
      if (v.type && !have) put(B.vType, v.type, 'Είδη οχημάτων');
      for (const [r2, x, w] of [[B.vProv, v.prov, 'Προβλέπονται'], [B.vKin, v.kin, 'Σε κίνηση'], [B.vMaint, v.maint, 'Για συντήρηση'], [B.vDmg, v.dmg, 'Λόγω βλάβης']] as const) put(r2, x ?? null, w + ' (οχήματα)');
    }
  }
  return { plan, warnings, report: rep, blocked };
}
void continuationOf;
