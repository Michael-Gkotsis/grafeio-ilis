// Κανονικοποίηση ελληνικών για αναζήτηση: χωρίς τόνους, κεφαλαία, λατινικά που μοιάζουν → ελληνικά
const LOOKALIKE: Record<string, string> = { A: 'Α', B: 'Β', E: 'Ε', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', X: 'Χ', Y: 'Υ', Z: 'Ζ' };
const GR2LAT: Record<string, string> = { Α: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Ζ: 'Z', Η: 'I', Θ: 'TH', Ι: 'I', Κ: 'K', Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X', Ο: 'O', Π: 'P', Ρ: 'R', Σ: 'S', Τ: 'T', Υ: 'Y', Φ: 'F', Χ: 'CH', Ψ: 'PS', Ω: 'O' };

export const norm = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
export const normGreek = (s: unknown): string => norm(s).split('').map(c => LOOKALIKE[c] || c).join('');
export const translit = (s: unknown): string => norm(s).split('').map(c => GR2LAT[c] || c).join('');
export const collator = new Intl.Collator('el', { sensitivity: 'base' });
