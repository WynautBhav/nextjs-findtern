import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_REPORT_BYTES, summariseCspReport } from "./csp-report.ts";

test("a report-uri report becomes one line with the directive, what was blocked and where", () => {
  const raw = JSON.stringify({
    "csp-report": {
      "document-uri": "https://findtern.in/contact?token=SECRET#x",
      "effective-directive": "frame-src",
      "blocked-uri": "https://www.google.com/maps/embed?pb=123",
      disposition: "report",
    },
  });
  assert.deepEqual(summariseCspReport(raw), ["[csp] frame-src would block https://www.google.com/maps/embed on https://findtern.in/contact (report)"]);
});

test("a Reporting API batch yields a line per csp-violation and ignores other report types", () => {
  const raw = JSON.stringify([
    { type: "csp-violation", body: { documentURL: "https://findtern.in/", effectiveDirective: "script-src", blockedURL: "inline", disposition: "enforce" } },
    { type: "deprecation", body: { id: "x" } },
    { type: "csp-violation", body: { documentURL: "https://findtern.in/pricing", effectiveDirective: "img-src", blockedURL: "https://cdn.example/a.png?sig=abc" } },
  ]);
  assert.deepEqual(summariseCspReport(raw), [
    "[csp] script-src would block inline on https://findtern.in/ (enforce)",
    "[csp] img-src would block https://cdn.example/a.png on https://findtern.in/pricing (report)",
  ]);
});

test("query strings never reach the log, and a crafted value cannot forge a log line", () => {
  const crafted = "x\n[csp] fake line\r" + String.fromCharCode(0x2028) + String.fromCharCode(0x2029);
  const raw = JSON.stringify({ "csp-report": { "document-uri": "https://findtern.in/a?password=hunter2", "effective-directive": crafted, "blocked-uri": "y".repeat(5000) } });
  const [out, ...rest] = summariseCspReport(raw);
  assert.equal(rest.length, 0);
  assert.doesNotMatch(out, /hunter2|password/);
  assert.doesNotMatch(out, new RegExp("[\n\r" + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + "]"));
  assert.ok(out.length < 600, "fields are length-capped");
});

test("anything that is not a report, or is too big, produces nothing", () => {
  for (const raw of ["", "not json", "123", "null", "[]", "{}", '{"csp-report": 5}', '[{"type":"csp-violation"}]']) assert.deepEqual(summariseCspReport(raw), [], raw);
  assert.deepEqual(summariseCspReport(" ".repeat(MAX_REPORT_BYTES + 1)), []);
});

test("at most ten lines come from one request", () => {
  const raw = JSON.stringify(Array.from({ length: 50 }, () => ({ type: "csp-violation", body: { documentURL: "https://findtern.in/", effectiveDirective: "img-src", blockedURL: "https://a.example/x" } })));
  assert.equal(summariseCspReport(raw).length, 10);
});
