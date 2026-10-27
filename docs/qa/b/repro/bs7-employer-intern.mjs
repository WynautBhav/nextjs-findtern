import { open, shot } from "./lib.mjs";
import { body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, role: "intern", email: "qa.b.intern.941877@gmail.com", password: "Qa#Tester2026", width: 1440, height: 900, name: "bs7-emp-intern" });
const p = s.page;
await p.goto(s.url("/intern/dashboard"), { waitUntil: "networkidle" });
console.log(new URL(p.url()).pathname, (await body(p)).slice(0, 900));
console.log(await p.$$eval("a[href*='/intern/']", (a) => [...new Set(a.map((x) => x.getAttribute("href")))]));
console.log(await p.evaluate(async () => { const r = await fetch("/api/intern/profile"); return r.status + " " + (await r.text()).slice(0, 600); }));
await s.close();
