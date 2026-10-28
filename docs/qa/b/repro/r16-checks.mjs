// Tester B, 28 Oct: retest of QA-152, 153, 155, 156 on the candidate build (see hitarea.mjs for 146/154/160, col-*.mjs for 157 to 159).
import { open, pick } from "./lib.mjs";
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
// 156
const a = await open({ port: 3502, ...pick("admin"), width: 375, height: 812, name: "r16-adm" });
await a.page.goto(a.url("/admin/companies"), { waitUntil: "networkidle" });
log("QA-156 Globex row", await a.page.evaluate(() => { const l = [...document.querySelectorAll("main a")].find((x) => /Globex Inc/.test(x.textContent)); const sp = [...l.querySelectorAll("span, div, p")].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => { const r = e.getBoundingClientRect(); return `${e.textContent.trim().slice(0, 14)} @[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`; }); return sp; }));
await a.close();
// 152, 153 as the hired intern
const i = await open({ port: 3502, ...pick("intern"), width: 375, height: 812, name: "r16-int" });
await i.page.goto(i.url("/intern/timesheets"), { waitUntil: "networkidle" });
log("QA-152 next timesheet", (await i.page.locator("main").innerText()).replace(/\s+/g, " ").match(/Next timesheet[^]{0,90}/)?.[0] ?? "(no next-timesheet card)");
for (const p of ["/intern/dashboard", "/intern/college", "/intern/proposals"]) {
  await i.page.goto(i.url(p), { waitUntil: "networkidle" });
  const t = (await i.page.locator("body").innerText()).replace(/\s+/g, " ");
  log(`QA-153 ${p} drive mentions`, { banner_or_card: (t.match(/Summer internship drive 2027/g) ?? []).length, callAlertsNotice: /can't show call alerts/.test(t) });
}
await i.close();
// 155 fresh intern
const f = await open({ port: 3502, role: "intern", email: "qa.intern.empty@qa.test", password: "Qa#Situations2026", width: 375, height: 812, name: "r16-fresh" });
await f.page.goto(f.url("/intern/opportunities"), { waitUntil: "networkidle" });
log("QA-155 opportunities", (await f.page.locator("main").innerText()).replace(/\s+/g, " ").match(/Open roles[^.]{0,60}/)?.[0]);
await f.page.goto(f.url("/intern/settings"), { waitUntil: "networkidle" });
log("QA-155 settings Need help heading icon", await f.page.evaluate(() => [...document.querySelectorAll("main h2, main h3")].filter((h) => /Need help/.test(h.textContent)).map((h) => !!h.querySelector("svg") || !!h.parentElement.querySelector("svg"))));
await f.close();
