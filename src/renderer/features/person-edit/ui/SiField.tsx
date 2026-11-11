// The «Σ.Ι.» field of the soldier form (Michael, 13/10): base, with/without weapon, condition category.
// Purpose: `SiField` is the Σ.Ι. dropdown set; what is not recognised is typed by hand (like the rank).
// Does NOT: save anything; the form that holds it does.
// Owner layer: renderer/features/person-edit. Why: moved verbatim from screens/si.ts (Phase 5.3c); only the person form uses it.
// Covering test: test/si.test.ts.
import { useState } from 'react';
import { parseSi, siBases, siCats, siLabel, siSubs, SI_CAT_BASES } from '../../../../shared/si';
import { useStore } from '../../../shared/model';
import { Select, type ValueEvent } from '../../../shared/ui';

const OTHER = '\u0001other';

// Σ.Ι., ΜΕ ΟΠΛΟ / ΧΩΡΙΣ ΟΠΛΟ και κατηγορία πάθησης. Ό,τι δεν αναγνωρίζεται γράφεται με το χέρι (όπως ο βαθμός).
/** Props of `SiField`. */
export interface SiFieldProps {
  id: string;
  value: string;
  cat: string;
  onChange: (value: string, cat: string) => void;
}

/** What the three dropdowns of `SiField` need. */
interface SiSelectsProps extends SiFieldProps {
  base: string;
  bases: string[];
  subs: string[];
  cats: string[];
  parts: ReturnType<typeof parseSi>;
  typing: boolean;
  hasCat: boolean;
  setBase: (b: string) => void;
}

/** The base, with/without weapon and condition-category dropdowns. */
function siSelects({
  id,
  value,
  cat,
  onChange,
  base,
  bases,
  subs,
  cats,
  parts,
  typing,
  hasCat,
  setBase,
}: SiSelectsProps) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      <Select
        id={id}
        className="ui-input"
        style={{ flex: 1 }}
        value={base}
        onChange={(e: ValueEvent) => setBase(e.target.value)}
      >
        <option value="">—</option>
        {bases.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
        <option value={OTHER} data-keep>
          Άλλο (γράψε το)…
        </option>
      </Select>
      {!typing && subs.length > 0 && (
        <Select
          className="ui-input"
          style={{ flex: 1.4 }}
          aria-label="Με όπλο ή άοπλος"
          value={parts!.sub}
          onChange={(e: ValueEvent) => onChange(siLabel(parts!.base, e.target.value), cat || '')}
        >
          <option value="">—</option>
          {subs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      )}
      {hasCat && (
        <Select
          className="ui-input"
          style={{ flex: 1.6 }}
          aria-label="Κατηγορία πάθησης"
          value={cat || ''}
          onChange={(e: ValueEvent) => onChange(value, e.target.value)}
        >
          <option value="">— πάθηση</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

export function SiField({ id, value, cat, onChange }: SiFieldProps) {
  const { state } = useStore();
  const cfg = state.settings.lists?.si;
  const parts = parseSi(value, cfg);
  const known = !value || !!parts?.ok;
  const [typing, setTyping] = useState(!known);
  const bases = siBases(cfg);
  if (parts?.ok && !bases.includes(parts.base)) bases.push(parts.base);
  const base = typing ? OTHER : parts?.ok ? parts.base : '';
  const subs = parts?.ok ? siSubs(parts.base) : [];
  const hasCat = !typing && !!parts?.ok && SI_CAT_BASES.includes(parts.base);
  const cats = siCats(cfg);
  if (cat && !cats.includes(cat)) cats.push(cat);
  const setBase = (b: string) => {
    if (b === OTHER) {
      setTyping(true);
      onChange(known ? '' : value, '');
      return;
    }
    setTyping(false);
    const keep = parts?.ok && siSubs(b).includes(parts.sub) ? parts.sub : '';
    onChange(b ? siLabel(b, keep) : '', SI_CAT_BASES.includes(b) ? cat || '' : '');
  };
  return (
    <div className="field" style={{ flex: 2 }}>
      <label className="field__label" htmlFor={id}>
        Σ.Ι.
      </label>
      {siSelects({ id, value, cat, onChange, base, bases, subs, cats, parts, typing, hasCat, setBase })}
      {typing && (
        <input
          className="ui-input"
          style={{ marginTop: '6px' }}
          aria-label="Σ.Ι. με το χέρι"
          placeholder="π.χ. Ι3 ΧΩΡΙΣ ΟΠΛΟ"
          value={value || ''}
          // biome-ignore lint/a11y/noAutofocus: the input appears when the user chose «Άλλο»; focus kept as it was
          autoFocus
          onChange={(e: ValueEvent) => onChange(e.target.value, '')}
        />
      )}
    </div>
  );
}
