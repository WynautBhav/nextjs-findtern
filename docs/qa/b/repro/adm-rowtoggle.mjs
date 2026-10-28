// Tester B, 28 Oct: QA-145 retest, what the candidate row offers now and what Deactivate does (throwaway Qab Tester account, local copy).
import { open, shot, pick } from "./lib.mjs";
const w = Number(process.argv[2] ?? 1440);
const s = await open({ port: 3502, ...pick("admin"), width: w, height: 900, name: `adm-rowtoggle-${w}` });
const { page } = s;
const dlgs = []; page.on("dialog", async (d) => { dlgs.push(`${d.type()}: ${d.message().slice(0, 100)}`); await d.dismiss(); });
const reqs = []; page.on("request", (r) => r.method() !== "GET" && reqs.push(`${r.method()} ${new URL(r.url()).pathname}`));
await page.goto(s.url("/admin/interns?q=jklu.edu.in"), { waitUntil: "networkidle" });
const row = page.locator("main tbody tr, main li, main article").first();
console.log("row text:", (await row.innerText()).replace(/\s+/g, " ").slice(0, 200));
console.log("row controls:", await row.locator("button, [role=switch], [role=menuitem], a").evaluateAll((es) => es.map((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.innerText).trim().replace(/\s+/g, " ").slice(0, 30)}${e.getAttribute("role") ? "[" + e.getAttribute("role") + "]" : ""}`)));
await shot(s, `adm-rowtoggle-${w}`, { fullPage: false });
const sw = row.getByRole("button", { name: /^Deactivate$/ });
console.log("toggle found:", await sw.count());
if (await sw.count()) { await sw.click(); await page.waitForTimeout(900); console.log("after click: native dialogs", dlgs, "| in-page dialogs", await page.getByRole("dialog").count() + await page.getByRole("alertdialog").count(), "| requests", reqs); console.log("dialog text:", (await page.getByRole("alertdialog").or(page.getByRole("dialog")).first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200)); await shot(s, `adm-rowtoggle-${w}-click`, { fullPage: false }); }
await s.close();
