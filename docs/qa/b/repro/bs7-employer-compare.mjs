import { open, shot } from "./lib.mjs";
import { NEHA, body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-compare" });
const p = s.page;
await p.goto(s.url("/employer/candidates"), { waitUntil: "networkidle" });
const links = p.locator("a:has-text('Compare')");
console.log("compare links:", await links.count(), await links.first().getAttribute("href"));
// add up to 6 via clicking
let n = 0;
for (let i = 0; i < 6; i++) {
  const l = p.locator("main a[aria-label='Add to compare']").first();
  if (!(await l.count())) break;
  const href = await l.getAttribute("href");
  await l.click(); await p.waitForTimeout(1200);
  n++;
  console.log(`click ${n}: url=${p.url().replace(s.origin,"")} href=${href}`);
  const t = await body(p);
  console.log("   ", t.match(/Compar(e|ing)[^.]{0,80}/g)?.slice(0, 3));
  if (!/candidates/.test(new URL(p.url()).pathname)) { await shot(s, `bs7-emp-compare-after-click${n}`, { fullPage: false }); break; }
}
await shot(s, "bs7-emp-compare-candidates-bar", { fullPage: false });
console.log("url", p.url().replace(s.origin, ""));
await p.goto(s.url("/employer/compare"), { waitUntil: "networkidle" });
console.log("compare page:", (await body(p)).slice(0, 2500));
await shot(s, "bs7-emp-compare-page-1440", { fullPage: true });
console.log(s.errors);
await s.close();
