// Renders every transactional email and checks it. Never sends anything.
//   node scripts/check-emails.mjs [--browser chromium|firefox] [--only <id-substring>]
// Per template: one button-styled primary action, text/background contrast >= 4.5 (light and dark),
// plain-text part, preheader, notification-settings link when the mail offers one, alt text on
// images, no horizontal overflow at 390 and 600, no angle-bracket / entity leakage.
import { readFileSync } from "node:fs";

import { chromium, firefox } from "playwright";

import { rendered } from "./lib/email-samples.mjs";

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const engine = arg("browser") === "firefox" ? firefox : chromium;
const only = arg("only");

/** The code is the action: a verification email has no button. */
const NO_BUTTON = /^otp-/;
const MIN_CONTRAST = 4.5;
const MIN_FONT_PX = 13;

/** Runs in the page: every visible text node's colour, effective background and size. */
const probe = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.99) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    const el = n.parentElement;
    if (!text || !el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || el.closest("style,title,script")) continue;
    if (parseFloat(cs.fontSize) <= 2 || cs.opacity === "0") continue; // preheader
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    out.push({ text: text.slice(0, 40), fg: parse(cs.color), bg: bgOf(el), size: parseFloat(cs.fontSize) });
  }
  const btns = [...document.querySelectorAll("a")].filter((a) => {
    const td = a.closest("td");
    return td && getComputedStyle(a).display === "block" && parse(getComputedStyle(td).backgroundColor)?.a > 0.99;
  }).map((a) => ({ href: a.getAttribute("href"), h: a.getBoundingClientRect().height, label: a.textContent.trim() }));
  const imgs = [...document.images].map((i) => ({ alt: i.getAttribute("alt"), shown: getComputedStyle(i).display !== "none" }));
  // A right-aligned value that wraps reads as a ragged edge; long values must stack under their label on phones.
  const ragged = [...document.querySelectorAll("td")].filter((td) => {
    const cs = getComputedStyle(td);
    const lh = parseFloat(cs.lineHeight);
    if (cs.textAlign !== "right" || td.querySelector("table") || !td.textContent.trim()) return false;
    const range = document.createRange(); // the text's own height: a cell stretched by a two-line label beside it is not a wrapped value
    range.selectNodeContents(td);
    return range.getBoundingClientRect().height > lh * 1.5;
  }).map((td) => td.textContent.replace(/\s+/g, " ").trim().slice(0, 40));
  // Text cells must carry a font-family inline (or inherit it from a cell that does): Gmail and Outlook drop body styles.
  const noFont = [...document.querySelectorAll("td")].filter((td) => {
    if ([...td.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim()) && !td.querySelector("p,h1,div,strong,a,span,ul")) return false;
    for (let e = td; e && e.tagName !== "BODY"; e = e.parentElement) if (e.style.fontFamily) return false;
    return true;
  }).map((td) => td.textContent.replace(/\s+/g, " ").trim().slice(0, 40));
  return {
    ragged,
    noFont,
    out,
    btns,
    imgs,
    hrefs: [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    scrollW: document.documentElement.scrollWidth,
    visible: document.body.innerText,
  };
};

const lum = ({ r, g, b }) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// The emails ask Google Fonts for Poppins 400/600, which this offline run cannot reach. Use the
// repo's own copies so widths match what Apple Mail / iOS Mail (web-font clients) will draw.
const font = (file, weight) => `@font-face{font-family:Poppins;font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(new URL(`../src/assets/fonts/${file}`, import.meta.url)).toString("base64")})}`;
const POPPINS = font("Poppins-Regular.ttf", 400) + font("Poppins-SemiBold.ttf", 600);

const browser = await engine.launch();
let failures = 0;
let minRatio = 99;
let fontOk = true;
const fail = (id, msg) => {
  failures++;
  console.log(`FAIL ${id}: ${msg}`);
};

const all = rendered().filter((m) => !only || m.id.includes(only));
for (const m of all) {
  const before = failures;
  const { id, html, text, content } = m;

  // Static checks on the strings.
  if (!text || text.trim().length < 40) fail(id, "plain-text part missing or empty");
  else {
    if (!text.includes(content.heading)) fail(id, "plain text lacks the heading");
    if (content.cta && !text.includes(content.cta.url)) fail(id, "plain text lacks the button url");
    if (/[<>]|&(amp|lt|gt|quot|#39);|undefined|\[object|\bnull\b/.test(text)) fail(id, "plain text leaks markup or a placeholder");
  }
  if (!content.preheader || content.preheader === content.subject) fail(id, "no preheader of its own");
  else if (!html.includes(content.preheader.replace(/’/g, "’"))) fail(id, "preheader not in the html");
  const settings = (content.reason ?? "").match(/https?:\/\/\S+/)?.[0];

  for (const scheme of ["light", "dark"]) {
    for (const width of [390, 600]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, javaScriptEnabled: true });
      const page = await ctx.newPage();
      await page.route("**/*", (r) => {
        const url = r.request().url();
        if (url.startsWith("data:") || url === "about:blank") return r.continue();
        const logo = url.match(/\/media\/(findtern-email-logo(?:-white)?\.png)$/); // the only image the mails use, served from the repo
        return logo ? r.fulfill({ path: new URL(`../public/media/${logo[1]}`, import.meta.url).pathname }) : r.abort(); // everything else: offline
      }); // fully offline
      await page.setContent(html, { waitUntil: "load" });
      await page.addStyleTag({ content: POPPINS });
      await page.evaluate(() => document.fonts.ready);
      const d = await page.evaluate(probe);
      if (!(await page.evaluate(() => document.fonts.check("600 16px Poppins") && [...document.fonts].some((f) => f.family.includes("Poppins") && f.status === "loaded")))) fontOk = false;
      const tag = `${scheme}@${width}`;

      if (d.scrollW > width) fail(id, `horizontal overflow at ${tag}: scrollWidth ${d.scrollW} > ${width}`);
      if (width === 390) {
        const worst = d.out.map((t) => ({ ...t, ratio: ratio(t.fg, t.bg) })).filter((t) => t.ratio < MIN_CONTRAST);
        for (const t of d.out) minRatio = Math.min(minRatio, ratio(t.fg, t.bg));
        for (const t of worst) fail(id, `contrast ${t.ratio.toFixed(2)}:1 (<${MIN_CONTRAST}) in ${scheme} for "${t.text}"`);
        for (const t of d.ragged) fail(id, `right-aligned value wraps to several lines at 390 (${scheme}): "${t}"`);
        for (const t of d.out) if (t.size < MIN_FONT_PX) fail(id, `font ${t.size}px (<${MIN_FONT_PX}) for "${t.text}"`);
        if (/[<>]|&(amp|lt|gt|quot|#39);|undefined|\[object|\bnull\b/.test(d.visible)) fail(id, `visible text leaks markup or a placeholder in ${scheme}`);
        if (scheme === "light") {
          const want = NO_BUTTON.test(id) ? 0 : 1;
          if (d.btns.length !== want) fail(id, `${d.btns.length} button-styled links, want ${want}`);
          for (const b of d.btns) {
            if (b.h < 44) fail(id, `button ${b.h}px tall (<44)`);
            if (content.cta && b.href !== content.cta.url) fail(id, "button does not point at the cta url");
          }
          for (const t of d.noFont) fail(id, `no inline font-family on the text cell "${t}"`);
          for (const i of d.imgs) if (!i.alt) fail(id, "image without alt text");
          if (settings && !d.hrefs.includes(settings)) fail(id, `notification settings url is text, not a link: ${settings}`);
        }
      }
      await ctx.close();
    }
  }
  if (failures === before) console.log(`ok   ${id}`);
}
await browser.close();
console.log(`\nPoppins loaded in every render: ${fontOk}; lowest text contrast seen: ${minRatio.toFixed(2)}:1`);
console.log(`${all.length} templates, ${failures} failure${failures === 1 ? "" : "s"}`);
process.exit(failures ? 1 : 0);
