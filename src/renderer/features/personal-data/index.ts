// Public API of features/personal-data: the «Προσωπικά» tab (IBAN, ΑΜΚΑ, ΑΦΜ, …) of a soldier's or cadre member's card.
// Import from here only (the architecture test rejects deep imports from other layers).
export { PersonalTab, type PersonalTabProps } from './ui/PersonalTab';
export type { PersonalWho } from './model/usePersonal';
