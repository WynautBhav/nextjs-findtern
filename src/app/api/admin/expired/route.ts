import { loadAiLinkRows } from "@/lib/admin/ai-link-queue-load";
import { loadExpiredProposals } from "@/lib/admin/expired-load";
import { handleExpiredExport } from "@/lib/admin/expired-export";
import { getSession } from "@/lib/auth";
import { getAiLinkExpiryDays } from "@/lib/platform-settings";

/**
 * Expired offers and expired AI interviews as CSV: `?type=proposals|ai` plus the same filters as the on-screen tab
 * (reason, q, company, intern, tz, from, to = IST days of the expiry). A read: no CSRF token. All logic is in
 * lib/admin/expired-export.ts so it is tested with fakes; this file only wires the real loaders.
 */
export async function GET(req: Request) {
  return handleExpiredExport(req, {
    session: getSession,
    loadProposals: loadExpiredProposals,
    loadAi: async () => {
      const [rows, days] = await Promise.all([loadAiLinkRows(), getAiLinkExpiryDays()]);
      return { rows, days };
    },
    now: () => new Date(),
  });
}
