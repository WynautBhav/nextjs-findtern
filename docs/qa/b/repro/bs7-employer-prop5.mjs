import { open, shot } from "./lib.mjs";
import { NEHA, body, errsOf } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-prop5" });
const p = s.page;
// accepted-and-unpaid QT offer: view + edit
for (const id of ["3fffe5a3-4932-4000-945e-9633a8c72968"]) {
  await p.goto(s.url(`/employer/proposal/${id}`), { waitUntil: "networkidle" });
  console.log("ACCEPTED VIEW buttons:", JSON.stringify(await p.$$eval("main a, main button", (e) => e.filter(x=>x.getBoundingClientRect().width>0).map((x) => (x.innerText||"").trim().slice(0, 30)))));
  console.log((await body(p)).match(/What happens next.{0,300}/)?.[0]);
  await shot(s, "bs7-emp-proposal-accepted-1440", { fullPage: false });
  await p.getByRole("button", { name: /Edit offer/ }).click(); await p.waitForTimeout(1500);
  console.log("edit mode:", (await body(p)).slice(300, 800));
  console.log(JSON.stringify(await p.$$eval("main input, main select, main textarea", (e) => e.filter(x=>x.getBoundingClientRect().width>0).map((x) => `${x.name||x.id}:${x.type}:${x.disabled?"DIS":"ok"}:${(x.value||"").slice(0,18)}`))));
  await shot(s, "bs7-emp-proposal-edit-accepted-1440", { fullPage: true });
}
await s.close();
