import { open, shot } from "./lib.mjs";
import { NEHA, body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-pages" });
const p = s.page;
for (const [name, path] of [["projects", "/employer/projects"], ["orders", "/employer/orders"], ["account", "/employer/account"]]) {
  await p.goto(s.url(path), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
  console.log(`=== ${name}:`, (await body(p)).slice(240, 2600));
  console.log(JSON.stringify(await p.$$eval("main input, main select, main textarea, main button, main a", (e) => e.filter(x=>x.getBoundingClientRect().width>0).map((x) => `${x.tagName[0]}:${x.type||""}:${x.name||""}:${(x.getAttribute("aria-label")||x.innerText||"").replace(/\s+/g," ").trim().slice(0,28)}${x.readOnly||x.disabled?":RO":""}`)).then(a=>a.slice(0,60))));
  await shot(s, `bs7-emp-${name}-1440`, { fullPage: true });
}
await s.close();
