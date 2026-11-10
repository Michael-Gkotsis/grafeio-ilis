// The typed contract of the Excel worker (src/main/shared/worker): wrong calls do not compile (checked by `npm run
// typecheck`), every transferable error comes back as the same class, Buffers are restored as before, and the host
// table has exactly the names the protocol promises.
import { describe, it, expect, expectTypeOf } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MessageChannel } from 'worker_threads';
import { ChangedError, LockedError } from '../src/main/files';
import { TemplateError } from '../src/main/exports';
import { OldFormatError } from '../src/main/sources';
import { zipHash } from '../src/main/ziphash';
import { ERROR_KINDS, fromWireError, toWireError } from '../src/main/shared/worker/errors';
import { FNS, serve } from '../src/main/shared/worker/host';
import { off } from '../src/main/shared/worker';
import type { WorkerArgs, WorkerFns, WorkerName, WorkerReply, WorkerResult } from '../src/main/shared/worker/protocol';
import { buf, fromWorker } from '../src/main/shared/worker/wire';
import type { ExportResult } from '../src/main/shared/forms';

describe('types: a wrong call does not compile', () => {
  it('names, argument tuples and local results are checked', () => {
    const never = (): never => {
      // none of this runs: the lines below are only compiled
      // @ts-expect-error unknown worker function
      off('noSuchFunction', [], async () => 0);
      // @ts-expect-error zipHash takes one buffer, not a string and a number
      off('zipHash', ['x', 1], async () => 'h');
      // @ts-expect-error the local result must be what the worker returns (string, not number)
      off('zipHash', [Buffer.alloc(0)], async () => 0);
      // @ts-expect-error the app state is not an argument (it travels beside the request)
      off('dutyCheck', [{} as never, '2026-10'], async () => ({}) as never);
      throw new Error('not run');
    };
    expect(typeof never).toBe('function');
    expectTypeOf<WorkerArgs<'zipHash'>>().toEqualTypeOf<[Buffer | Uint8Array]>();
    expectTypeOf<WorkerResult<'zipHash'>>().toEqualTypeOf<string>();
    expectTypeOf<WorkerResult<'fillFroura'>>().toEqualTypeOf<ExportResult>();
    expectTypeOf<WorkerArgs<'dutyCheck'>>().toEqualTypeOf<[string]>();
    expectTypeOf<WorkerArgs<'readBook'>>().toEqualTypeOf<[file: string, maxRows?: number, maxCols?: number]>();
  });
});

describe('error kinds', () => {
  const cases: [string, Error, string | undefined][] = [
    ['LockedError', new LockedError('C:\\x\\a.xlsx'), 'C:\\x\\a.xlsx'],
    ['ChangedError', new ChangedError('C:\\x\\b.xlsx'), 'C:\\x\\b.xlsx'],
    ['TemplateError', new TemplateError('κακό πρότυπο'), undefined],
    ['OldFormatError', new OldFormatError('παλιό .xls'), undefined],
  ];
  it.each(cases)('%s goes over the wire and comes back as the same class, message and file', (name, err, file) => {
    const wire = structuredClone(toWireError(err));
    expect(wire.name).toBe(name);
    expect(wire.file).toBe(file);
    const back = fromWireError(wire);
    expect(back.constructor).toBe(err.constructor);
    expect(back.message).toBe(err.message);
    expect((back as { file?: string }).file).toBe(file);
  });
  it('the table names the four kinds, in the order the worker tests them', () => {
    expect(ERROR_KINDS.map((k) => k.name)).toEqual(['LockedError', 'ChangedError', 'TemplateError', 'OldFormatError']);
  });
  it('anything else is a plain Error with its message (also for thrown strings and unknown classes)', () => {
    class Odd extends Error {}
    expect(toWireError(new Odd('odd')).name).toBe('Error');
    expect(fromWireError(toWireError(new Odd('odd'))).constructor).toBe(Error);
    expect(toWireError('boom')).toEqual({ name: 'Error', message: 'boom', file: undefined });
    expect(toWireError(null).message).toBe('null');
    expect(fromWireError({ name: 'NoSuchKind', message: 'm' }).message).toBe('m');
  });
});

describe('Buffers on the wire', () => {
  const bytes = () => new Uint8Array([1, 2, 3]);
  it('a top level Uint8Array becomes a Buffer over the same memory', () => {
    const u = bytes();
    const b = fromWorker(u);
    expect(Buffer.isBuffer(b)).toBe(true);
    expect(b.buffer).toBe(u.buffer);
  });
  it('a Buffer stays the same object', () => {
    const b = Buffer.from([1]);
    expect(fromWorker(b)).toBe(b);
  });
  it('one level deep in a plain object, not deeper, arrays and class instances untouched', () => {
    class Box {
      data = bytes();
    }
    const r = fromWorker({ data: bytes(), n: 1, deep: { data: bytes() }, list: [bytes()], box: new Box() });
    expect(Buffer.isBuffer(r.data)).toBe(true);
    expect(Buffer.isBuffer(r.deep.data)).toBe(false);
    expect(Buffer.isBuffer(r.list[0])).toBe(false);
    expect(Buffer.isBuffer(r.box.data)).toBe(false);
    const list = [bytes()];
    expect(fromWorker(list)[0]).toBe(list[0]);
    const box = new Box();
    expect(fromWorker(box).data).toBe(box.data);
    expect(fromWorker(null)).toBe(null);
    expect(fromWorker('s')).toBe('s');
  });
  it('buf gives a Buffer for bytes and the same Buffer for a Buffer', () => {
    expect(Buffer.isBuffer(buf(bytes()))).toBe(true);
    const b = Buffer.from([9]);
    expect(buf(b)).toBe(b);
  });
});

describe('the host table', () => {
  const promised: Record<WorkerName, true> = {
    fillFroura: true,
    fillHkai: true,
    fillOuts: true,
    signMade: true,
    mergeFirstSheets: true,
    mergeSheets: true,
    fillReport: true,
    placeSheets: true,
    previewReport: true,
    previewTemplate: true,
    previewBuilt: true,
    zipHash: true,
    valuesHash: true,
    readBook: true,
    writeGroup: true,
    dutyCheck: true,
  };
  it('has exactly the names of WorkerFns', () => {
    expectTypeOf<keyof typeof FNS>().toEqualTypeOf<keyof WorkerFns>();
    expect(Object.keys(FNS).sort()).toEqual(Object.keys(promised).sort());
  });
  it('answers over a port: a result with the bytes, and an error in its wire form', async () => {
    const { port1, port2 } = new MessageChannel();
    serve(port2);
    const ask = (fn: string, args: unknown[]) =>
      new Promise<WorkerReply>((resolve) => {
        port1.once('message', resolve);
        port1.postMessage({ id: 7, fn, args });
      });
    const bytes = new Uint8Array(await fs.promises.readFile(path.join(__dirname, '..', 'templates', 'froura.xlsx')));
    const ok = await ask('zipHash', [bytes]);
    expect(ok).toEqual({ id: 7, ok: true, r: await zipHash(Buffer.from(bytes)) });
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ilh-proto-')), 'παλιό.xls');
    fs.writeFileSync(f, 'x');
    const bad = await ask('readBook', [f]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.err.name).toBe('OldFormatError');
    port1.close();
    port2.close();
  });
});
