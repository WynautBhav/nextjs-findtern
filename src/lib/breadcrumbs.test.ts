import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { breadcrumbsFor } from "./breadcrumbs.ts";

describe("breadcrumbsFor", () => {
  const labels = { "/admin/interns": "Candidate Directory", "/admin/cms": "Website Content" };

  it("uses the sidebar label when one exists", () => {
    assert.deepEqual(breadcrumbsFor("/admin/cms", labels), [{ href: "/admin/cms", label: "Website Content", link: true }]);
  });

  it("collapses ids to one word", () => {
    assert.deepEqual(breadcrumbsFor("/admin/interns/763872fb-0512-49e9-99b9-d4c61b8f4719", labels), [
      { href: "/admin/interns", label: "Candidate Directory", link: true },
      { href: "/admin/interns/763872fb-0512-49e9-99b9-d4c61b8f4719", label: "Details", link: false },
    ]);
  });

  it("title-cases unknown segments", () => {
    assert.deepEqual(breadcrumbsFor("/employer/send-proposal", {}), [
      { href: "/employer/send-proposal", label: "Send proposal", link: false },
    ]);
  });

  it("is empty on the role root", () => {
    assert.deepEqual(breadcrumbsFor("/employer", {}), []);
  });

  it("maps a detail page's parent segment to its list and drops the id", () => {
    const parents = { "/employer/proposal": { label: "Proposals", href: "/employer/proposals" } };
    assert.deepEqual(breadcrumbsFor("/employer/proposal/763872fb-0512-49e9-99b9-d4c61b8f4719", {}, "", parents), [
      { href: "/employer/proposals", label: "Proposals", link: true },
    ]);
  });
});
