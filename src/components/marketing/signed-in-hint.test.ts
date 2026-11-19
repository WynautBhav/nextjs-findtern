import assert from "node:assert/strict";
import { test } from "node:test";

import { hasSignInHint } from "./signed-in-hint.ts";

test("a ft_csrf cookie is the hint; anything else is not", () => {
  assert.equal(hasSignInHint("ft_csrf=abc123"), true);
  assert.equal(hasSignInHint("a=1; ft_csrf=abc123; b=2"), true);
  assert.equal(hasSignInHint(""), false);
  assert.equal(hasSignInHint(null), false);
  assert.equal(hasSignInHint("ft_csrf="), false);
  assert.equal(hasSignInHint("x_ft_csrf=abc"), false);
  assert.equal(hasSignInHint("ft_sid=abc"), false);
});
