// Screenshot rendered email HTML (from render-emails.mjs) at 600 and 390 px, in Chromium and Firefox.
//   node scripts/shoot-emails.mjs <htmlDir> <outDir> [--only <id-substring>]
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, firefox } from "playwright";

const [dir, out] = process.argv.slice(2, 4);
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined;
mkdirSync(out, { recursive: true });
const font = (file, weight) => `@font-face{font-family:Poppins;font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(new URL(`../src/assets/fonts/${file}`, import.meta.url)).toString("base64")})}`;
const POPPINS = font("Poppins-Regular.ttf", 400) + font("Poppins-SemiBold.ttf", 600);

for (const [name, engine] of [["chromium", chromium], ["firefox", firefox]]) {
  const browser = await engine.launch();
  for (const width of [600, 390]) {
    const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
    await page.route("**/*", (r) => {
        const url = r.request().url();
        if (url.startsWith("data:") || url === "about:blank") return r.continue();
        const logo = url.match(/\/media\/(findtern-email-logo(?:-white)?\.png)$/); // the only image the mails use, served from the repo
        return logo ? r.fulfill({ path: new URL(`../public/media/${logo[1]}`, import.meta.url).pathname }) : r.abort(); // everything else: offline
      });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".html") && (!only || f.includes(only)))) {
      await page.setContent(readFileSync(join(dir, f), "utf8"), { waitUntil: "load" });
      await page.addStyleTag({ content: POPPINS });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(out, `${f.replace(".html", "")}.${name}.${width}.png`), fullPage: true });
    }
  }
  await browser.close();
}
console.log("done", out);
