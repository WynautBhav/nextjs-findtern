import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OPEN_INTERN_PAGES, PRECOMPLETE_OPEN_PAGES, isOpenInternPage, precompleteVerdict, type PrecompleteVerdict } from "./intern-lock.ts";

const verdict = (pathname: string, complete: boolean | null, locked: boolean) => precompleteVerdict({ pathname, complete, locked });

const OPEN = ["/intern/dashboard", "/intern/onboarding", "/intern/settings", "/intern/notifications", "/intern/locked"];
const CLOSED = ["/intern/documents", "/intern/profile", "/intern/guarantee"];

describe("precompleteVerdict: complete x locked x path", () => {
  it("locked + incomplete: only Home, onboarding, Settings, Notifications, locked page are open", () => {
    for (const p of OPEN) assert.equal(verdict(p, false, true), "allow", p);
    for (const p of CLOSED) assert.equal(verdict(p, false, true), "redirect_onboarding", p);
  });

  it("locked + complete: the WP2 set applies unchanged (Documents and Your profile open again)", () => {
    for (const p of [...OPEN, ...CLOSED]) assert.equal(verdict(p, true, true), "allow", p);
  });

  it("paid / grandfathered (not locked): never affected, complete or not", () => {
    for (const complete of [true, false, null]) for (const p of [...OPEN, ...CLOSED, "/intern/record"]) assert.equal(verdict(p, complete, false), "allow", `${p} ${complete}`);
  });

  it("an unreadable completion check fails open (never shuts anyone out)", () => {
    for (const p of [...OPEN, ...CLOSED]) assert.equal(verdict(p, null, true), "allow", p);
  });

  it("onboarding is allowed in every combination (no redirect loop)", () => {
    for (const complete of [true, false, null]) for (const locked of [true, false]) {
      for (const p of ["/intern/onboarding", "/intern/onboarding/", "/Intern/Onboarding?step=2", "/intern/onboarding/anything"]) {
        assert.equal(verdict(p, complete, locked), "allow", `${p} ${complete} ${locked}`);
      }
    }
  });

  it("the redirect target is itself allowed", () => assert.equal(verdict("/intern/onboarding", false, true), "allow"));
});

describe("precompleteVerdict: path shapes (locked + incomplete)", () => {
  const cases: [string, PrecompleteVerdict][] = [
    ["/intern/documents/", "redirect_onboarding"], // trailing slash
    ["/Intern/Documents", "redirect_onboarding"], // case
    ["/INTERN/PROFILE", "redirect_onboarding"],
    ["/intern/documents?tab=1#x", "redirect_onboarding"], // query and hash
    ["/intern/profile?x=/intern/dashboard", "redirect_onboarding"], // an open path hiding in the query does not open it
    ["/intern/documents/open?key=a", "redirect_onboarding"], // sub-path
    ["/intern/profile/edit", "redirect_onboarding"],
    ["/intern/dashboard/../documents", "redirect_onboarding"], // traversal out of an open page
    ["/intern/dashboard/%2e%2e/profile", "redirect_onboarding"],
    ["/intern/dashboard/%252e%252e/profile", "redirect_onboarding"],
    ["/intern/dashboard\\..\\documents", "redirect_onboarding"],
    ["/intern/documents/../dashboard", "allow"], // traversal INTO an open page
    ["/intern//documents", "redirect_onboarding"], // double slash
    ["/intern/documents%00", "redirect_onboarding"], // unreadable: closed
    ["/intern/%E0%A4%A", "redirect_onboarding"],
    ["/intern/dashboard/", "allow"],
    ["/Intern/Dashboard?x=1", "allow"],
    ["/intern/settings#college", "allow"],
    ["/intern/notifications/", "allow"],
    ["/intern/dashboardx", "redirect_onboarding"], // prefix match is by segment, not by string
    ["/intern/profiles", "redirect_onboarding"],
    ["/intern", "allow"],
    ["/intern/", "allow"],
    ["/intern/college", "allow"], // redirects to Settings
    ["/intern/bank-details", "allow"], // redirects to Settings
  ];
  for (const [path, want] of cases) it(`${path} -> ${want}`, () => assert.equal(verdict(path, false, true), want));
});

describe("precomplete set stays inside the payment lock's open set", () => {
  it("every pre-completion page is also open to an unpaid intern (this rule only ever narrows)", () => {
    for (const p of PRECOMPLETE_OPEN_PAGES) {
      assert.ok((OPEN_INTERN_PAGES as readonly string[]).includes(p), p);
      assert.equal(isOpenInternPage(p), true, p);
    }
  });
  it("it narrows by exactly Documents, Your profile and the guarantee page", () => {
    const dropped = OPEN_INTERN_PAGES.filter((p) => !(PRECOMPLETE_OPEN_PAGES as readonly string[]).includes(p)).sort();
    assert.deepEqual(dropped, ["/intern/documents", "/intern/guarantee", "/intern/profile"]);
  });
});
