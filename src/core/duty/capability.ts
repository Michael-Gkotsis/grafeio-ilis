// Duty capability: which kinds of duty a person can do, and the duty type used for the rotation.
//
// Purpose: `defaultCaps` (from the Σ.Ι. and the post), `capsOf` / `capsPerService` / `ownKinds`, `manOf` (the
//   sergeant's setting for a post) and `dutyType`.
// Does NOT: check a person against a day (dutyCheck.ts) or build the «Ποιος κάνει τι» columns (whoDoes.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: Two one-off migrations (settings.rev 6 and 7) are written here as pure functions of the settings, so the old
//   data keeps its meaning.
// Covering tests: test/who-does.test.ts, test/excel-caps.test.ts, test/rules.test.ts.
import { personMap } from './indexes';
import { allPosts } from './posts';
import { DEFAULT_BLOCKS, DEFAULT_BLOCKS_SPEN } from '../model/defaultBlocks';
import { type BlockDef, CAP_KINDS, type DutyKind } from '../model/duty';
import type { CapKey, Caps } from '../model/dutyRules';
import type { StatCell, UserLists } from '../model/lists';
import type { Person } from '../model/person';
import type { Settings } from '../model/settings';
import { blocksOf, everyBlock } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { TYPES } from '../model/status';
import { siAllows, siOf } from '../people/si';
import { STAT_ROWS, statDefault } from '../statuses/stat';

/**
 * What a person does not do, per kind of duty, by default: the post, or a Σ.Ι. that fits no duty of that kind (blocks:
 * of both forms). For the person card; the check per post is `capBlock`, per duty.
 */
export function defaultCaps(
  p: Person,
  lists?: UserLists,
  blocks: BlockDef[] = [...DEFAULT_BLOCKS, ...DEFAULT_BLOCKS_SPEN],
): Partial<Record<DutyKind, string>> {
  // whoever has a post is excluded from every duty except Λ/Υ and Δ/Υ; there he enters only by hand (the auto-fill does
  // not put him, allowedOn)
  if (p.post) return Object.fromEntries(CAP_KINDS.map(([k]) => [k, 'Πόστο: ' + p.post]));
  const out: Partial<Record<DutyKind, string>> = {};
  for (const [k] of CAP_KINDS) {
    const bs = blocks.filter((b) => b.kind === k && !b.hidden);
    if (bs.length && bs.every((b) => !siAllows(p, b, lists))) out[k] = 'Σ.Ι. ' + siOf(p, lists).text;
  }
  return out;
}

const blocksIdx = new WeakMap<Settings, BlockDef[]>();

export const allBlocks = (st: Settings): BlockDef[] => {
  let b = blocksIdx.get(st);
  if (!b) {
    const seen = new Set<string>();
    b = [...(blocksOf(st) || []), ...everyBlock(st)].filter((x) => !seen.has(x.id) && !!seen.add(x.id));
    blocksIdx.set(st, b);
  }
  return b;
};

/**
 * The capability of a person per kind: the defaults of `defaultCaps` with the sergeant's settings (`s.caps`) on top. A
 * value is the reason the person does not do that kind.
 */
export function capsOf(s: AppState, pid: number): Partial<Record<DutyKind, string>> {
  const p = personMap(s.people).get(pid);
  const c: Partial<Record<CapKey, string | null>> = {
    ...(p ? defaultCaps(p, s.settings.lists, allBlocks(s.settings)) : {}),
    ...(s.caps[pid] || {}),
  };
  const out: Partial<Record<DutyKind, string>> = {};
  CAP_KINDS.forEach(([k]) => {
    if (c[k]) out[k] = c[k] as string;
  });
  return out;
}

/**
 * The sergeant's setting for a post: that of the own duty («b:» + id) only, otherwise that of its kind. An own duty
 * (e.g. Πύλη) has its own column and does not follow its kind.
 * `string` = does not do it (the reason), `null` = does it explicitly (despite Σ.Ι. / post), `undefined` = whatever
 * Σ.Ι. and post say.
 * @decision Michael 22/10: «Πύλη σκέτο, όχι σαν Μαγειρεία».
 */
export const manOf = (
  own: Partial<Record<CapKey, string | null>>,
  block: string | undefined,
  kind: DutyKind,
  custom: boolean,
): string | null | undefined => (custom && block ? own[('b:' + block) as CapKey] : own[kind]);

/**
 * One-off migration (settings.rev 6): what held for an own duty through its kind (e.g. «δεν κάνει μαγειρεία» also for
 * the Πύλη that had the kind μαγειρεία) is written into its own column, so that nothing changes. `null` = no change.
 */
export function capsPerService(st: Settings, caps: Caps): Caps | null {
  const own = allBlocks(st).filter((b) => b.custom && b.kind !== 'ly');
  if (!own.length) return null;
  let out: Caps | null = null;
  for (const [id, c] of Object.entries(caps)) {
    let next: Partial<Record<CapKey, string | null>> | null = null;
    for (const b of own) {
      const key = ('b:' + b.id) as CapKey;
      if (c[b.kind] === undefined || c[key] !== undefined) continue;
      next = next || { ...c };
      next[key] = c[b.kind];
    }
    if (next) {
      out = out || { ...caps };
      out[Number(id)] = next;
    }
  }
  return out;
}

/**
 * One-off migration (settings.rev 7): the own duties that had a kind of the form (e.g. Πύλη as μαγειρεία) become
 * «άλλη»: their own column in the check and in the order, not in the totals of the μαγειρεία any more. Their codes stay
 * (the old Excel files are still read). Where the Καταστάσεις table said something else because of the kind (ΕΑ/ΕΟ not
 * in μαγειρεία, in a σκοπιά only if nobody else) it is written explicitly, so that who enters does not change. Run
 * `capsPerService` first (it needs the old kind). `null` = no change.
 * @decision Michael 22/10: «κάθε υπηρεσία να μετρά ως δική της».
 */
export function ownKinds(st: Settings): Settings | null {
  const conv = everyBlock(st).filter((b) => b.custom && b.kind !== 'other' && b.kind !== 'ly');
  if (!conv.length) return null;
  const old = st.lists?.stat?.cells || {};
  const cells: Record<string, Record<string, StatCell>> = { ...old };
  for (const b of conv)
    for (const t of STAT_ROWS) {
      const was = statDefault(TYPES[t], b),
        now = statDefault(TYPES[t], { kind: 'other', armed: b.armed });
      if (was !== now && !cells[t]?.[b.id]) cells[t] = { ...(cells[t] || {}), [b.id]: was };
    }
  const ids = new Set(conv.map((b) => b.id));
  const fix = (list: BlockDef[] | undefined) =>
    list && list.map((b) => (ids.has(b.id) && b.custom ? { ...b, kind: 'other' as DutyKind } : b));
  const out: Settings = {
    ...st,
    blocks: fix(st.blocks)!,
    blocksSpen: fix(st.blocksSpen)!,
    ...(st.phases ? { phases: st.phases.map((x) => ({ ...x, blocks: fix(x.blocks)! })) } : {}),
  };
  if (JSON.stringify(cells) !== JSON.stringify(old))
    out.lists = { ...(st.lists || {}), stat: { ...(st.lists?.stat || {}), cells } };
  return out;
}

const typeIdx = new WeakMap<Settings, Map<string, string>>();

/**
 * The type of a duty for the rotation: the kind (θαλαμοφύλακας of both tables together, σκοπιά, μαγειρεία…), each own
 * duty separately («b:» + id, as in «Ποιος κάνει τι»). A duty without a post (from Excel): its kind.
 */
export function dutyType(s: AppState, k: string, kind: DutyKind): string {
  let m = typeIdx.get(s.settings);
  if (!m) {
    const own = new Set(
      allBlocks(s.settings)
        .filter((b) => b.custom)
        .map((b) => b.id),
    );
    m = new Map(allPosts(s.settings).map((p) => [p.k, own.has(p.block) ? 'b:' + p.block : p.kind]));
    typeIdx.set(s.settings, m);
  }
  return (k && m.get(k)) || kind;
}
