// Κανονικοποίηση ελληνικών για αναζήτηση: χωρίς τόνους, κεφαλαία, λατινικά που μοιάζουν → ελληνικά
const LOOKALIKE: Record<string, string> = { A: 'Α', B: 'Β', E: 'Ε', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', X: 'Χ', Y: 'Υ', Z: 'Ζ' };
const GR2LAT: Record<string, string> = { Α: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Ζ: 'Z', Η: 'I', Θ: 'TH', Ι: 'I', Κ: 'K', Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X', Ο: 'O', Π: 'P', Ρ: 'R', Σ: 'S', Τ: 'T', Υ: 'Y', Φ: 'F', Χ: 'CH', Ψ: 'PS', Ω: 'O' };

export const norm = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
export const normGreek = (s: unknown): string => norm(s).split('').map(c => LOOKALIKE[c] || c).join('');
export const translit = (s: unknown): string => norm(s).split('').map(c => GR2LAT[c] || c).join('');
export const collator = new Intl.Collator('el', { sensitivity: 'base' });
// Κεφαλαία χωρίς τόνους, όπως γράφονται στα έγγραφα (τα διαλυτικά μένουν): «Στέρηση εξόδου» → «ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ»
export const upper = (s: unknown): string => String(s ?? '').toUpperCase().normalize('NFD').replace(/́/g, '').normalize('NFC');
// Κεφαλαία για ό,τι γράφει η εφαρμογή σε Excel/Word (Michael, 26/11): ο τακτικός αριθμός κρατά μικρή την κατάληξη, «1ο», «2η», «3ος», όχι «1Ο».
// Μόνο αριθμός κολλητά με κατάληξη, χωρίς γράμμα ή ψηφίο γύρω του (έτσι τα «Θ1α», «2Η ΕΠΧΙΑ» κ.ά. κωδικοί δεν πειράζονται εκτός από την κατάληξη).
const ORD_RE = /(?<![\p{L}\d])(\d+)(ΟΣ|ΟΥ|ΗΣ|ΟΙ|ΕΣ|ΩΝ|Ο|Η)(?![\p{L}\d])/gu;
export const upperOrd = (s: unknown): string => upper(s).replace(ORD_RE, (_m, n: string, suf: string) => n + suf.toLowerCase());
