import { chromium } from "/home/wynautbhav/.local/share/mise/installs/npm-playwright/latest/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("docs/screenshots/redesign");
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

const SCREENS = [
  { slug: "dashboard", path: "/admin/dashboard" },
  { slug: "interns", path: "/admin/interns" },
  { slug: "companies", path: "/admin/companies" },
  { slug: "transactions", path: "/admin/transactions" },
  { slug: "payouts", path: "/admin/transactions?view=payouts" },
  { slug: "reports", path: "/admin/reports" },
  { slug: "roles", path: "/admin/roles" },
  { slug: "promo_codes", path: "/admin/promo-codes" },
  { slug: "messages", path: "/admin/messages" },
  { slug: "cms", path: "/admin/cms" },
  { slug: "projects", path: "/admin/projects" },
  { slug: "proposal_tracker", path: "/admin/proposal-tracker" },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Logging into Findtern admin...");
  await page.goto("http://localhost:3000/admin/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "admin@findtern.dev");
  await page.fill('input[type="password"]', "Findtern@2026");
  await page.click('button[type="submit"]');

  await page.waitForURL("**/admin/dashboard", { timeout: 10000 });
  console.log("Login successful! Starting screenshot capture...");

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`[Console Error on ${page.url()}]: ${msg.text()}`);
    }
  });

  for (const vp of VIEWPORTS) {
    console.log(`\nCapturing viewport ${vp.name}px (${vp.width}x${vp.height})...`);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const screen of SCREENS) {
      const url = `http://localhost:3000${screen.path}`;
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
        // Wait a small moment for any animations or fonts
        await page.waitForTimeout(300);

        const filename = `${screen.slug}_${vp.name}.png`;
        const filepath = path.join(OUT_DIR, filename);
        await page.screenshot({ path: filepath, fullPage: false });
        console.log(`  ✓ Saved ${filename}`);
      } catch (err) {
        console.error(`  ✗ Error capturing ${screen.slug} at ${vp.name}:`, err.message);
      }
    }
  }

  await browser.close();
  console.log(`\nCapture completed. Total errors logged: ${errors.length}`);
  if (errors.length > 0) {
    console.log("Errors encountered:");
    for (const err of errors.slice(0, 10)) {
      console.log("  ", err);
    }
  }
}

run().catch((err) => {
  console.error("Fatal capture error:", err);
  process.exit(1);
});
