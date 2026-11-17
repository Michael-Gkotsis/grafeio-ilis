// Scores the shape detector against the ground truth of a mock file (test/mockgen.ts).
// Per item: sure-correct | suggested (right concept, only suggested) | missed | wrong-sure (a SURE answer that is wrong: never allowed).
import type { BookShape, GridRegion, ListRegion, MatrixRegion, SheetShape } from '../src/shared/shape';
import type { Match } from '../src/shared/lexicon';
import type { Item } from './mockgen';

export type Verdict = 'sure' | 'suggested' | 'missed' | 'wrong-sure' | 'skip';
export interface Scored { item: Item; verdict: Verdict; why: string }
export interface Tally { sure: number; suggested: number; missed: number; wrongSure: number }
export const emptyTally = (): Tally => ({ sure: 0, suggested: 0, missed: 0, wrongSure: 0 });
export function add(t: Tally, v: Verdict) { if (v === 'sure') t.sure++; else if (v === 'suggested') t.suggested++; else if (v === 'missed') t.missed++; else if (v === 'wrong-sure') t.wrongSure++; }

const list = (c: Item['concept']): string[] => (c == null ? [] : Array.isArray(c) ? c.filter(Boolean) : [c]);

// Judge one Match against the expected concept(s)
function judge(m: Match | undefined, it: Item): { v: Verdict; why: string } {
  if (!m) return { v: 'missed', why: 'nothing found' };
  const exp = list(it.concept); const nullOk = it.concept == null || (Array.isArray(it.concept) && it.concept.some(x => x == null));
  const got = m.concept;
  if (m.confidence === 'unknown' || !got) return nullOk && exp.length === 0 ? { v: 'skip', why: '' } : { v: 'missed', why: 'unknown (' + m.text + ')' };
  // «ΟΝΟΜΑΤΕΠΩΝΥΜΟ» is the full name, whichever of last/name the generator filed it under
  const right = exp.includes(got) || (got === 'person:name' && exp.includes('person:last') && /ονοματεπ/.test(m.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  if (m.confidence === 'sure') {
    if (!right || it.maxLevel === 'suggest') return { v: 'wrong-sure', why: 'SURE ' + got + ' for «' + m.text + '», expected ' + (exp.join('|') || 'unknown') + (it.maxLevel ? ' (at most suggest)' : '') };
    return { v: 'sure', why: '' };
  }
  return right ? { v: 'suggested', why: got + ' for «' + m.text + '»' } : (nullOk && exp.length === 0 ? { v: 'skip', why: '' } : { v: 'missed', why: 'suggested ' + got + ' for «' + m.text + '», expected ' + exp.join('|') });
}

const has = (x: { r1: number; r2: number; c1: number; c2: number }, ref: { r: number; c: number }) => ref.r >= x.r1 && ref.r <= x.r2 && ref.c >= x.c1 && ref.c <= x.c2;
function region<T extends 'matrix' | 'list' | 'grid'>(sh: SheetShape, type: T, ref: { r: number; c: number }): (T extends 'matrix' ? MatrixRegion : T extends 'list' ? ListRegion : GridRegion) | undefined {
  for (const x of sh.regions) {
    if (x.type !== type) continue;
    const top = x.type === 'matrix' ? x.headerRows[0] : x.type === 'list' ? x.headerRows[0] : x.headerRow;
    const c1 = x.type === 'matrix' ? x.labelCol : x.c1;
    if (ref.r >= top && ref.r <= x.r2 && ref.c >= c1 && ref.c <= x.c2) return x as never;
  }
  void has; return undefined;
}

export function score(shape: BookShape, items: Item[]): Scored[] {
  const out: Scored[] = [];
  const push = (item: Item, v: Verdict, why = '') => out.push({ item, verdict: v, why });
  for (const it of items) {
    const sh = shape.sheets.find(s => s.name === it.sheet);
    if (!sh) { push(it, 'missed', 'sheet not found'); continue; }
    const ref = it.ref || { r: it.r ?? 0, c: it.c ?? 0 };
    if (it.shape === 'label') {
      const l = sh.labels.find(x => x.r === it.r && x.c === it.c);
      if (it.what === 'labelConcept') { const j = judge(l?.match, it); push(it, j.v, j.why); continue; }
      const val = it.value as { r: number; c: number };
      if (!l || !l.value) push(it, 'missed', 'label not found');
      else if (l.value.r === val.r && l.value.c === val.c) {
        // the concept of title/place labels is judged too
        if (/^label:(title|placeDate|unit)$/.test(String(it.concept))) { const j = judge(l.match, it); push(it, j.v === 'skip' ? 'missed' : j.v === 'sure' || j.v === 'suggested' ? 'sure' : j.v, j.why); } else push(it, 'sure');
      } else push(it, 'missed', 'value at ' + l.value.r + ':' + l.value.c + ', expected ' + val.r + ':' + val.c);
      continue;
    }
    if (it.shape === 'formula') {
      const m = region(sh, 'matrix', ref);
      if (!m || !m.driven) { push(it, 'missed', 'no driven matrix'); continue; }
      const d = m.driven;
      if (it.geom === 'dataSheet') push(it, d.dataSheet === it.value ? 'sure' : 'missed', 'data sheet ' + d.dataSheet);
      else if (it.geom === 'rankCol') push(it, d.critCols.find(x => x.role === 'rank')?.col === it.value ? 'sure' : 'missed', 'rank col');
      else if (it.geom === 'statusCol') push(it, d.critCols.find(x => x.role === 'status')?.col === it.value ? 'sure' : 'missed', 'status col');
      else {
        const word = it.geom === 'rankWord' ? d.rowCrit[it.r!] : d.colCrit[it.c!];
        if (word !== it.value) { push(it, 'missed', 'word ' + word + ' vs ' + it.value); continue; }
        const col = d.critCols.find(x => x.role === (it.geom === 'rankWord' ? 'rank' : 'status'));
        const w = col?.words.find(x => x.text === word);
        if (it.concept && w && w.match.confidence === 'sure' && w.match.concept !== it.concept) push(it, 'wrong-sure', 'word «' + word + '» SURE ' + w.match.concept + ', expected ' + it.concept);
        else push(it, 'sure');
      }
      continue;
    }
    const t = it.shape === 'matrix' ? 'matrix' : it.shape === 'list' ? 'list' : 'grid';
    const reg = region(sh, t, ref);
    if (!reg) { push(it, 'missed', t + ' not found at ' + ref.r + ':' + ref.c); continue; }
    if (it.what === 'geom') {
      let got: number | undefined;
      if (reg.type === 'matrix') got = it.geom === 'first' ? reg.r1 : it.geom === 'last' ? reg.r2 : reg.labelCol;
      else if (reg.type === 'list') got = it.geom === 'first' ? reg.r1 : it.geom === 'last' ? reg.r2 : reg.c1;
      else got = it.geom === 'header' ? reg.headerRow : it.geom === 'firstDay' ? reg.dayCols[0] : it.geom === 'days' ? reg.days : reg.people;
      push(it, got === it.value ? 'sure' : 'missed', it.geom + ' ' + got + ' vs ' + it.value);
      continue;
    }
    if (it.what === 'span') {
      const g = reg as GridRegion; push(it, g.spans.some(x => x.r === it.r && x.c1 === it.c && x.c2 === it.c2) ? 'sure' : 'missed', 'span');
      continue;
    }
    if (it.what === 'col') {
      const cols = reg.type === 'grid' ? [...reg.left, ...reg.right] : reg.cols;
      const c = cols.find(x => x.c === it.c);
      if (!c) { push(it, list(it.concept).length ? 'missed' : 'skip', 'column ' + it.c + ' not in region'); continue; }
      const j = judge(c.match, it); push(it, j.v, j.why); continue;
    }
    if (it.what === 'row') {
      const r = (reg as MatrixRegion).rows?.find(x => x.r === it.r);
      if (!r) { push(it, 'missed', 'row ' + it.r + ' not in matrix'); continue; }
      const j = judge(r.match, it); push(it, j.v, j.why); continue;
    }
  }
  return out;
}
