import { open, shot } from "./lib.mjs";
import { NEHA, body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-cand3" });
const p = s.page;
const cards = () => p.evaluate(() => [...document.querySelectorAll("main article, main [data-candidate], main li")].filter(e=>/AI interview/.test(e.innerText)&&e.innerText.length<1500).map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 400)));
await p.goto(s.url("/employer/candidates"), { waitUntil: "networkidle" });
let c = await cards();
console.log("cards found", c.length);
console.log("sample card:", c[0]);
// row 123: each card contains React or SQL?
let bad = c.filter((x) => !/React|SQL/.test(x));
console.log("cards without React/SQL:", bad.length, bad.slice(0,2));
// AI interview score zero/dash?
console.log("cards with AI interview 0/--:", c.filter((x) => /AI interview (0\.0|—|-|n\/a)/i.test(x)).length);
// Show everyone
await p.getByRole("link", { name: "Show everyone" }).click(); await p.waitForLoadState("networkidle");
console.log("show everyone url:", p.url().replace(s.origin, ""), (await body(p)).match(/\d+ (interns|candidates)[^.]{0,40}/)?.[0]);
c = await cards();
console.log("everyone: cards", c.length, "without AI score tile value:", c.filter((x) => !/AI interview \d/.test(x)).length);
// add a skill
await p.goto(s.url("/employer/candidates"), { waitUntil: "networkidle" });
const search = p.locator("input[placeholder*='Search & add skills']");
await search.fill("Figma"); await p.waitForTimeout(600);
console.log("skill suggestions:", await p.$$eval("[role=listbox] [role=option], [role=option]", (o) => o.map((x) => x.textContent.trim()).slice(0, 5)));
await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter"); await p.waitForTimeout(1500);
console.log("after add Figma:", p.url().replace(s.origin, ""), (await body(p)).match(/\d+ (interns|candidates)[^.]{0,40}/)?.[0], (await body(p)).match(/Required skills (.{0,80}?)Skills from/)?.[1]);
// switch project via select: do skills reset?
await p.locator("select[name=project]").selectOption({ label: "Robotics Software Intern" });
await p.waitForTimeout(500);
await p.getByRole("button", { name: "Apply" }).click().catch(()=>{});
await p.waitForLoadState("networkidle"); await p.waitForTimeout(1000);
console.log("after project change:", p.url().replace(s.origin, ""), (await body(p)).match(/Required skills (.{0,80}?)Skills from/)?.[1], (await body(p)).match(/\d+ (interns|candidates)[^.]{0,40}/)?.[0]);
await shot(s, "bs7-emp-cand-projswitch-1440", { fullPage: false });
// pagination retention
await p.goto(s.url("/employer/candidates?project=c0754b5c-9c72-42f6-a06f-6303d6b8de15"), { waitUntil: "networkidle" });
console.log("pager hrefs:", await p.$$eval("a[href*='page=']", (a) => a.map((x) => x.getAttribute("href")).slice(0, 4)));
await p.locator("a[href*='page=2']").first().click(); await p.waitForLoadState("networkidle");
console.log("page 2 url:", p.url().replace(s.origin, ""), "select:", await p.locator("select[name=project] option:checked").innerText());
await p.locator("aside a:has-text('Dashboard'), nav a:has-text('Dashboard')").first().click(); await p.waitForLoadState("networkidle");
await p.locator("a:has-text('Candidates')").first().click(); await p.waitForLoadState("networkidle");
console.log("after dashboard->candidates:", p.url().replace(s.origin, ""), "select:", await p.locator("select[name=project] option:checked").innerText());
await p.goto(s.url("/employer/compare")); await p.locator("a:has-text('Candidates')").first().click(); await p.waitForLoadState("networkidle");
console.log("after compare->candidates:", p.url().replace(s.origin, ""), "select:", await p.locator("select[name=project] option:checked").innerText());
await s.close();
