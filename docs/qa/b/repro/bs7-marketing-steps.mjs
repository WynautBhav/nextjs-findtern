import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, height: 900, name: "bs7mk-steps" });
  await s.page.goto(s.url("/"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(600);
  const H = await s.page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 400) { await s.page.evaluate((y) => window.scrollTo(0, y), y); await s.page.waitForTimeout(60); }
  const o = await s.page.evaluate(() => {
    const labels = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /^STEP \d$/i.test(e.textContent.trim()));
    return labels.map((l) => {
      const card = l.parentElement; const title = [...card.querySelectorAll("*")].find((e) => e !== l && e.children.length === 0 && e.textContent.trim() && !/^STEP/i.test(e.textContent.trim()));
      const body = [...card.querySelectorAll("p,span,div")].filter((e) => e.children.length === 0).slice(-1)[0];
      const cs = (e) => { const c = getComputedStyle(e); return `${c.fontSize}/${c.fontWeight}/lh${c.lineHeight}`; };
      return { step: l.textContent.trim(), label: cs(l), title: title.textContent.trim() + " " + cs(title), body: body.textContent.trim().slice(0, 70) + " " + cs(body) };
    });
  });
  console.log(w); o.forEach((r) => console.log("  ", JSON.stringify(r)));
  const t = await s.page.evaluate(() => document.body.innerText);
  console.log("  'skill-based' on home:", /skill[- ]based/i.test(t), (t.match(/.{40}skill[- ]based.{40}/i) ?? [])[0]);
  await s.page.evaluate(() => [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /^STEP 1$/i.test(e.textContent.trim())).scrollIntoView({ block: "start" })); await s.page.evaluate(() => scrollBy(0, -140)); await s.page.waitForTimeout(500);
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-steps-${w}.png`) });
  await s.close();
}
