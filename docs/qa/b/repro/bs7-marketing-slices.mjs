// usage: node bs7-marketing-slices.mjs /route width sliceHeight
import { open, text } from "./lib.mjs";
import { join } from "node:path";
import { SHOTS } from "./lib.mjs";
const [route = "/", w = "1440", sh = "1400"] = process.argv.slice(2);
const s = await open({ port: 3502, width: +w, name: "bs7mk-slices" });
await s.page.goto(s.url(route), { waitUntil: "networkidle" });
await s.page.waitForTimeout(800);
// trigger lazy/reveal animations
const H = await s.page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < H; y += 500) { await s.page.evaluate((y) => window.scrollTo(0, y), y); await s.page.waitForTimeout(120); }
await s.page.evaluate(() => window.scrollTo(0, 0)); await s.page.waitForTimeout(400);
const slug = route === "/" ? "home" : route.slice(1).replace(/\//g, "-");
let i = 0;
for (let y = 0; y < H; y += +sh) {
  const p = join(SHOTS, `bs7mk-${slug}-${w}-s${i}.png`);
  await s.page.screenshot({ path: p, fullPage: true, clip: { x: 0, y, width: +w, height: Math.min(+sh, H - y) } });
  console.log(p); i++;
}
await s.close();
