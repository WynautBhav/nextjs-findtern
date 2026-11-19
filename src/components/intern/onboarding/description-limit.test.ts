import assert from "node:assert/strict";
import { test } from "node:test";

import { descriptionLimitError, MAX_EXPERIENCE_DESCRIPTION } from "./description-limit.ts";

test("the limit is 4000 and the error names the field id and the limit", () => {
  assert.equal(MAX_EXPERIENCE_DESCRIPTION, 4000);
  const e = descriptionLimitError("abc");
  assert.equal(e?.field, "exp.abc.description");
  assert.match(e?.message ?? "", /4000/);
});

test("a row without an id gets no field-level error", () => {
  assert.equal(descriptionLimitError(undefined), null);
  assert.equal(descriptionLimitError(""), null);
});
