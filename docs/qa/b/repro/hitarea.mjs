// Tester B, 28 Oct: real tap area of small controls. An element whose own box is under 44 px passes when the points
// 22 px away from its centre (left/right/up/down, inside the viewport) still hit the element, its label or its link.
// Usage: PORT=3502 ROLE=admin|intern|college [EMAIL=.. PASSWORD=..] node hitarea.mjs <width> <path> [<path>...]
import { open, shot } from "./lib.mjs";
const width = Number(process.argv[2] ?? 375), paths = process.argv.slice(3);
const CRED = { admin: ["e2e-admin@findtern.test", "E2e#Admin2026"], intern: ["ritika.launchtest@gmail.com", "Launch#2026pw"], college: ["tpo@jklu.edu.in", "Findtern@2026"], employer: ["neha@acmerobotics-launchtest.in", "Launch#2026pw"] };
const role = process.env.ROLE ?? "admin";
const s = await open({ port: process.env.PORT ?? 3502, role, email: process.env.EMAIL ?? CRED[role][0], password: process.env.PASSWORD ?? CRED[role][1], width, height: width < 500 ? 812 : 900, name: `hit-${role}-${width}` });
for (const p of paths) {
  await s.page.goto(s.url(p), { waitUntil: "networkidle" }); await s.page.waitForTimeout(400);
  const res = await s.page.evaluate(() => {
    const els = [...document.querySelectorAll("main a[href], main button, main input:not([type=hidden]), main select, main textarea, main [role=switch], main [role=checkbox]")];
    let total = 0; const bad = [];
    for (const e of els) {
      const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
      const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") continue;
      total++;
      const host = e.closest("label, a, button") ?? e;
      const hitsHost = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || host.contains(t) || (t.closest("label, a, button") && t.closest("label, a, button") === host)); };
      e.scrollIntoView({ block: "center" });
      const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const pts = [[cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]].filter(([x, y]) => x > 0 && y > 0 && x < innerWidth && y < innerHeight);
      const wOK = r.width >= 44 || (hitsHost(cx - 21, cy) && hitsHost(cx + 21, cy)) || r.width >= 40;
      const hOK = r.height >= 44 || (hitsHost(cx, cy - 21) && hitsHost(cx, cy + 21)) || r.height >= 40;
      if (!(wOK && hOK) && (r.width < 40 || r.height < 40)) bad.push(`${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute("aria-label") || e.value || e.type).toString().trim().replace(/\s+/g, " ").slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return { total, bad: [...new Set(bad)] };
  });
  console.log(`${p} @${width}: ${res.total} controls, ${res.bad.length} with a hit area under 44 px${res.bad.length ? " → " + res.bad.slice(0, 6).join(" | ") : ""}`);
}
await s.close();
