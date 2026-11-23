// R3-08: WCAG contrast of the college hero text colours against the real hero gradient stops.
// Reads the tokens from src/app/globals.css. Static, no server or DB:  node e2e/college-audit/hero-contrast.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)), "utf8");
const tok = (n) => { const m = css.match(new RegExp(`--color-${n}:\\s*(#[0-9a-fA-F]{6})`)); if (!m) throw new Error(`token ${n} not found`); return m[1]; };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// HeroPanel: bg-gradient-to-br from-brand-600 via-brand-800 to-brand-950, plus a brand-400/25 glow at the top right.
const stops = { "brand-600 (top-left, lightest)": rgb(tok("brand-600")), "brand-800 (middle)": rgb(tok("brand-800")), "brand-950 (bottom-right)": rgb(tok("brand-950")) };
// The glow sits at the top-right corner, where a to-br gradient is exactly the middle stop (brand-800); at its peak it is 25% brand-400.
stops["brand-400/25 glow over brand-800 (top-right)"] = mix(stops["brand-800 (middle)"], rgb(tok("brand-400")), 0.25);
// Pessimistic bound (the glow cannot reach the top-left corner, but if the box shape ever moves it could): reported, not enforced.
stops["glow over brand-600 (bound, not enforced)"] = mix(stops["brand-600 (top-left, lightest)"], rgb(tok("brand-400")), 0.25);
const texts = { "text-on-dark": rgb(tok("on-dark")), "text-on-dark-subtle (old)": rgb(tok("on-dark-subtle")), "text-white": [255, 255, 255] };

let fail = 0;
for (const [tn, tc] of Object.entries(texts)) for (const [sn, sc] of Object.entries(stops)) {
  const r = ratio(tc, sc);
  const must = !tn.includes("(old)") && !sn.includes("not enforced");
  const ok = r >= 4.5;
  if (must && !ok) fail++;
  console.log(`${tn.padEnd(28)} on ${sn.padEnd(46)} ${r.toFixed(2)}:1 ${ok ? "ok" : must ? "FAIL" : "below 4.5 (not enforced)"}`);
}
console.log(fail ? `hero contrast: ${fail} FAIL` : "hero contrast: PASS (text-on-dark and text-white >= 4.5:1 on every stop)");
process.exit(fail ? 1 : 0);
