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
  it("matches the company on whole words, not inside other words", () => {
    assert.equal(issue("Innovation dashboard", "Nova"), null);
    assert.equal(issue("Workspace redesign", "Ace Pvt Ltd"), null);
    assert.equal(issue("Marketplace app", "Ace"), null);
    assert.equal(issue("Search revamp", "Arc Ltd"), null);
    assert.equal(issue("Product analytics", "Pro Pvt Ltd"), null);
    assert.ok(issue("Nova dashboard", "Nova"));
    assert.ok(issue("ZentrovaLabs CRM", "Zentrova Labs"));
    assert.ok(issue("Workspace by Ace", "Ace"));
  });
  it("blocks the company name with a plural or possessive tail", () => {
    for (const p of ["Zentrova", "Zentrovas", "Zentrovaes", "Zentrova's", "Zentrovas'", "Zentrova\u2019s", "ZENTROVAS portal"]) {
      assert.match(issue(p, "Zentrova")!, /company name/, p);
    }
    assert.match(issue("Acme's", "Acme")!, /company name/);
    assert.match(issue("Zentrova Labss", "Zentrova Labs")!, /company name/);
    assert.match(issue("Zentrovalabs's", "Zentrova Labs Pvt Ltd")!, /company name/);
    // Not the company: longer words that merely start with it, and unrelated words.
    assert.equal(issue("Innovation", "Nova"), null);
    assert.equal(issue("Innovations", "Nova"), null);
    assert.equal(issue("Novara dashboard", "Nova"), null);
    assert.equal(issue("Zentrovan tools", "Zentrova"), null);
    assert.equal(issue("Acmestore", "Acme"), null);
  });
  it("blocks initials as whole tokens", () => {
    for (const p of ["AR portal", "A.R. portal", "AR-VR app"]) assert.match(issue(p, "Alpha Robotics")!, /"AR" looks like/);
    assert.equal(issue("Arena revamp", "Alpha Robotics"), null);
    assert.equal(issue("Radar", "Alpha Robotics"), null);
    assert.match(issue("ATPL onboarding", "Acme Tech Pvt Ltd")!, /"ATPL"/);
    assert.match(issue("atpl onboarding", "Acme Tech Pvt Ltd")!, /"ATPL"/);
    assert.equal(issue("Z app", "Zentrova"), null);
  });
  it("2-letter initials only block in capitals, and never common acronyms or words", () => {
    assert.equal(issue("ar portal", "Alpha Robotics"), null);
    assert.equal(issue("AI chatbot", "Alpha Innovations"), null);
    assert.equal(issue("ML pipeline", "Mango Labs"), null);
    assert.equal(issue("QA automation", "Quick Apps"), null);
    assert.equal(issue("IT helpdesk", "Indigo Technologies"), null);
    assert.equal(issue("US market research", "Urban Spaces"), null);
    assert.equal(issue("AT dashboard", "Acme Tech Pvt Ltd"), null);
    assert.equal(issue("Growth at scale", "Acme Tech Pvt Ltd"), null);
    assert.match(issue("XY portal", "Xenon Yards")!, /"XY" looks like/);
    assert.equal(issue("xy portal", "Xenon Yards"), null);
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
