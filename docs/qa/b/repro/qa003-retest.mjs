// Tester B, 28 Oct: retest of QA-003 (identity masked on the server, audited reveal, permission-gated).
// Usage: PORT=3502 INTERN=<user id> AADHAAR=<digits> PAN=<pan> node docs/qa/b/repro/qa003-retest.mjs
// Needs PGHOST/PGPORT/PGUSER/PGDATABASE in the environment (your local QA copy). Local copies only: staff2/3/4/5@qa.invalid are the QA harness's staff rows with a test password copied in.
import { open, shot } from "./lib.mjs";
import { execFileSync } from "node:child_process";
const PORT = process.env.PORT ?? 3502, id = process.env.INTERN, A = process.env.AADHAAR, P = process.env.PAN;
const psql = (q) => execFileSync("psql", ["-At", "-c", q]).toString().trim();
const audit = () => Number(psql("select count(*) from admin_audit_log where action='identity.reveal'"));
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

const login = (email, password) => open({ port: PORT, role: "admin", email, password, name: `qa003r-${email.split("@")[0]}` });
const sup = await login("e2e-admin@findtern.test", "E2e#Admin2026");
const url = sup.url(`/admin/interns/${id}`);

// 1. The digits must not be in the HTML or the RSC payload the server sends
const html = await (await sup.ctx.request.get(url)).text();
const rsc = await (await sup.ctx.request.get(url, { headers: { RSC: "1" } })).text();
const spaced = (n) => n.replace(/(\d{4})(?=\d)/g, "$1 ");
for (const [label, body] of [["html", html], ["rsc", rsc]]) log(`serverPayload.${label}`, { bytes: body.length, fullAadhaar: body.includes(A) || body.includes(spaced(A)), fullPan: body.includes(P), last4Present: body.includes(A.slice(-4)) });

// 2. The rendered page, then Reveal (UI)
await sup.page.goto(url, { waitUntil: "networkidle" });
const shown = (await sup.page.locator("main").innerText()).replace(/\s+/g, " ");
log("page.masked", (shown.match(/(Aadhaar|PAN|Bank)[^A-Z]{0,40}[•*Xx]{2,}[^A-Z]{0,12}/g) ?? []).slice(0, 4));
const reveals = sup.page.getByRole("button", { name: /reveal|show/i });
log("revealButtons", await reveals.allInnerTexts());
await shot(sup, "qa003r-admin-masked", { fullPage: false });
const before = audit();
await reveals.first().click(); await sup.page.waitForTimeout(1200);
log("afterReveal.onPage", { hasFull: (await sup.page.locator("main").innerText()).replace(/\s/g, "").includes(A) || (await sup.page.locator("main").innerText()).replace(/\s/g, "").includes(P) });
await shot(sup, "qa003r-admin-revealed", { fullPage: false });
if (await reveals.count()) { await reveals.first().click().catch(() => {}); await sup.page.waitForTimeout(800); }
log("audit.rowsAddedByUI", audit() - before);
log("audit.lastRow", psql("select action||' '||target_type||' '||left(target_id,8)||' '||meta::text||' by '||(select email from admins where id=admin_id) from admin_audit_log where action='identity.reveal' order by created_at desc limit 1"));

// 3. The API directly, per role (no CSRF headers beyond what the browser context sends)
for (const field of ["aadhaar", "pan", "nonsense"]) {
  const r = await sup.ctx.request.post(sup.url(`/api/admin/interns/${id}/reveal`), { data: { field }, headers: { origin: sup.origin } });
  const b0 = audit();
  log(`super.api.${field}`, { status: r.status(), body: (await r.text()).slice(0, 80), cache: r.headers()["cache-control"] });
}
const noOrigin = await sup.ctx.request.post(sup.url(`/api/admin/interns/${id}/reveal`), { data: { field: "pan" } });
log("super.api.noOriginHeader", noOrigin.status());
await sup.close();
for (const [email, label] of [["staff4@qa.invalid", "exec_sales"], ["staff2@qa.invalid", "exec_accounts"], ["staff3@qa.invalid", "exec_operations"], ["staff5@qa.invalid", "admin"]]) {
  const s = await login(email, "E2e#Admin2026");
  const b0 = audit();
  const pg = await s.ctx.request.get(url);
  const r = await s.ctx.request.post(s.url(`/api/admin/interns/${id}/reveal`), { data: { field: "aadhaar" }, headers: { origin: s.origin } });
  const body = await r.text();
  const pgBody = await pg.text();
  log(`role.${label}`, { page: pg.status(), pageHasFull: pgBody.includes(A), api: r.status(), apiBody: body.slice(0, 70), auditAdded: audit() - b0 });
  await s.close();
}
log("audit.total", audit());

// 4. The same reveal through the UI, per role (the page carries the CSRF token)
for (const [email, label] of [["staff4@qa.invalid", "exec_sales"], ["staff2@qa.invalid", "exec_accounts"], ["staff3@qa.invalid", "exec_operations"], ["staff5@qa.invalid", "admin"]]) {
  const s = await login(email, "E2e#Admin2026");
  await s.page.goto(url, { waitUntil: "networkidle" });
  const btns = await s.page.getByRole("button", { name: /reveal|show/i }).count();
  const b0 = audit();
  let clicked = null;
  if (btns) { await s.page.getByRole("button", { name: /reveal|show/i }).first().click(); await s.page.waitForTimeout(1200); clicked = (await s.page.locator("main").innerText()).replace(/\s/g, "").includes(A); }
  log(`ui.${label}`, { revealButtons: btns, fullShownAfterClick: clicked, auditAdded: audit() - b0, errors: [...new Set(s.errors)].slice(0, 2) });
  await s.close();
}
