import { open, shot, text } from "./lib.mjs";
const routes = ["/", "/about", "/pricing", "/contact", "/faq", "/interns", "/guaranteed-internship-program", "/intern-nda", "/intern-terms-and-conditions", "/terms-and-conditions", "/privacy", "/opportunities", "/blog"];
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-survey-${w}` });
  for (const r of routes) {
    const res = await s.page.goto(s.url(r), { waitUntil: "networkidle" });
    await s.page.waitForTimeout(800);
    const slug = r === "/" ? "home" : r.slice(1).replace(/\//g, "-");
    const p = await shot(s, `bs7mk-${slug}-${w}`, { fullPage: true });
    const emails = await s.page.evaluate(() => {
      const t = document.body.innerText; return [...new Set(t.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [])];
    });
    const mailto = await s.page.$$eval("a[href^='mailto:']", (a) => [...new Set(a.map((x) => x.getAttribute("href")))]);
    console.log(w, r, res.status(), p, "emails:", emails, "mailto:", mailto, "h", await s.page.evaluate(() => document.documentElement.scrollHeight), "overflowX", await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  }
  console.log(s.errors.slice(0,10));
  await s.close();
}
