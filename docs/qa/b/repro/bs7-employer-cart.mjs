import { open, shot } from "./lib.mjs";
import { NEHA, body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-cart" });
const p = s.page;
await p.goto(s.url("/employer/cart"), { waitUntil: "networkidle" });
console.log((await body(p)).slice(250, 2500));
console.log(JSON.stringify(await p.$$eval("main a, main button", (e) => e.map((x) => (x.getAttribute("aria-label") || x.innerText || "").replace(/\s+/g, " ").trim().slice(0, 30) + "→" + (x.getAttribute("href") || "")))));
await shot(s, "bs7-emp-cart-1440", { fullPage: true });
await s.close();
