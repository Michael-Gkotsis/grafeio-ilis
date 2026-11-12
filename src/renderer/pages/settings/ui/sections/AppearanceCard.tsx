// «Ρυθμίσεις › Εμφάνιση» card (second half): theme, density, menu, Excel preview zoom and «βαθμός πριν το όνομα».
// Purpose: `AppearanceCard`, the settings of THIS PC (not of the database): they apply at once, no restart.
// Does NOT: save to the database; `usePrefs` keeps them in localStorage (`grafeio.prefs`).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered. The row is a plain function, not a component.
// Covering test: test/screens-settings-guide.test.ts, test/prefs.test.ts.
import { usePrefs, type Prefs } from '../../../../shared/lib/prefs';
import { Card, Segmented } from '../../../../shared/ui';

/** One preference row: label, help and the segmented choice. */
function prefRow<K extends 'theme' | 'density' | 'nav' | 'xlZoom'>(
  m: ReturnType<typeof usePrefs>,
  k: K,
  label: string,
  help: string,
  items: { value: Prefs[K]; label: string }[],
) {
  return (
    <div className="pref" key={k}>
      <div>
        <b>{label}</b>
        <small>{help}</small>
      </div>
      <Segmented small={true} value={m.prefs[k]} onChange={(v: Prefs[K]) => m.set(k, v)} items={items} />
    </div>
  );
}

/** «Εμφάνιση (αυτό το PC)». */
export function AppearanceCard() {
  const m = usePrefs();
  const { prefs, set } = m;
  return (
    <Card title="Εμφάνιση (αυτό το PC)">
      {prefRow(m, 'theme', 'Θέμα', 'Στα Windows 7 το «Όπως τα Windows» είναι φωτεινό.', [
        { value: 'light', label: 'Φωτεινό' },
        { value: 'dark', label: 'Σκοτεινό' },
        { value: 'auto', label: 'Όπως τα Windows' },
      ])}
      {prefRow(m, 'density', 'Πυκνότητα', 'Η συμπαγής χωρά περισσότερες γραμμές σε οθόνη 1024×768.', [
        { value: 'normal', label: 'Κανονική' },
        { value: 'compact', label: 'Συμπαγής' },
      ])}
      {prefRow(m, 'nav', 'Μενού', 'Αυτόματο: στενό μενού σε οθόνες κάτω από 1280px. Αλλάζει και με Ctrl+B.', [
        { value: 'full', label: 'Πλήρες' },
        { value: 'rail', label: 'Στενό' },
        { value: 'auto', label: 'Αυτόματο' },
      ])}
      {prefRow(m, 'xlZoom', 'Προεπισκόπηση Excel', 'Το «Χωρά» μικραίνει το έντυπο για να φαίνεται όλο το πλάτος.', [
        { value: 'fit', label: 'Χωρά' },
        { value: '100', label: '100%' },
      ])}
      <div className="pref">
        <div>
          <b>Βαθμός και όπλο πριν το όνομα</b>
          <small>π.χ. ΣΤΡ (ΠΖ) ΠΑΠΑΔΟΠΟΥΛΟΣ Γ. στις οθόνες· τα Excel δεν αλλάζουν</small>
        </div>
        <Segmented
          small={true}
          value={prefs.rankNames ? 'on' : 'off'}
          onChange={(v: string) => set('rankNames', v === 'on')}
          items={[
            { value: 'on', label: 'Ναι' },
            { value: 'off', label: 'Όχι' },
          ]}
        />
      </div>
    </Card>
  );
}
