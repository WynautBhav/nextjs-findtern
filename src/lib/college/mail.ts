import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { renderEmail, type EmailContent } from "@/lib/emails";
import { sendSmtpMail } from "@/lib/mailer";
import { SITE } from "@/lib/content/site";

/**
 * Best-effort mail for the college money flows. `notify()` only knows
 * intern | employer, so colleges get their own small channel. Neither helper
 * ever throws: call them after the transaction has committed, and a failed
 * email must never undo or fail the payment.
 */

/** Email every active placement officer of a college. */
export async function mailCollegeOfficers(collegeId: string, content: EmailContent): Promise<void> {
  try {
    const rows = await getDb()
      .select({ email: schema.collegeAdmins.email })
      .from(schema.collegeAdmins)
      .where(and(eq(schema.collegeAdmins.collegeId, collegeId), eq(schema.collegeAdmins.isActive, true)));
    const to = [...new Set(rows.map((r) => r.email.trim()).filter(Boolean))];
    if (to.length === 0) return;
    await sendSmtpMail({ to, ...renderEmail(content) });
  } catch (err) {
    console.error("[college-mail] officers email failed", err);
  }
}

/** Email the Findtern admin inbox (a payout request needs a human). */
export async function mailFindternAdmin(content: EmailContent): Promise<void> {
  try {
    await sendSmtpMail({ to: SITE.adminEmail, ...renderEmail(content) });
  } catch (err) {
    console.error("[college-mail] admin email failed", err);
  }
}
