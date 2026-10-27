// usage: node bs7-marketing-shot.mjs /route width name "selector-or-text" [heightpx]
import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
const [route, w, name, needle, h = "900"] = process.argv.slice(2);
const s = await open({ port: 3502, width: +w, height: +h, name: "bs7mk-shot" });
await s.page.goto(s.url(route), { waitUntil: "networkidle" }); await s.page.waitForTimeout(600);
const H = await s.page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < H; y += 500) { await s.page.evaluate((y) => window.scrollTo(0, y), y); await s.page.waitForTimeout(60); }
const loc = needle.startsWith("css:") ? s.page.locator(needle.slice(4)).first() : s.page.getByText(needle, { exact: false }).first();
await loc.scrollIntoViewIfNeeded(); await s.page.evaluate(() => window.scrollBy(0, -100)); await s.page.waitForTimeout(500);
await s.page.screenshot({ path: join(SHOTS, `${name}.png`) });
console.log(`docs/qa/b/screens/${name}.png`, s.page.url());
await s.close();
