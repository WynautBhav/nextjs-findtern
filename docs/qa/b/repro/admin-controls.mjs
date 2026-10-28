import { open, shot, pick } from "./lib.mjs";
import { dump } from "./dump.mjs";
const [route, W = "375"] = process.argv.slice(2);
const s = await open({ port: 3502, ...pick("admin"), width: Number(W), name: `admin-controls-${W}` });
await s.page.goto(s.url(route), { waitUntil: "networkidle" });
console.log("scrollWidth", await s.page.evaluate(() => document.documentElement.scrollWidth), "/", W);
for (const c of (await dump(s.page)).filter((c) => !/^button$/.test(c.t) || c.h < 44 || /score|approve|save|pay|mark|reject|set/i.test(c.l))) console.log(JSON.stringify(c));
await shot(s, `admin-controls-${route.replace(/\W+/g, "-")}-${W}`, { fullPage: true });
await s.close();
