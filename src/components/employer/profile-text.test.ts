import { test } from "node:test";
import assert from "node:assert/strict";

import { HIDDEN_UNTIL_HIRE } from "../../lib/contact-scrub.ts";
import { profileText } from "./profile-text.ts";

test("before hire, contact details typed into profile free text are hidden", () => {
  const out = profileText("Built the app. Call me on 98765 43210 or mail ravi.k@gmail.com", false);
  assert.ok(!out.includes("98765"));
  assert.ok(!out.includes("ravi.k@gmail.com"));
  assert.ok(out.includes(HIDDEN_UNTIL_HIRE));
  assert.ok(out.startsWith("Built the app."));
});

test("ordinary text is untouched before hire", () => {
  assert.equal(profileText("Python 3.11 for 3 months", false), "Python 3.11 for 3 months");
});

test("after hire the text shows as written", () => {
  const raw = "WhatsApp 98765 43210";
  assert.equal(profileText(raw, true), raw);
});
