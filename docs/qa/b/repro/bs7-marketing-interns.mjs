import { open } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-interns-${w}` });
  await s.page.goto(s.url("/interns"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(600);
  const o = await s.page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    const links = [...document.querySelectorAll("main a")].map((a) => `${a.innerText.trim().slice(0, 40)} -> ${a.getAttribute("href")}`);
    const gar = [...document.querySelectorAll("h1,h2,h3")].find((h) => /Guarantee/.test(h.innerText) && /Findtern/.test(h.innerText));
    const f = gar ? [...gar.querySelectorAll("*")].find((e) => e.innerText.trim() === "Findtern") : null;
    return { links, price: t.match(/.{60}(₹|\$)\s?[\d,]+.{60}/g), cards: [...document.querySelectorAll("[class*=card],article")].length, pricingWords: t.match(/.{30}(per month|a month|\/hr|Espresso|Cappuccino|Latte|Choose).{30}/g), garH: gar?.innerText, fColor: f && getComputedStyle(f).color, hColor: gar && getComputedStyle(gar).color, emails: [...document.querySelectorAll("a[href^=mailto]")].map((a) => a.getAttribute("href")), allEmails: t.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) };
  });
  console.log(w, JSON.stringify(o, null, 1));
  await s.close();
}
