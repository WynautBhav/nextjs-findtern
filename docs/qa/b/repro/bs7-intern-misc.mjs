import { open, shot, pick } from "./lib.mjs";
const s = await open({ port: 3502, ...pick("intern"), width: 1440, name: "bs7-intern-misc" });
const p = s.page;
const body = () => p.evaluate(() => document.querySelector("main")?.innerText.replace(/\s+/g, " ") ?? "");
const has = (t, re) => (t.match(re) ?? []).slice(0, 3);
for (const r of ["/intern/interviews", "/intern/opportunities", "/intern/dashboard", "/intern/profile", "/intern/documents", "/intern/settings"]) {
  await p.goto(s.url(r), { waitUntil: "networkidle" });
  const t = await body();
  console.log("==", r, "| incruiter:", has(t, /incruiter/gi).length, "| 'none of these work':", has(t, /none of these|ask for a new one|request a new/gi), "| 'Hidden company':", has(t, /hidden company/gi).length, "| 'AI interview' mentions:", has(t, /AI interview[^.]{0,50}/gi));
  if (r === "/intern/opportunities") console.log("  roles sample:", t.slice(150, 520));
  if (r === "/intern/dashboard") console.log("  completion:", has(t, /(profile|complet)[^.]{0,80}(PAN|Aadhaar|document)[^.]{0,60}/gi), has(t, /\d+% [^.]{0,60}/g));
  if (r === "/intern/profile") console.log("  location/work:", has(t, /(Preferred|Prefers|Work mode|Open to)[^.]{0,100}/gi));
  await shot(s, `bs7-intern-${r.split("/").pop()}-1440`, { fullPage: false });
}
await p.goto(s.url("/intern/interviews"), { waitUntil: "networkidle" });
console.log("INTERVIEWS full:", (await body()).slice(0, 1400));
console.log(s.errors);
await s.close();
