// Shared helpers for the WP2 scripts: college login and page fetch on the local build.
import { assertLocalOnly } from "./lib/local-only.mjs";
export const BASE = process.env.WP2_BASE ?? "http://localhost:3332"; // not $BASE: the shell env is shared and can point at another package
assertLocalOnly(BASE);
const rnd = () => `10.8.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;
export async function login(email = "tpo@jklu.edu.in", path = "/api/auth/college/login", password = "Findtern@2026") {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": rnd() }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`login ${r.status}`);
  const jar = r.headers.getSetCookie().map((c) => c.split(";")[0]);
  const csrf = decodeURIComponent(jar.find((c) => c.startsWith("ft_csrf="))?.slice(8) ?? "");
  const cookie = jar.join("; ");
  return {
    cookie, csrf,
    get: (p, extra = {}) => fetch(`${BASE}${p}`, { headers: { cookie, ...extra } }),
    post: (p, body) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie, "x-csrf-token": csrf }, body: JSON.stringify(body) }),
  };
}
export function parseCsv(text) {
  const rows = [[]];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++; else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ",") rows.at(-1).push(cell), (cell = "");
    else if (ch === "\n") rows.at(-1).push(cell.replace(/\r$/, "")), rows.push([]), (cell = "");
    else cell += ch;
  }
  if (cell || rows.at(-1).length) rows.at(-1).push(cell);
  return rows.filter((r) => r.length > 1);
}
