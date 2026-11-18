import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

import nextConfig from "../../next.config.ts";

/**
 * Employer–intern Messages was removed: no page, no thread API. Old links resolve to the dashboard with a
 * 308, and /api/threads is simply not a route any more (404). The tables (threads, messages) stay for the record.
 */
const app = (p: string) => existsSync(new URL(`../app/${p}`, import.meta.url));

describe("old Messages links redirect", () => {
  it("/employer/messages and /intern/messages are permanent redirects to their dashboards", async () => {
    const rules = (await nextConfig.redirects!()) as { source: string; destination: string; permanent?: boolean; statusCode?: number }[];
    const by = (source: string) => rules.find((r) => r.source === source);
    for (const [source, destination] of [
      ["/employer/messages/:path*", "/employer/dashboard"],
      ["/intern/messages/:path*", "/intern/dashboard"],
    ] as const) {
      const r = by(source);
      assert.ok(r, `${source} has a rule`);
      assert.equal(r.destination, destination);
      // Next sends permanent: true as 308 (statusCode would say 301/308 explicitly).
      assert.equal(r.permanent, true, `${source} is permanent (308)`);
      assert.equal(r.statusCode, undefined);
    }
  });

  it("the :path* pattern covers the list and a thread id (path-to-regexp semantics)", async () => {
    const rules = (await nextConfig.redirects!()) as { source: string }[];
    for (const source of ["/employer/messages/:path*", "/intern/messages/:path*"]) {
      assert.ok(rules.some((r) => r.source === source));
      const base = source.replace("/:path*", "");
      // :path* matches zero or more segments: /x/messages, /x/messages/t1 and /x/messages/t1/y.
      const re = new RegExp(`^${base}(?:/.*)?$`);
      for (const url of [base, `${base}/t1`, `${base}/t1/y`]) assert.match(url, re);
    }
  });

  it("no rule sends a Messages path anywhere but the dashboards", async () => {
    const rules = (await nextConfig.redirects!()) as { source: string; destination: string }[];
    for (const r of rules.filter((x) => /^\/(employer|intern)\/messages/.test(x.source))) {
      assert.match(r.destination, /^\/(employer|intern)\/dashboard$/);
    }
  });
});

describe("the Messages routes are gone", () => {
  it("no page under employer/messages or intern/messages", () => {
    assert.equal(app("employer/messages"), false);
    assert.equal(app("intern/messages"), false);
  });
  it("no /api/threads route (so it answers 404)", () => {
    assert.equal(app("api/threads"), false);
    assert.equal(app("api/threads/route.ts"), false);
  });
  it("admin /admin/messages (contact form inbox) is untouched", () => {
    assert.equal(app("admin/messages/page.tsx"), true);
  });
});
