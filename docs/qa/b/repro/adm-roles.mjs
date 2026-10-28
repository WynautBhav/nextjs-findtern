// Tester B, 28 Oct: can an admin read the role in each staff row's select at 375 and 1440?
import { open, shot, pick } from "./lib.mjs";
for (const w of [375, 1440]) {
  const s = await open({ port: 3502, ...pick("admin"), width: w, height: 900, name: `adm-roles-${w}` });
  await s.page.goto(s.url("/admin/roles"), { waitUntil: "networkidle" });
  console.log(w, await s.page.locator("main select").evaluateAll((es) => es.slice(0, 7).map((e) => `${e.options[e.selectedIndex]?.text} | select ${Math.round(e.getBoundingClientRect().width)}px, text ${Math.round(e.scrollWidth)}`)));
  await s.close();
}
