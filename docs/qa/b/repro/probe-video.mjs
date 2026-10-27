import { open, shot } from "./lib.mjs";
const s = await open({ port: 3502, width: Number(process.argv[2] ?? 1440), name: "bs7-video" });
await s.page.goto(s.url("/"), { waitUntil: "networkidle" });
await s.page.waitForTimeout(2500);
console.log(await s.page.$$eval("video", (v) => v.map((x) => ({ paused: x.paused, t: x.currentTime, ready: x.readyState }))));
console.log("buttons near video:", await s.page.$$eval("section:has(video) button", (b) => b.map((x) => (x.getAttribute("aria-label") || x.innerText).trim())));
await shot(s, `bs7-home-top-${process.argv[2] ?? 1440}`, { fullPage: false });
await s.close();
