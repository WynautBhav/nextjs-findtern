import assert from "node:assert/strict";
import { test } from "node:test";

import { FILTER_LANGUAGES, LANGUAGE_FILTER_LEVELS, MAX_LANGUAGES, languageChipLabel, levelsAtLeast, parseLanguage, parseLanguageLevel, parseLanguages, serializeLanguages } from "./language-filter.ts";
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

test("several languages, each with its own level, round-trip through the URL; each chip drops only its own", () => {
  const f = readFilters({ lang: "french:professional,German,klingon,French" });
  assert.deepEqual(f.langs, [
    { language: "French", level: "professional" },
    { language: "German", level: "" },
  ]);
  assert.match(queryOf(f), /lang=French%3Aprofessional%2CGerman/);
  const chips = activeChips(f).filter((c) => c.key.startsWith("lang:"));
  assert.deepEqual(chips.map((c) => c.label), ["French · Professional", "German"]);
  assert.match(chips[0].href, /lang=German(&|$)/);
});

test("an older single-language link with ll still reads; at most five languages", () => {
  assert.deepEqual(readFilters({ lang: "english", ll: "native" }).langs, [{ language: "English", level: "native" }]);
  assert.deepEqual(readFilters({ ll: "native" }).langs, []);
  assert.equal(parseLanguages("Hindi,English,French,German,Spanish,Tamil").length, MAX_LANGUAGES);
  assert.equal(serializeLanguages([{ language: "Hindi", level: "native" }, { language: "Tamil", level: "" }]), "Hindi:native,Tamil");
});
