import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectNameIssue as issue } from "./project-name.ts";

describe("projectNameIssue", () => {
  it("blocks the company name in any spelling", () => {
    for (const p of ["Zentrova Labs website", "zentrova-labs portal", "ZENTROVALABS app"]) {
      assert.match(issue(p, "Zentrova Labs")!, /company name/);
    }
    assert.ok(issue("Zentrova Labs CRM", "Zentrova Labs Pvt Ltd"));
    assert.ok(issue("Zentrova app", "Zentrova"));
    assert.ok(issue("cafe nova site", "Café Nova"));
  });
  it("blocks initials as whole tokens", () => {
    for (const p of ["AR portal", "A.R. portal", "ar-vr app"]) assert.match(issue(p, "Alpha Robotics")!, /"AR" looks like/);
    assert.equal(issue("Arena revamp", "Alpha Robotics"), null);
    assert.equal(issue("Radar", "Alpha Robotics"), null);
    assert.match(issue("ATPL onboarding", "Acme Tech Pvt Ltd")!, /"ATPL"/);
    assert.match(issue("AT dashboard", "Acme Tech Pvt Ltd")!, /"AT"/);
    assert.equal(issue("Z app", "Zentrova"), null);
  });
  it("short names match whole words only", () => {
    assert.ok(issue("HP fleet tool", "HP"));
    assert.equal(issue("Chip design", "HP"), null);
    assert.equal(issue("HPC cluster", "HP"), null);
  });
  it("empty company is fine", () => {
    assert.equal(issue("Anything", null), null);
    assert.equal(issue("Anything", "  "), null);
  });
  it("e2e names stay clear of the rule", () => {
    assert.equal(issue("Ops dashboards abc123", "Zentrova Labs ABC123"), null);
    assert.equal(issue("Ops dashboards 1", "Zentrova QA chromium 1"), null);
    assert.equal(issue("Growth analytics 1", "Brightwell US QA 1"), null);
  });
});
