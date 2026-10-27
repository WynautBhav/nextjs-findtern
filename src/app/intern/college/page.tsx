import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { PageHead } from "@/components/app/primitives";
import { CollegeForm } from "@/components/intern/college-form";
import { requireRole } from "@/lib/auth";
import { membershipOf } from "@/lib/college/membership";
import { NOTICE_TEXT, NOTICE_VERSION, PURPOSE_COPY, CONSENT_PURPOSES } from "@/lib/college/consent";
import { getDb, schema } from "@/lib/db";
import { draftFromRecord } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "College",
  robots: { index: false, follow: false },
};

/**
 * Your college.
 *
 * Picking a college is one search and two ticks. The ticks are the DPDP
 * consent, one per purpose, and both start empty: a pre-ticked box is not
 * consent. The search starts from the institution already on the profile, so
 * most students only confirm.
 */
export default async function InternCollegePage() {
  const session = await requireRole("intern");
  const college = await membershipOf(session.uid);

  let institution = "";
  try {
    const [row] = await getDb()
      .select()
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, session.uid))
      .limit(1);
    if (row) institution = draftFromRecord(row).academics?.institution ?? "";
  } catch {}

  return (
    <div>
      <PageHead
        title="Your college"
        lede={
          college
            ? "Your placement team can follow your progress, and employers in your college's drives can find you."
            : "If your college runs placement drives on Findtern, join it here. Your profile itself doesn't change."
        }
      />
      <CollegeForm
        initial={college}
        institution={institution}
        purposes={CONSENT_PURPOSES.map((p) => ({ id: p, ...PURPOSE_COPY[p] }))}
        notice={{ version: NOTICE_VERSION, text: NOTICE_TEXT }}
        vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      />
    </div>
  );
}
