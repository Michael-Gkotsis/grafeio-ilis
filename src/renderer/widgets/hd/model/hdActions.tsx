// The actions of the Ημερήσια Διαταγή tab: come out as Word or print, start again from the data, pick an own template.
// Purpose: `hdActions`, plain functions (not hooks) over what `useHd` already holds.
// Does NOT: hold any state or call a hook (model/useHd.tsx does).
// Owner layer: renderer/widgets/hd. Why: moved verbatim from screens/hd.ts (Phase 6.0); split from `useHd` to keep it
//   short.
// Covering test: test/screens-main.test.ts, test/hd.test.ts.
import type { ISODate } from '../../../../shared/dates';
import type { HdDoc } from '../../../../shared/hd';
import type { Sig } from '../../../../shared/sigs';
import type { StoreValue } from '../../../shared/model';
import type { useToast } from '../../../shared/ui';

/** What the actions need: the day and its document, and the store and toast functions. */
export interface HdActionDeps {
  date: ISODate;
  doc: HdDoc;
  /** The document as it came out before (kept), if any. */
  saved: HdDoc | undefined;
  run: StoreValue['run'];
  undoMark: StoreValue['undoMark'];
  toast: ReturnType<typeof useToast>;
  setEdit: (e: { date: ISODate; doc: HdDoc } | null) => void;
  setBusy: (b: boolean) => void;
}

/** «Βγάλε Word» / «Εκτύπωση» (`go`), «Ξανά από τα δεδομένα» (`again`) and «Δικό μου πρότυπο Word…» (`pickTpl`). */
export function hdActions({ date, doc, saved, run, undoMark, toast, setEdit, setBusy }: HdActionDeps) {
  const go = async (print: boolean, over?: Sig[]) => {
    setBusy(true);
    try {
      // kept as it came out: it comes out the same even if the data changes
      if (!(await run({ t: 'setHd', date, doc }, false))) return;
      setEdit(null);
      const r = await window.api.exportHd({ date, doc, print, ...(over ? { sigs: over } : {}) });
      if (!r.ok)
        toast({
          text: (
            <span>
              <b>Δεν βγήκε.</b> {r.error}
            </span>
          ),
        });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() });
    } finally {
      setBusy(false);
    }
  };
  const again = async () => {
    setEdit(null);
    if (saved && (await run({ t: 'setHd', date, doc: null }, false)))
      toast({ text: 'Ξανά από τα δεδομένα.', actions: [undoMark()] });
  };
  const pickTpl = async () => {
    const r = await window.api.pickHdTpl();
    if (!r) return;
    if (!r.ok) {
      toast({
        text: (
          <span>
            <b>Δεν μπήκε.</b> {r.error}
          </span>
        ),
      });
      return;
    }
    if (
      await run(
        {
          t: 'setSettings',
          settings: { hdTpl: { file: r.file, name: r.name } },
          text: 'πρότυπο Word Ημερήσιας Διαταγής: ' + r.name,
        },
        false,
      )
    )
      toast({ text: 'Πρότυπο: ' + r.name });
  };
  return { go, again, pickTpl };
}
