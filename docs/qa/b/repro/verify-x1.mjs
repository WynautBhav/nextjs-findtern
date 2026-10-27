import { open } from "./lib.mjs";
for (const engine of ["chromium", "webkit"]) {
  const s = await open({ port: 3502, width: 375, engine, name: `verify-x1-${engine}` });
  for (const r of ["/", "/faq", "/pricing"]) {
    await s.page.goto(s.url(r), { waitUntil: "networkidle" });
    console.log(engine, r, await s.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, btn: (() => { const b = document.querySelector("header button[aria-label*=enu]"); const r = b?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.right)] : null; })() })));
  }
  await s.close();
}
