// «Από template: …» under a form, with a link to Templates.
// Purpose: `TemplateNote` names the template file(s) a form is made from, and marks the user's own.
// Does NOT: choose the template (main does) or edit it.
// Owner layer: renderer/widgets/export. Why: moved verbatim from renderer/common.ts (Phase 5.3b).
// Covering test: test/reports-flow.test.ts.
import { phaseBase } from '../../../../shared/domain';
import type { Boot } from '../../../../shared/api';
import { useNav, useStore } from '../../../shared/model';
import { Button } from '../../../shared/ui';

/** Props of `TemplateNote`. `ids` are template ids as in `boot.templates`. */
export interface TemplateNoteProps {
  ids: string[];
}

/** The note. ΦΡΟΥΡΑ shows the file that matches the unit's phase (spen or not). */
export function TemplateNote({ ids }: TemplateNoteProps) {
  const { boot, state } = useStore();
  const nav = useNav();
  const spen = phaseBase(state.settings) === 'spen';
  const ts = ids
    .map((id) =>
      boot.templates.find((t) => t.id === id && (id !== 'froura' || (t.file === 'froura-spen.xlsx') === spen)),
    )
    .filter(Boolean) as Boot['templates'];
  return (
    <span className="tplnote">
      Από template:{' '}
      {ts.map((t, i) => (
        <span key={t.file}>
          {i ? ', ' : ''}
          <b>{t.name}</b>
          {t.custom ? ' (δικό σου)' : ''}
        </span>
      ))}{' '}
      ·{' '}
      <Button variant="link" onClick={() => nav.go('templates', { tab: 'templates' })}>
        Templates
      </Button>
    </span>
  );
}
