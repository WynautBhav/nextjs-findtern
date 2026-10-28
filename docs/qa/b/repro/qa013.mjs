import { open, shot, text, pick } from "./lib.mjs";
const PORT = process.env.PORT ?? 3503;
const s = await open({ port: PORT, ...pick("college"), width: 1440, name: `qa-013-${PORT}` });
await s.page.goto(s.url("/college/drives"), { waitUntil: "networkidle" });
console.log(await s.page.$$eval("main a[href^='/college/drives/']", (a) => a.map((x) => x.innerText.replace(/\s+/g, " ").trim().slice(0, 120))));
await shot(s, `qa-013-college-drives-${PORT}`, { fullPage: false });
await s.close();
