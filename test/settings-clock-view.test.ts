// The pure rules of the «Ώρα και ζώνη ώρας» card (pages/settings/model/clockView.ts).
import { describe, expect, it } from 'vitest';
import {
  ZONES_FALLBACK,
  appOffset,
  clockMode,
  dstWord,
  fixAfter,
  fixText,
  fixTxt,
  hm,
  isoOf,
  zoneList,
} from '../src/renderer/pages/settings/model/clockView';
import { FIX_MAX } from '../src/shared/dates';

const parts = (over: object = {}) => ({ y: 2026, mo: 7, d: 4, h: 8, mi: 5, s: 0, ...over });

describe('Ώρα και ζώνη ώρας view', () => {
  it('writes a correction with its sign', () => {
    expect(fixTxt(0)).toBe('0′');
    expect(fixTxt(5)).toBe('+5′');
    expect(fixTxt(-12)).toBe('−12′');
    expect(fixText(-1)).toBe('Διόρθωση ώρας −1′');
  });

  it('clamps ±60 to the limit and does not clamp ±1', () => {
    expect(fixAfter(0, 60)).toBe(60);
    expect(fixAfter(-10, -60)).toBe(-70);
    expect(fixAfter(FIX_MAX - 10, 60)).toBe(FIX_MAX);
    expect(fixAfter(-FIX_MAX + 10, -60)).toBe(-FIX_MAX);
    expect(fixAfter(FIX_MAX, 1)).toBe(FIX_MAX + 1);
    expect(fixAfter(3, -1)).toBe(2);
  });

  it('writes the time and the date of a wall clock', () => {
    expect(hm(parts())).toBe('08:05');
    expect(hm(parts({ h: 14, mi: 30 }))).toBe('14:30');
    expect(isoOf(parts({ mo: 1, d: 9 }))).toBe('2026-01-09');
  });

  it('chooses the mode: Windows, another zone, or Athens', () => {
    expect(clockMode('system', false)).toBe('win');
    expect(clockMode('system', true)).toBe('win');
    expect(clockMode('', true)).toBe('other');
    expect(clockMode('America/New_York', false)).toBe('other');
    expect(clockMode('Europe/Athens', false)).toBe('athens');
    expect(clockMode('', false)).toBe('athens');
  });

  it("uses Windows' offset for «system» and the zone's offset otherwise", () => {
    expect(appOffset('system', 0, 7_200_000)).toBe(7_200_000);
    expect(appOffset('', Date.UTC(2026, 6, 4), 0)).toBe(3 * 3_600_000);
    expect(appOffset('', Date.UTC(2026, 0, 4), 0)).toBe(2 * 3_600_000);
  });

  it('says summer or winter time only for the Athens zone', () => {
    const now = parts();
    expect(dstWord('', 3 * 3_600_000, now)).toBe(' θερινή');
    expect(dstWord('Europe/Athens', 2 * 3_600_000, now)).toBe(' χειμερινή');
    expect(dstWord('America/New_York', 3 * 3_600_000, now)).toBe('');
  });

  it('lists the zones with UTC, never empty', () => {
    const zones = zoneList();
    expect(zones.length).toBeGreaterThan(0);
    expect(zones).toContain('UTC');
    expect(ZONES_FALLBACK).toContain('Europe/Athens');
  });
});
