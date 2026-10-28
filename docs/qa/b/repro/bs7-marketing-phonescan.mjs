import { open } from "./lib.mjs";
const routes = ["/", "/about", "/pricing", "/contact", "/faq", "/interns", "/employers", "/guaranteed-internship-program", "/opportunities", "/blog", "/login", "/signup", "/signup?role=employer", "/signup?role=intern", "/employer/signup", "/college", "/colleges"];
const s = await open({ port: 3502, width: 1440, name: "bs7mk-phonescan" });
for (const r of routes) {
  const res = await s.page.goto(s.url(r), { waitUntil: "networkidle" }).catch(() => null); await s.page.waitForTimeout(400);
  if (!res) continue;
  const o = await s.page.evaluate(() => ({ tel: document.querySelectorAll("input[type=tel]").length, ccSelects: [...document.querySelectorAll("select")].filter((e) => /\+\d/.test(e.options[0]?.text ?? "")).map((e) => e.options.length) }));
  console.log(r, res.status(), JSON.stringify(o));
}
await s.close();
