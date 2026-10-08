import type { Metadata } from "next";
import Link from "next/link";

import { PageHead, SectionHead, Surface, WaitingNote } from "@/components/app/primitives";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

/**
 * Settings.
 *
 * The old page was a placeholder that promised features the auth API did not
 * expose yet. The password change is here now — the endpoint has existed the
 * whole time, nobody had written the form.
 */
export default async function InternSettings() {
  const session = await getSession();
  const uid = session!.uid;

  return (
    <div>
      <PageHead
        title="Settings"
        lede="Where to change what, and what is already handled for you."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          <section>
            <SectionHead title="Password" hint="Changing it ends your other sessions." />
            <Surface className="p-6">
              <ChangePasswordForm endpoint={`/api/users/${encodeURIComponent(uid)}/change-password`} />
            </Surface>
          </section>

          <section>
            <SectionHead title="Your account" hint="The details on file." />
            <Surface className="p-6">
              <p className="text-sm leading-relaxed text-ink-600">
                Sign-in email and password are managed from the account you used to register. To
                update your personal details, skills, or bank account, use the profile editor.
              </p>
              <Link
                href="/intern/onboarding"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-[var(--dur-instant)] hover:bg-primary-hover active:scale-[0.98]"
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