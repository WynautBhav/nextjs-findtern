import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanPageUrl, filesInText, formatSupportMessage, parseContactMessage, safeFileHref } from "./contact-meta.ts";

test("legacy support report: header, body, video and attachments", () => {
  const text = [
    "kind: report",
    "userType: employer",
    "userId: emp-1",
    "pageUrl: https://findtern.in/employer/dashboard",
    "message:",
    "The cart is empty",
    "after I pay",
    "video: /uploads/support/v1.mp4",
    "attachments: /uploads/support/a.png, /uploads/support/b.jpg",
  ].join("\n");
  const m = parseContactMessage(text, "hiring");
  assert.equal(m.kind, "report");
  assert.equal(m.role, "employer");
  assert.equal(m.userId, "emp-1");
  assert.equal(m.pageUrl, "https://findtern.in/employer/dashboard");
  assert.equal(m.body, "The cart is empty\nafter I pay");
  assert.deepEqual(
    m.files.map((f) => [f.href, f.type]),
    [
      ["/uploads/support/v1.mp4", "video"],
      ["/uploads/support/a.png", "image"],
      ["/uploads/support/b.jpg", "image"],
    ],
  );
});

test("website contact form: no header, role from query type, body untouched", () => {
  const m = parseContactMessage("Hello: I want to hire 3 interns.\nThanks", "hiring");
  assert.equal(m.kind, null);
  assert.equal(m.role, "employer");
  assert.equal(m.body, "Hello: I want to hire 3 interns.\nThanks");
  assert.deepEqual(m.files, []);
  assert.equal(parseContactMessage("Hi", "intern").role, "intern");
  assert.equal(parseContactMessage("Hi", "general").role, null);
});

test("first new-app rows: 'Attachment:' line becomes a file", () => {
  const m = parseContactMessage("Broken button\n\nAttachment: /api/admin/support-file/abc_123.webp", "intern");
  assert.equal(m.body, "Broken button");
  assert.deepEqual(m.files, [{ href: "/api/admin/support-file/abc_123.webp", name: "abc_123.webp", type: "image" }]);
});

test("upload URLs in the body are linked (legacy extractUploadUrlsFromText)", () => {
  const m = parseContactMessage("See https://findtern.in/uploads/support/x.pdf, and uploads/support/y.png.", null);
  assert.deepEqual(
    m.files.map((f) => f.href),
    ["/uploads/support/x.pdf", "/uploads/support/y.png"],
  );
});

test("only the two access-checked routes are ever linked", () => {
  assert.equal(safeFileHref("javascript:alert(1)"), null);
  assert.equal(safeFileHref("https://evil.example/x.png"), null);
  assert.equal(safeFileHref("/uploads/../etc/passwd"), null);
  assert.equal(safeFileHref("/api/admin/support-file/a/b"), null);
  assert.equal(safeFileHref("/uploads/support/a.png)"), "/uploads/support/a.png");
  assert.deepEqual(filesInText("nothing here http://x.com/page"), []);
});

test("writer produces what the reader (and legacy) parse", () => {
  const text = formatSupportMessage({
    kind: "report",
    userType: "intern",
    userId: "u1",
    pageUrl: "https://findtern.in/intern/home",
    topic: "bug",
    message: "  It crashed  ",
    video: "/api/admin/support-file/v.mp4",
    attachments: ["/api/admin/support-file/a.webp", "/api/admin/support-file/b.png"],
  });
  assert.ok(text.startsWith("kind: report\nuserType: intern\nuserId: u1\npageUrl: https://findtern.in/intern/home\ntopic: bug\nmessage:\nIt crashed\n"));
  const m = parseContactMessage(text, "intern");
  assert.equal(m.kind, "report");
  assert.equal(m.topic, "bug");
  assert.equal(m.body, "It crashed");
  assert.equal(m.files.length, 3);
  assert.equal(m.files[0].type, "video");
});

test("page URL: http(s) or site path only", () => {
  assert.equal(cleanPageUrl("javascript:alert(1)"), null);
  assert.equal(cleanPageUrl("//evil.example"), null);
  assert.equal(cleanPageUrl("/intern/home?x=1"), "/intern/home?x=1");
  assert.equal(cleanPageUrl("https://findtern.in/a"), "https://findtern.in/a");
  assert.equal(cleanPageUrl(""), null);
});
