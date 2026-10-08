/**
 * scripts/shots.ts
 *
 * Full-page screenshot harness for Findtern using Playwright.
 * Captures all routes under /admin, /employer, and /intern at 1440, 1024, and 390 widths.
 *
 * Usage:
 *   npm run shots -- before2
 *   node --experimental-strip-types scripts/shots.ts before2
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium } from "playwright";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";

import * as schema from "../src/lib/db/schema.ts";

const WIDTHS = [1440, 1024, 390];
const DEFAULT_PORT = process.env.PORT || "3100";
const BASE_URL = `http://localhost:${DEFAULT_PORT}`;
const PASSWORD = "Findtern@2026";

interface RouteResult {
  role: string;
  route: string;
  width: number;
  status: number;
  hasOverflow: boolean;
  consoleErrors: string[];
  screenshotPath: string;
}

// Helper to check if server is already responding
async function isServerReady(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/auth/me`, { signal: AbortSignal.timeout(1500) });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

// Start dev server if needed
async function ensureServer(): Promise<{ proc: ChildProcess | null; url: string }> {
  if (await isServerReady(BASE_URL)) {
    console.log(`Server already running at ${BASE_URL}`);
    return { proc: null, url: BASE_URL };
  }

  // Also check port 3000 just in case
  const fallbackUrl = "http://localhost:3000";
  if (await isServerReady(fallbackUrl)) {
    console.log(`Server running at ${fallbackUrl}`);
    return { proc: null, url: fallbackUrl };
  }

  console.log(`Starting dev server on port ${DEFAULT_PORT}…`);
  const proc = spawn("npx", ["next", "dev", "-p", DEFAULT_PORT], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: DEFAULT_PORT },
    stdio: "pipe",
  });

  proc.stderr?.on("data", (data) => {
    const msg = data.toString();
    if (msg.includes("Error:") || msg.includes("Failed")) {
      process.stderr.write(msg);
    }
  });

  // Poll until ready
  const start = Date.now();
  while (Date.now() - start < 60000) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isServerReady(BASE_URL)) {
      console.log(`Dev server ready at ${BASE_URL}`);
      return { proc, url: BASE_URL };
    }
  }

  proc.kill();
  throw new Error(`Dev server failed to start within 60s at ${BASE_URL}`);
}

async function getDynamicIds() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const db = drizzle(client, { schema });

  const [firstEmployer] = await db.select({ id: schema.employers.id }).from(schema.employers).limit(1);
  const [firstUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  const [firstProject] = await db.select({ id: schema.projects.id }).from(schema.projects).limit(1);

  // Proposal for employer
  const [empProposal] = await db
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(eq(schema.proposals.employerId, firstEmployer?.id ?? ""))
    .limit(1);

  // Proposal for intern
  const [internProposal] = await db
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(eq(schema.proposals.internId, firstUser?.id ?? ""))
    .limit(1);

  // Timesheet for employer
  const [empTimesheet] = await db
    .select({ id: schema.timesheets.id })
    .from(schema.timesheets)
    .where(eq(schema.timesheets.employerId, firstEmployer?.id ?? ""))
    .limit(1);

  await client.end();

  return {
    employerId: firstEmployer?.id || "demo-emp-id",
    internId: firstUser?.id || "demo-intern-id",
    projectId: firstProject?.id || "demo-proj-id",
    employerProposalId: empProposal?.id || "demo-prop-id",
    internProposalId: internProposal?.id || "demo-prop-id",
    employerTimesheetId: empTimesheet?.id || "demo-time-id",
  };
}

async function loginAndGetCookie(url: string, role: "admin" | "employer" | "intern"): Promise<string> {
  const endpoint =
    role === "admin"
      ? `${url}/api/auth/admin/login`
      : role === "employer"
      ? `${url}/api/auth/employer/login`
      : `${url}/api/auth/login`;

  const email =
    role === "admin"
      ? "admin@findtern.dev"
      : role === "employer"
      ? "hiring@northwind.dev"
      : "candidate@findtern.dev";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(`Failed to login as ${role}: ${res.status} ${await res.text()}`);
  }

  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/ft_sid=([^;]+)/);
  if (!match) {
    throw new Error(`Login response for ${role} did not return ft_sid cookie`);
  }
  return match[1];
}

async function main() {
  const label = process.argv.find((arg) => !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1]) || "before2";
  console.log(`\n── Running screenshot harness with label: "${label}" ──\n`);

  const outputDir = join(process.cwd(), "docs", "screenshots", label);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const { proc, url } = await ensureServer();
  const ids = await getDynamicIds();

  const routesByRole = {
    admin: [
      "/admin/dashboard",
      "/admin/interns",
      `/admin/interns/${ids.internId}`,
      "/admin/companies",
      `/admin/companies/${ids.employerId}`,
      "/admin/projects",
      "/admin/proposal-tracker",
      "/admin/payouts",
      "/admin/transactions",
      "/admin/reports",
      "/admin/roles",
      "/admin/promo-codes",
      "/admin/messages",
      "/admin/cms",
      "/admin/notifications",
    ],
    employer: [
      "/employer/dashboard",
      "/employer/candidates",
      "/employer/compare",
      `/employer/intern/${ids.internId}`,
      "/employer/projects",
      "/employer/proposals",
      `/employer/proposal/${ids.employerProposalId}`,
      "/employer/send-proposal",
      "/employer/schedule",
      "/employer/timesheets",
      `/employer/timesheets/${ids.employerTimesheetId}`,
      "/employer/orders",
      "/employer/cart",
      "/employer/checkout",
      "/employer/alerts",
      "/employer/account",
      "/employer/onboarding",
    ],
    intern: [
      "/intern/dashboard",
      "/intern/profile",
      "/intern/onboarding",
      "/intern/opportunities",
      `/intern/opportunities/${ids.projectId}`,
      "/intern/interviews",
      "/intern/proposals",
      `/intern/proposals/${ids.internProposalId}`,
      "/intern/timesheets",
      "/intern/earnings",
      "/intern/documents",
      "/intern/record",
      "/intern/notifications",
      "/intern/settings",
    ],
  };

  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  const results: RouteResult[] = [];

  try {
    for (const [role, routes] of Object.entries(routesByRole) as [("admin" | "employer" | "intern"), string[]][]) {
      console.log(`\nCapturing screenshots for ${role.toUpperCase()} routes…`);
      const sid = await loginAndGetCookie(url, role);

      const parsedUrl = new URL(url);
      const context = await browser.newContext({
        storageState: undefined,
      });

      await context.addCookies([
        {
          name: "ft_sid",
          value: sid,
          domain: parsedUrl.hostname,
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);

      const page = await context.newPage();

      for (const route of routes) {
        for (const width of WIDTHS) {
          const consoleErrors: string[] = [];
          const onConsole = (msg: { type: () => string; text: () => string }) => {
            if (msg.type() === "error") {
              consoleErrors.push(msg.text());
            }
          };
          page.on("console", onConsole);

          await page.setViewportSize({ width, height: 900 });

          let status = 200;
          let hasOverflow = false;

          try {
            const resp = await page.goto(`${url}${route}`, {
              waitUntil: "networkidle",
              timeout: 15000,
            }).catch(async () => {
              return await page.goto(`${url}${route}`, {
                waitUntil: "domcontentloaded",
                timeout: 15000,
              });
            });

            if (resp) {
              status = resp.status();
            }

            // Hide Next.js dev overlays / indicators
            await page.addStyleTag({
              content: `
                nextjs-portal,
                [data-nextjs-toast],
                [data-nextjs-dialog-overlay],
                #next-route-announcer {
                  display: none !important;
                }
              `,
            });

            // Allow micro-animations to settle
            await page.waitForTimeout(300);

            // Measure horizontal overflow
            hasOverflow = await page.evaluate(() => {
              return document.documentElement.scrollWidth > window.innerWidth;
            });

            // Path generation: role__route__width.png
            const cleanRoute = route
              .replace(/^\/[^/]+\/?/, "") // strip /admin/
              .replace(/[/\\?%*:|"<>]/g, "_") || "dashboard";
            const filename = `${role}__${cleanRoute}__${width}.png`;
            const filepath = join(outputDir, filename);

            await page.screenshot({ path: filepath, fullPage: true });

            results.push({
              role,
              route,
              width,
              status,
              hasOverflow,
              consoleErrors,
              screenshotPath: filepath,
            });

            process.stdout.write(`  [${status}] ${role} ${route} @ ${width}px ${hasOverflow ? "⚠️ OVERFLOW" : "✓"}\n`);
          } catch (err) {
            console.error(`  ❌ Error capturing ${role} ${route} @ ${width}px:`, (err as Error).message);
            results.push({
              role,
              route,
              width,
              status: 500,
              hasOverflow: false,
              consoleErrors: [(err as Error).message],
              screenshotPath: "",
            });
          } finally {
            page.off("console", onConsole);
          }
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
    if (proc) {
      console.log("Shutting down dev server…");
      proc.kill("SIGTERM");
    }
  }

  // ── Print Issue Table ────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("             FINDTERN SCREENSHOT HARNESS SUMMARY REPORT             ");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  const problemRoutes = results.filter((r) => r.status !== 200 || r.hasOverflow || r.consoleErrors.length > 0);

  if (problemRoutes.length === 0) {
    console.log("✓ All routes rendered with HTTP 200, zero console errors, and zero horizontal overflow!");
  } else {
    console.log(`Found issues on ${problemRoutes.length} route configurations:\n`);
    console.log("Role".padEnd(10) + "Width".padEnd(8) + "Status".padEnd(8) + "Overflow".padEnd(10) + "Route");
    console.log("─".repeat(70));
    for (const r of problemRoutes) {
      console.log(
        r.role.padEnd(10) +
        `${r.width}px`.padEnd(8) +
        String(r.status).padEnd(8) +
        (r.hasOverflow ? "YES" : "No").padEnd(10) +
        r.route
      );
      if (r.consoleErrors.length > 0) {
        console.log(`    ↳ Errors: ${r.consoleErrors.slice(0, 2).join("; ")}`);
      }
    }
  }

  console.log(`\nScreenshots saved in: ${outputDir}\n`);
}

main().catch((err) => {
  console.error("Fatal shots error:", err);
  process.exit(1);
});
