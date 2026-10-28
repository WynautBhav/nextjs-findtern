import { open, shot } from "./lib.mjs";
import { NEHA, body, errsOf } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-misc" });
const p = s.page;
// S2 4 sidebar collapse
await p.goto(s.url("/employer/dashboard"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
const w0 = await p.evaluate(() => document.querySelector("aside, nav")?.getBoundingClientRect().width);
const btn = p.locator("button[aria-label*='ollapse'], button[aria-label*='idebar'], button[aria-label*='nav' i]").first();
console.log("collapse btn:", await btn.getAttribute("aria-label").catch(() => "none"), "sidebar width before:", w0);
await btn.click().catch((e) => console.log("collapse click fail", e.message.slice(0, 60))); await p.waitForTimeout(800);
console.log("sidebar width after:", await p.evaluate(() => document.querySelector("aside, nav")?.getBoundingClientRect().width));
await shot(s, "bs7-emp-sidebar-collapsed-1440", { fullPage: false });
await btn.click().catch(() => {}); await p.waitForTimeout(500);
// FAQ / Contact reachable from sidebar
for (const name of ["FAQ", "Contact us", "Email us", "Report a problem"]) {
  const a = p.locator(`aside a:has-text("${name}"), nav a:has-text("${name}")`).first();
  console.log(name, "->", await a.getAttribute("href").catch(() => "missing"));
}
// Ask me FAB size
console.log("Ask me FAB:", JSON.stringify(await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /Ask me - chat/.test(x.getAttribute("aria-label") || "") || x.innerText.trim() === "Ask me"); const r = b?.getBoundingClientRect(); return r && { w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute("aria-label") }; })));
// avatars: any <img> on candidates, avatar API for QT/PH as Neha (not hired for PH)
await p.goto(s.url("/employer/candidates"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
console.log("imgs on candidates page:", await p.$$eval("main img", (i) => i.length));
for (const id of ["333cab93-5cc8-4c7d-9e4a-190e8eedb654", "d3cfce82-7f94-494d-9416-8c3ab740f78b", "1111f088-9503-4fee-9f9f-f27a18db40a2"]) {
  console.log("avatar", id.slice(0, 8), await p.evaluate(async (i) => { const r = await fetch("/api/intern/avatar?id=" + i); return r.status + " " + r.headers.get("content-type"); }, id));
}
// 113 Free
console.log("candidates with 'Free' price:", (await body(p)).match(/.{20}Free.{20}/g)?.slice(0, 3), "| $0/₹0 occurrences:", (await body(p)).match(/(₹|\$)0(\/hr)?/g));
await p.goto(s.url("/employer/candidates?pf=0&plan=standard"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
console.log("plan=standard:", (await body(p)).match(/(\d+) interns match/)?.[0], (await body(p)).match(/STANDARD.{0,40}/)?.[0], (await body(p)).match(/(₹|\$)0\/hr|Free\/hr|Free/g)?.slice(0,3));
await p.goto(s.url("/employer/account"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
await p.locator("input[name=escalationContactEmail]").fill("neha@acmerobotics-launchtest.in");
await p.getByRole("button", { name: /Save company details/ }).click(); await p.waitForTimeout(2000);
console.log("account esc=login email ->", JSON.stringify((await errsOf(p)).filter(t=>t.length<140)));
await p.locator("input[name=escalationContactEmail]").fill("someone@other-domain.com");
await p.getByRole("button", { name: /Save company details/ }).click(); await p.waitForTimeout(2000);
console.log("account esc=other domain ->", JSON.stringify((await errsOf(p)).filter(t=>t.length<140)));
await p.locator("input[name=companyEmail]").evaluate((e) => ({ ro: e.readOnly, dis: e.disabled })).then((r) => console.log("companyEmail:", JSON.stringify(r)));
await s.close();
