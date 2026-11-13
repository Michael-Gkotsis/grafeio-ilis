// The overview of «Ρυθμίσεις»: one card per group with its one-line summary and the number of settings in it.
// Purpose: `SettingsHome` (the body of the `home` section) and `settingsTotal` (the «44 ρυθμίσεις» of the head).
// Does NOT: navigate by itself (the screen passes `open`), search, or draw a section.
// Owner layer: renderer/pages/settings. Why: U11c, a calm first page instead of «Μονάδα και έντυπα».
// Covering test: test/screens-settings-guide.test.ts (render), test/settings-screen-view.test.ts (summary, counts).
import { SET_GROUPS, groupSummary } from '../model/screenView';
import { groupCount } from '../model/settingsIndex';

/** @returns the text «N ρυθμίσεις» (or «1 ρύθμιση») */
export const countText = (n: number): string => (n === 1 ? '1 ρύθμιση' : `${n} ρυθμίσεις`);

/** @returns all settings of checklist §16, for the head of the overview */
export const settingsTotal = (): number => SET_GROUPS.reduce((sum, group) => sum + groupCount(group.key), 0);

/**
 * The 7 cards. A whole card is one button that opens the first section of its group.
 * @param open - asks about unsaved changes and opens a section key
 */
export function SettingsHome({ open }: { open: (section: string) => void }) {
  return (
    <ul className="settings__cards">
      {SET_GROUPS.map((group) => (
        <li key={group.key}>
          <button type="button" className="ui-card settings__card" onClick={() => open(group.sections[0] as string)}>
            <span className="settings__card-title">{group.label}</span>
            <span className="settings__card-text">{groupSummary(group.key)}</span>
            <span className="settings__card-link">{countText(groupCount(group.key))} ›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
