import assert from "node:assert/strict";
import { test } from "node:test";

import { FILTER_LANGUAGES, LANGUAGE_FILTER_LEVELS, languageChipLabel, levelsAtLeast, parseLanguage, parseLanguageLevel } from "./language-filter.ts";
import { activeChips, queryOf, readFilters } from "./candidates-params.ts";

test("the three levels are named exactly Native, Professional and Basic", () => {
  assert.deepEqual(LANGUAGE_FILTER_LEVELS.map((l) => l.label), ["Native", "Professional", "Basic"]);
  assert.ok(FILTER_LANGUAGES.includes("French"));
  assert.ok(!FILTER_LANGUAGES.includes("Other"));
});

test("a level means at least that level", () => {
  assert.deepEqual(levelsAtLeast("native"), ["native"]);
  assert.deepEqual(levelsAtLeast("professional"), ["native", "professional"]);
  assert.deepEqual(levelsAtLeast("basic"), ["native", "professional", "basic", "conversational"]);
  assert.deepEqual(levelsAtLeast(""), levelsAtLeast("basic"));
});

test("URL values are checked against the lists", () => {
  assert.equal(parseLanguage("french"), "French");
  assert.equal(parseLanguage("Klingon"), "");
  assert.equal(parseLanguage("other"), "");
  assert.equal(parseLanguageLevel("Professional"), "professional");
  assert.equal(parseLanguageLevel("fluent"), "");
  assert.equal(languageChipLabel("French", "native"), "French · Native");
  assert.equal(languageChipLabel("French", ""), "French");
});

test("lang and ll round-trip through the URL; a level without a language is dropped; the chip removes both", () => {
  const f = readFilters({ lang: "french", ll: "professional" });
  assert.equal(f.lang, "French");
  assert.equal(f.langLevel, "professional");
  assert.match(queryOf(f), /lang=French&ll=professional/);
  assert.equal(readFilters({ ll: "native" }).langLevel, "");
  const chip = activeChips(f).find((c) => c.key === "lang");
  assert.equal(chip?.label, "Language: French · Professional");
  assert.doesNotMatch(chip?.href ?? "", /lang=|ll=/);
});
