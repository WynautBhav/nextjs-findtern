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

    // The two switches that make a production server quietly do nothing
    // (SYS-05): no reminders or notification jobs, and no email at all.
    // Both are right for a staging copy and wrong for the live site, so say
    // so loudly at every boot instead of finding out from users.
    if (process.env.SCHEDULERS !== "on") {
      console.warn(
        "[startup] WARNING: SCHEDULERS is not \"on\": interview reminders and notification jobs will NOT run. Set SCHEDULERS=on on the live server.",
      );
    }
    // Without it every caller shares one rate-limit bucket (clientIp), so one
    // person's failed logins lock everyone out.
    if (process.env.VERCEL !== "1" && !/^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? "")) {
      console.warn("[startup] WARNING: TRUST_PROXY is not set: all visitors share one rate limit. Set TRUST_PROXY=1 behind nginx.");
    }
    const mailMode = (process.env.MAIL_MODE ?? "").trim().toLowerCase();
    if (mailMode === "log") {
      console.warn(
        "[startup] WARNING: MAIL_MODE=log: no email is sent (OTP codes, resets, offers); messages go to logs/mail/. Leave MAIL_MODE unset or set it to \"send\" on the live server.",
      );
    } else if (!["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].every((k) => process.env[k]?.trim())) {
      console.warn("[startup] WARNING: SMTP is not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM): emails will fail.");
    }
  }

  if (process.env.SCHEDULERS === "on") {
    const { startSchedulers } = await import("@/lib/schedulers");
    startSchedulers();
  }
}
