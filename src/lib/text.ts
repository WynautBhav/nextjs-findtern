/**
 * Strips emoji from displayed text.
 *
 * Applied at the render layer only - the stored value is never mutated, so the
 * CMS record and every URL are untouched. Several of the live blog titles and
 * one FAQ answer carry emoji, which reads as unpolished next to the typographic
 * treatment on the same page.
 *
 * Covers the Unicode ranges that actually occur in this content: the
 * Miscellaneous Symbols and Pictographs block (which includes the regional
 * indicator pairs that make flag glyphs), Dingbats, and the
 * Supplemental Symbols block. Variation selectors are dropped with their base
 * character so no orphan FE0F is left behind.
 */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{FE0E}]/gu;

export function stripEmoji(input: string): string {
  return input.replace(EMOJI, "");
}

/** Collapses the double and leading whitespace left behind by stripping. */
export function tidyText(input: string): string {
  return input.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim();
}
