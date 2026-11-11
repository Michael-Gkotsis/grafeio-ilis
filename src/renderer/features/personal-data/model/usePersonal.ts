// State and saving of the «Προσωπικά» tab.
// Purpose: `usePersonal` holds the draft of the fields (IBAN, ΑΜΚΑ, ΑΦΜ and, for soldiers, e-mail, relative's e-mail, blood group),
//   saves a field when it loses the focus (`setPersonal`), and saves what was typed when the card closes.
// Does NOT: draw anything (ui/PersonalTab.tsx). The checks (digits etc.) only warn, they never block.
// Owner layer: renderer/features/personal-data. Why: moved verbatim from screens/personal.ts (Phase 5.3c).
// Covering test: test/personal.test.ts.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../shared/model';
import {
  normExtra,
  normPersonal,
  PFIELDS,
  showPersonal,
  XFIELDS,
  type Extras,
  type Personal,
  type PKey,
  type XKey,
} from '../../../../shared/personal';

/** Field key: personal (IBAN, ΑΜΚΑ, ΑΦΜ) or extra (soldiers only). */
export type PersonalKey = PKey | XKey;
type Rec = Personal & Extras;

/** Who the data belongs to: a soldier or a cadre member. */
export type PersonalWho = { pid: number; cid?: undefined } | { cid: string; pid?: undefined };

const draftOf = (rec: Rec): Record<PersonalKey, string> => ({
  iban: showPersonal('iban', rec.iban),
  amka: showPersonal('amka', rec.amka),
  afm: showPersonal('afm', rec.afm),
  email: rec.email || '',
  relEmail: rec.relEmail || '',
  blood: rec.blood || '',
});
const isX = (k: PersonalKey): k is XKey => k === 'email' || k === 'relEmail' || k === 'blood';
const norm1 = (k: PersonalKey, v: unknown) => (isX(k) ? normExtra(k, v) : normPersonal(k, v));

/** State of the tab. `rec` is the person or cadre member; the parent mounts the tab with a key per person. */
export function usePersonal(who: PersonalWho, rec: Rec) {
  const { run } = useStore();
  const [f, setF] = useState(() => draftOf(rec));
  const [saved, setSaved] = useState<PersonalKey | null>(null);
  const soldier = who.pid != null; // e-mail και ομάδα αίματος: μόνο οπλίτες
  const live = useRef({ f, rec, who, run });
  live.current = { f, rec, who, run };
  const save = async (k: PersonalKey) => {
    const { f: cur, rec: r, who: w, run: go } = live.current;
    const v = norm1(k, cur[k]);
    if (v === ((r as Record<string, unknown>)[k] || '')) return;
    if (await go({ t: 'setPersonal', ...w, [k]: v } as never, false)) setSaved(k);
  };
  // φεύγει από την καρτέλα με πεδίο που γράφτηκε και δεν «έχασε» ακόμα την εστίαση: αποθηκεύεται κι αυτό
  useEffect(
    () => () => {
      const { f: cur, rec: r, who: w, run: go } = live.current;
      const patch: Rec = {};
      for (const x of [...PFIELDS, ...(w.pid != null ? XFIELDS : [])]) {
        const v = norm1(x.k, cur[x.k]);
        if (v !== ((r as Record<string, unknown>)[x.k] || '')) (patch as Record<string, unknown>)[x.k] = v;
      }
      if (Object.keys(patch).length) void go({ t: 'setPersonal', ...w, ...patch } as never, false);
    },
    [],
  );
  return { run, f, setF, saved, setSaved, soldier, save };
}

/** What `usePersonal` returns. */
export type Personal_ = ReturnType<typeof usePersonal>;
