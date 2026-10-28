import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-guar-${w}` });
  await s.page.goto(s.url("/guaranteed-internship-program"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(600);
  const H = await s.page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 500) { await s.page.evaluate((y) => window.scrollTo(0, y), y); await s.page.waitForTimeout(80); }
  const o = await s.page.evaluate(() => {
    const h = [...document.querySelectorAll("h1,h2,h3")].find((x) => /does not cover/i.test(x.innerText));
    const sec = h.closest("section") ?? h.parentElement.parentElement;
    const r160 = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /160\+? hours/.test(e.innerText || ""));
    return { block: sec.innerText.replace(/\s+/g, " ").slice(0, 1500), r160: r160.map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 120)), y: Math.round(h.getBoundingClientRect().y + scrollY), items: [...sec.querySelectorAll("li")].map((li) => li.innerText.replace(/\s+/g, " ")) };
  });
  console.log(w, JSON.stringify(o, null, 1));
  await s.page.evaluate((y) => window.scrollTo(0, y - 80), o.y); await s.page.waitForTimeout(500);
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-guar-notcover-${w}.png`) });
  await s.close();
}
