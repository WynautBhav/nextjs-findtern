import { open, shot, text } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-pricing-${w}` });
  await s.page.goto(s.url("/pricing"), { waitUntil: "networkidle" });
  await s.page.waitForTimeout(800);
  const info = await s.page.evaluate(() => {
    const sels = [...document.querySelectorAll("select")].map((e) => ({ label: e.getAttribute("aria-label"), opts: [...e.options].map((o) => o.text) }));
    const trig = [...document.querySelectorAll("button,[role=combobox]")].filter((b) => /Cappuccino|days|INR|hour|Espresso|Latte/.test(b.innerText)).map((b) => `${b.tagName}[${b.getAttribute("role")}|${b.getAttribute("aria-haspopup")}]: ${b.innerText.trim().slice(0, 40)}`);
    return { sels, trig };
  });
  console.log(w, JSON.stringify(info));
  const t = await text(s);
  console.log("4h/6h mentions:", (t.match(/.{40}\b(4|6)\s?(h|hr|hrs|hours)\b.{40}/gi) ?? []));
  console.log("days mentions:", (t.match(/.{50}\b(22|26)\b.{50}/g) ?? []));
  // open each combobox
  const combos = await s.page.$$("button[aria-haspopup], [role=combobox]");
  console.log("combos", combos.length);
  for (let i = 0; i < combos.length; i++) {
    const label = (await combos[i].innerText()).trim().slice(0, 30);
    await combos[i].scrollIntoViewIfNeeded(); await combos[i].click(); await s.page.waitForTimeout(400);
    const opts = await s.page.$$eval("[role=option],[role=menuitem],[role=menuitemradio]", (o) => o.map((x) => x.innerText.trim().replace(/\s+/g, " ")));
    console.log("  combo", i, label, "=>", JSON.stringify(opts));
    if (i === 0 || /days|Cappuccino/.test(label)) await s.page.screenshot({ path: join(SHOTS, `bs7mk-pricing-combo${i}-${w}.png`) });
    await s.page.keyboard.press("Escape"); await s.page.waitForTimeout(200);
  }
  await s.close();
}
