// The «Ρυθμίσεις» screen: a menu of 7 groups on the left (and the overview), the sections of the open group as tabs.
// Purpose: `TemplatesScreen` (the name the routes and tests have always used), one section at a time, chosen by the
//   `tab` route parameter. Changing section with unsaved changes asks first (`requestLeave`).
// Does NOT: hold state (the open section is the route parameter) or draw a card (ui/sections/*).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered. The section body is a plain function.
// Covering test: test/screens-settings-guide.test.ts, test/ux-names.test.ts, test/status-fix.test.ts.
import type { ReactNode } from 'react';
import { HkRowsCard } from '../../../features/hk-rows';
import { UpdatesCard } from '../../../features/update';
import { requestLeave } from '../../../shared/lib/pending';
import { useNav, useStore } from '../../../shared/model';
import { PageHeader, Tabs } from '../../../shared/ui';
import { HOME_SECTION, SET_GROUPS, groupOf, sectionLabel, sectionOf } from '../model/screenView';
import { useSettingsSearch } from '../model/useSettingsSearch';
import { AppearanceCard } from './sections/AppearanceCard';
import { BackupsCard } from './sections/BackupsCard';
import { BrandCard } from './sections/BrandCard';
import { ClockCard } from './sections/ClockCard';
import { DutySection } from './sections/DutySection';
import { EssoCards } from './sections/EssoCards';
import { FoldersCard } from './sections/FoldersCard';
import { ImportCard } from './sections/ImportCard';
import { ListsCard } from './sections/ListsCard';
import { RoomsCard } from './sections/RoomsCard';
import { SettingsCard } from './sections/SettingsCard';
import { SigsCard } from './sections/SigsCard';
import { SourcesView } from './sections/SourcesView';
import { templatesTab } from './sections/templatesTab';
import { XlLookCard } from './sections/XlLookCard';
import { SettingsHome, countText, settingsTotal } from './SettingsHome';
import { SettingsResults, SettingsSearchBox } from './SettingsSearch';

/** The body of one section; an unknown key is already `home`, and the last branch is «Πρότυπα εφαρμογής». */
function sectionBody(tab: string, templates: ReactNode) {
  return tab === 'unit' ? (
    <div className="stack">
      <SettingsCard />
    </div>
  ) : tab === 'brand' ? (
    <BrandCard />
  ) : tab === 'sigs' ? (
    <SigsCard />
  ) : tab === 'hkrows' ? (
    <HkRowsCard />
  ) : tab === 'rooms' ? (
    <RoomsCard />
  ) : tab === 'duty' ? (
    <DutySection />
  ) : tab === 'lists' ? (
    <ListsCard />
  ) : tab === 'import' ? (
    <ImportCard />
  ) : tab === 'files' ? (
    <div className="stack">
      <SourcesView />
      <FoldersCard />
    </div>
  ) : tab === 'excel' ? (
    <XlLookCard />
  ) : tab === 'look' ? (
    <AppearanceCard />
  ) : tab === 'backup' ? (
    <BackupsCard />
  ) : tab === 'update' ? (
    <UpdatesCard />
  ) : tab === 'esso' ? (
    <EssoCards />
  ) : tab === 'clock' ? (
    <ClockCard />
  ) : (
    templates
  );
}

/** «Ρυθμίσεις»: 7 groups on the left, the sections of the open group as tabs, then the open section. */
export function TemplatesScreen() {
  const { boot } = useStore();
  const nav = useNav();
  const tab = sectionOf(nav.params.tab);
  const home = tab === HOME_SECTION;
  const group = groupOf(tab);
  // built on every render, used or not, exactly as before (the elements are only created, never mounted)
  const templates = templatesTab(boot);
  const search = useSettingsSearch(tab, nav.params.dsub);
  const open = (section: string) => requestLeave(() => {
      search.setQ('');
      nav.set({ tab: section });
    });
  return (
    <div>
      <PageHeader
        title="Ρυθμίσεις"
        sub="Η μονάδα, οι υπηρεσίες, οι λίστες, τα αρχεία Excel και τα έντυπα που συμπληρώνει η εφαρμογή."
      >
        <SettingsSearchBox s={search} />
        {home && !search.on && <span className="settings__total">{countText(settingsTotal())}</span>}
      </PageHeader>
      <div className="settings__grid">
        <nav className="settings__nav" aria-label="Ρυθμίσεις">
          <button
            type="button"
            className="settings__navitem"
            aria-current={home ? 'page' : undefined}
            onClick={() => (home ? search.setQ('') : open(HOME_SECTION))}
          >
            {sectionLabel(HOME_SECTION)}
          </button>
          {SET_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              className="settings__navitem"
              aria-current={!home && group.key === g.key ? 'page' : undefined}
              onClick={() => (home || group.key !== g.key ? open(g.sections[0] as string) : search.setQ(''))}
            >
              {g.label}
            </button>
          ))}
        </nav>
        <div className="settings__body" ref={search.bodyRef}>
          {search.on ? (
            <SettingsResults s={search} />
          ) : (
            <>
              {!home && group.sections.length > 1 && (
                <div className="settings__tabs">
                  <Tabs
                    value={tab}
                    onChange={(section) => tab !== section && open(section)}
                    items={group.sections.map((value) => ({ value, label: sectionLabel(value) }))}
                  />
                </div>
              )}
              {home ? <SettingsHome open={open} /> : sectionBody(tab, templates)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
