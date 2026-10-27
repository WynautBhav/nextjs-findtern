// usage: node bs7-marketing-grep.mjs /route "regex" [width]
import { open, text } from "./lib.mjs";
const [route, re, w = "1440"] = process.argv.slice(2);
const s = await open({ port: 3502, width: +w, name: "bs7mk-grep" });
await s.page.goto(s.url(route), { waitUntil: "networkidle" }); await s.page.waitForTimeout(800);
const t = await text(s);
const rx = new RegExp(re, "gi"); let m; let n = 0;
while ((m = rx.exec(t)) && n++ < 15) console.log("…" + t.slice(Math.max(0, m.index - 100), m.index + 160) + "…");
console.log("matches:", n);
await s.close();
