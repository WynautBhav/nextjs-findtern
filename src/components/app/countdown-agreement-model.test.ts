import assert from "node:assert/strict";
import { test } from "node:test";

import { agreementWait, confirmButtonLabel } from "./countdown-agreement-model.ts";

test("every second of the wait says how long is left, ticked or not", () => {
  for (let left = 10; left >= 1; left--) {
    assert.match(agreementWait(left, false, false) ?? "", new RegExp(`in ${left}s`));
    assert.match(agreementWait(left, true, false) ?? "", new RegExp(`in ${left}s`));
    assert.equal(confirmButtonLabel("Agree and send", left), `Agree and send (${left}s)`);
  }
});

test("the box still unticked after the seconds run out: the line says why the button is locked", () => {
  assert.equal(agreementWait(0, false, false), "Tick the box above to continue.");
});

test("ready or sending: no wait line, plain label", () => {
  assert.equal(agreementWait(0, true, false), null);
  assert.equal(agreementWait(5, true, true), null);
  assert.equal(confirmButtonLabel("Agree and send", 0), "Agree and send");
});

test("a gate with no tick box (requireAgreement false) counts as agreed", () => {
  assert.equal(agreementWait(0, true, false), null);
  assert.match(agreementWait(3, true, false) ?? "", /^You can continue in 3s\.$/);
});
