import { open } from "./lib.mjs";
const s = await open({ port: 3502, width: 375, engine: "webkit", name: "webkit-home-novideo" });
await s.page.route(/\.(mp4|webm)(\?|$)/, (r) => r.abort());
try {
  await s.page.goto(s.url("/"), { waitUntil: "load", timeout: 30000 });
  await s.page.waitForTimeout(2500);
  console.log("blocked video → ok", await s.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, btn: document.querySelector("header button[aria-label*=enu]")?.getBoundingClientRect().right })));
} catch (e) { console.log("blocked video →", e.message.split("\n")[0]); }
await s.close().catch(() => {});
