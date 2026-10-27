import { open, shot } from "./lib.mjs";
import { NEHA, body, small, hscroll } from "./bs7-employer-lib.mjs";
const ENGINE = process.argv[2] ?? "chromium";
const s = await open({ port: 3502, ...NEHA, width: 375, height: 812, engine: ENGINE, name: "bs7-emp-phone-sweep-" + ENGINE });
const p = s.page;
const known = /Skip to content|Ask me|Dismiss|Findtern home/;
for (const [n, path] of [["dashboard", "/employer/dashboard"], ["projects", "/employer/projects"], ["proposals", "/employer/proposals"], ["schedule", "/employer/schedule"], ["orders", "/employer/orders"], ["account", "/employer/account"], ["checkout", "/employer/checkout"], ["compare", "/employer/compare?ids=333cab93-5cc8-4c7d-9e4a-190e8eedb654,bf5e910d-6439-4691-9d51-edb7d2293ac1"], ["proposal", "/employer/proposal/d4742141-2e38-4e87-9f16-2bbf1b7d4ff4"]]) {
  await p.goto(s.url(path), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3200);
  const hs = await hscroll(p);
  const sm = (await small(p)).filter((t) => !known.test(t));
  // text cut off: elements whose scrollWidth > clientWidth with overflow hidden/ellipsis
  const cut = await p.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => e.children.length === 0 && e.innerText && e.scrollWidth > e.clientWidth + 1 && ["hidden", "clip"].includes(getComputedStyle(e).overflowX) && e.getBoundingClientRect().width > 0).map((e) => e.innerText.trim().slice(0, 30)).slice(0, 5));
  console.log(`## ${n}: hscroll ${hs.sw}/${hs.cw}${hs.sw > hs.cw ? " OVERFLOW" : ""} | small(${sm.length}):`, JSON.stringify([...new Set(sm)].slice(0, 12)), "| cut:", JSON.stringify(cut));
  await shot(s, `bs7-emp-phone-${n}-${ENGINE}`, { fullPage: false });
}
await s.close();
