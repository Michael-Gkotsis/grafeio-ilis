// The pure helpers of the «ΕΣΣΟ» cards (pages/settings/model/essoView.ts).
import { describe, expect, it } from 'vitest';
import { ESSO_STEPS, SERIES_ITEMS, atTxt, essoStartArgs, joinDir } from '../src/renderer/pages/settings/model/essoView';

describe('esso view', () => {
  it('joins a folder and a name with the separator the folder uses', () => {
    expect(joinDir('C:\\Ίλη\\', 'Γ΄ ΕΣΣΟ')).toBe('C:\\Ίλη\\Γ΄ ΕΣΣΟ');
    expect(joinDir('/home/x//', 'a')).toBe('/home/x/a');
  });

  it('shows the series with a tonos and numbers four steps', () => {
    expect(SERIES_ITEMS.map((i) => i.label)).toEqual(['Α΄', 'Β΄', 'Γ΄', 'Δ΄']);
    expect(ESSO_STEPS).toHaveLength(4);
  });

  it('writes an archive time as dd/mm/yyyy and leaves anything else alone', () => {
    expect(atTxt('2026-08-10 09:12')).toBe('10/08/2026 09:12');
    expect(atTxt('χθες')).toBe('χθες');
  });

  it('builds the start request with the optional folder and roster only when chosen', () => {
    const unit = { unitKind: 'ili', unit: ['a', 'b', 'c'], unitName: 'x' } as never;
    const base = essoStartArgs({ s: 'Β', y: 2026 }, 'R', null, null, unit);
    expect(base).toEqual({ esso: { s: 'Β', y: 2026 }, archiveRoot: 'R', unit });
    const full = essoStartArgs({ s: 'Β', y: 2026 }, 'R', 'D', { token: 'T' } as never, unit);
    expect(full.newDir).toBe('D');
    expect(full.roster).toBe('T');
  });
});
