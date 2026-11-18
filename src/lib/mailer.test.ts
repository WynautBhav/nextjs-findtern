import assert from "node:assert/strict";
import { test } from "node:test";

import { pooledTransport } from "./mailer.ts";

const smtp = { host: "smtp.example.test", port: 587, secure: false, auth: { user: "u", pass: "p" } };

test("pooledTransport reuses one pooled transporter for the same SMTP settings", () => {
  const a = pooledTransport(smtp);
  assert.equal(pooledTransport({ ...smtp, auth: { ...smtp.auth } }), a);
  assert.equal((a.options as { pool?: boolean }).pool, true);
  assert.equal((a.options as { maxConnections?: number }).maxConnections, 5);
});

test("pooledTransport builds a new transporter when a setting changes", () => {
  const a = pooledTransport(smtp);
  const b = pooledTransport({ ...smtp, host: "smtp2.example.test" });
  assert.notEqual(a, b);
  b.close();
});
