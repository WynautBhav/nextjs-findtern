import { open, shot } from "./lib.mjs";
import { NEHA, body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, ...NEHA, width: 1440, height: 900, name: "bs7-emp-cand4" });
const p = s.page;
await p.goto(s.url("/employer/candidates?project=c0754b5c-9c72-42f6-a06f-6303d6b8de15"), { waitUntil: "networkidle" });
await p.goto(s.url("/employer/cart"), { waitUntil: "networkidle" });
await p.goto(s.url("/employer/candidates"), { waitUntil: "networkidle" });
console.log("127: bare /employer/candidates after visiting other page ->", p.url().replace(s.origin,""), "| project select:", await p.locator("select[name=project] option:checked").innerText());
console.log("cookies:", (await s.ctx.cookies()).map(c=>c.name).join(","));
// real pagination click
await p.locator("a[href*='page=2']").first().scrollIntoViewIfNeeded();
await p.locator("a[href*='page=2']").first().click(); await p.waitForTimeout(2500);
console.log("page2 url:", p.url().replace(s.origin,""), (await body(p)).match(/Showing[^A-Z]{0,20}/)?.[0]);
// Show everyone
await p.goto(s.url("/employer/candidates"), { waitUntil: "networkidle" });
const se = p.getByText("Show everyone").first();
console.log("show everyone tag:", await se.evaluate((e) => e.tagName + " " + (e.getAttribute("href")||"")));
await se.click(); await p.waitForTimeout(2000);
console.log("after click:", p.url().replace(s.origin,""), (await body(p)).match(/\d+ interns match[^.]*\./)?.[0], (await body(p)).match(/Matched to[^.]{0,80}|Showing everyone[^.]{0,80}/)?.[0]);
// Remote checkbox
await p.goto(s.url("/employer/candidates"), { waitUntil: "networkidle" });
const before = (await body(p)).match(/(\d+) interns match/)?.[1];
await p.locator("input[name=remote][type=checkbox]").check(); await p.waitForTimeout(500);
await p.getByRole("button", { name: "Apply" }).click(); await p.waitForTimeout(2500);
console.log("95: remote count before/after", before, (await body(p)).match(/(\d+) interns match/)?.[1], p.url().replace(s.origin,""));
await s.close();
