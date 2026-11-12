// State of the «Αντίγραφα ασφαλείας» card: the list of backups, the one picked for restore and the buttons.
// Purpose: `useBackups`, the hooks of `BackupsCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/BackupsCard.tsx) or hold the texts (model/backupsView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); hook order is
//   unchanged.
// Covering test: test/settings-backups-view.test.ts, test/screens-settings-guide.test.ts.
import { useEffect, useState } from 'react';
import type { BackupInfo } from '../../../../shared/api';
import { useStore, useUsbCopy } from '../../../shared/model';
import { useToast } from '../../../shared/ui';

/**
 * Everything `BackupsCard` reads and calls.
 * @returns `boot`, `today`, the `list` (`null` while loading), the picked backup `pick` with `setPick`, `copyToUsb`,
 *   `importFromUsb` (a cancelled picker changes nothing; an error is a toast) and `restore`
 */
export function useBackups() {
  const toast = useToast();
  const usb = useUsbCopy();
  const { boot, today } = useStore();
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [pick, setPick] = useState<BackupInfo | null>(null);
  const load = async () => {
    setList(await window.api.listBackups());
  };
  useEffect(() => {
    load();
  }, []);
  const copyToUsb = async () => {
    if (await usb()) load();
  };
  const importFromUsb = async () => {
    const r = await window.api.importBackup();
    if (!r) return;
    if (!r.ok) {
      toast({ text: r.error });
      return;
    }
    await load();
    toast({ text: 'Το αντίγραφο μπήκε στη λίστα. Πάτα «Επαναφορά» δίπλα του.' });
  };
  const restore = async (b: BackupInfo) => {
    const r = await window.api.restoreBackup(b.name);
    setPick(null);
    if (!r.ok) toast({ text: r.error });
  };
  return { boot, today, list, pick, setPick, copyToUsb, importFromUsb, restore };
}
