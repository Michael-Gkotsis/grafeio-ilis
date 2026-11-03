// Ρολόι εφαρμογής (dates.ts): ζώνη ώρας + διόρθωση, ανεξάρτητα από την ώρα και τη ζώνη του PC
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appVsOs, clockOf, nowHM, nowMin, nowParts, setClock, today, utcLabel, durLabel, zoneLabel, zoneOffset } from '../src/shared/dates';

const at = (iso: string) => vi.setSystemTime(new Date(iso));
beforeEach(() => { vi.useFakeTimers(); setClock({}); });
afterEach(() => { setClock({}); vi.useRealTimers(); });

describe('ρολόι: Ελλάδα (προεπιλογή)', () => {
  it('θερινή ώρα UTC+3', () => { at('2026-07-15T10:30:00Z'); expect(nowHM()).toBe('13:30'); expect(today()).toBe('2026-07-15'); expect(nowMin()).toBe(13 * 60 + 30); });
  it('χειμερινή ώρα UTC+2', () => { at('2026-01-15T10:30:00Z'); expect(nowHM()).toBe('12:30'); });
  it('αλλαγή μέρας στα μεσάνυχτα Αθήνας, ενώ το UTC είναι ακόμα χθες', () => {
    at('2026-07-15T20:59:59Z'); expect(today()).toBe('2026-07-15'); expect(nowHM()).toBe('23:59');
    at('2026-07-15T21:00:00Z'); expect(today()).toBe('2026-07-16'); expect(nowHM()).toBe('00:00');
    at('2026-01-15T21:59:59Z'); expect(today()).toBe('2026-01-15');
    at('2026-01-15T22:00:00Z'); expect(today()).toBe('2026-01-16');
  });
  it('αλλαγή ώρας 29/03/2026 (03:00 → 04:00)', () => {
    at('2026-03-29T00:59:00Z'); expect(nowHM()).toBe('02:59');
    at('2026-03-29T01:00:00Z'); expect(nowHM()).toBe('04:00');   // 03:00 UTC+2 → 04:00 UTC+3
    at('2026-03-29T12:00:00Z'); expect(nowHM()).toBe('15:00'); expect(today()).toBe('2026-03-29');
  });
  it('αλλαγή ώρας 25/10/2026 (04:00 → 03:00)', () => {
    at('2026-10-24T23:59:00Z'); expect(nowHM()).toBe('02:59'); expect(today()).toBe('2026-10-25');
    at('2026-10-25T00:59:00Z'); expect(nowHM()).toBe('03:59');
    at('2026-10-25T01:00:00Z'); expect(nowHM()).toBe('03:00');   // δεύτερο 03:00, πλέον UTC+2
    at('2026-10-25T12:00:00Z'); expect(nowHM()).toBe('14:00');
  });
  it('κενή ζώνη = Αθήνα· το offset μένει σωστό μετά από λεπτά (κρατημένο ανά τέταρτο)', () => {
    clockOf({ tz: '', clockFix: 0 });
    at('2026-10-25T00:44:00Z'); expect(nowHM()).toBe('03:44');
    vi.advanceTimersByTime(16 * 60000); expect(nowHM()).toBe('03:00');
  });
  it('nowParts', () => { at('2026-07-15T20:59:07Z'); expect(nowParts()).toEqual({ y: 2026, mo: 7, d: 15, h: 23, mi: 59, s: 7 }); });
});

describe('ρολόι: άλλες ζώνες και διόρθωση', () => {
  it('άλλη ζώνη', () => { setClock({ tz: 'UTC' }); at('2026-07-15T10:30:00Z'); expect(nowHM()).toBe('10:30'); setClock({ tz: 'America/New_York' }); expect(nowHM()).toBe('06:30'); });
  it('διόρθωση περνά τα μεσάνυχτα', () => {
    setClock({ fix: 5 }); at('2026-07-15T20:56:00Z'); expect(today()).toBe('2026-07-16'); expect(nowHM()).toBe('00:01');
    setClock({ fix: -5 }); at('2026-07-15T21:03:00Z'); expect(today()).toBe('2026-07-15'); expect(nowHM()).toBe('23:58');
  });
  it('διόρθωση: όριο ±720 και στρογγυλοποίηση', () => {
    setClock({ tz: 'UTC', fix: 5000 }); at('2026-07-15T00:00:00Z'); expect(nowHM()).toBe('12:00');
    setClock({ tz: 'UTC', fix: -5000 }); expect(nowHM()).toBe('12:00'); expect(today()).toBe('2026-07-14');
  });
  it('«system»: τοπική ώρα του PC (+ διόρθωση)', () => {
    setClock({ tz: 'system', fix: 10 }); at('2026-07-15T10:30:00Z');
    const d = new Date(Date.now() + 10 * 60000);
    expect(nowHM()).toBe(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
    expect(today()).toBe(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    setClock({ tz: 'system' }); expect(appVsOs()).toBe(0);
  });
  it('άκυρη ζώνη: σιωπηλά Αθήνα', () => { setClock({ tz: 'Mars/Olympus' }); at('2026-07-15T10:30:00Z'); expect(nowHM()).toBe('13:30'); });
  it('Ελλάδα απέναντι στα Windows', () => {
    at('2026-07-15T10:30:00Z'); const os = -new Date().getTimezoneOffset();
    expect(appVsOs()).toBe(180 - os);
  });
});

describe('κείμενα', () => {
  it('ζώνη, offset, διάρκεια', () => {
    expect(zoneLabel('Europe/Athens')).toBe('Ελλάδα, Αθήνα'); expect(zoneLabel('system')).toBe('όπως τα Windows'); expect(zoneLabel('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(zoneOffset('Europe/Athens', Date.parse('2026-07-01T00:00:00Z'))).toBe(3 * 3600e3);
    expect(utcLabel(2 * 3600e3)).toBe('UTC+02:00'); expect(utcLabel(-(9.5 * 3600e3))).toBe('UTC−09:30');
    expect(durLabel(60)).toBe('1 ώρα'); expect(durLabel(-30)).toBe('30 λεπτά'); expect(durLabel(65)).toBe('1 ώρα και 5 λεπτά'); expect(durLabel(121)).toBe('2 ώρες και 1 λεπτό');
  });
});
