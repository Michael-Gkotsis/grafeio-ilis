// The pure rules of the service-block dialogs (features/duty-blocks/model/view.ts): the starting form, the number
// labels, the save command, the shape facts, the «Αποθήκευση» reason and the phase naming.
import { describe, expect, it } from 'vitest';
import {
  GR,
  NEW_PHASE,
  PHASE_TIP,
  TPL_BOXES,
  addedPhaseId,
  addedToastText,
  blockCommand,
  blockWhy,
  clampCount,
  hoursPerNumber,
  initialForm,
  isRotating,
  numberLabels,
  phaseTip,
  phaseWhy,
  shapeInfo,
  shiftOut,
  type BlockF,
} from '../src/renderer/features/duty-blocks/model/view';
import { DEFAULT_SETTINGS, MAX_NUMS, MAX_PER, PHASE_NAME, blocksOf, type BlockDef } from '../src/shared/domain';

const blocks = blocksOf(DEFAULT_SETTINGS);
const kindOf = (kind: string) => blocks.find((b) => b.kind === kind) as BlockDef;
const blank = (): BlockF => initialForm(undefined);

describe('duty-blocks view: the form', () => {
  it('a new service starts blank, active, unarmed, all day', () => {
    expect(blank()).toMatchObject({
      name: '',
      nums: 1,
      per: 1,
      armed: false,
      weapon: 'own',
      active: true,
      mode: 'day',
    });
    expect(blank().hrs).toEqual(['']);
  });

  it('an existing block opens with its own shape, name and codes', () => {
    const b = kindOf('mg');
    const f = initialForm(b);
    expect(f.name).toBe(b.name);
    expect(f.active).toBe(!b.hidden);
    expect(Object.keys(f.codes)).toEqual(b.posts.map((p) => p.k));
  });

  it('a rotating block (θαλαμοφύλακες) is always in shift mode', () => {
    const rot = blocks.find(isRotating) as BlockDef;
    expect(initialForm(rot).mode).toBe('shift');
  });

  it('counts are whole numbers from 1 to the limit; text gives 1', () => {
    expect(clampCount(0, MAX_NUMS)).toBe(1);
    expect(clampCount(NaN, MAX_NUMS)).toBe(1);
    expect(clampCount(2.9, MAX_NUMS)).toBe(2);
    expect(clampCount(99, MAX_NUMS)).toBe(MAX_NUMS);
    expect(clampCount(99, MAX_PER)).toBe(MAX_PER);
  });
});

describe('duty-blocks view: the shape preview', () => {
  it('numbers are 1ος, 2ος… and the people of a number are α + β', () => {
    expect(numberLabels(undefined, 3, 1)).toEqual({ nums: ['1ος', '2ος', '3ος'], labels: ['1ος', '2ος', '3ος'] });
    expect(numberLabels(undefined, 2, 2).labels).toEqual(['1ος (α + β)', '2ος (α + β)']);
  });

  it('the limits of the form are 30 numbers × 10 people, with a letter for each person', () => {
    expect(MAX_NUMS).toBe(30);
    expect(MAX_PER).toBe(10);
    expect(GR).toHaveLength(MAX_PER);
    const big = numberLabels(undefined, MAX_NUMS, MAX_PER);
    expect(big.nums).toHaveLength(30);
    expect(big.labels[29]).toBe('30ος (α + β + γ + δ + ε + ζ + η + θ + ι + κ)');
  });

  it('the built-in σκοπιά is numbered from its first post (3η, 4η…)', () => {
    const sk = blocksOf(DEFAULT_SETTINGS, 'spen').find((b) => b.kind === 'sk' && !b.custom) as BlockDef;
    const first = +(/\d+/.exec(sk.posts[0]?.short || '')?.[0] || 3);
    expect(numberLabels(sk, 2, 1).nums).toEqual([first + 'η', first + 1 + 'η']);
  });

  it('the total is numbers × people; the template boxes and hints depend on the kind', () => {
    const f = { ...blank(), nums: 6, per: 2 };
    expect(shapeInfo(undefined, f)).toMatchObject({ total: 12, boxes: undefined, overBoxes: false, underBoxes: false });
    const th = kindOf('th');
    const over = shapeInfo(th, { ...f, nums: TPL_BOXES.th + 1 });
    expect(over).toMatchObject({ boxes: TPL_BOXES.th, overBoxes: true, tableName: th.name.toUpperCase() });
    expect(shapeInfo(th, { ...f, nums: 1, per: 1 })).toMatchObject({ underBoxes: true, dropsPosts: true });
  });
});

describe('duty-blocks view: save', () => {
  it('no name: «Λείπει: Όνομα»; a code error comes next; a name alone is fine', () => {
    expect(blockWhy(blank(), [])).toBe('Λείπει: Όνομα');
    expect(blockWhy({ ...blank(), name: 'Πύλη' }, ['Ο κωδικός Θ υπάρχει ήδη'])).toBe('Ο κωδικός Θ υπάρχει ήδη');
    expect(blockWhy({ ...blank(), name: 'Πύλη' }, [])).toBe('');
  });

  it('a new service saves as «addBlock», an existing one as «editBlock»', () => {
    const f = { ...blank(), name: 'Πύλη', nums: 2, per: 2, armed: true, weapon: 'post' as const, active: false };
    expect(blockCommand(undefined, 'sven', f, false)).toMatchObject({
      t: 'addBlock',
      phase: 'sven',
      name: 'Πύλη',
      kind: 'other',
      n: 2,
      per: 2,
      hrs: '',
      off: true,
      shift: null,
      armed: true,
      armWeapon: 'post',
    });
    const b = kindOf('mg');
    const edit = blockCommand(b, 'sven', initialForm(b), false);
    expect(edit).toMatchObject({ t: 'editBlock', phase: 'sven', id: b.id, hrs: {}, hidden: !!b.hidden });
  });

  it('hours: fixed copies the first range to numbers without their own, all day clears all 30', () => {
    const fixed = { ...blank(), mode: 'fixed' as const, nums: 3, hrs: ['07:00-08:00', ''] };
    expect(hoursPerNumber(fixed)).toEqual(['07:00-08:00', '', '07:00-08:00']);
    expect(hoursPerNumber(blank())).toEqual(Array.from({ length: MAX_NUMS }, () => ''));
    expect(hoursPerNumber({ ...blank(), mode: 'shift' })).toBeUndefined();
    expect(blockCommand(undefined, 'sven', { ...fixed, name: 'Α' }, false)).toMatchObject({ hrs: '07:00-08:00' });
  });

  it('a rotating block left at its default shifts saves no shift; otherwise the shift is saved', () => {
    const f = { ...blank(), mode: 'shift' as const };
    expect(shiftOut(f, true)).toBeNull();
    expect(shiftOut(f, false)).not.toBeNull();
    expect(shiftOut({ ...f, mode: 'fixed' }, false)).toBeNull();
  });

  it('the toast says where the service shows', () => {
    const f = { ...blank(), name: 'Πύλη' };
    expect(addedToastText(f, true, 'ΣΒΕΝ')).toBe('Προστέθηκε: Πύλη. Τη βλέπεις στις θέσεις και στο έντυπο.');
    expect(addedToastText(f, false, 'ΣΠΕΝ')).toBe('Προστέθηκε: Πύλη. Τη βλέπεις όταν ισχύει η ΦΡΟΥΡΑ ΣΠΕΝ.');
    expect(addedToastText({ ...f, active: false }, true, 'ΣΒΕΝ')).toContain('Είναι ανενεργή');
  });
});

describe('duty-blocks view: the ΦΡΟΥΡΑ forms', () => {
  it('a built-in form has its own tip; a custom one names the template it uses', () => {
    expect(phaseTip({ id: 'sven', custom: false, base: 'sven' }, PHASE_NAME)).toBe(PHASE_TIP.sven);
    expect(phaseTip({ id: 'x1', custom: true, base: 'spen' }, PHASE_NAME)).toContain(PHASE_NAME.spen);
  });

  it('the name is required; the «new» option never collides with a phase id', () => {
    expect(phaseWhy('  ')).toBe('Λείπει: Όνομα');
    expect(phaseWhy('ΑΣΚΗΣΗ')).toBe('');
    expect(NEW_PHASE).toBe('__new');
  });

  it('the added phase is the id that was not there before', () => {
    const settings = { ...DEFAULT_SETTINGS, phases: [{ id: 'a' }, { id: 'b' }] } as unknown as typeof DEFAULT_SETTINGS;
    expect(addedPhaseId(new Set(['a']), settings)).toBe('b');
    expect(addedPhaseId(new Set(['a', 'b']), settings)).toBeUndefined();
  });
});
