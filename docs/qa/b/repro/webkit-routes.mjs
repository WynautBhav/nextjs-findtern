import { open } from "./lib.mjs";
for (const r of ["/faq", "/pricing", "/about", "/contact", "/interns", "/employers", "/login", "/blog"]) {
  const s = await open({ port: 3502, width: 375, engine: "webkit", name: "webkit-routes" });
  try {
    await s.page.goto(s.url(r), { waitUntil: "load", timeout: 30000 });
    await s.page.waitForTimeout(1500);
    console.log(r, "ok", await s.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth].join("/")));
  } catch (e) { console.log(r, e.message.split("\n")[0]); }
  await s.close().catch(() => {});
}
