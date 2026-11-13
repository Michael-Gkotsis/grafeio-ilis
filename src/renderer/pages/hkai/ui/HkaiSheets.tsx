// The preview part of the «ΗΚΑΙ» page: front/back switch, leaves switch, the Excel-like sheet and the template note.
// Purpose: `hkaiSheets`, a plain function the screen calls (not a component: render counts stay as they were).
// Does NOT: hold state (the screen passes `useHkai()` in) or build the sheets (shared/lib/sheets/hkai.ts does).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts.
import { ExcelSheet } from '../../../widgets/excel-preview';
import { TemplateNote } from '../../../widgets/export';
import { Tabs } from '../../../shared/ui';
import type { useHkai } from '../model/useHkai';
import { HkLeavesToggle } from './HkLeavesToggle';

/** The sheets column (the «Μπροστά» and «Πίσω» tabs on a phone); `s` is the result of `useHkai()`. */
export function hkaiSheets(s: ReturnType<typeof useHkai>) {
  const { mobile, side, setSide, date, back, front, fn } = s;
  return (
    <div className="hkai__sheets">
      <div className="hkai__bar">
        {!mobile && (
          <Tabs
            value={side === 'sum' ? 'front' : side}
            onChange={setSide}
            items={[
              { value: 'front', label: 'Μπροστά' },
              { value: 'back', label: 'Πίσω' },
            ]}
          />
        )}
        <HkLeavesToggle date={date} onToggle={() => setSide('back')} />
      </div>
      {side === 'back' ? (
        <ExcelSheet model={back} fileName={fn} sheetName="πισω" meta="A4 οριζόντιο" />
      ) : (
        <ExcelSheet
          model={front}
          fileName={fn}
          sheetName="μπροστινο"
          meta="A4 οριζόντιο · 1 σελίδα"
          footer="Γράφονται μόνο τα κελιά εισόδου· τα αθροίσματα μένουν τύποι του εντύπου."
        />
      )}
      <TemplateNote ids={['hkai']} />
    </div>
  );
}
