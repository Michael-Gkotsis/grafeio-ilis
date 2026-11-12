// The «Ρυθμίσεις» screen: a menu of sections on the left and the open section on the right.
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
import { PageHeader } from '../../../shared/ui';
import { SET_SECTIONS, sectionOf } from '../model/screenView';
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

/** The body of one section; an unknown key is already `unit`, and the last branch is «Πρότυπα εφαρμογής». */
function sectionBody(tab: string, templates: ReactNode) {
  return tab === 'unit' ? (
    <div className="stack">
      <SettingsCard />
      <SigsCard />
      <HkRowsCard />
    </div>
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
    <div className="stack">
      <BrandCard />
      <AppearanceCard />
    </div>
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

/** «Ρυθμίσεις». */
export function TemplatesScreen() {
  const { boot } = useStore();
  const nav = useNav();
  const tab = sectionOf(nav.params.tab);
  // built on every render, used or not, exactly as before (the elements are only created, never mounted)
  const templates = templatesTab(boot);
  return (
    <div>
      <PageHeader
        title="Ρυθμίσεις"
        sub="Η μονάδα, οι υπηρεσίες, οι λίστες, τα αρχεία Excel και τα έντυπα που συμπληρώνει η εφαρμογή."
      />
      <div className="setgrid">
        <nav className="setnav" aria-label="Ρυθμίσεις">
          {SET_SECTIONS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-current={tab === k ? 'page' : undefined}
              onClick={() => tab !== k && requestLeave(() => nav.set({ tab: k }))}
            >
              {l}
            </button>
          ))}
        </nav>
        <div className="setbody">{sectionBody(tab, templates)}</div>
      </div>
    </div>
  );
}
