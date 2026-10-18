import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";

import { PageHead, SectionHead, Surface, WaitingNote } from "@/components/app/primitives";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { BankDetailsForm, type BankDetails } from "@/components/intern/bank-details-form";
import { ContactDetailsForm } from "@/components/intern/contact-details-form";
import { requireRole } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

/**
 * Settings.
 *
 * Password change and bank payout preferences.
 */
export default async function InternSettings() {
  const session = await requireRole("intern");
  const uid = session.uid;

  let initialBank: BankDetails = {};
  let contact = { firstName: "", lastName: "", countryCode: "+91", phoneNumber: "" };
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, uid))
      .limit(1);

    if (row?.extraData) {
      const extra = row.extraData as Record<string, unknown>;
      const bank = (extra.bankDetails ?? extra.bank ?? {}) as BankDetails;
      initialBank = bank;
    }
    const [user] = await db
      .select({ f: schema.users.firstName, l: schema.users.lastName, cc: schema.users.countryCode, p: schema.users.phoneNumber })
      .from(schema.users)
      .where(eq(schema.users.id, uid))
      .limit(1);
    if (user) contact = { firstName: user.f, lastName: user.l, countryCode: user.cc, phoneNumber: user.p };
  } catch {}

  return (
    <div>
      <PageHead
        title="Settings"
        lede="Where to change what, and what is already handled for you."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          <section>
            <SectionHead title="Your details" hint="Your email is your sign-in and can't be changed here." />
            <Surface className="p-6">
              <ContactDetailsForm userId={uid} initial={contact} />
            </Surface>
          </section>

          <section>
            <SectionHead title="Password" hint="Changing it ends your other sessions." />
            <Surface className="p-6">
              <ChangePasswordForm endpoint={`/api/users/${encodeURIComponent(uid)}/change-password`} />
            </Surface>
          </section>

          <section id="bank">
            <SectionHead title="Bank Account" hint="For monthly stipend payouts and disbursements." />
            <BankDetailsForm initialBank={initialBank} />
          </section>

          <section>
            <SectionHead title="Your account" hint="The details on file." />
            <Surface className="p-6">
              <p className="text-sm leading-relaxed text-ink-600">
                Sign-in email and password are managed from the account you used to register. To
                update your personal details or skills, use the profile editor.
              </p>
              <Link
                href="/intern/onboarding"
                className="apple-spring apple-pressable mt-4 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
              >
                Update your profile
              </Link>
            </Surface>
          </section>
        </div>

        <aside className="space-y-8">
          <section>
            <SectionHead title="What this product does not send you" />
            <Surface className="p-6">
              <p className="text-sm leading-relaxed text-ink-600">
                No streak reminders. No re-engagement emails after a quiet week. Notifications only
                ever arrive when something a company did changes your state: a new offer, a booked
                interview, an approved timesheet, a payment. The full list is on your{" "}
                <Link
                  href="/intern/notifications"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  notifications page
                </Link>
                .
              </p>
            </Surface>
          </section>

          <section>
            <SectionHead title="If something goes wrong" />
            <Surface className="p-6">
              <WaitingNote who="Support" typical="Replies within one working day." />
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Use the contact link on the marketing page, and your Findtern ID is on your profile
                so the team can find you without asking.
              </p>
            </Surface>
          </section>
        </aside>
      </div>
    </div>
  );
}