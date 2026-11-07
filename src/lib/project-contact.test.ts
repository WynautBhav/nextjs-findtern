import { test } from "node:test";
import assert from "node:assert/strict";

import { projectContactError } from "./project-contact.ts";

test("a project name with contact details is refused", () => {
  for (const name of ["Call 98765 43210", "Design intern - hr@acme.in", "wa.me/919876543210", "Growth (insta: acme_jobs)", "Apply at acme.com"]) {
    assert.match(projectContactError(name) ?? "", /contact details/i, name);
  }
});

test("ordinary role names pass", () => {
  for (const name of ["Frontend engineering", "Python 3.11 data pipelines", "UI/UX design for 3 months", "Growth marketing", "Node.js backend"]) {
    assert.equal(projectContactError(name), null, name);
  }
});
