// Seed DB only (SEED data has submitted sheets with 0 filled days). Approves one through the UI.
import { open, shot, text } from "./lib.mjs";
const PORT = 3503;
const s = await open({ port: PORT, role: "employer", email: "design@cred-studio.dev", password: "Findtern@2026", width: 1440, name: "qa-005" });
const id = "8ea54b7b-e7cc-4000-af6b-8b24a273fd49";
await s.page.goto(s.url(`/employer/timesheets/${id}`), { waitUntil: "networkidle" });
console.log((await text(s)).replace(/^.*?Report a problem Sign out/, "").slice(0, 700));
console.log("buttons:", await s.page.$$eval("button", (b) => b.map((x) => `${x.innerText.trim()}${x.disabled ? " (disabled)" : ""}`).filter(Boolean)));
console.log(await shot(s, "qa-005-timesheet-zero-days", { fullPage: false }));
const approve = s.page.getByRole("button", { name: /^approve/i }).first();
if (await approve.count()) {
  await approve.click();
  await s.page.waitForTimeout(1500);
  console.log("after click:", (await text(s)).match(/(approved|already|fill|every day|need)[^.]{0,100}/gi)?.slice(0, 4));
  await shot(s, "qa-005-after-approve", { fullPage: false });
}
await s.close();
