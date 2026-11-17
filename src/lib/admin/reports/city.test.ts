import assert from "node:assert/strict";
import { test } from "node:test";

import { cityMatches, cityPatterns, mergeCityRows, normalizeCity } from "./city.ts";

test("case, spacing and punctuation fold to one key and a title-cased label", () => {
  for (const raw of ["Jaipur", "jaipur", "  JAIPUR ", "jai pur".replace(" ", ""), "Jaipur.", "jaipur,", "Jaipur   "]) {
    assert.deepEqual(normalizeCity(raw), { key: "jaipur", label: "Jaipur" }, raw);
  }
});

test("known spelling variants map to one city", () => {
  for (const raw of ["Jaypur", "jaipure", "Jaipur Rajasthan", "Jaipur, Rajasthan", "jaipur (raj)", "Jaipur - 302001"]) assert.equal(normalizeCity(raw)?.key, "jaipur", raw);
  for (const raw of ["Jodhpur", "jodpur", "JODHPURR", "Jodhpur, Rajasthan"]) assert.equal(normalizeCity(raw)?.key, "jodhpur", raw);
  for (const raw of ["Bangalore", "bengaluru", "Bengalooru", "Bangalore Urban", "BLR"]) assert.equal(normalizeCity(raw)?.key, "bengaluru", raw);
  assert.equal(normalizeCity("Gurgaon")?.label, "Gurugram");
  assert.equal(normalizeCity("Bombay")?.label, "Mumbai");
  assert.equal(normalizeCity("Poona")?.label, "Pune");
  assert.equal(normalizeCity("Calcutta")?.label, "Kolkata");
  assert.equal(normalizeCity("Madras")?.label, "Chennai");
  assert.equal(normalizeCity("New Delhi")?.label, "Delhi");
  assert.equal(normalizeCity("Delhi NCR")?.label, "Delhi");
});

test("Jaipur and Jodhpur stay different cities", () => {
  assert.notEqual(normalizeCity("Jaipur")?.key, normalizeCity("Jodhpur")?.key);
});

test("unknown cities are cleaned, not dropped", () => {
  assert.deepEqual(normalizeCity("  sri   ganganagar "), { key: "sri ganganagar", label: "Sri Ganganagar" });
  assert.deepEqual(normalizeCity("S.A.S. Nagar"), { key: "s a s nagar", label: "S A S Nagar" });
});

test("a trailing state or PIN code is stripped from an unknown city too", () => {
  assert.equal(normalizeCity("Kota, Rajasthan")?.key, "kota");
  assert.equal(normalizeCity("Udaipur 313001")?.key, "udaipur");
});

test("empty and junk give null", () => {
  for (const raw of [null, undefined, "", "   ", "-", "n/a", "NA", "none", "null", "123456", "..."]) assert.equal(normalizeCity(raw as string), null, String(raw));
});

test("mergeCityRows adds variants together, keeps the biggest spelling's label, sorts by count then name", () => {
  const out = mergeCityRows([
    { city: "jaipur", count: 5 },
    { city: "jaypur", count: 2 },
    { city: "jodhpur", count: 4 },
    { city: "Jodpur", count: 1 },
    { city: "pune", count: 5 },
    { city: "", count: 9 },
  ]);
  assert.deepEqual(out, [
    { key: "jaipur", label: "Jaipur", count: 7 },
    { key: "pune", label: "Pune", count: 5 },
    { key: "jodhpur", label: "Jodhpur", count: 5 },
  ].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).map((r) => r));
});

test("mergeCityRows on nothing is empty", () => {
  assert.deepEqual(mergeCityRows([]), []);
});

test("cityMatches searches the label and aliases, ignoring case and spacing", () => {
  assert.equal(cityMatches("jai", "jaipur"), true);
  assert.equal(cityMatches(" JOD ", "jodhpur"), true);
  assert.equal(cityMatches("bangalore", "bengaluru"), true);
  assert.equal(cityMatches("pun", "jaipur"), false);
  assert.equal(cityMatches("", "jaipur"), true);
});

test("mergeCityRows carries the state of the biggest spelling", () => {
  const out = mergeCityRows([
    { city: "jaipur", count: 5, state: "Rajasthan" },
    { city: "jaypur", count: 2, state: "Raj" },
  ]);
  assert.deepEqual(out, [{ key: "jaipur", label: "Jaipur", count: 7, state: "Rajasthan" }]);
});

test("cityPatterns cover the key, its aliases and a trailing state or PIN, and escape wildcards", () => {
  const p = cityPatterns("jaipur");
  for (const x of ["jaipur", "jaypur", "jaipur,%", "jaipur %", "jaipur-%", "jaipur.%", "jaipur(%"]) assert.ok(p.includes(x), x);
  assert.ok(!p.some((x) => x.startsWith("jodhpur")));
  assert.deepEqual(cityPatterns("a_b").slice(0, 1), ["a\\_b"]);
});
