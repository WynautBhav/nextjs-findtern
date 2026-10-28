import { open, shot } from "./lib.mjs";
import { NEHA, body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-cand5" });
const p = s.page;
const DA = "3ec5cc1b-f14f-4ad2-af2b-962528b989b3";
await p.goto(s.url(`/employer/candidates?project=${DA}`), { waitUntil: "networkidle" });
console.log("per page hrefs:", await p.$$eval("a:has-text('per page')", (a) => a.map((x) => x.getAttribute("href"))));
const cnt = async () => (await body(p)).match(/(\d+) interns match/)?.[1];
console.log("DA default count", await cnt());
await p.goto(s.url(`/employer/candidates?project=${DA}&remote=1`), { waitUntil: "networkidle" });
console.log("DA +remote count", await cnt());
console.log("remote card tags:", (await p.$$eval("main article, main li", (e)=>e.filter(x=>/AI interview/.test(x.innerText)).map(x=>(x.innerText.match(/(Remote|Hybrid|On-site)[ ·A-Za-z-]*/)||[""])[0]))).slice(0,5));
// scan everyone for unscored
const per = (await p.$$eval("a:has-text('48 per page')", (a) => a[0]?.getAttribute("href"))) ;
console.log("48 href", per);
const seen=new Set();
for (let pg = 1; pg <= 8; pg++) {
  await p.goto(s.url(`/employer/candidates?pf=0&project=${DA}&page=${pg}`), { waitUntil: "networkidle" });
  const rows = await p.$$eval("main article, main li", (e) => e.filter((x) => /AI interview/.test(x.innerText) && x.innerText.length < 1500).map((x) => x.innerText.replace(/\s+/g, " ")));
  if (!rows.length) break;
  for (const r of rows) if (!/AI interview [1-9]/.test(r)) console.log("pg", pg, "UNSCORED:", r.slice(0, 220));
  rows.forEach(r=>seen.add(r));
}
console.log("distinct cards", seen.size);
// onsite city filter + remote
await p.goto(s.url(`/employer/candidates?project=${DA}&city=Pune`), { waitUntil: "networkidle" });
const c1 = (await body(p)).match(/(\d+) interns match/)?.[1];
await p.goto(s.url(`/employer/candidates?project=${DA}&city=Pune&remote=1`), { waitUntil: "networkidle" });
const c2 = (await body(p)).match(/(\d+) interns match/)?.[1];
console.log("city=Pune remote off/on:", c1, c2);
await p.goto(s.url(`/employer/candidates?project=${DA}&city=Zzzz`), { waitUntil: "networkidle" });
console.log("city=Zzzz off:", (await body(p)).match(/(\d+) interns match/)?.[1], (await body(p)).match(/No (interns|candidates)[^.]*\./)?.[0]);
await p.goto(s.url(`/employer/candidates?project=${DA}&city=Zzzz&remote=1`), { waitUntil: "networkidle" });
console.log("city=Zzzz on:", (await body(p)).match(/(\d+) interns match/)?.[1]);
await s.close();
