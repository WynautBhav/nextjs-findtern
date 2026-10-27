import { open, shot } from "./lib.mjs";
import { NEHA, body, errsOf } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-prop6" });
const p = s.page;
// edit PH waiting offer: change to 6 months & hours, save
await p.goto(s.url("/employer/proposal/d4742141-2e38-4e87-9f16-2bbf1b7d4ff4?edit=1"), { waitUntil: "networkidle" });
console.log("edit PH buttons:", JSON.stringify(await p.$$eval("main button", (e) => e.filter(x=>x.getBoundingClientRect().width>0).map((x) => (x.innerText||"").trim().slice(0, 30)))));
await p.locator("main select").first().selectOption("6m").catch((e) => console.log("dur sel:", e.message.slice(0, 80)));
await p.locator("main textarea").first().fill("Analyse sales data, build weekly dashboards (edited).");
const save = p.getByRole("button", { name: /save|update|resend|send/i }).first();
console.log("save label:", await save.innerText());
await save.click(); await p.waitForTimeout(3000);
console.log("after edit:", p.url().replace(s.origin, ""), (await body(p)).match(/Length \d+ months|What the intern will do.{0,90}/g));
await shot(s, "bs7-emp-proposal-edited-1440", { fullPage: false });
// withdraw the duplicate accepted QT offer
await p.goto(s.url("/employer/proposal/3fffe5a3-4932-4000-945e-9633a8c72968"), { waitUntil: "networkidle" });
await p.getByRole("button", { name: /Withdraw offer/ }).click(); await p.waitForTimeout(1000);
console.log("withdraw confirm:", (await p.locator("[data-slot=dialog-content], [role=alertdialog]").first().innerText().catch(() => "no dialog")).replace(/\s+/g, " ").slice(0, 400));
await shot(s, "bs7-emp-withdraw-confirm-1440", { fullPage: false });
await p.getByRole("button", { name: /^(Withdraw|Yes|Confirm)/ }).last().click(); await p.waitForTimeout(2500);
console.log("after withdraw:", p.url().replace(s.origin, ""), (await body(p)).match(/(Withdrawn|Declined|withdrawn)[^.]{0,100}/)?.[0]);
await p.goto(s.url("/employer/proposals"), { waitUntil: "networkidle" });
console.log((await body(p)).match(/Waiting on candidate \d+ Accepted · payment due \d+ .{0,40}Hired \d+ Closed \d+/)?.[0]);
await s.close();
