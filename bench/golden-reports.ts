/**
 * `npm run bench:golden`: prints one line per report/form output (Excel hash, preview hash, print hashes) for 5, 60 and
 * 300 people. Run it before and after a change and diff the two outputs: they must be identical.
 *
 * It does NOT compare anything by itself and does not cover the other app outputs (roster, weapons, ΗΔ,
 * write-backs...): `test/golden-outputs.test.ts` checks all of them against `test/golden/outputs.txt` on every
 * `npm test`.
 * The generation code lives in `bench/golden-lib.ts`.
 */
import { GOLDEN_SIZES, legacyRows } from './golden-lib';

(async () => {
  const lines: string[] = [];
  for (const n of GOLDEN_SIZES) lines.push(...(await legacyRows(n)).map(row => row.line));
  console.log(lines.join('\n'));
})();
