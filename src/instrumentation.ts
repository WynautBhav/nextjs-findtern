/**
 * Next.js instrumentation hook — runs once on server startup.
 * Starts the in-process schedulers (interview reminders, notification jobs).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSchedulers } = await import("@/lib/schedulers");
    startSchedulers();
  }
}
