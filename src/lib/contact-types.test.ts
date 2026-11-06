import assert from "node:assert/strict";
import { test } from "node:test";

import { parseQueryType } from "./contact-types.ts";

test("parseQueryType reads known types and defaults to general", () => {
  assert.equal(parseQueryType("college"), "college");
  assert.equal(parseQueryType(" College "), "college");
  assert.equal(parseQueryType(["hiring", "intern"]), "hiring");
  assert.equal(parseQueryType("admin"), "general");
  assert.equal(parseQueryType(undefined), "general");
  assert.equal(parseQueryType(""), "general");
});
