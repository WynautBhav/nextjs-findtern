import { open, shot } from "./lib.mjs";
import { NEHA, body, errsOf } from "./bs7-employer-lib.mjs";
import { dump } from "./dump.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-book" });
const p = s.page;
const ids = ["333cab93-5cc8-4c7d-9e4a-190e8eedb654", "bf5e910d-6439-4691-9d51-edb7d2293ac1", "8a7f610b-9ab9-49f0-bcb0-a0e9a88aa777"];
for (const id of ids) {
  await p.goto(s.url(`/employer/intern/${id}?project=3ec5cc1b-f14f-4ad2-af2b-962528b989b3`), { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /^Shortlist$/ }).click().catch((e) => console.log("shortlist btn:", e.message.slice(0, 60)));
  await p.waitForTimeout(1200);
}
await p.goto(s.url("/employer/cart"), { waitUntil: "networkidle" });
const t = await body(p);
console.log(t.slice(250, 2200));
console.log("ORDER (initials/status):", (await p.$$eval("main article, main li", (e) => e.map((x) => x.innerText.replace(/\s+/g, " ").slice(0, 60)))));
console.log(JSON.stringify(await p.$$eval("main a, main button", (e) => e.map((x) => (x.getAttribute("aria-label") || x.innerText || "").replace(/\s+/g, " ").trim().slice(0, 30) + "→" + (x.getAttribute("href") || "")))));
await shot(s, "bs7-emp-cart-shortlisted-1440", { fullPage: true });
await s.close();
