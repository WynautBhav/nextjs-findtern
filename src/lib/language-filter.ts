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

/** One language wanted, and the least level ("" = any). */
export type LanguageWant = { language: string; level: LanguageLevelFilter };

/** How many languages one search can ask for. */
export const MAX_LANGUAGES = 5;

/**
 * The URL form: `lang=French:professional,German` (a level after the colon is optional). Unknown names and repeats
 * are dropped, at most MAX_LANGUAGES kept. An older link's single `lang=French&ll=native` still reads: `ll` is the
 * level of a lone language that has none of its own.
 */
export function parseLanguages(raw: string | undefined, legacyLevel?: string): LanguageWant[] {
  const out: LanguageWant[] = [];
  for (const part of (raw ?? "").split(",")) {
    const [name, lvl] = part.split(":");
    const language = parseLanguage(name);
    if (!language || out.some((w) => w.language === language)) continue;
    out.push({ language, level: parseLanguageLevel(lvl) });
    if (out.length >= MAX_LANGUAGES) break;
  }
  if (out.length === 1 && !out[0].level && legacyLevel) out[0] = { ...out[0], level: parseLanguageLevel(legacyLevel) };
  return out;
}

export function serializeLanguages(list: LanguageWant[]): string {
  return list.map((w) => (w.level ? `${w.language}:${w.level}` : w.language)).join(",");
}

/** "French", or "French · Professional" with a level. */
export function languageChipLabel(language: string, level: LanguageLevelFilter): string {
  const label = LANGUAGE_FILTER_LEVELS.find((l) => l.value === level)?.label;
  return label ? `${language} · ${label}` : language;
}
