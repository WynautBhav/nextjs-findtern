import { open } from "./lib.mjs";
const s = await open({ port: 3502, width: 375, name: "bs7-google" });
for (const r of ["/login", "/signup", "/employer/login", "/employer/signup", "/college/login", "/admin/login"]) {
  await s.page.goto(s.url(r), { waitUntil: "networkidle" });
  console.log(r, JSON.stringify(await s.page.$$eval("a[href*='google']", (a) => a.map((x) => `${x.innerText.trim()} → ${x.getAttribute("href")}`))));
}
await s.close();
