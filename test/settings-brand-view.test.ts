// The pure rules of the «Τίτλος και λογότυπο» card (pages/settings/model/brandView.ts).
import { describe, expect, it } from 'vitest';
import {
  brandDirty,
  brandToSave,
  cleanTitle,
  hasBrand,
  isUploaded,
  rankOf,
  uploadedOf,
} from '../src/renderer/pages/settings/model/brandView';
import { BRAND_RANKS } from '../src/shared/brand';

const first = BRAND_RANKS[0].rank;

describe('brand view', () => {
  it('collapses spaces in the title and recognises an uploaded picture', () => {
    expect(cleanTitle('  Ο   Λοχίας ')).toBe('Ο Λοχίας');
    expect(isUploaded('data:image/png;base64,AA')).toBe(true);
    expect(isUploaded('')).toBe(false);
    expect(uploadedOf({ logo: 'data:image/png;base64,AA' })).toBe('data:image/png;base64,AA');
    expect(uploadedOf({ logo: 'star' })).toBe('');
  });

  it('starts with the stored rank, else the first', () => {
    expect(rankOf({})).toBe(first);
    expect(rankOf({ rank: 'X' })).toBe('X');
  });

  it('saves only what differs from the defaults', () => {
    expect(brandToSave({ rank: first, title: ' ', logo: '' })).toEqual({});
    expect(brandToSave({ rank: 'X', title: ' Α  Β ', logo: 'star' })).toEqual({
      rank: 'X',
      title: 'Α Β',
      logo: 'star',
    });
  });

  it('is dirty when rank, cleaned title or logo differ from the stored brand', () => {
    expect(brandDirty({ rank: first, title: '', logo: '' }, {})).toBe(false);
    expect(brandDirty({ rank: first, title: 'Α  Β', logo: '' }, { title: 'Α Β' })).toBe(false);
    expect(brandDirty({ rank: first, title: '', logo: 'star' }, {})).toBe(true);
    expect(hasBrand({})).toBe(false);
    expect(hasBrand({ title: 'Α' })).toBe(true);
  });
});
