// Pure rules of the «Τίτλος και λογότυπο» card: the draft, what is stored, and what a save writes.
// Purpose: `brandView` helpers for `useBrand` and their test.
// Does NOT: render anything, touch React, read files or call `run` (model/useBrand.ts does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/units.ts (Phase 6) so the rules are testable
//   without a render.
// Covering test: test/settings-brand-view.test.ts.
import { BRAND_RANKS } from '../../../../shared/brand';

/** The three editable values of the card. */
export interface BrandForm {
  rank: string;
  title: string;
  /** '' = the logo of the rank; a logo kind; or a `data:image/` URL. */
  logo: string;
}
/** What `Settings.brand` holds; every field is optional (empty = the default). */
export interface StoredBrand {
  rank?: string;
  title?: string;
  logo?: string;
}

const DATA_IMAGE = /^data:image\//;
/** The logo is a picture the user uploaded. */
export const isUploaded = (logo: string) => DATA_IMAGE.test(logo);
/** Spaces collapsed and trimmed (the title as saved). */
export const cleanTitle = (title: string) => title.trim().replace(/\s+/g, ' ');
/** The rank the card starts with: the stored one, else the first. */
export const rankOf = (b: StoredBrand) => b.rank || BRAND_RANKS[0].rank;
/** The picture to keep among the options at the start («Δικό σου»), or ''. */
export const uploadedOf = (b: StoredBrand) => (isUploaded(b.logo || '') ? b.logo! : '');
/** The form differs from what is stored. */
export const brandDirty = (f: BrandForm, b: StoredBrand) =>
  f.rank !== rankOf(b) || cleanTitle(f.title) !== (b.title || '') || f.logo !== (b.logo || '');
/** The `brand` setting a save writes: only what differs from the defaults. */
export const brandToSave = (f: BrandForm): StoredBrand => ({
  ...(f.rank !== BRAND_RANKS[0].rank ? { rank: f.rank } : {}),
  ...(f.title.trim() ? { title: cleanTitle(f.title) } : {}),
  ...(f.logo ? { logo: f.logo } : {}),
});
/** Something is stored, so «Όπως ήταν» is offered. */
export const hasBrand = (b: StoredBrand) => !!(b.rank || b.title || b.logo);
