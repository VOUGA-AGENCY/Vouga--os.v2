// Racius blocks automated access, so lookups open in the person's own browser. Company pages live at
// racius.com/<slug>/ (e.g. "Acrs - Metal Solutions, Lda" → acrs-metal-solutions-lda); a few slugs differ,
// hence the search fallback.
export const raciusSlug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
export const raciusPage = (name: string) =>
  `https://www.racius.com/${raciusSlug(name)}/`;
export const raciusSearch = (name: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`site:racius.com "${name}"`)}`;
