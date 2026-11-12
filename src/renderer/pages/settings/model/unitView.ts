// Pure rules of the «Μονάδα και έντυπα» card: the form, its dirty check and what a save writes.
// Purpose: `unitView` helpers for `useUnit` and their test; the card edits a copy of five settings and writes them back
//   in one `setSettings` command.
// Does NOT: render anything, touch React or call `run` (model/useUnit.ts does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4) so the rules are
//   testable without a render.
// Covering test: test/settings-unit-view.test.ts.
import type { Settings } from '../../../../shared/domain';
import { HK, UNIT_KINDS, unitKindOf, unitSettingsFor, unitText, type UnitKind } from '../../../../shared/unit';

/** What the card edits: unit kind, 3 header lines, title unit, place, cadre counts and the ΗΚΑΙ head. */
export interface UnitForm {
  unitKind: UnitKind;
  unit: [string, string, string];
  unitName: string;
  place: string;
  cadre: Settings['cadre'];
  head: string[];
}

/**
 * @param settings - the saved settings
 * @returns the form as it is saved (a copy: editing never touches `settings`)
 */
export const unitFormOf = (settings: Settings): UnitForm => ({
  unitKind: unitKindOf(settings),
  unit: [...settings.unit] as [string, string, string],
  unitName: settings.unitName,
  place: settings.place,
  cadre: { ...settings.cadre },
  head: [settings.hkai?.head?.[0] || '', settings.hkai?.head?.[1] || ''],
});

/** True when the form differs from the saved one (the unsaved-changes bar and the leave question). */
export const unitDirty = (form: UnitForm, saved: UnitForm): boolean => JSON.stringify(form) !== JSON.stringify(saved);

/**
 * Another unit kind: the header and the title change together («4η ΙΛΗ» → «4ος ΛΟΧΟΣ»), so the user sees them before
 * saving.
 */
export const withUnitKind = (form: UnitForm, kind: UnitKind): UnitForm => ({
  ...form,
  unitKind: kind,
  ...unitSettingsFor(form, kind),
  head: form.head.map((line) => unitText(line, kind)),
});

/** The `settings` patch and the history text of a save. An empty ΗΚΑΙ head is removed, not stored as blanks. */
export const unitSavePlan = (form: UnitForm, settings: Settings): { patch: Partial<Settings>; text: string } => {
  const head = form.head.map((line) => line.trim());
  const hkai = { ...(settings.hkai || {}) };
  if (head.some(Boolean)) hkai.head = head;
  else delete hkai.head;
  return {
    patch: {
      unitKind: form.unitKind,
      unit: form.unit,
      unitName: form.unitName,
      place: form.place,
      cadre: form.cadre,
      hkai,
    },
    text: 'μονάδα (' + UNIT_KINDS.find((k) => k.id === form.unitKind)!.label + '), στελέχη ' + HK(),
  };
};
