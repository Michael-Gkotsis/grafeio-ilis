// State of the «Αρχεία Excel ανά είδος» card: which dialog is open and what each button of a row does.
// Purpose: `useSources`, the hooks of `SourcesView`, in the order the section always called them.
// Does NOT: draw anything (ui/sections/SourcesView.tsx) or hold the rules (model/sourcesView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); hook order is unchanged.
// Covering test: test/settings-sources-view.test.ts, test/screens-settings-guide.test.ts.
import { useState } from 'react';
import type { ImportPreview, SourceBook } from '../../../../shared/api';
import { KIND, type ListKind, type SourceBinding, type StatusKind } from '../../../../shared/sources';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { useSourceStatus } from '../../../widgets/sources-alert';
import { SHEET_KINDS, bindingForPick, bindingMoved, newFileText } from './sourcesView';

/** The dialog that is open over the section (one at a time); `back` is where «Άκυρο» of the mapping goes. */
export type Layer =
  | { kind: 'match'; book: SourceBook }
  | { kind: 'map'; list: ListKind; book: SourceBook; b: SourceBinding; back?: Layer }
  | { kind: 'import'; list: StatusKind; book: SourceBook; b: SourceBinding }
  | { kind: 'sheet'; list: ListKind; book: SourceBook; b: SourceBinding }
  | { kind: 'people'; pv: ImportPreview }
  | { kind: 'write'; list: ListKind };

/** What the row actions need: the store, the toast, the stored bindings and the setters of the section. */
interface Env {
  toast: ReturnType<typeof useToast>;
  refresh: () => Promise<unknown>;
  sources: Partial<Record<ListKind, SourceBinding>>;
  setLayer: (l: Layer | null) => void;
  setBusy: (k: string) => void;
  saving: ListKind | null;
  setSaving: (k: ListKind | null) => void;
}

/** «Διάλεξε Excel…» / «Άλλο αρχείο…» / «Εισαγωγή νέου Excel…»: pick a file and open the mapping or the matching. */
async function pickFile(env: Env, kind: ListKind | null) {
  const { toast, setLayer, setBusy } = env;
  setBusy(kind || 'new');
  try {
    const r = await window.api.srcPick(kind);
    if (!r) return;
    if (!r.ok) {
      toast({ text: r.error });
      return;
    }
    if (kind) setLayer({ kind: 'map', list: kind, book: r, b: bindingForPick(kind, r) });
    else setLayer({ kind: 'match', book: r });
  } finally {
    setBusy('');
  }
}

/** «Στήλες…»: open the mapping with the binding as it is in the file now. */
async function editBinding(env: Env, kind: ListKind) {
  const { toast, setLayer, sources } = env;
  const r = await window.api.srcRead(kind);
  if (!r.ok) {
    toast({ text: r.error });
    return;
  }
  setLayer({ kind: 'map', list: kind, book: r, b: r.binding || sources[kind]! });
}

/**
 * «Ανανέωση από Excel»: read the file and open the preview that fits the kind.
 * `fresh` is the mapping that was just saved (the `sources` of this render still has the old one).
 */
async function readSource(env: Env, kind: ListKind, fresh?: SourceBinding, book?: SourceBook) {
  const { toast, refresh, setLayer, sources } = env;
  const b0 = fresh || sources[kind];
  if (!b0) return;
  if (kind === 'people') {
    const r = await window.api.srcPeople(b0);
    if (!r.ok) {
      toast({ text: r.error });
      return;
    }
    setLayer({ kind: 'people', pv: r });
    return;
  }
  const r = book || (await window.api.srcRead(kind));
  if (!r.ok) {
    toast({ text: r.error });
    return;
  }
  // The table or its columns may have moved: the main process answers where they are now.
  const b = !fresh && r.binding ? r.binding : b0;
  if (bindingMoved(b, sources[kind])) await refresh();
  if (SHEET_KINDS.includes(kind)) setLayer({ kind: 'sheet', list: kind, book: r, b });
  // Every kind outside SHEET_KINDS (and not 'people', handled above) is a status kind.
  else setLayer({ kind: 'import', list: kind as StatusKind, book: r, b });
}

/** «Νέο αρχείο…» / «Νέο φύλλο…» / «Νέος μήνας»: let the app make the file or sheet. */
async function makeNewFile(env: Env, kind: ListKind) {
  const { toast, refresh } = env;
  const r = await window.api.srcNewFile(kind);
  if (!r) return;
  if (!r.ok) {
    toast({ text: r.error });
    return;
  }
  await refresh();
  toast({ text: newFileText(kind, r), actions: [{ label: 'Άνοιξε', fn: () => window.api.openPath(r.file) }] });
}

/** «✕»: stop reading and writing this file (the file itself is not touched). */
async function removeSource(env: Env, kind: ListKind) {
  await window.api.srcSave(kind, null);
  await env.refresh();
  env.toast({ text: KIND[kind].label + ': η εφαρμογή δεν διαβάζει ούτε γράφει πια σε Excel. Το αρχείο δεν άλλαξε.' });
}

/** The two checkboxes of a row: one box at a time, a second click before the status refreshes would write stale data. */
async function toggleOption(env: Env, kind: ListKind, patch: Partial<SourceBinding>) {
  const { refresh, sources, saving, setSaving } = env;
  if (saving) return;
  setSaving(kind);
  try {
    await window.api.srcSave(kind, { ...sources[kind]!, ...patch });
    await refresh();
  } finally {
    setSaving(null);
  }
}

/**
 * Everything `SourcesView` reads and calls.
 * @returns the stored `sources`, the file `st`atus, the open `layer` with `setLayer` and `close`, the row `busy` kind
 *   and `saving` kind, and the row actions `pick`, `edit`, `read`, `newFile`, `remove` and `toggle`
 */
export function useSources() {
  const { state, refresh } = useStore();
  const toast = useToast();
  const st = useSourceStatus();
  const [layer, setLayer] = useState<Layer | null>(null);
  const [busy, setBusy] = useState('');
  const sources = state.settings.sources || {};
  const close = () => setLayer(null);
  const [saving, setSaving] = useState<ListKind | null>(null);
  const env: Env = { toast, refresh, sources, setLayer, setBusy, saving, setSaving };
  return {
    sources,
    st,
    layer,
    setLayer,
    close,
    busy,
    saving,
    pick: (kind: ListKind | null) => pickFile(env, kind),
    edit: (kind: ListKind) => editBinding(env, kind),
    read: (kind: ListKind, fresh?: SourceBinding, book?: SourceBook) => readSource(env, kind, fresh, book),
    newFile: (kind: ListKind) => makeNewFile(env, kind),
    remove: (kind: ListKind) => removeSource(env, kind),
    toggle: (kind: ListKind, patch: Partial<SourceBinding>) => toggleOption(env, kind, patch),
  };
}
