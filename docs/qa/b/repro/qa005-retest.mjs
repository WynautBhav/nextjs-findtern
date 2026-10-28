// Tester B, 28 Oct: retest of QA-005 (a submitted sheet with unfilled days cannot be approved), then fill the days and approve.
// Usage: PORT=3503 EMAIL=... PASSWORD=... SHEET=<id> [DB=findtern_seed2] node qa005-retest.mjs [chromium|webkit] [375|1440]
import { open, shot } from "./lib.mjs";
import { execFileSync } from "node:child_process";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const { PORT = "3503", EMAIL, PASSWORD, SHEET, DB = "findtern_seed2" } = process.env;
const psql = (q) => execFileSync("psql", ["-h", "localhost", "-p", process.env.PGPORT ?? "5432", "-U", "findtern", "-d", DB, "-At", "-c", q]).toString().trim();
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const s = await open({ port: PORT, role: "employer", email: EMAIL, password: PASSWORD, width, height: width < 500 ? 812 : 900, engine, name: `qa005r-${engine}-${width}-${PORT}` });
const { page } = s;
const go = async () => { await page.goto(s.url(`/employer/timesheets/${SHEET}`), { waitUntil: "networkidle" }); await page.waitForTimeout(400); };
await go();
const main = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");
log("status", psql(`select status from timesheets where id='${SHEET}'`));
log("decision text", (await main()).match(/Decision[^]{0,320}/)?.[0]);
const approveBtn = page.getByRole("button", { name: /^Approve timesheet$/ });
log("approve button", { n: await approveBtn.count(), disabled: await approveBtn.first().isDisabled().catch(() => null) });
log("controls", await page.locator("main button").evaluateAll((es) => es.filter((e) => /Approve|Send back/.test(e.innerText)).map((e) => `${e.innerText.trim()}${e.disabled ? " (disabled)" : ""}`)));
await shot(s, `qa005r-${engine}-${width}-${PORT}-blocked`, { fullPage: false });
// the API, as the page would call it (CSRF header from the cookie)
const api = await page.evaluate(async (id) => {
  const csrf = decodeURIComponent((document.cookie.match(/(?:^|;\s*)ft_csrf=([^;]+)/) ?? [])[1] ?? "");
  const r = await fetch(`/api/timesheets/${id}/decision`, { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ decision: "approved" }) });
  const b = await r.json().catch(() => null);
  return { status: r.status, error: b?.error, missing: Array.isArray(b?.missingDates) ? `${b.missingDates.length} dates, first ${b.missingDates[0]}` : b?.missingDates };
}, SHEET);
log("api approve with blanks", api);
log("status after refused approve", psql(`select status from timesheets where id='${SHEET}'`));
// Send back still works? (reason required) -- only when SENDBACK=1, it changes the sheet to rejected
if (process.env.SENDBACK) {
  await page.getByText("Send back", { exact: true }).first().click(); await page.waitForTimeout(300);
  await page.locator("textarea").fill("Please fill the empty days."); await page.getByRole("button", { name: /Send back to the intern/ }).click(); await page.waitForTimeout(1500);
  log("after send back", psql(`select status from timesheets where id='${SHEET}'`));
  await s.close(); process.exit(0);
}
// fill every day with the app's words, then approve through the UI
psql(`update timesheets set entries=(select jsonb_agg(jsonb_build_object('date', d::date::text, 'status', case when extract(dow from d) in (0,6) then 'Fixed off' else 'Present' end, 'hours', case when extract(dow from d) in (0,6) then 0 else 8 end, 'note', '') order by d) from generate_series(period_start, period_end, interval '1 day') d) where id='${SHEET}'`);
await go();
log("after filling: decision text", (await main()).match(/Decision[^]{0,200}/)?.[0]);
log("approve button now", { disabled: await approveBtn.first().isDisabled().catch(() => null) });
await approveBtn.click(); await page.waitForTimeout(700);
const yes = page.getByRole("button", { name: /Yes, approve and lock/ });
if (await yes.count()) await yes.click();
await page.waitForTimeout(1500);
log("status after approve", psql(`select status from timesheets where id='${SHEET}'`));
log("page now", (await main()).match(/Decision[^]{0,160}/)?.[0]);
await shot(s, `qa005r-${engine}-${width}-${PORT}-approved`, { fullPage: false });
log("errors", [...new Set(s.errors)].slice(0, 2));
await s.close();
