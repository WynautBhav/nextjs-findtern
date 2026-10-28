// Tester B, 28 Oct: which admin pages still have a visible Filter / Apply button (DESIGN §0: filters apply on change)?
import { open, pick } from "./lib.mjs";
const s = await open({ port: 3502, ...pick("admin"), width: 1440, height: 900, name: "adm-applybtn" });
for (const r of ["interns","users","companies","projects","proposal-tracker","orders","intern-invoices","transactions","payouts","promo-codes","reports","reports/analytics","reports/money","messages","notification-history","website","cms"]) {
  await s.page.goto(s.url(`/admin/${r}`), { waitUntil: "networkidle" });
  const b = await s.page.locator("main button, main a, main input[type=submit]").evaluateAll((es) => es.filter((e) => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4; }).map((e) => (e.innerText || e.value || "").trim()).filter((t) => /^(Apply( range| dates)?|Filter|Search|Go|Update)$/i.test(t)));
  if (b.length) console.log(`/admin/${r}:`, b);
}
await s.close();
