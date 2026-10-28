import { open, shot, text, pick } from "./lib.mjs";
const PORT = process.env.PORT ?? (process.env.SEED ? 3503 : 3502);
const pages = {
  admin: ["/admin/dashboard", "/admin/transactions", "/admin/reports", "/admin/reports/money", "/admin/proposal-tracker", "/admin/companies"],
  employer: ["/employer/orders", "/employer/dashboard"],
};
for (const [role, routes] of Object.entries(pages)) {
  const s = await open({ port: PORT, ...pick(role), name: `qa-007-${role}-${PORT}` });
  for (const r of routes) {
    await s.page.goto(s.url(r), { waitUntil: "networkidle" });
    const t = await text(s);
    console.log(`\n=== ${role} ${r}\n${t.slice(0, 900)}`);
    await shot(s, `qa-007-${r.replace(/\W+/g, "-").slice(1)}-${PORT}`, { fullPage: false });
  }
  await s.close();
}
