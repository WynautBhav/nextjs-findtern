// WP2 C1: opens 40 heat-matrix / categories numbers as the Overview pop-up and compares the pop-up list size with the number clicked. Cwd = worktree.
import { openRoles, closeAll } from "./lib/ctx.mjs";
import { assertLocalOnly } from "./lib/local-only.mjs";
const base = process.env.WP2_BASE ?? "http://localhost:3332";
assertLocalOnly(base);
const { browser, ctxs } = await openRoles(["tpo"], { base });
const p = await ctxs.tpo.newPage();
await p.goto(`${base}/college?mode=categories&design=1`, { waitUntil: "load" }); await p.waitForTimeout(700);
let bad = 0, n = 0;
const links = await p.$$eval('[role=tabpanel] a[aria-label]', (as) => as.map((a) => a.getAttribute("aria-label")).filter((l) => /\d+ students/.test(l)));
for (const label of links.slice(0, 40)) {
  const want = +label.match(/(\d+) students/)[1];
  await p.locator(`[role=tabpanel] a[aria-label="${label.replace(/"/g, '\\"')}"]`).first().click();
  await p.waitForSelector("[role=dialog] section[aria-label='Master data table']");
  const t = await p.locator("[role=dialog] section[aria-label='Master data table']").innerText();
  const got = +t.match(/([\d,]+)\s+of\s/)[1].replace(/,/g, "");
  const body = await p.locator("[role=dialog][data-slot=dialog-content]").innerText();
  const leak = /Waiting for approval/.test(body);
  n++; if (got !== want || leak) { bad++; console.log("FAIL", label, "popup", got, leak ? "(shows unverified)" : ""); }
  await p.keyboard.press("Escape"); await p.waitForSelector("[role=dialog][data-slot=dialog-content]", { state: "detached" });
}
console.log({ popups: n, bad });
await closeAll(browser);
process.exit(bad ? 1 : 0);
