import { open, shot } from "./lib.mjs";
import { loadState, body } from "./bs7-employer-lib.mjs";
const st = loadState();
let s = await open({ port: 3502, role: "employer", email: st.email, password: "Qa#Tester2026", width: 1280, height: 900, name: "bs7-tzchange" });
let p = s.page;
console.log("now:", new Date().toISOString(), new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" }), "IST");
await p.goto(s.url("/employer/cart"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3500);
await p.getByRole("button", { name: "Book meeting" }).first().click(); await p.waitForTimeout(1000);
const dlg = p.locator("[data-slot=dialog-content]");
const read = async (l) => console.log(l, "tz:", await dlg.locator("select").last().inputValue(), "| dates:", await dlg.locator("input[type=date]").evaluateAll(e=>e.map(x=>x.value)), "| times:", await dlg.locator("select").evaluateAll(e=>e.slice(0,3).map(x=>x.value)), "| min date:", await dlg.locator("input[type=date]").first().getAttribute("min"));
await read("default  ");
for (const tz of ["America/New_York", "Asia/Dubai", "Pacific/Auckland"]) {
  await dlg.locator("select").last().selectOption(tz); await p.waitForTimeout(700);
  console.log(tz, "now there:", new Date().toLocaleString("en-GB", { timeZone: tz }));
  await read("changed  ");
}
console.log("hint:", (await dlg.innerText()).match(/(Set from|Changed|candidate sees)[^.]*\./)?.[0]);
await shot(s, "bs7-emp-book-tz-nz-1280", { fullPage: false });
await dlg.getByRole("button", { name: "Cancel" }).click();
await p.goto(s.url("/employer/send-proposal"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
console.log("acct1 send-proposal tz default:", await p.locator("select[name=timezone]").inputValue().catch(() => "n/a"));
await s.close();
s = await open({ port: 3502, role: "employer", email: st.emailW, password: "Qa#Tester2026", width: 1280, height: 900, name: "bs7-tzchange2" });
p = s.page;
await p.goto(s.url("/employer/send-proposal?intern=333cab93-5cc8-4c7d-9e4a-190e8eedb654"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
console.log("UAE acct send-proposal tz default:", await p.locator("select[name=timezone]").inputValue().catch(() => "n/a"));
await p.locator("select[name=timezone]").selectOption("America/New_York");
console.log("changed to NY ->", await p.locator("select[name=timezone]").inputValue(), "| hint:", (await body(p)).match(/The working hours and interview slots use this zone[^.]*\.?/)?.[0]);
await s.close();
