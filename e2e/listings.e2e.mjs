/**
 * Employer self-service listings, moderation and saved roles (PLAN §1, WP-C/WP-D).
 *
 *   create (description, contact details refused) → review step → live in
 *   discovery (intern opportunities + public page) → edit → pause hides it →
 *   resume → close is final → admin take-down with a reason (audited,
 *   employer notified) → the employer cannot reopen it → restore →
 *   intern saves a role → employer sees "Interested in this role" and the
 *   saver ranked first (no explicit sort).
 *
 * Run through e2e/run.mjs (`npm run e2e`, E2E_SPECS=listings).
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { baseUrl, ROOT, testDatabaseUrl } from "./lib/env.mjs";
import { visit } from "./lib/browser.mjs";
import {
  closeDb, eventually, expectNoText, expectText, guestContext, one, seedAdmin, seedEmployer, seedIntern, seedProject, send, signedInContext,
} from "./lib/fixtures.mjs";

testDatabaseUrl();

const SKILLS = ["React", "SQL", "Python", "Excel"];
const CONTACT_SENTENCE = /Remove the phone number \/ email \/ link from the description: candidates contact you through Findtern\./;
const state = {};
let browser;

const fetchAs = async (ctx, path) => ctx.request.get(new URL(path, baseUrl()).toString(), { failOnStatusCode: false });
/**
 * The intern role page is wrapped by src/app/intern/loading.tsx, so Next has already sent a 200 when notFound() runs:
 * a missing role renders the "Page not found" page with that status. "Gone" = a 404, or that page with no sign of the role.
 */
const internRoleGone = async (id, roleName) => {
  const res = await fetchAs(state.lowCtx, `/intern/opportunities/${id}`);
  if (res.status() === 404) return true;
  const html = await res.text();
  return res.status() === 200 && /Page not found/.test(html) && !html.includes(roleName);
};
const publicStatus = async (id) => (await fetchAs(state.guest, `/opportunities/${id}`)).status();

async function createListing(name, description = "Build and ship small data dashboards with our analytics team, weekly demos.") {
  const res = await send(state.employerCtx, "POST", `/api/employer/${state.employer.id}/projects`, {
    projectName: name,
    skills: SKILLS,
    scopeOfWork: "short-term",
    locationType: "remote",
    timezone: "Asia/Kolkata",
    ...(description === undefined ? {} : { description }),
  });
  return res;
}

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  state.employer = await seedEmployer({ label: "list-emp" });
  state.admin = await seedAdmin();
  // The employer keeps one listing that stays active, so pausing/closing the others is allowed (last-open rule).
  state.anchor = await seedProject(state.employer.id, { name: "Anchor Analytics Role", skills: SKILLS });
  state.employerCtx = await signedInContext(browser, state.employer);
  state.adminCtx = await signedInContext(browser, state.admin);
  state.guest = await guestContext(browser);
  // Interns: "Rishi" ranks below "Meera" on score; Rishi will save the role.
  state.low = await seedIntern({ label: "saver", firstName: "Rishi", score: 7, paid: true, skills: SKILLS });
  state.high = await seedIntern({ label: "top", firstName: "Meera", score: 9, paid: true, skills: SKILLS });
  state.lowCtx = await signedInContext(browser, state.low);
});

after(async () => {
  await browser?.close();
  await closeDb();
});

test("create: a listing with a description is saved and goes live at once", async () => {
  const res = await createListing("Dashboard Analytics Intern");
  assert.equal(res.status, 201, JSON.stringify(res.body));
  state.listingId = res.body.project?.id;
  assert.ok(state.listingId, "the response carries the project");
  const row = await one(`SELECT status, description, taken_down_at FROM projects WHERE id = $1`, [state.listingId]);
  assert.equal(row.status, "active", "no draft state: published at once");
  assert.match(row.description, /small data dashboards/);
  assert.equal(row.taken_down_at, null);
});

test("create: contact details in the description are refused with a sentence, nothing is saved", async () => {
  const before = (await one(`SELECT count(*)::int AS n FROM projects WHERE employer_id = $1`, [state.employer.id])).n;
  const attempts = [
    "Call us on 9876543210 to apply.",
    "Write to hiring@acme-example.com for details.",
    "Apply at https://acme-example.com/careers today.",
    "Message me on WhatsApp wa.me/919876543210 please.",
  ];
  const words = ["Alpha", "Beta", "Gamma", "Delta"];
  for (const [i, text] of attempts.entries()) {
    const res = await createListing(`Refused Role ${words[i]}`, text);
    assert.equal(res.status, 400, `${text} → ${JSON.stringify(res.body)}`);
    assert.match(res.body.error ?? "", CONTACT_SENTENCE, text);
  }
  const after = (await one(`SELECT count(*)::int AS n FROM projects WHERE employer_id = $1`, [state.employer.id])).n;
  assert.equal(after, before, "no listing was created by a refused save");
  assert.equal((await one(`SELECT count(*)::int AS n FROM projects WHERE project_name LIKE 'Refused Role%' AND employer_id = $1`, [state.employer.id])).n, 0);
});

test("create: plain numbers like '3 months' or '2026' are not treated as contact details", async () => {
  const res = await createListing("Research Assistant Intern", "A 3 month project for 2 interns starting in 2026, 20 hours a week.");
  assert.equal(res.status, 201, JSON.stringify(res.body));
});

test("edit: the description can be changed, and the same contact check applies to edits", async () => {
  const ok = await send(state.employerCtx, "PUT", `/api/employer/projects/${state.listingId}`, { description: "Updated: own the weekly KPI dashboard." });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.match((await one(`SELECT description FROM projects WHERE id = $1`, [state.listingId])).description, /^Updated:/);
  const bad = await send(state.employerCtx, "PUT", `/api/employer/projects/${state.listingId}`, { description: "Reach me at +91 98765 43210" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error ?? "", CONTACT_SENTENCE);
  assert.match((await one(`SELECT description FROM projects WHERE id = $1`, [state.listingId])).description, /^Updated:/, "a refused edit keeps the old text");
});

test("discovery: the live listing is on the intern opportunities page, its detail page and the public page, with the description", async () => {
  const list = await (await fetchAs(state.lowCtx, "/intern/opportunities")).text();
  assert.ok(list.includes("Dashboard Analytics Intern"), "intern opportunities list");
  const detail = await fetchAs(state.lowCtx, `/intern/opportunities/${state.listingId}`);
  assert.equal(detail.status(), 200);
  expectText(await detail.text(), /weekly KPI dashboard/, "the description is shown on the intern detail page");
  const pub = await fetchAs(state.guest, `/opportunities/${state.listingId}`);
  assert.equal(pub.status(), 200, "public page");
  expectText(await pub.text(), /weekly KPI dashboard/, "the description is shown on the public page");
});

test("copy: the opportunity pages no longer say no company can contact you directly", async () => {
  for (const [ctx, path] of [[state.guest, "/opportunities"], [state.guest, `/opportunities/${state.listingId}`]]) {
    const html = await (await fetchAs(ctx, path)).text();
    expectNoText(html, /no company can contact you directly/i, path);
  }
});

test("pause: a paused listing 404s publicly and leaves discovery; resume brings it back", async () => {
  const paused = await send(state.employerCtx, "PUT", `/api/employer/projects/${state.listingId}`, { status: "inactive" });
  assert.equal(paused.status, 200, JSON.stringify(paused.body));
  assert.equal((await one(`SELECT status FROM projects WHERE id = $1`, [state.listingId])).status, "inactive");
  assert.equal(await publicStatus(state.listingId), 404, "public page");
  assert.ok(await internRoleGone(state.listingId, "Dashboard Analytics Intern"), "intern detail page");
  assert.ok(!(await (await fetchAs(state.lowCtx, "/intern/opportunities")).text()).includes("Dashboard Analytics Intern"), "intern list");

  const resumed = await send(state.employerCtx, "PUT", `/api/employer/projects/${state.listingId}`, { status: "active" });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
  assert.equal(await publicStatus(state.listingId), 200, "public page is back");
});

test("close: closing is final (a closed listing cannot be reopened) and it leaves discovery", async () => {
  const res = await createListing("Temporary Closing Role", "A short-lived listing to close.");
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.project.id;
  const closed = await send(state.employerCtx, "PUT", `/api/employer/projects/${id}`, { status: "closed" });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal((await one(`SELECT status FROM projects WHERE id = $1`, [id])).status, "closed", "stored as closed, not paused");
  assert.equal(await publicStatus(id), 404);
  const reopen = await send(state.employerCtx, "PUT", `/api/employer/projects/${id}`, { status: "active" });
  assert.equal(reopen.status, 409, JSON.stringify(reopen.body));
  assert.match(reopen.body.error ?? "", /closed/i);
  assert.equal((await one(`SELECT status FROM projects WHERE id = $1`, [id])).status, "closed");
});

test("take-down: only an admin with a reason; the listing disappears, the employer is told, the action is audited", async () => {
  const id = state.listingId;
  const asEmployer = await send(state.employerCtx, "PUT", `/api/admin/projects/${id}/status`, { action: "take_down", reason: "I want it down" });
  assert.ok([401, 403].includes(asEmployer.status), `an employer must not reach the admin route (got ${asEmployer.status})`);
  const noReason = await send(state.adminCtx, "PUT", `/api/admin/projects/${id}/status`, { action: "take_down", reason: "no" });
  assert.equal(noReason.status, 400, "reason must be 3 to 500 characters");

  const down = await send(state.adminCtx, "PUT", `/api/admin/projects/${id}/status`, { action: "take_down", reason: "Misleading role description" });
  assert.equal(down.status, 200, JSON.stringify(down.body));
  const row = await one(`SELECT taken_down_at, taken_down_by, taken_down_reason, status FROM projects WHERE id = $1`, [id]);
  assert.ok(row.taken_down_at, "taken_down_at set");
  assert.equal(row.taken_down_reason, "Misleading role description");
  assert.equal(row.taken_down_by, state.admin.id);
  assert.equal(await publicStatus(id), 404, "public page");
  assert.ok(await internRoleGone(id, "Dashboard Analytics Intern"), "intern detail page");

  const audit = await one(`SELECT meta FROM admin_audit_log WHERE action = 'project.take_down' AND target_id = $1`, [id]);
  assert.ok(audit, "audited as project.take_down");
  const note = await eventually("employer notification", () =>
    one(`SELECT title, message FROM notifications WHERE recipient_type = 'employer' AND recipient_id = $1 AND created_at >= now() - interval '1 minute' ORDER BY created_at DESC LIMIT 1`, [state.employer.id]));
  assert.match(`${note.title} ${note.message}`, /Misleading role description|taken down|took/i);
});

test("take-down: the employer cannot reopen it and sees the reason", async () => {
  const id = state.listingId;
  const res = await send(state.employerCtx, "PUT", `/api/employer/projects/${id}`, { status: "active" });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.match(res.body.error ?? "", /Findtern took this listing down: Misleading role description\. Contact support\./);
  assert.notEqual((await one(`SELECT status FROM projects WHERE id = $1`, [id])).status, "closed");
  assert.equal(await publicStatus(id), 404, "still hidden");
});

test("take-down: restoring brings it back (audited); restoring a live listing is a 409", async () => {
  const id = state.listingId;
  const up = await send(state.adminCtx, "PUT", `/api/admin/projects/${id}/status`, { action: "restore" });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal((await one(`SELECT taken_down_at FROM projects WHERE id = $1`, [id])).taken_down_at, null);
  assert.ok(await one(`SELECT 1 AS x FROM admin_audit_log WHERE action = 'project.restore' AND target_id = $1`, [id]), "audited as project.restore");
  assert.equal(await publicStatus(id), 200);
  const again = await send(state.adminCtx, "PUT", `/api/admin/projects/${id}/status`, { action: "restore" });
  assert.equal(again.status, 409);
  const unknown = await send(state.adminCtx, "PUT", `/api/admin/projects/00000000-0000-0000-0000-000000000000/status`, { action: "restore" });
  assert.equal(unknown.status, 404);
});

test("an inactive employer's listing is not in discovery", async () => {
  const hidden = await seedEmployer({ label: "list-off", active: false });
  const projectId = await seedProject(hidden.id, { name: "Ghost Analytics Role", skills: SKILLS });
  assert.equal(await publicStatus(projectId), 404, "public page");
  assert.ok(!(await (await fetchAs(state.lowCtx, "/intern/opportunities")).text()).includes("Ghost Analytics Role"), "intern list");
});

test("saved roles: an intern saves and unsaves; a role that is not open is a 404", async () => {
  const id = state.listingId;
  const saved = await send(state.lowCtx, "POST", "/api/intern/saved-projects", { projectId: id });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.saved, true);
  assert.ok(await one(`SELECT 1 AS x FROM intern_saved_projects WHERE intern_id = $1 AND project_id = $2`, [state.low.id, id]));
  const again = await send(state.lowCtx, "POST", "/api/intern/saved-projects", { projectId: id });
  assert.equal(again.status, 200, "saving twice is a no-op");
  assert.equal((await one(`SELECT count(*)::int AS n FROM intern_saved_projects WHERE intern_id = $1 AND project_id = $2`, [state.low.id, id])).n, 1);
  const gone = await send(state.lowCtx, "DELETE", "/api/intern/saved-projects", { projectId: id });
  assert.equal(gone.status, 200);
  assert.equal(gone.body.saved, false);
  assert.equal((await one(`SELECT count(*)::int AS n FROM intern_saved_projects WHERE intern_id = $1 AND project_id = $2`, [state.low.id, id])).n, 0);
  // A role that is paused is not open to save.
  const paused = await createListing("Paused Save Role", "Not open any more.");
  const pid = paused.body.project.id;
  await send(state.employerCtx, "PUT", `/api/employer/projects/${pid}`, { status: "inactive" });
  const refused = await send(state.lowCtx, "POST", "/api/intern/saved-projects", { projectId: pid });
  assert.equal(refused.status, 404, JSON.stringify(refused.body));
  // The employer cannot use the intern route, and a guest cannot either.
  const asEmployer = await send(state.employerCtx, "POST", "/api/intern/saved-projects", { projectId: id });
  assert.ok([401, 403].includes(asEmployer.status), `employer got ${asEmployer.status}`);
});

test("saved roles: the saver is ranked first for that project and carries 'Interested in this role'", async () => {
  const id = state.listingId;
  const order = async () => {
    const html = await (await fetchAs(state.employerCtx, `/employer/candidates?project=${id}`)).text();
    const at = (internId) => html.indexOf(internId);
    return { html, lowAt: at(state.low.id), highAt: at(state.high.id) };
  };
  const before = await order();
  assert.ok(before.lowAt >= 0 && before.highAt >= 0, "both candidates are on the page for this project");
  assert.ok(before.highAt < before.lowAt, "without a save, the higher score (Meera, 9) is listed before Rishi (7)");
  expectNoText(before.html, /Interested in this role/, "no chip before a save");

  assert.equal((await send(state.lowCtx, "POST", "/api/intern/saved-projects", { projectId: id })).status, 200);
  const after = await order();
  assert.ok(after.lowAt < after.highAt, "the saver now leads with no explicit sort");
  expectText(after.html, /Interested in this role/, "the chip");

  // An explicit employer sort still leads: score first puts Meera back on top.
  const explicit = await (await fetchAs(state.employerCtx, `/employer/candidates?project=${id}&sort=score`)).text();
  assert.ok(explicit.indexOf(state.high.id) < explicit.indexOf(state.low.id), "an explicit sort still leads");
  expectText(explicit, /Interested in this role/, "the chip stays");

  // Saving never touches the score (PRODUCT.md).
  const score = await one(`SELECT extra_data->>'findternScore' AS s FROM intern_onboarding WHERE user_id = $1`, [state.low.id]);
  assert.equal(Number(score.s), 7);
});

test("UI: create goes through a review step before the listing is published [UI]", async () => {
  const ctx = await signedInContext(browser, state.employer);
  const page = await ctx.newPage();
  const name = "Insights Reporting Intern";
  try {
    await visit(page, "/employer/projects");
    // Posting is its own page now (/employer/projects/new), reached from the header link.
    await page.getByRole("link", { name: /post a project/i }).first().click();
    await page.waitForURL(/\/employer\/projects\/new/);
    await page.getByLabel("Project name").fill(name);
    for (const skill of SKILLS) {
      const box = page.getByLabel(/^Skills/).first();
      await box.fill(skill);
      await box.press("Enter");
    }
    // Scope of work reads "Up to 60 days" (stored as short-term); the description is "What the work involves".
    await page.getByRole("radio", { name: /up to 60 days/i }).click();
    await page.getByRole("radio", { name: /remote/i }).click();
    await page.getByLabel(/what the work involves/i).fill("Own the monthly insights report and present it to the team.");
    // The new step: Review comes first, nothing is created until Publish.
    await page.getByRole("button", { name: /^review/i }).click();
    await page.getByText(name).first().waitFor();
    assert.equal((await one(`SELECT count(*)::int AS n FROM projects WHERE employer_id = $1 AND project_name = $2`, [state.employer.id, name])).n, 0, "nothing is saved at the review step");
    await page.getByRole("button", { name: /publish|create project/i }).click();
    const row = await eventually("the listing row", () => one(`SELECT id, status, description FROM projects WHERE employer_id = $1 AND project_name = $2`, [state.employer.id, name]), { timeoutMs: 15_000 });
    assert.equal(row.status, "active");
    assert.match(row.description, /monthly insights report/);
  } catch (err) {
    await page.screenshot({ path: join(ROOT, "e2e", ".artifacts", "fail-listings-ui-create.png"), fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await ctx.close();
  }
});

test("UI: pause and close are separate actions; a taken-down listing shows its reason [UI]", async () => {
  const ctx = await signedInContext(browser, state.employer);
  const page = await ctx.newPage();
  try {
    await visit(page, "/employer/projects");
    await page.getByText("Dashboard Analytics Intern").first().waitFor();
    const body = await page.locator("main").innerText();
    assert.match(body, /Dashboard Analytics Intern/);
    const menu = page.getByRole("button", { name: /More actions for Dashboard Analytics Intern/ });
    await menu.click();
    await page.getByRole("menuitem", { name: /^pause/i }).waitFor();
    await page.getByRole("menuitem", { name: /^close/i }).waitFor();
    await page.keyboard.press("Escape");
    // Take it down as admin, then the employer's list shows why.
    assert.equal((await send(state.adminCtx, "PUT", `/api/admin/projects/${state.listingId}/status`, { action: "take_down", reason: "Needs rewording" })).status, 200);
    await page.reload();
    await page.getByText(/Findtern took (?:this listing )?down.{0,80}Needs rewording/).first().waitFor();
    await send(state.adminCtx, "PUT", `/api/admin/projects/${state.listingId}/status`, { action: "restore" });
  } catch (err) {
    await page.screenshot({ path: join(ROOT, "e2e", ".artifacts", "fail-listings-ui-menu.png"), fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await ctx.close();
  }
});
