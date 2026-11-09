// Comparison and report of the styles-diff tool (bench/ui/styles-diff.mjs).
//
// Purpose: compare the captures of the BASE build and the CURRENT build state by state (normalised DOM lines,
//   computed style of every element by path, bounding boxes, states that could not be opened) and write the report.
// Does NOT: open a browser or decide whether a difference is wanted; any difference makes the tool exit 1.
// Why: a CSS-only or structure-only PR must show "no visible change" as evidence, and a visible change must show up
//   as `state › element-path › property: base → current` lines a reviewer can read.
// Run: not run directly; imported by styles-diff.mjs.
import fs from 'fs';
import path from 'path';

const pseudoName = ['::before', '::after'];

/** Line diff of two arrays: trims the common head/tail, then a simple LCS on the rest (falls back to raw if huge). */
export function diffLines(a, b) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const x = a.slice(s, ea), y = b.slice(s, eb);
  if (!x.length && !y.length) return [];
  if (x.length * y.length > 4e6) return [...x.map((t, i) => `- ${s + i + 1}: ${t.trim()}`), ...y.map((t, i) => `+ ${s + i + 1}: ${t.trim()}`)];
  const lcs = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { i++; j++; }
    else if (j < y.length && (i === x.length || lcs[i][j + 1] >= lcs[i + 1][j])) out.push(`+ ${s + j + 1}: ${y[j++].trim()}`);
    else out.push(`- ${s + i + 1}: ${x[i++].trim()}`);
  }
  return out;
}

const styleMap = (cap, idx) => (idx < 0 ? null : cap.styles[idx].split('\n'));

/** Property differences of two style indexes (cached per pair, the same pair repeats on many elements). */
function propDiffs(base, cur, bi, ci, cache) {
  const key = bi + ':' + ci;
  if (cache.has(key)) return cache.get(key);
  const b = styleMap(base, bi), c = styleMap(cur, ci);
  const out = !b || !c ? [['(pseudo-element)', b ? 'present' : 'absent', c ? 'present' : 'absent']]
    : base.props.flatMap((p, k) => (b[k] === c[k] ? [] : [[p, b[k], c[k]]]));
  cache.set(key, out);
  return out;
}

/** Differences of one pseudo-element (`::before`/`::after`) of an element; index -1 = it has no generated content. */
function pseudoDiffs(base, cur, bp, cp, where, cache) {
  if ((bp < 0) !== (cp < 0)) return [`${where} › (pseudo-element): ${bp < 0 ? 'absent' : 'present'} → ${cp < 0 ? 'absent' : 'present'}`];
  if (bp < 0 || base.styles[bp] === cur.styles[cp]) return [];
  return propDiffs(base, cur, bp, cp, cache).map(([p, x, y]) => `${where} › ${p}: ${x} → ${y}`);
}

/** Compares two captures of one state. @returns {{ dom: string[], style: string[], box: string[], only: string[] }} */
export function compareCapture(base, cur) {
  const dom = diffLines(base.dom, cur.dom);
  const byPath = new Map(cur.els.map(e => [e.p, e]));
  const seen = new Set();
  const cache = new Map(), style = [], box = [], only = [];
  for (const be of base.els) {
    const ce = byPath.get(be.p);
    if (!ce) { only.push(`removed ${be.p} (${be.c})`); continue; }
    seen.add(be.p);
    const where = `${be.p}${be.c ? ' .' + be.c : ''}`;
    if (be.s !== ce.s || base.styles[be.s] !== cur.styles[ce.s]) {
      style.push(...propDiffs(base, cur, be.s, ce.s, cache).map(([p, x, y]) => `${where} › ${p}: ${x} → ${y}`));
    }
    style.push(...be.ps.flatMap((bp, k) => pseudoDiffs(base, cur, bp, ce.ps[k], `${where}${pseudoName[k]}`, cache)));
    if (be.b.join() !== ce.b.join()) box.push(`${where} › box [x,y,w,h]: ${be.b.join(',')} → ${ce.b.join(',')}`);
  }
  only.push(...cur.els.filter(e => !seen.has(e.p)).map(e => `added ${e.p} (${e.c})`));
  return { dom, style, box, only };
}

/**
 * Compares all states of one run. @returns {{ rows: object[], total: number }} one row per state with its counts and
 * differences. A state present on one side only, or skipped on one side only, counts as one difference.
 */
export function compareRun(runName, base, cur) {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(cur)])];
  const rows = keys.map(key => {
    const name = `${runName} › ${key}`;
    const b = base[key], c = cur[key];
    if (!b || !c) return { name, dom: [], style: [], box: [], only: [`state exists only in ${b ? 'BASE' : 'CURRENT'}`] };
    if (b.skipped || c.skipped) {
      const same = b.skipped && c.skipped;
      return { name, dom: [], style: [], box: [], only: same ? [] : [`could not be opened in ${b.skipped ? 'BASE' : 'CURRENT'}: ${b.skipped || c.skipped}`], skipped: same ? b.skipped : undefined };
    }
    return { name, ...compareCapture(b, c) };
  });
  const total = rows.reduce((n, r) => n + r.dom.length + r.style.length + r.box.length + r.only.length, 0);
  return { rows, total };
}

const FIRST = 8, MAX_STATES = 15;
const summary = r => `dom ${r.dom.length}, style ${r.style.length}, box ${r.box.length}, structure ${r.only.length}`;

/** Prints the first differences per state and writes dist/styles-diff/report.{json,md}. */
export function writeReport(dir, meta, rows, skippedNotes) {
  const bad = rows.filter(r => r.dom.length + r.style.length + r.box.length + r.only.length > 0);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ meta, bad, skipped: skippedNotes }, null, 1));
  const md = [
    `# styles-diff: ${meta.base} (base) vs current`, '',
    `States compared: ${meta.states} · different: ${bad.length} · not openable (same on both sides): ${skippedNotes.length}`, '',
    ...bad.flatMap(r => [`## ${r.name}`, summary(r), '',
      ...[['DOM', r.dom], ['Style', r.style], ['Box', r.box], ['Structure', r.only]].filter(([, l]) => l.length).flatMap(([t, l]) => [`**${t}**`, '```', ...l, '```']), '']),
    ...(skippedNotes.length ? ['## Not openable', ...skippedNotes.map(s => `- ${s}`)] : [])
  ];
  fs.writeFileSync(path.join(dir, 'report.md'), md.join('\n'));
  return bad;
}

/** Console summary: counts and the first FIRST differences of the first MAX_STATES different states. */
export function printBad(bad) {
  if (bad.length > MAX_STATES) console.log(`\n(${bad.length} different states; the first ${MAX_STATES} are shown, all are in the report)`);
  bad.slice(0, MAX_STATES).map(r => {
    console.log(`\n${r.name}: ${summary(r)}`);
    [...r.only, ...r.dom, ...r.style, ...r.box].slice(0, FIRST).map(l => console.log('  ' + r.name + ' › ' + l));
    const rest = r.only.length + r.dom.length + r.style.length + r.box.length - FIRST;
    if (rest > 0) console.log(`  … ${rest} more`);
  });
}
