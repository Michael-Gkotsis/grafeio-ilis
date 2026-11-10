// Buffer and Uint8Array across the thread boundary.
//
// Purpose: `buf` (worker side: a received `Uint8Array` back to a `Buffer`), `toBuf` and `fromWorker` (main side: the
//   same for a reply).
// Does NOT: copy bytes (a `Buffer` is a view over the same memory) or look deeper than one level.
// Owner layer: main (architecture), `shared/worker`. No Electron, no fs.
// Why: structured clone turns every `Buffer` into a plain `Uint8Array`, and the engines call Buffer methods on their
//   input. Only ONE level is converted on a reply (e.g. `r.data` of a filled form): the sheets of a read book hold
//   thousands of cells and must not be walked one by one.
// Covering test: test/worker-protocol.test.ts.

/** Bytes that are not a `Buffer` yet become a `Buffer` over the same memory; anything else is returned as is. */
export const toBuf = (v: unknown): unknown =>
  v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength) : v;

/**
 * Worker side: the `Buffer` for an argument that arrived as bytes.
 * @param v bytes from the main process (the typed protocol only sends bytes here)
 */
export const buf = (v: Uint8Array): Buffer => toBuf(v) as Buffer; // toBuf of bytes is always a Buffer

/**
 * Main side: puts Buffers back into a reply. Converts the value itself and the direct properties of a plain object;
 * arrays, class instances and anything deeper are left as they arrived. `Object.keys` equals the old `for...in` here:
 * the object is a plain one (its prototype is `Object.prototype`), so there are no inherited enumerable keys.
 * @returns the same value (mutated in place for an object), typed as what the worker function returns
 */
export function fromWorker<T>(v: T): T {
  if (v instanceof Uint8Array) return toBuf(v) as T;
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype) {
    const fields = v as Record<string, unknown>;
    for (const k of Object.keys(fields)) if (fields[k] instanceof Uint8Array) fields[k] = toBuf(fields[k]);
  }
  return v;
}
