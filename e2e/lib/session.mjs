/**
 * Sign-in helpers shared by the QA steps. The QA server runs with
 * TRUST_PROXY=1 (lib/qa-server.mjs), so each login carries its own
 * X-Forwarded-For and does not share the 8-per-15-minutes login bucket.
 */
import { baseUrl } from "./env.mjs";
import { LOGIN, PERSONAS } from "./personas.mjs";

let ipSeq = Math.floor(Math.random() * 60000) + 256;
export const nextIp = () => `10.78.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;

export const persona = (key) => {
  const p = PERSONAS.find((x) => x.key === key);
  if (!p) throw new Error(`unknown persona ${key}`);
  return p;
};

/** Log in through the API in a throwaway context; returns Playwright storageState. */
export async function loginState(browser, p) {
  const ctx = await browser.newContext();
  const spec = LOGIN[p.role];
  const res = await ctx.request.post(new URL(spec.api, baseUrl()).toString(), {
    data: spec.body(p),
    headers: { "x-forwarded-for": nextIp(), "content-type": "application/json" },
  });
  if (!res.ok()) {
    const detail = `login ${p.key} → HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`;
    await ctx.close();
    throw new Error(detail);
  }
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

/** "name=value; name2=value2" for a request header (Lighthouse). */
export const cookieHeader = (state) => state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

/** Where each persona lands, and the three dashboards the brief names. */
export const DASHBOARDS = [
  { key: "intern-hired", path: "/intern/dashboard" },
  { key: "employer-main", path: "/employer/dashboard" },
  { key: "admin", path: "/admin/dashboard" },
];

/** The college console's landing page, for runs that cover the fourth role. */
export const COLLEGE_HOME = { key: "college", path: "/college" };
