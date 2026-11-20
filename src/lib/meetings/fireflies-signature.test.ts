import assert from "node:assert/strict";
import test from "node:test";

import { firefliesSignature, verifyFirefliesSignature } from "./fireflies-signature.ts";

// Known vector, computed independently: `printf '%s' '{"event":"meeting.transcribed","meeting_id":"ASxwZxCstx"}' | openssl dgst -sha256 -hmac 'whsec_test_123'`
const BODY = '{"event":"meeting.transcribed","meeting_id":"ASxwZxCstx"}';
const SECRET = "whsec_test_123";
const VECTOR = "sha256=b2545ef52ae5f2ad657296d574f6c53c25dcbc835b70aef598879e1887296920";

test("signature matches the documented format sha256=<hex hmac of the raw body>", () => {
  const got = firefliesSignature(BODY, SECRET);
  assert.match(got, /^sha256=[0-9a-f]{64}$/);
  assert.equal(got, VECTOR);
});

test("verify: accepts the right signature, rejects everything else", () => {
  const good = firefliesSignature(BODY, SECRET);
  assert.equal(verifyFirefliesSignature(BODY, good, SECRET), true);
  assert.equal(verifyFirefliesSignature(BODY + " ", good, SECRET), false, "body changed");
  assert.equal(verifyFirefliesSignature(BODY, good, "other"), false, "wrong secret");
  assert.equal(verifyFirefliesSignature(BODY, good.replace("sha256=", ""), SECRET), false, "no prefix");
  assert.equal(verifyFirefliesSignature(BODY, good.slice(0, -2) + "00", SECRET), false, "last byte");
  assert.equal(verifyFirefliesSignature(BODY, good.slice(0, -1), SECRET), false, "short");
  assert.equal(verifyFirefliesSignature(BODY, null, SECRET), false, "missing header");
  assert.equal(verifyFirefliesSignature(BODY, "", SECRET), false);
  assert.equal(verifyFirefliesSignature(BODY, good, undefined), false, "no secret configured = closed");
  assert.equal(verifyFirefliesSignature(BODY, good, ""), false);
});
