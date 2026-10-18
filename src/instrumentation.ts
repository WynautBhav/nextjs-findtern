/**
 * Next.js instrumentation hook - runs once on server startup.
 * Starts the in-process schedulers (interview reminders, notification jobs)
 * when SCHEDULERS=on. Off by default so a local run against a copy of the
 * live database never notifies real users.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    // These fall back to dev defaults (or fail on first use) rather than at
    // boot. PUBLIC_ORIGIN in particular silently becomes localhost:3000 in
    // reset-password emails, signed upload URLs and Google redirect URIs.
    const missing = ["DATABASE_URL", "SESSION_SECRET", "SIGNING_SECRET", "PUBLIC_ORIGIN"].filter(
      (k) => !process.env[k],
    );
    if (missing.length) console.error(`[startup] Missing production env: ${missing.join(", ")}`);
  }

  if (process.env.SCHEDULERS === "on") {
    const { startSchedulers } = await import("@/lib/schedulers");
    startSchedulers();
  }
}
