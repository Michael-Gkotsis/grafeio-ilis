// The pure rules of the «Υπηρεσίες» card (pages/settings/model/blocksView.ts).
import { describe, expect, it } from 'vitest';
import {
  WEAPON_TIP,
  activeTip,
  armedTip,
  codesText,
  currentPhase,
  isLy,
  postsWord,
  shapeText,
  shownPosts,
  stateWord,
} from '../src/renderer/pages/settings/model/blocksView';
import { blocksOf } from '../src/shared/domain';
import { fakeState } from './fixtures';

const settings = () => fakeState(3).settings;
const blocks = () => blocksOf(settings(), 'sven');

describe('Υπηρεσίες view', () => {
  it('shows the picked form, or the first when it is gone', () => {
    expect(currentPhase(settings(), 'spen').id).toBe('spen');
    expect(currentPhase(settings(), 'ghost' as never).id).toBe(currentPhase(settings(), 'sven').id);
  });

  it('counts only the posts that are not hidden', () => {
    const b = { ...blocks()[1], posts: [{ code: 'Α' }, { code: '', hidden: true }, { code: '' }] } as ReturnType<
      typeof blocks
    >[number];
    expect(shownPosts(b)).toHaveLength(2);
    expect(codesText(shownPosts(b))).toBe('Α, ?');
  });

  it('writes «θέση» or «θέσεις»', () => {
    expect(postsWord(1)).toBe('θέση');
    expect(postsWord(0)).toBe('θέσεις');
    expect(postsWord(3)).toBe('θέσεις');
  });

  it('says the shape only for several numbers per post', () => {
    const b = blocks().find((x) => x.posts.length > 0)!;
    expect(shapeText({ ...b, per: 1 } as typeof b)).toBe('');
  });

  it('says the state: inactive, armed or unarmed', () => {
    const b = blocks()[1];
    expect(stateWord({ ...b, hidden: true })).toBe('ανενεργή');
    expect(stateWord({ ...b, hidden: false, armed: true })).toBe('ένοπλη');
    expect(stateWord({ ...b, hidden: false, armed: false })).toBe('άοπλη');
  });

  it('keeps the Λ/Υ and Δ/Υ blocks always active and without an armed tip', () => {
    const ly = { ...blocks()[0], kind: 'ly' } as ReturnType<typeof blocks>[number];
    expect(isLy(ly)).toBe(true);
    expect(activeTip(ly)).toMatch(/^Ο Λ\/Υ και ο Δ\/Υ μένουν πάντα ενεργοί/);
    expect(armedTip(ly)).toBeUndefined();
  });

  it('has a tip for an inactive and for an active block', () => {
    const b = blocks().find((x) => x.kind !== 'ly')!;
    expect(activeTip({ ...b, hidden: true })).toMatch(/^Ανενεργή: /);
    expect(activeTip({ ...b, hidden: false })).toMatch(/^Ξετσέκαρε /);
    expect(armedTip(b)).toMatch(/^Σε ένοπλη θέση δεν μπαίνουν /);
    expect(WEAPON_TIP).toMatch(/^Δικό του: .* Της θέσης: /);
  });
});
