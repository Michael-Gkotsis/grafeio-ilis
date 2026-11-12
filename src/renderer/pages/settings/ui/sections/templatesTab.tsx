// «Ρυθμίσεις › Πρότυπα εφαρμογής»: the list of the Excel templates and how to replace one.
// Purpose: `templatesTab(boot)`, the last section of the menu (also the fallback body).
// Does NOT: read or check the templates (the main process does, `boot.templates`); it only shows them.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered. A plain function, not a component.
// Covering test: test/screens-settings-guide.test.ts.
import type { Boot } from '../../../../../shared/api';
import { Badge, Button } from '../../../../shared/ui';

/**
 * @param boot - the startup data; only `boot.templates` is read
 * @returns the section's markup: a card with a line per template, the note and the «Άνοιξε τον φάκελο» button
 */
export function templatesTab(boot: Boot) {
  return (
    <div>
      <div className="ui-card">
        <ul className="tpl">
          {boot.templates.map((t) => (
            <li key={t.file}>
              <div>
                <b>{t.name}</b> <Badge tone="ok">Excel</Badge>
                {t.custom && (
                  <>
                    {' '}
                    <Badge tone="info">δικό σου</Badge>
                  </>
                )}
                <small>{t.file}</small>
              </div>
              {t.ok ? <Badge tone="ok">✓ Έτοιμο</Badge> : <Badge tone="bad">Λείπει</Badge>}
            </li>
          ))}
        </ul>
      </div>
      <p className="note" style={{ marginTop: '10px' }}>
        Για να αλλάξεις ένα έντυπο (π.χ. νέα κεφαλίδα), άνοιξε τον φάκελο templates, βάλε εκεί το δικό σου αρχείο με το
        ίδιο όνομα. Τα κομμάτια βρίσκονται από τις λέξεις τους (τίτλοι, «Λ/Υ:», ονόματα βαθμών, επικεφαλίδες), όχι από
        τη θέση τους: κράτα τις λέξεις, τα κελιά μπορούν να μετακινηθούν. Η εφαρμογή γράφει μόνο τιμές και δεν αλλάζει
        τύπους, στυλ ή διάταξη σελίδας.
      </p>
      <Button variant="outline" onClick={() => window.api.openFolder('templates')}>
        Άνοιξε τον φάκελο templates
      </Button>
    </div>
  );
}
