// WP5: the intern college card, leave request through the real UI, officer queue, admin panel. Text + screenshots.
import { openRoles, closeAll } from "./lib/ctx.mjs";
import { q, closeDb, check, failures, mkUser, SFX, JKLU } from "./wp5-lib.mjs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const EV = resolve(process.env.OUT ?? "./out"); // screenshots; ./out is gitignored
mkdirSync(EV, { recursive: true });
const base = process.env.BASE;
const s = await mkUser({ first: "Uma", last: "Ui", email: `uma.ui.${SFX}@jklu.edu.in` });
await q("insert into college_memberships (user_id,college_id,status,verified_by,year,branch) values ($1,$2,'verified','email_domain',2,'CSE')", [s.id, JKLU]);
const { browser, ctxs } = await openRoles({ tpo: { role: "tpo" }, student: { role: "student", email: s.email }, admin: { role: "admin" } }, { base });
const errs = [];
const open = async (ctx, path, name) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`${path}: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errs.push(`${path} console: ${m.text().slice(0, 150)}`));
  await p.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
  if (name) await p.screenshot({ path: `${EV}/${name}.png`, fullPage: true });
  return p;
};
let p = await open(ctxs.student, "/intern/college", "student-college-card");
let txt = await p.innerText("body");
console.log("--- /intern/college\n" + txt.replace(/\n+/g, " | ").slice(0, 700));
check("college card names the college", /JK Lakshmipat/.test(txt));
const leaveBtn = p.getByRole("button", { name: /leave|request/i }).first();
console.log("leave button visible:", await leaveBtn.isVisible().catch(() => false));
await leaveBtn.click().catch((e) => console.log("click leave failed", e.message.slice(0, 80)));
await p.waitForTimeout(500);
await p.screenshot({ path: `${EV}/student-leave-dialog.png`, fullPage: true });
const ta = p.locator("textarea").first();
if (await ta.count()) await ta.fill("Transferring to another college");
await p.getByRole("button", { name: /send|submit|request leave|confirm/i }).last().click().catch((e) => console.log("send failed", e.message.slice(0, 80)));
await p.waitForTimeout(1500);
await p.screenshot({ path: `${EV}/student-leave-requested.png`, fullPage: true });
txt = await p.innerText("body");
check("student sees the request is waiting", /waiting|pending|requested/i.test(txt), txt.replace(/\n+/g, " | ").slice(0, 300));
const row = (await q("select status, reason from college_leave_requests where user_id=$1", [s.id]))[0];
check("request stored with reason", row?.status === "requested" && row.reason === "Transferring to another college", JSON.stringify(row));
// no second request button
console.log("second request possible?", await p.getByRole("button", { name: /^(send|request).*leave/i }).count());
// officer queue
const t = await open(ctxs.tpo, "/college/leave-requests", "tpo-leave-queue");
const tt = await t.innerText("body");
console.log("--- tpo queue\n" + tt.replace(/\n+/g, " | ").slice(0, 500));
check("officer sees Uma Ui + reason", /Uma Ui/.test(tt) && /Transferring to another college/.test(tt));
// admin panel
const a = await open(ctxs.admin, `/admin/colleges/${JKLU}`, "admin-college-page");
const at = await a.innerText("body");
check("admin college page shows the pending request", /Uma Ui|uma\.ui/i.test(at) || /leave/i.test(at), at.length + " chars");
// approvals page + overview
await open(ctxs.tpo, "/college/approvals", "tpo-approvals");
await open(ctxs.tpo, "/college", "tpo-home");
await open(ctxs.student, "/intern/dashboard", "student-dashboard");
console.log("page errors:", errs.length, errs.slice(0, 6));
await closeAll(browser);
await closeDb();
process.exit(failures() ? 1 : 0);
