import { open, shot } from "./lib.mjs";
import { NEHA, body, small, hscroll } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-cand2" });
const p = s.page;
await p.goto(s.url("/employer/candidates"), { waitUntil: "networkidle" });
const t = await body(p);
console.log("'+N more' occurrences:", t.match(/\+\s?\d+ more/g));
console.log("score tiles missing?:", (t.match(/AI interview/g)||[]).length);
await shot(s, "bs7-emp-cand-top-1440", { fullPage: false });
// filter sidebar: expand all sections
for (const name of ["Laptop", "Hourly price", "Ratings", "Location"]) {
  const b = p.locator(`aside button:has-text("${name}"), summary:has-text("${name}")`).first();
  console.log(name, "toggle exists:", await b.count());
}
console.log("project select options:", await p.locator("select[name=project] option").allTextContents());
console.log("project select value:", await p.locator("select[name=project]").inputValue());
console.log("sort opts:", await p.locator("select[name=sort] option").allTextContents(), await p.locator("select[name=plan] option").allTextContents());
console.log("filters via query:", await p.$$eval("form [name]", (e) => e.map((x) => x.name + "=" + (x.type === "checkbox" ? x.checked : x.value)).join("&")));
console.log("url:", p.url());
// switch project
const opts = await p.locator("select[name=project] option").evaluateAll((o) => o.map((x) => [x.value, x.text]));
for (const [v, tx] of opts) {
  await p.goto(s.url("/employer/candidates?project=" + v), { waitUntil: "networkidle" });
  const t2 = await body(p);
  console.log("project", tx, "->", t2.match(/Required skills (.{0,120}?)Skills from/)?.[1], "|", t2.match(/Matched to[^.]{0,200}/)?.[0], "|", t2.match(/\d+ interns? match/)?.[0], "| url", p.url().replace(s.origin, ""));
}
await s.close();
