import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-contact2-${w}` });
  await s.page.goto(s.url("/contact"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(800);
  const ph = s.page.locator("form input[type=tel]").first();
  const cc = s.page.locator("select[aria-label='Country code']");
  console.log(w, "options:", await cc.evaluate((e) => e.options.length));
  for (const label of ["+91 · India", "+1 · United States", "+44 · United Kingdom", "+971 · United Arab Emirates", "+65 · Singapore"]) {
    const opt = await cc.evaluate((e, l) => [...e.options].find((o) => o.text.startsWith(l.split(" ")[0] + " "))?.text, label);
    if (!opt) { console.log(" missing", label); continue; }
    await cc.selectOption({ label: opt }); await s.page.waitForTimeout(150);
    await ph.fill(""); await ph.pressSequentially("98765432101234", { delay: 3 });
    console.log(" ", opt, "-> maxlength", await ph.getAttribute("maxlength"), "value", JSON.stringify(await ph.inputValue()), "hint:", (await s.page.locator("form").first().innerText()).match(/Optional\. [^\n]*/)?.[0]);
  }
  await ph.fill("12345");
  await s.page.locator("form input[autocomplete=given-name]").fill("Test"); await s.page.locator("form input[autocomplete=family-name]").fill("Tester");
  await s.page.locator("form input[type=email]").fill("qa.tester@example.com"); await s.page.locator("form textarea").fill("hello");
  // do NOT submit (would POST). only check validity
  await cc.selectOption({ index: 0 }); await ph.fill("9876543210");
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-contact-phone-${w}.png`) });
  await s.close();
}
