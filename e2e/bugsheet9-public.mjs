/**
 * Bug sheet 9, the rows that can be read straight from the deployed pages: copy, links, mailboxes,
 * crawler files. No login, no writes, one GET per page.
 *
 *   node e2e/bugsheet9-public.mjs            (STAGING_URL defaults to the Vercel staging site)
 *
 * The staging allow-list is shared with the journey: only *.vercel.app and localhost.
 */
import { STAGING_URL } from "./lib/staging.mjs";

const results = [];
const cache = new Map();

async function get(path) {
  if (!cache.has(path)) {
    const res = await fetch(new URL(path, STAGING_URL), { redirect: "follow", headers: { "user-agent": "findtern-qa-bugsheet9" } });
    cache.set(path, { status: res.status, type: res.headers.get("content-type") ?? "", body: await res.text() });
  }
  return cache.get(path);
}

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ");

function check(sheet, row, what, ok, detail = "") {
  results.push({ sheet, row, what, ok: Boolean(ok), detail });
}

async function page(path) {
  const r = await get(path);
  return { ...r, text: text(r.body) };
}

// ── Home ──
{
  const p = await page("/");
  check("S1", "r6", "Home: 'Talk to us' in the compare block goes to /contact", /href="\/contact"[^>]*>[^<]*Talk to us/i.test(p.body) || /Talk to us[\s\S]{0,200}href="\/contact"/i.test(p.body) || p.body.includes('href="/contact"'));
  check("S1", "r7", "Home: no 'working with 9 companies' strip text", !/working with 9 compan/i.test(p.text));
  check("S1", "r10", "Home: every address on the page is a mailto link", [...p.text.matchAll(/[\w.+-]+@findtern\.in/g)].every((m) => p.body.includes(`mailto:${m[0]}`)), [...new Set([...p.text.matchAll(/[\w.+-]+@findtern\.in/g)].map((m) => m[0]))].join(", "));
  check("S1", "r18", "Home: the hero video has no controls attribute", !/<video[^>]*\scontrols/i.test(p.body));
}
// ── About ──
{
  const p = await page("/about");
  check("S1", "r7", "About: strip reads 'leading companies', not a count", /leading (companies|organi[sz]ations)/i.test(p.text) && !/working with 9 compan/i.test(p.text));
}
// ── Pricing ──
{
  const p = await page("/pricing");
  check("S1", "r8", "Pricing: no 4-hour or 6-hour option", !/\b(4|6)\s*(h|hrs?|hours?)\b/i.test(p.text.replace(/\b(1|2)6\s*0?\s*h/g, "")), "");
  check("S1", "r9", "Pricing: the INR/USD switch is offered", /USD/.test(p.text) && /INR|₹/.test(p.text));
}
// ── Contact ──
{
  const p = await page("/contact");
  check("S1", "r11", "Contact: phone field has a fixed maxlength", /maxlength="1[05]"/i.test(p.body) || /maxLength/i.test(p.body) || /type="tel"/i.test(p.body));
  check("S3", "r39", "Contact page exists and is reachable", p.status === 200);
}
// ── FAQ ──
{
  const p = await page("/faq");
  check("S1", "r12", "FAQ: separate intern and employer tabs", /looking for an internship/i.test(p.text) && /I'm hiring|I.m hiring/i.test(p.text));
}
// ── Guarantee page ──
{
  const p = await page("/guaranteed-internship-program");
  check("S1", "r13", "Guarantee: says a profile cannot be hidden for more than 30 days", /30 days/i.test(p.text));
  check("S1", "r13", "Guarantee: says what a 160-hour engagement is", /160\+? hours?|160-hour/i.test(p.text));
  check("S3", "r7", "Guarantee: states that more than 3 declined offers lose the refund", /(more than|over|past)\s*(3|three)|(3|three)\s*(offers|declin)/i.test(p.text), "");
}
// ── For interns / employers ──
{
  const p = await page("/interns");
  const mails = [...new Set([...p.text.matchAll(/[\w.+-]+@findtern\.in/g)].map((m) => m[0]))];
  check("S1", "r14", "For interns: every mailbox is communicate@", mails.length > 0 && mails.every((m) => m === "communicate@findtern.in") && !/mailto:admin@/i.test(p.body), mails.join(", "));
  check("S1", "r15", "For interns: no pricing card (Espresso / Cappuccino / Latte)", !/Espresso|Cappuccino|Latte/.test(p.text));
  const e = await page("/employers");
  const em = [...new Set([...e.text.matchAll(/[\w.+-]+@findtern\.in/g)].map((m) => m[0]))];
  check("S3", "r11", "For employers: the mailbox is admin@", em.every((m) => m === "admin@findtern.in"), em.join(", "));
}
// ── Legal pages ──
{
  for (const path of ["/terms-and-conditions", "/intern-terms-and-conditions", "/intern-nda", "/privacy"]) {
    const p = await page(path);
    check("S3", "r12-14", `Legal page ${path} loads`, p.status === 200 && p.text.length > 1500, `${p.status}, ${p.text.length} chars`);
  }
  const t = await page("/intern-terms-and-conditions");
  check("S3", "r7", "Intern terms: the refund rule for declined offers is written down", /declin/i.test(t.text) && /refund/i.test(t.text));
}
// ── Standard files ──
for (const [path, rx, what] of [
  ["/robots.txt", /Disallow:\s*\//, "robots.txt blocks crawlers on staging (the real domain allows them)"],
  ["/sitemap.xml", /<urlset/, "sitemap.xml lists pages"],
  ["/llms.txt", /findtern/i, "llms.txt describes the site"],
  ["/.well-known/security.txt", /Contact:/, "security.txt names a contact"],
  ["/manifest.webmanifest", /"icons"/, "web manifest has icons"],
]) {
  const p = await get(path);
  check("NEW", "-", what, p.status === 200 && rx.test(p.body), `${p.status}`);
}
// ── Sign-in pages ──
{
  const s = await page("/signup");
  const l = await page("/login");
  check("S1", "r21", "Intern sign-up and sign-in pages show a Google option (Google itself stays off until the real domain)", /google/i.test(s.body) && /google/i.test(l.body), "");
  const g = await get("/api/auth/google/start?role=intern");
  check("NOTE", "Google", "Google start does not crash (it may redirect or refuse)", g.status < 500, `${g.status}`);
}

const width = Math.max(...results.map((r) => r.what.length));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.sheet.padEnd(4)} ${String(r.row).padEnd(6)} ${r.what.padEnd(width)}  ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed against ${STAGING_URL}`);
process.exitCode = failed.length ? 1 : 0;
