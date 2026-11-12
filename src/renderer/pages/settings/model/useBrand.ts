// State of the «Τίτλος και λογότυπο» card: the form, the picture upload, the save and the unsaved-changes registration.
// Purpose: `useBrand`, the hooks of `BrandCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/BrandCard.tsx) or hold the rules (model/brandView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/units.ts (Phase 6); hook order is unchanged.
// Covering test: test/settings-brand-view.test.ts, test/screens-settings-guide.test.ts.
import { useState, type ChangeEvent } from 'react';
import { BRAND_RANKS, appTitle } from '../../../../shared/brand';
import { useStore } from '../../../shared/model';
import { usePending } from '../../../shared/lib/pending';
import { useToast } from '../../../shared/ui';
import { brandDirty, brandToSave, hasBrand, isUploaded, rankOf, uploadedOf } from './brandView';
import { shrinkImage } from './shrinkImage';

/**
 * Everything `BrandCard` reads and calls.
 * @returns the stored `b`, the form (`rank`, `title`, `logo`, `upl`) with its setters, the selected rank `rk`, the
 *   `draft` for the preview, `pickFile`, `save`, `reset` («Όπως ήταν») and `stored` (something is stored)
 */
export function useBrand() {
  const { state, run } = useStore();
  const toast = useToast();
  const b = state.settings.brand || {};
  const [rank, setRank] = useState(rankOf(b));
  const [title, setTitle] = useState(b.title || '');
  const [logo, setLogo] = useState(b.logo || '');
  // The picture uploaded earlier stays among the options.
  const [upl, setUpl] = useState(uploadedOf(b));
  const draft = { brand: { rank, title, logo } };
  const rk = BRAND_RANKS.find((r) => r.rank === rank) || BRAND_RANKS[0];
  const custom = isUploaded(logo);
  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f: File | undefined = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const d = await shrinkImage(f);
      setUpl(d);
      setLogo(d);
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : String(err) });
    }
  };
  const save = async () => {
    const brand = brandToSave({ rank, title, logo });
    const text = 'τίτλος «' + appTitle({ brand }) + '»' + (custom ? ', δικό σου λογότυπο' : '');
    const ok = await run({ t: 'setSettings', settings: { brand }, text }, false);
    if (ok) toast({ text: 'Αποθηκεύτηκε ο τίτλος και το λογότυπο' });
    return ok;
  };
  const discard = () => {
    setRank(rankOf(b));
    setTitle(b.title || '');
    setLogo(b.logo || '');
  };
  usePending(brandDirty({ rank, title, logo }, b), { label: 'Τίτλος και λογότυπο', save, discard });
  const reset = () => {
    setRank(BRAND_RANKS[0].rank);
    setTitle('');
    setLogo('');
    setUpl('');
  };
  return { rank, setRank, title, setTitle, logo, setLogo, upl, draft, rk, pickFile, save, reset, stored: hasBrand(b) };
}
