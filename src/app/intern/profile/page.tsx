import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHead, SectionHead, Surface, WaitingNote } from "@/components/app/primitives";
import { ReadinessMeter } from "@/components/app/readiness";
import { ProfileCard } from "@/components/app/profile-card";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { loadInternData } from "@/lib/intern-data";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

/**
 * The profile, as the candidate sees it.
 *
 * The same facts that power the card on the home screen, plus the full
 * readiness meter: what an employer can see, what is still hidden, and which
 * of those block payment. Nothing here duplicates a row, so a change made in
 * the onboarding editor shows up on the card and on this page the next time
 * the page renders.
 */
export default async function InternProfile() {
  const session = await getSession();
  if (!session) return null;

  const data = await loadInternData(session.uid);
  const [user] = await getDb()
    .select({ first: schema.users.firstName, last: schema.users.lastName })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);

  const name = `${user?.first ?? ""} ${user?.last ?? ""}`.trim() || "Candidate";
  const initials = `${(user?.first ?? "").charAt(0)}${(user?.last ?? "").charAt(0)}`.toUpperCase() || "?";
  const academics = (data.onboarding?.extraData as Record<string, unknown> | null)?.academics as
    | Record<string, unknown>
    | undefined;

  return (
    <div>
      <PageHead
        title={name}
        lede="What employers can see, what is still hidden from them, and the fastest way to complete it."
        action={
          <Link
            href="/intern/onboarding"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-[var(--dur-instant)] hover:bg-primary-hover active:scale-[0.98]"
          >
            Edit profile
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <SectionHead title="Your profile card" hint="This is the card an employer sees in search." />
          <ProfileCard
            name={name}
            initials={initials}
            stage={data.stage}
            city={data.onboarding?.city}
            state={data.onboarding?.state}
            bio={data.onboarding?.bio}
            skills={Array.isArray(data.onboarding?.skills) ? (data.onboarding.skills as string[]) : []}
            degree={typeof academics?.degree === "string" ? academics.degree : null}
            institution={typeof academics?.institution === "string" ? academics.institution : null}
            yearOfGraduation={typeof academics?.yearOfGraduation === "string" ? academics.yearOfGraduation : null}
            cgpa={typeof academics?.cgpa === "string" ? academics.cgpa : null}
          />

          {data.onboarding?.bio ? (
            <Surface className="p-6">
              <SectionHead title="About you" />
              <p className="text-pretty leading-relaxed text-ink-700">{data.onboarding.bio}</p>
            </Surface>
          ) : null}

          {data.onboarding?.linkedinUrl ? (
            <Surface className="p-6">
              <SectionHead title="LinkedIn" />
              <a
                href={data.onboarding.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {data.onboarding.linkedinUrl}
              </a>
            </Surface>
          ) : null}
        </div>

        <aside className="space-y-5">
          <ReadinessMeter readiness={data.readiness} />
          <Surface className="p-5">
            <WaitingNote who="Your record" typical="Dated, named, and exportable." />
            <Link
              href="/intern/record"
              className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open your record
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
