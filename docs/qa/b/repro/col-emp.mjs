// Tester B, 28 Oct: a drive seen by the public, by an employer who never joined, by one who did, and after the link is closed.
// Usage: node col-emp.mjs [chromium|webkit] [375|1440]
import { open, shot } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const H = width < 500 ? 812 : 900;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
// 1. college creates a drive, keeps the link
const c = await open({ port: 3502, role: "college", email: "tpo@jklu.edu.in", password: "Findtern@2026", width, height: H, engine, name: `col-emp-c-${engine}-${width}` });
await c.page.goto(c.url("/college/drives/new"), { waitUntil: "networkidle" });
await c.page.getByPlaceholder("e.g. Summer internship drive 2027").fill(`QA-B public ${Date.now() % 100000}`);
await c.page.getByRole("button", { name: /Create drive|Create/ }).first().click(); await c.page.waitForTimeout(2500);
const driveId = c.page.url().split("/").pop();
const html = await c.page.content();
const token = html.match(/\/drive\/([A-Za-z0-9_-]{20,})/)?.[1];
log("created", { driveId, tokenFound: !!token });
// 2. signed out, public page
const p = await open({ port: 3502, width, height: H, engine, name: `col-emp-p-${engine}-${width}` });
let r = await p.page.goto(p.url(`/drive/${token}`), { waitUntil: "networkidle" });
log("public (live, signed out)", { status: r.status(), text: (await p.page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300) });
await shot(p, `col-emp-${engine}-${width}-public-live`);
// 3. employer who never joined
const e = await open({ port: 3502, role: "employer", email: "neha@acmerobotics-launchtest.in", password: "Launch#2026pw", width, height: H, engine, name: `col-emp-e-${engine}-${width}` });
r = await e.page.goto(e.url(`/employer/drives/${driveId}`), { waitUntil: "networkidle" });
const nt = (await e.page.locator("main").innerText()).replace(/\s+/g, " ");
log("employer, never joined", { status: r.status(), text: nt.slice(0, 300), showsTitle: /QA-B public/.test(nt), showsDates: /\d{1,2} (Oct|Nov|Dec)/.test(nt) });
await shot(e, `col-emp-${engine}-${width}-not-joined`, { fullPage: false });
// 4. employer on a drive it joined
await e.page.goto(e.url("/employer/drives"), { waitUntil: "networkidle" });
const joined = await e.page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\/employer\/drives\/[0-9a-f-]{20,}/.test(h)));
log("employer drives list links", joined.length);
log("employer drives list text", (await e.page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 260));
if (joined[0]) { r = await e.page.goto(e.url(joined[0]), { waitUntil: "networkidle" }); log("employer, joined", { status: r.status(), text: (await e.page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 320) }); await shot(e, `col-emp-${engine}-${width}-joined`, { fullPage: false }); }
// 5. close the link, public again
await c.page.goto(c.url(`/college/drives/${driveId}`), { waitUntil: "networkidle" });
await c.page.getByRole("button", { name: /Close link now/ }).click(); await c.page.waitForTimeout(500);
await c.page.getByRole("button", { name: /Yes, close|Close the link|Yes/ }).first().click(); await c.page.waitForTimeout(1800);
r = await p.page.goto(p.url(`/drive/${token}`), { waitUntil: "networkidle" });
log("public (closed link, signed out)", { status: r.status(), text: (await p.page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 260) });
await shot(p, `col-emp-${engine}-${width}-public-closed`);
r = await e.page.goto(e.url(`/employer/drives/${driveId}`), { waitUntil: "networkidle" });
log("employer on closed drive", { status: r.status(), text: (await e.page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200) });
log("errors", [...new Set([...c.errors, ...p.errors, ...e.errors])].filter((x) => !/avatar|googletag|CONNECTION_RESET|TLS|\/tr\//.test(x)).slice(0, 4));
await c.close(); await p.close(); await e.close();
