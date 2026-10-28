// Tester B, 28 Oct: what does "Deactivate" / "Hide" do on a candidate row (throwaway Qab Tester account, local copy)?
import { open, shot, pick } from "./lib.mjs";
const s = await open({ port: 3502, ...pick("admin"), width: 1440, height: 900, name: "adm-deactivate" });
const { page } = s;
const dlgs = []; page.on("dialog", async (d) => { dlgs.push(`${d.type()}: ${d.message().slice(0,90)}`); await d.accept(); });
const reqs = []; page.on("request", (r) => r.method() !== "GET" && reqs.push(`${r.method()} ${new URL(r.url()).pathname}`));
await page.goto(s.url("/admin/interns?q=qa.b.intern.2276542"), { waitUntil: "networkidle" });
const b = page.getByRole("button", { name: /^Deactivate$/ }).first();
console.log("button:", await b.evaluate((e) => ({ text: e.innerText, disabled: e.disabled, type: e.type, aria: e.getAttribute("aria-label"), html: e.outerHTML.slice(0, 200) })));
await b.click(); await page.waitForTimeout(1500);
console.log("requests after 1 click:", reqs);
console.log("row text now:", (await page.locator("main tbody tr").first().innerText()).replace(/\s+/g, " ").slice(0, 200));
console.log("native dialogs:", dlgs);
console.log("dialogs/popovers:", await page.locator("[role=dialog], [role=alertdialog], [data-radix-popper-content-wrapper]").count());
await shot(s, "adm-deactivate-after-click", { fullPage: false });
await page.getByRole("button", { name: /^Activate$/ }).first().click(); await page.waitForTimeout(1200);
console.log("restored; requests:", reqs);
await s.close();
