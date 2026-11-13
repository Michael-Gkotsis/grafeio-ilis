import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { addImage, copyImages, fitSize, imageFile, readImage, type Img } from '../src/main/eikones';

// ψεύτικο nativeImage: το μέγεθος και ό,τι γράφτηκε
const fake = (w: number, h: number, log: string[] = []) => ({ createFromPath: (p: string): Img => {
  const mk = (w: number, h: number): Img => ({ isEmpty: () => p.includes('bad'), getSize: () => ({ width: w, height: h }), resize: o => { log.push('resize ' + o.width + 'x' + o.height); return mk(o.width, o.height); },
    toPNG: () => Buffer.from('PNG' + w + 'x' + h), toJPEG: q => Buffer.from('JPG' + q + 'x' + w + 'x' + h) });
  return mk(w, h);
} });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'eik-'));

describe('εικόνες επικεφαλίδων', () => {
  it('μέγεθος: μεγαλύτερη πλευρά ως 600, μικρές όπως είναι', () => {
    expect(fitSize(1200, 600)).toEqual({ width: 600, height: 300 });
    expect(fitSize(300, 2400)).toEqual({ width: 75, height: 600 });
    expect(fitSize(500, 400)).toEqual({ width: 500, height: 400 });
  });
  it('PNG μένει PNG, JPG γίνεται JPEG 85, ίδιο id για ίδια εικόνα', () => {
    const d = tmp(); const log: string[] = [];
    const a = addImage(d, '/x/emv.PNG', fake(1200, 900, log)); expect(a).toMatchObject({ ok: true, ext: 'png', w: 600, h: 450 });
    expect(log).toEqual(['resize 600x450']);
    if (!a.ok) return;
    expect(a.id).toMatch(/^[0-9a-f]{40}$/); expect(fs.existsSync(path.join(d, 'eikones', a.id + '.png'))).toBe(true);
    expect(addImage(d, '/y/other.png', fake(1200, 900))).toMatchObject({ id: a.id });
    const j = addImage(d, '/x/f.jpeg', fake(100, 80, log)); expect(j).toMatchObject({ ok: true, ext: 'jpg', w: 100, h: 80 }); expect(log).toHaveLength(1);
    if (j.ok) expect(fs.readFileSync(path.join(d, 'eikones', j.id + '.jpg'), 'utf8')).toBe('JPG85x100x80');
  });
  it('άκυρα: λάθος τύπος, άδεια εικόνα', () => {
    const d = tmp();
    expect(addImage(d, '/x/a.gif', fake(1, 1))).toMatchObject({ ok: false });
    expect(addImage(d, '/x/bad.png', fake(1, 1))).toMatchObject({ ok: false });
    expect(fs.existsSync(path.join(d, 'eikones'))).toBe(false);
  });
  it('ανάγνωση: data URL, και τίποτα για άγνωστο ή επικίνδυνο id', () => {
    const d = tmp(); const a = addImage(d, '/x/a.png', fake(10, 10)); if (!a.ok) throw 0;
    expect(readImage(d, a.id)).toBe('data:image/png;base64,' + Buffer.from('PNG10x10').toString('base64'));
    expect(imageFile(d, a.id)!.ext).toBe('png');
    expect(readImage(d, '0'.repeat(40))).toBeNull(); expect(readImage(d, '../ilh')).toBeNull();
  });
  it('αντίγραφο σε USB: μόνο όσες λείπουν', () => {
    const d = tmp(), u = tmp(); expect(copyImages(d, u)).toBe(0);
    addImage(d, '/x/a.png', fake(10, 10)); addImage(d, '/x/b.jpg', fake(20, 10));
    expect(copyImages(d, u)).toBe(2); expect(copyImages(d, u)).toBe(0); expect(fs.readdirSync(path.join(u, 'eikones'))).toHaveLength(2);
  });
});
