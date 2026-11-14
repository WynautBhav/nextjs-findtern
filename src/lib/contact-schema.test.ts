import assert from "node:assert/strict";
import { test } from "node:test";

import { contactBodySchema } from "./contact-schema.ts";

const base = {
  firstName: "Asha",
  email: "asha@acme.in",
  countryCode: "+91",
  phone: "9812345678",
  message: "Hello there",
};

const phoneIssue = (input: unknown) => {
  const r = contactBodySchema.safeParse(input);
  return r.success ? null : r.error.issues.find((i) => i.path[0] === "phone");
};

test("contact schema accepts a valid phone and keeps digits only", () => {
  const r = contactBodySchema.safeParse({ ...base, phone: "98123 45678" });
  assert.ok(r.success);
  assert.equal(r.data.phone, "9812345678");
});

test("contact schema rejects a missing, empty or non-digit phone as required", () => {
  const noPhone: Record<string, string> = { ...base };
  delete noPhone.phone;
  for (const input of [noPhone, { ...base, phone: "" }, { ...base, phone: "  -- " }]) {
    assert.equal(phoneIssue(input)?.message, "Phone number is required");
  }
});

test("contact schema rejects a malformed phone using the shared rules", () => {
  assert.match(phoneIssue({ ...base, phone: "12345" })?.message ?? "", /10 digits/);
  assert.ok(phoneIssue({ ...base, phone: "5876543210" }));
});
