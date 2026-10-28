// Tester B, 28 Oct: does the full Aadhaar/PAN of one candidate appear in any other admin page's HTML/RSC?
import { open } from "./lib.mjs";
const A = process.env.AADHAAR, P = process.env.PAN, id = process.env.INTERN;
const s = await open({ port: 3502, role: "admin", email: "e2e-admin@findtern.test", password: "E2e#Admin2026", name: "qa003-leak" });
for (const r of ["/admin/interns", `/admin/interns/${id}`, "/admin/users", "/admin/payouts", "/admin/transactions", "/admin/proposal-tracker", "/admin/companies", "/admin/reports"]) {
  for (const hdr of [{}, { RSC: "1" }]) {
    const res = await s.ctx.request.get(s.url(r), { headers: hdr });
    const b = await res.text();
    console.log(r, hdr.RSC ? "rsc" : "html", res.status(), "aadhaar:", b.includes(A), "pan:", b.includes(P));
  }
}
await s.close();
