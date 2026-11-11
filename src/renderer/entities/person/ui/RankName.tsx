// The rank-and-name element for JSX.
// Purpose: `RkName`, a grey prefix plus the name; the name keeps the style of its parent.
// Does NOT: hold the rank-names switch (model/rankName.ts does).
// Owner layer: renderer/entities/person. Why: lists and dialogs show people this way everywhere.
// Covering test: test/ux-names.test.ts.
import type { Person } from '../../../../shared/domain';
import { shortName } from '../../../../shared/domain';
import { rkPrefix } from '../model/rankName';

/** Props of `RkName`. */
export interface RkNameProps {
  p: Person;
  /** Name function: `shortName` (default), `fullName` or `plainName`. */
  fn?: (p: Person) => string;
  /** Keep the rank when the switch is off (see `rkPrefix`). */
  keep?: boolean;
}

/** `<span><span class="rk">PREFIX </span>NAME</span>`; without a prefix just `<span>NAME</span>`. */
export function RkName({ p, fn = shortName, keep = false }: RkNameProps) {
  const pre = rkPrefix(p, keep);
  return pre ? (
    <span>
      <span className="rk">{pre + ' '}</span>
      {fn(p)}
    </span>
  ) : (
    <span>{fn(p)}</span>
  );
}
