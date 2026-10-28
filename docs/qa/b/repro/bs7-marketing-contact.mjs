import { open, shot } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-contact-${w}` });
  await s.page.goto(s.url("/contact"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(800);
  const info = await s.page.evaluate(() => {
    const sels = [...document.querySelectorAll("form select")].map((e) => ({ name: e.name, aria: e.getAttribute("aria-label"), n: e.options.length, first: [...e.options].slice(0, 4).map((o) => o.text), last: [...e.options].slice(-2).map((o) => o.text), sel: e.options[e.selectedIndex]?.text }));
    const inputs = [...document.querySelectorAll("form input, form textarea")].map((e) => ({ name: e.name, type: e.type, inputmode: e.inputMode, maxlength: e.maxLength, minlength: e.minLength, pattern: e.pattern, ph: e.placeholder, ac: e.autocomplete, aria: e.getAttribute("aria-label") }));
    return { sels, inputs };
  });
  console.log(w, JSON.stringify(info, null, 1));
  const ph = s.page.locator("form input[type=tel], form input[name*=phone i]").first();
  await ph.scrollIntoViewIfNeeded();
  await ph.fill(""); await ph.pressSequentially("abc98765432109876543", { delay: 5 });
  console.log("typed 'abc98765432109876543' -> value:", JSON.stringify(await ph.inputValue()));
  await s.page.locator("form input[name*=first i]").first().fill("Test"); 
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-contact-phone-${w}.png`) });
  // test submit validation message for short number
  await ph.fill("12345");
  console.log("validity for 12345:", await ph.evaluate((e) => ({ valid: e.validity.valid, msg: e.validationMessage })));
  await ph.fill("9876543210");
  console.log("validity for 9876543210:", await ph.evaluate((e) => ({ valid: e.validity.valid, msg: e.validationMessage })));
  // country select: swap to +1
  await s.close();
}
