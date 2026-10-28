// Tester B, 28 Oct: QA-007 part 3 retest: an employer with accepted-but-unpaid offers (fresh seed, :3503).
import { open, shot } from "./lib.mjs";
const s = await open({ port: 3503, role: "employer", email: "careers@swiggy-labs.dev", password: "Findtern@2026", name: "qa007r-swiggy" });
const t = async (p) => { await s.page.goto(s.url(p), { waitUntil: "networkidle" }); return (await s.page.locator("main").innerText()).replace(/\s+/g, " "); };
for (const [p, re] of [["/employer/orders", /Orders & payments.{0,260}/], ["/employer/dashboard", /^.{0,330}/], ["/employer/proposals", /All \d+.{0,120}/], ["/employer/checkout", /Checkout.{0,420}/]]) console.log(p, "→", (await t(p)).match(re)?.[0]);
await shot(s, "qa007r-swiggy-orders", { fullPage: false });
await s.page.goto(s.url("/employer/orders"), { waitUntil: "networkidle" }); await shot(s, "qa007r-swiggy-orders", { fullPage: false });
await s.close();
