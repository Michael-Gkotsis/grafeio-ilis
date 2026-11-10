// Handlers: own duty forms (phases) and their blocks (services).
//
// Purpose: The handlers of `setPhase`, `addPhase`, `renamePhase`, `delPhase`, `addBlock`, `editBlock`, `setBlock`.
//   Each one is the old `case` body of `run`, unchanged.
// Does NOT: handle the other settings (settings.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/own-phases.test.ts, test/own-kind.test.ts, test/shifts.test.ts, test/golden-outputs.test.ts,
//   test/rules.test.ts, test/duty-fuzz.test.ts.
import type { BlockDef } from '../../model/duty';
import { blocksOf, phaseBase, phaseList, phaseName, withBlocks } from '../../model/settingsAccess';
import { blockGroups, blockShape, MAX_NUMS, MAX_PER, reshapeBlock, shiftGroups } from '../../model/blocks';
import { hasShift } from '../../model/shifts';
import type { AppState } from '../../model/state';
import { codeErrors } from '../../duty/dutyCodes';
import type { CommandOf, Result, Ctx } from '../types';
import { phaseNameOk, phaseDelWhy } from '../phases';
import { blockShift, usedKeys, fillCodes, shapeTxt } from '../blocks';
import { dropFutureGuards } from '../guards';

/** Handler of the command `setPhase`. */
export function handleSetPhase(s: AppState, c: CommandOf<'setPhase'>): Result {
  if (c.phase === s.settings.phase) return { state: s, text: '', files: [] };
  if (!phaseList(s.settings).some((x) => x.id === c.phase)) throw new Error('Δεν βρέθηκε το έντυπο υπηρεσιών');
  return {
    state: { ...s, settings: { ...s.settings, phase: c.phase } },
    text: 'Έντυπο υπηρεσιών: ΦΡΟΥΡΑ ' + phaseName(s.settings, c.phase),
    files: [],
  };
}
/**
 * Handler of the command `addPhase`. Your own duty forms (Michael, 22/10): they start as a copy of another, with the
 * same services and posts (same keys = same history and fairness), and come out in the Excel with the form of that
 * one (ΣΒΕΝ or ΣΠΕΝ)
 */
export function handleAddPhase(s: AppState, c: CommandOf<'addPhase'>, ctx: Ctx): Result {
  const name = phaseNameOk(s.settings, c.name);
  if (!phaseList(s.settings).some((x) => x.id === c.from)) throw new Error('Δεν βρέθηκε το έντυπο υπηρεσιών');
  const id =
    'f' +
    ctx
      .newId()
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 8);
  const phases = [
    ...(s.settings.phases || []),
    {
      id,
      name,
      base: phaseBase(s.settings, c.from),
      blocks: blocksOf(s.settings, c.from).map((b) => ({ ...b, posts: b.posts.map((p) => ({ ...p })) })),
    },
  ];
  return {
    state: { ...s, settings: { ...s.settings, phases } },
    text: 'Νέο έντυπο υπηρεσιών: ΦΡΟΥΡΑ ' + name + ' (αντίγραφο της ΦΡΟΥΡΑ ' + phaseName(s.settings, c.from) + ')',
    files: [],
  };
}
/** Handler of the command `renamePhase`. */
export function handleRenamePhase(s: AppState, c: CommandOf<'renamePhase'>): Result {
  const f = (s.settings.phases || []).find((x) => x.id === c.id);
  if (!f) throw new Error('Η ΣΒΕΝ και η ΣΠΕΝ δεν αλλάζουν όνομα');
  const name = phaseNameOk(s.settings, c.name, c.id);
  if (name === f.name) return { state: s, text: '', files: [] };
  return {
    state: {
      ...s,
      settings: { ...s.settings, phases: s.settings.phases!.map((x) => (x.id === c.id ? { ...x, name } : x)) },
    },
    text: 'ΦΡΟΥΡΑ ' + f.name + ': λέγεται πια ΦΡΟΥΡΑ ' + name,
    files: [],
  };
}
/** Handler of the command `delPhase`. */
export function handleDelPhase(s: AppState, c: CommandOf<'delPhase'>): Result {
  const f = (s.settings.phases || []).find((x) => x.id === c.id);
  if (!f) throw new Error('Η ΣΒΕΝ και η ΣΠΕΝ δεν διαγράφονται');
  const why = phaseDelWhy(s, c.id);
  if (why) throw new Error(why);
  return {
    state: { ...s, settings: { ...s.settings, phases: s.settings.phases!.filter((x) => x.id !== c.id) } },
    text: 'Διαγράφηκε το έντυπο υπηρεσιών ΦΡΟΥΡΑ ' + f.name,
    files: [],
  };
}
/** Handler of the command `addBlock`. */
export function handleAddBlock(s: AppState, c: CommandOf<'addBlock'>, ctx: Ctx): Result {
  const name = c.name.trim();
  if (!name) throw new Error('Γράψε όνομα για τη νέα υπηρεσία');
  const n = Math.min(MAX_NUMS, Math.max(1, Math.floor(c.n) || 1));
  const per = Math.min(MAX_PER, Math.max(1, Math.floor(c.per || 1) || 1));
  const id =
    'x' +
    ctx
      .newId()
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 8);
  const sh = blockShift(c.shift, n);
  // every own service counts as its own (Michael, 22/10): kind «άλλη», with its own column in the check and in the
  // order numbers × people (Michael, 4/11): same shape as the edit (reshapeBlock)
  const seed: BlockDef = {
    id,
    kind: c.kind || 'other',
    name,
    armed: c.armed,
    custom: true,
    ...(c.armed && c.armWeapon === 'post' ? { armWeapon: 'post' as const } : {}),
    posts: [{ k: id + '_1', label: name, short: name, hrs: c.hrs.trim() || 'ημέρα' }],
  };
  const b: BlockDef = {
    ...seed,
    ...(c.off ? { hidden: true } : {}),
    ...(sh ? { shift: sh } : {}),
    posts: reshapeBlock(seed, n, per, name, usedKeys(s.settings)),
  };
  return {
    state: {
      ...s,
      settings: fillCodes(withBlocks(s.settings, c.phase, [...blocksOf(s.settings, c.phase), b]), c.phase, id),
    },
    text:
      'Νέα υπηρεσία στη ΦΡΟΥΡΑ ' +
      phaseName(s.settings, c.phase) +
      ': ' +
      name +
      ' (' +
      shapeTxt(n, per) +
      (c.armed ? ', ένοπλη' : '') +
      (c.off ? ', ανενεργή' : '') +
      ')',
    files: [],
  };
}
/** Handler of the command `editBlock`. */
export function handleEditBlock(s: AppState, c: CommandOf<'editBlock'>, ctx: Ctx): Result {
  // Edit of a service (Michael, 4/11: all except Λ/Υ-Δ/Υ): name, numbers, people per number, hours, codes, shifts,
  // armed, active, weapon
  const list = [...blocksOf(s.settings, c.phase)];
  const i = list.findIndex((x) => x.id === c.id);
  if (i < 0) throw new Error('Δεν βρέθηκε η υπηρεσία');
  const b = list[i];
  const ly = b.kind === 'ly';
  if (c.move) {
    const j = i + c.move;
    if (j < 0 || j >= list.length || list[j].kind === 'ly' || b.kind === 'ly') return { state: s, text: '', files: [] };
    [list[i], list[j]] = [list[j], list[i]];
    return {
      state: { ...s, settings: withBlocks(s.settings, c.phase, list) },
      text: 'ΦΡΟΥΡΑ ' + phaseName(s.settings, c.phase) + ', ' + b.name + ': άλλαξε σειρά',
      files: [],
    };
  }
  const name = (!ly && c.name.trim()) || b.name;
  let posts = b.posts.map((p) =>
    p.rot == null && c.hrs[p.k] != null ? { ...p, hrs: c.hrs[p.k].trim() || 'ημέρα' } : p,
  );
  if (!ly) {
    const was = blockShape(b);
    // the posts that are left over are hidden (not deleted), so that their history is not lost; growing again, the same
    // ones come back
    posts = reshapeBlock(
      { ...b, posts },
      c.nums ?? (c.n && c.n > 0 ? c.n : was.nums),
      c.per ?? was.per,
      name,
      usedKeys(s.settings),
    );
  }
  // hours per number (Michael, 4/11): all people of the number have the same, and new numbers get their own
  if (!ly && c.hrsNum) {
    const hs = blockGroups(posts).flatMap((g, i) =>
      g[0].rot == null && c.hrsNum![i] != null ? g.map((p) => [p.k, c.hrsNum![i].trim() || 'ημέρα'] as const) : [],
    );
    const m = new Map(hs);
    posts = posts.map((p) => (m.has(p.k) ? { ...p, hrs: m.get(p.k) } : p));
  }
  if (c.codes) posts = posts.map((p) => (c.codes![p.k] != null ? { ...p, code: c.codes![p.k].trim() } : p));
  const nb: BlockDef = { ...b, name, posts };
  if (!ly) {
    if (c.armed != null) nb.armed = c.armed;
    if (c.armWeapon != null) {
      if (c.armWeapon === 'post') nb.armWeapon = 'post';
      else delete nb.armWeapon;
    }
    if (c.hidden != null) {
      if (c.hidden) nb.hidden = true;
      else delete nb.hidden;
    }
  }
  // shifts (Michael, 20/10): null = as before (the 2-hour shifts of the form, or the hours of each post); own shifts
  // (Michael, 24/10): the number of each shift inside the numbers of the service
  if (c.shift !== undefined) {
    const sh = blockShift(c.shift, shiftGroups(nb).length);
    if (sh) nb.shift = sh;
    else delete nb.shift;
  }
  // the form has hours only for 4 numbers (ROT): with another count and without own shifts, every 2 hours so that all
  // have hours (Michael, 4/11)
  if (!ly && nb.posts.some((p) => p.rot != null) && shiftGroups(nb).length !== 4 && !hasShift(nb.shift))
    nb.shift = { every: 120 };
  list[i] = nb;
  const settings = fillCodes(withBlocks(s.settings, c.phase, list), c.phase, b.id);
  const errs = codeErrors(settings, { phase: c.phase, id: b.id });
  if (errs.length) throw new Error(errs[0]);
  // fewer people (Michael): the posts that were hidden cannot stay filled for tomorrow and later (invisible services
  // that would count in fairness and make the person «Already» busy); as in setBlock, today's stays and only in the
  // form in force
  const nowHidden = new Set(posts.filter((p) => p.hidden && !b.posts.find((o) => o.k === p.k)?.hidden).map((p) => p.k));
  if (nb.hidden && !b.hidden) for (const p of b.posts) nowHidden.add(p.k);
  const { guards, gone } = dropFutureGuards(s, ctx, c.phase, nowHidden);
  return {
    state: { ...s, guards, settings },
    text:
      'ΦΡΟΥΡΑ ' +
      phaseName(s.settings, c.phase) +
      ', ' +
      name +
      ': άλλαξαν τα στοιχεία' +
      (gone ? ', βγήκαν ' + gone + (gone === 1 ? ' υπηρεσία' : ' υπηρεσίες') + ' από αύριο και μετά' : ''),
    files: [],
  };
}
/** Handler of the command `setBlock`. */
export function handleSetBlock(s: AppState, c: CommandOf<'setBlock'>, ctx: Ctx): Result {
  const list = blocksOf(s.settings, c.phase);
  const b = list.find((x) => x.id === c.id);
  if (!b) throw new Error('Δεν βρέθηκε η υπηρεσία');
  // «Active» (Michael, 20/10): inactive = hidden, not deleted. It does not enter the posts, the auto-fill or the form;
  // the services that were done stay in the duty check, in fairness and on the card. Those entered for tomorrow and
  // later go away (otherwise they would count without being seen); today's stays, it may have been done already. Only
  // in the form in force: the posts of the other form may have the same keys (θαλαμοφύλακες, μαγειρεία).
  if (c.patch.hidden && b.kind === 'ly')
    throw new Error('Ο Λ/Υ και ο Δ/Υ μένουν πάντα ενεργοί (χρειάζονται στην ΗΚΑΙ)');
  const { guards, gone } =
    c.patch.hidden && !b.hidden
      ? dropFutureGuards(s, ctx, c.phase, new Set(b.posts.map((p) => p.k)))
      : { guards: s.guards, gone: 0 };
  const what =
    c.patch.hidden != null
      ? c.patch.hidden
        ? 'ανενεργή' +
          (gone ? ', βγήκαν ' + gone + (gone === 1 ? ' υπηρεσία' : ' υπηρεσίες') + ' από αύριο και μετά' : '')
        : 'ενεργή'
      : c.patch.armed != null
        ? c.patch.armed
          ? 'ένοπλη'
          : 'άοπλη'
        : c.patch.armWeapon != null
          ? c.patch.armWeapon === 'post'
            ? 'το όπλο είναι της θέσης (περνά από χέρι σε χέρι)'
            : 'το κάθε άτομο βγάζει το δικό του όπλο'
          : 'άλλαξε';
  // «own» is the default: it is not written in the settings
  const nb = (x: BlockDef): BlockDef => {
    const y = { ...x, ...c.patch };
    if (y.armWeapon !== 'post') delete y.armWeapon;
    return y;
  };
  return {
    state: {
      ...s,
      guards,
      settings: withBlocks(
        s.settings,
        c.phase,
        list.map((x) => (x.id === c.id ? nb(x) : x)),
      ),
    },
    text: 'ΦΡΟΥΡΑ ' + phaseName(s.settings, c.phase) + ', ' + b.name + ': ' + what,
    files: [],
  };
}
