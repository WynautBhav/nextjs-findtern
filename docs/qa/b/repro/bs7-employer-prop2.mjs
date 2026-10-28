import { open, shot } from "./lib.mjs";
import { NEHA, body, errsOf } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-prop2" });
const p = s.page;
const DA = "3ec5cc1b-f14f-4ad2-af2b-962528b989b3";
await p.goto(s.url(`/employer/send-proposal?intern=bf5e910d-6439-4691-9d51-edb7d2293ac1&project=${DA}`), { waitUntil: "networkidle" });
const amt = () => p.locator("input[name=monthlyAmount]").inputValue();
console.log("amount @1 month default:", await amt(), "hours", await p.locator("input[name=monthlyHours]").inputValue());
for (const m of ["1 mo", "2 mo", "3 mo", "6 mo"]) { await p.locator(`main button:text-is("${m}")`).click(); await p.waitForTimeout(300); console.log(m, "-> amount", await amt()); }
for (const [k, v] of [["weeklySchedule", "mon_sat"], ["paidLeaves", "0"], ["paidLeaves", "3"]]) { await p.locator(`select[name=${k}]`).selectOption(v); await p.waitForTimeout(300); console.log(k, v, "-> hours", await p.locator("input[name=monthlyHours]").inputValue(), "amount", await amt()); }
await p.locator("select[name=weeklySchedule]").selectOption("mon_fri"); await p.locator("select[name=paidLeaves]").selectOption("2");
await p.locator(`main button:text-is("3 mo")`).click();
// past start date
await p.locator("input[name=startDate]").fill("2026-10-20");
await p.locator("textarea[name=message]").fill("Analyse sales data and build weekly dashboards.");
await p.getByRole("button", { name: "Review and send" }).click(); await p.waitForTimeout(1500);
console.log("past start ->", (await body(p)).match(/Review.{0,100}|[^.]*(past|future|later)[^.]*\./i)?.[0], JSON.stringify(await errsOf(p)));
await shot(s, "bs7-emp-sendprop-pastdate-1440", { fullPage: false });
await p.locator("input[name=startDate]").fill("2026-11-02");
await p.getByRole("button", { name: "Review and send" }).click(); await p.waitForTimeout(1500);
const t = await body(p);
console.log("REVIEW:", t.slice(t.indexOf("Review") > 0 ? t.indexOf("Review") : 250, (t.indexOf("Review") > 0 ? t.indexOf("Review") : 250) + 2500));
console.log(JSON.stringify(await p.$$eval("main button, [data-slot=dialog-content] button", (e) => e.filter(x=>x.getBoundingClientRect().width>0).map((x) => x.innerText.trim().slice(0, 40)))));
await shot(s, "bs7-emp-sendprop-review-1440", { fullPage: true });
await s.close();
