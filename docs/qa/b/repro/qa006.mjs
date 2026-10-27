import { open, shot, text } from "./lib.mjs";
const PORT = 3503;
const token = process.argv[2];
const s = await open({ port: PORT, width: 375, name: "qa-006" });
await s.page.goto(s.url(`/drive/${token}`), { waitUntil: "networkidle" });
console.log("drive page:", (await text(s)).slice(0, 200));
await shot(s, "qa-006-drive-signedout-375", { fullPage: false });
const links = await s.page.$$eval("a", (a) => a.map((x) => [x.innerText.trim(), x.getAttribute("href")]).filter(([t]) => /sign in|create/i.test(t)));
console.log(links);
await s.page.getByRole("link", { name: /create an employer account/i }).click();
await s.page.waitForLoadState("networkidle");
console.log("after click →", new URL(s.page.url()).pathname + new URL(s.page.url()).search);
for (const bad of ["x".repeat(30), "%00".repeat(10), "a".repeat(101)]) {
  const r = await s.page.goto(s.url(`/drive/${bad}`));
  console.log("bad token", bad.slice(0, 12), "→", r.status());
}
await s.close();
