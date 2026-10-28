import { open, shot } from "./lib.mjs";
import { NEHA, body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-filters" });
const p = s.page;
const DA = "3ec5cc1b-f14f-4ad2-af2b-962528b989b3";
const run = async (q) => {
  await p.goto(s.url(`/employer/candidates?project=${DA}&pf=0&${q}`), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
  const cards = await p.$$eval("main ul > li", (l) => l.map((x) => x.innerText.replace(/\s+/g, " ")).filter((t) => /AI interview/.test(t)));
  console.log(q.padEnd(28), "count:", (await body(p)).match(/(\d+|No) interns? match/)?.[1], "| page1 cards:", cards.length,
    "| coding>=9:", cards.filter((t) => +(t.match(/Coding (\d+\.?\d*)/)?.[1] ?? 0) >= 9).length,
    "| comm>=9:", cards.filter((t) => +(t.match(/Comms (\d+\.?\d*)/)?.[1] ?? 0) >= 9).length,
    "| own laptop:", cards.filter((t) => /Own laptop/.test(t)).length, "| price:", [...new Set(cards.map((t) => t.match(/(₹\d+\/hr|Free)/)?.[1]))].join(","));
};
await run("");
await run("r_coding=9");
await run("r_communication=9");
await run("min=9");
await run("laptop=1");
await run("plan=standard");
await run("sort=coding");
await s.close();
