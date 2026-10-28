import { open, shot } from "./lib.mjs";
import { NEHA, body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-compare2" });
const p = s.page;
// find candidates w/ most skills across list pages (pf=0), by card skill chips
await p.goto(s.url("/employer/candidates?pf=0"), { waitUntil: "networkidle" });
const info = [];
for (let pg = 1; pg <= 3; pg++) {
  await p.goto(s.url(`/employer/candidates?pf=0&page=${pg}`), { waitUntil: "networkidle" });
  const rows = await p.$$eval("main article, main li", (e) => e.filter((x) => /AI interview/.test(x.innerText) && x.innerText.length < 1500).map((x) => ({ n: x.querySelectorAll("[class*=rounded-full]").length, href: x.querySelector("a[aria-label='Add to compare']")?.getAttribute("href"), t: x.innerText.replace(/\s+/g, " ").slice(0, 160) })));
  info.push(...rows);
}
info.sort((a, b) => b.n - a.n);
console.log(info.slice(0, 4).map((x) => x.n + " " + x.t));
const ids = info.slice(0, 2).map((x) => new URL(x.href, s.origin).searchParams.get("ids")).filter(Boolean);
console.log("ids", ids);
const DA = "3ec5cc1b-f14f-4ad2-af2b-962528b989b3";
const idList = ids.map((x) => x.split(",").pop());
await p.goto(s.url(`/employer/compare?ids=${idList.join(",")}&project=${DA}`), { waitUntil: "networkidle" });
const t = await body(p);
console.log("surcharge mentions:", t.match(/.{40}(surcharge|placement).{60}/gi));
console.log(t.slice(t.indexOf("Project fit"), t.indexOf("Project fit") + 1400));
await shot(s, "bs7-emp-compare-skills-1440", { fullPage: true });
await s.close();
