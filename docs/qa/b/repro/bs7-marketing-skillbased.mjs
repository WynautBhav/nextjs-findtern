import { open } from "./lib.mjs";
const s = await open({ port: 3502, width: 1440, name: "bs7mk-sb" });
for (const r of ["/", "/about", "/pricing", "/contact", "/faq", "/interns", "/employers", "/guaranteed-internship-program", "/blog", "/opportunities"]) {
  await s.page.goto(s.url(r), { waitUntil: "networkidle" });
  const t = await s.page.evaluate(() => document.documentElement.textContent);
  const m = t.match(/.{50}skill[- ]based.{50}/gi);
  const cal = /calendly/i.test(await s.page.content());
  console.log(r, "skill-based:", m ? m.slice(0, 2) : 0, "calendly:", cal);
}
await s.close();
