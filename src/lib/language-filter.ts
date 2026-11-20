/**
 * The Candidates language filter: one language and, optionally, the least level wanted. Levels are the three an
 * intern picks on the profile (stored lower-case in `extra.languages[].level`): Native, Professional, Basic. A level
 * means "at least": Professional also lists Native speakers. Pure, so it runs under plain `node --test`.
 */
import { LANGUAGES } from "./onboarding.ts";

export type LanguageLevelFilter = "" | "native" | "professional" | "basic";

export const LANGUAGE_FILTER_LEVELS: { value: Exclude<LanguageLevelFilter, "">; label: string }[] = [
  { value: "native", label: "Native" },
  { value: "professional", label: "Professional" },
  { value: "basic", label: "Basic" },
];

/** The languages an intern can pick, without the free-text "Other". */
export const FILTER_LANGUAGES: string[] = LANGUAGES.filter((l) => l !== "Other");

/** A language from the URL, in its listed spelling; "" when it is not one of the list. */
export function parseLanguage(raw: string | undefined): string {
  const v = (raw ?? "").trim().toLowerCase();
  return FILTER_LANGUAGES.find((l) => l.toLowerCase() === v) ?? "";
}

export function parseLanguageLevel(raw: string | undefined): LanguageLevelFilter {
  const v = (raw ?? "").trim().toLowerCase();
  return LANGUAGE_FILTER_LEVELS.some((l) => l.value === v) ? (v as LanguageLevelFilter) : "";
}

/** The stored levels that meet `level` (lower-case). "" (any level) is every level. An early build stored "conversational": it reads as Basic. */
export function levelsAtLeast(level: LanguageLevelFilter): string[] {
  if (level === "native") return ["native"];
  if (level === "professional") return ["native", "professional"];
  return ["native", "professional", "basic", "conversational"];
}

/** "French", or "French · Professional" with a level. */
export function languageChipLabel(language: string, level: LanguageLevelFilter): string {
  const label = LANGUAGE_FILTER_LEVELS.find((l) => l.value === level)?.label;
  return label ? `${language} · ${label}` : language;
}
