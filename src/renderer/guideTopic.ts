// Οδηγός χρήσης: ποιο θέμα ταιριάζει στην οθόνη που βλέπεις (Shift+F1, κουμπί «?» στην πάνω μπάρα).
// Χωριστά από τον οδηγό, για να μη φορτώνεται το κείμενό του στο άνοιγμα της εφαρμογής.
const VIEW_TOPIC: Record<string, string> = { home: 'today', people: 'people', cadre: 'cadre', guard: 'guard', outs: 'outs', records: 'medical', strength: 'strength', hkai: 'hkai', weapons: 'weapons', reports: 'reports', history: 'history' };
const TAB_TOPIC: Record<string, string> = { unit: 'set-unit', settings: 'set-unit', rooms: 'set-rooms', duty: 'set-duty', lists: 'set-lists', import: 'set-files', files: 'set-files', templates: 'set-forms', excel: 'set-forms', look: 'set-look', esso: 'set-esso', backup: 'set-backup' };
export function topicFor(view: string, params: Record<string, any>): string {
  if (view === 'templates') return TAB_TOPIC[params.tab] || 'set-unit';
  return VIEW_TOPIC[view] || 'about';
}
