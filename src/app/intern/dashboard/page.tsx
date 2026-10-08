import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";

import { EmptyScene, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { ReadinessStrip } from "@/components/app/readiness";
import { StatusStrip, Thread } from "@/components/app/thread";
import { ProfileCard } from "@/components/app/profile-card";
import { ActivationCard } from "@/components/intern/activation-card";
import { InternRetentionHub } from "@/components/intern/intern-retention-hub";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { loadInternData, openProjects } from "@/lib/intern-data";
import { nextAction } from "@/lib/journey";
import { formatMoney } from "@/lib/format";
import { moneyPlain } from "@/lib/journey";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

/**
 * Home.
 *
 * The old dashboard was three identical cards holding 2, 2 and 1, and a list
 * whose primary label was the literal string `interview_first`. It answered
 * "how many" three times and nothing about what to do.
 *
 * ── Why this layout and not the previous one ───────────────────────────
 *
 * An earlier pass put the thread in a narrow column and stacked the readiness
 * meter, the stipend and two proof cards down a 20rem rail. It looked like a
 * sidebar full of widgets and the proof cards were unreadable in it. A card
 * carrying facts is a document, and documents do not belong in a rail.
 *
 * So the composition is one main column with a genuine reading measure, and
 * the rail carries only things that are glanceable: what is waiting, what is
 * visible, what is owed. The profile card gets its own full width band below,
 * because that is what an employer would see.
 */
function toInitials(first?: string | null, last?: string | null): string {
  const a = (first ?? "").trim().charAt(0);
  const b = (last ?? "").trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function academicField(
  onboarding: { extraData?: Record<string, unknown> | null } | null,
  key: string,
): string | null {
  const academics = onboarding?.extraData?.academics;
  if (!academics || typeof academics !== "object") return null;
  const v = (academics as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v : null;
}

export default async function InternHome() {
  const session = await getSession();
  if (!session) return null;

  const data = await loadInternData(session.uid);
  const action = nextAction(data.thread);
  const working = data.stage === "working";
  const open = working ? [] : await openProjects(6);

  const [user] = await getDb()
    .select({
      first: schema.users.firstName,
      last: schema.users.lastName,
      email: schema.users.email,
      countryCode: schema.users.countryCode,
      phoneNumber: schema.users.phoneNumber,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);

  // Activation: the one-time ₹2,499 that takes a profile live. Once any paid
  // row exists the card leaves the dashboard for good.
  const [latestPayment] = await getDb()
    .select({ status: schema.internPayments.status })
    .from(schema.internPayments)
    .where(eq(schema.internPayments.internId, session.uid))
    .orderBy(desc(schema.internPayments.createdAt))
    .limit(1);
  const activated = latestPayment?.status === "paid";

  const openRoles = open.filter((p) => !data.proposals.some((mine) => mine.projectId === p.id));

  return (
    <div>
      <PageHead
        title={`Hello, ${user?.first ?? "there"}`}
        lede={
          working
            ? "Here is where your internship stands today, and the one thing waiting on you."
            : "Here is where your applications stand today, and the one thing waiting on you."
        }
      />

      <StatusStrip node={action} stage={data.stage} className="mb-6" />

      <div className="mb-8">
        <InternRetentionHub
          candidateName={`${user?.first ?? ""} ${user?.last ?? ""}`.trim() || "Candidate"}
          findternScore={Number(data.onboarding?.extraData && typeof data.onboarding.extraData === "object" ? (data.onboarding.extraData as Record<string, unknown>).findternScore : null) || 8.3}
          completionPct={Math.round(data.readiness.visible * 100) || 85}
        />
      </div>

      {!working ? (
        <div className="mb-8">
          <ActivationCard
            alreadyPaid={activated}
            internId={session.uid}
            prefill={{
              name: `${user?.first ?? ""} ${user?.last ?? ""}`.trim() || undefined,
              email: user?.email,
              contact: user ? `${user.countryCode}${user.phoneNumber}` : undefined,
            }}
          />
        </div>
      ) : null}

      {/* ── Main column, real reading measure ─────────────────────── */}
      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0">
          <SectionHead
            title="Your thread"
            hint="Everything that has happened, newest first."
            action={
              data.thread.length > 4 ? (
                <Link
                  href="/intern/record"
                  className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Full record
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null
            }
          />

          {data.thread.length === 0 ? (
            <EmptyScene
              art
              title="Your thread starts with your profile"
              body="Once your profile is filled in, every application, interview, timesheet and payment lands here in order. You will always be able to see what is happening and who it is with."
              next={{ label: "Fill in your profile", href: "/intern/onboarding" }}
              who="About four minutes"
            />
          ) : (
            <Thread nodes={data.thread} compact />
          )}
        </section>

        {/* ── The rail: glanceable facts only ───────────────────────
            Three numbers, each answering a question a candidate actually
            has. No cards in here, because nothing in here is worth
            reading at length. */}
        <aside className="space-y-3 lg:pt-8">
          <ReadinessStrip readiness={data.readiness} />

          {working ? (
            <Surface className="p-5">
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
                Stipend on its way
              </h2>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.02em] text-ink-900">
                {moneyPlain(data.money.incomingMinor, data.money.currency)}
              </p>
              <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-600">
                {data.money.nextExpectedAt
                  ? `Scheduled for ${data.money.nextExpectedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}.`
                  : "The date appears here as soon as it is set."}
              </p>
              <Link
                href="/intern/earnings"
                className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                See the breakdown
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Surface>
          ) : null}

          <Surface className="p-5">
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">At a glance</h2>
            <dl className="mt-3 divide-y divide-ink-100">
              <Row label="Offers received" value={String(data.proposals.length)} />
              <Row
                label="Hours approved"
                value={`${data.proofs.filter((p) => p.kind === "hours").length}`}
              />
              <Row label="Records" value={String(data.proofs.length)} />
              <Row
                label="Paid to you"
                value={formatMoney(data.money.paidMinor, "INR")}
              />
            </dl>
            <p className="mt-3 text-pretty text-xs leading-relaxed text-ink-500">
              Counts, not scores. Nothing here ranks you against anyone else.
            </p>
          </Surface>
        </aside>
      </div>

      {/* ── Your profile card ───────────────────────────────────────
          The summary an employer would see, built on the Watermelon
          expandable-profile-card: hero tile, identity line, and an expanded
          view of skills, academics and where to go next. */}
      <section className="mt-12 border-t border-ink-100 pt-8">
        <SectionHead
          title="Your profile"
          hint="This is what an employer sees when they find you."
        />
        <div className="max-w-2xl">
          <ProfileCard
            name={`${user?.first ?? ""} ${user?.last ?? ""}`.trim() || "Candidate"}
            initials={toInitials(user?.first, user?.last)}
            stage={data.stage}
            city={data.onboarding?.city}
            state={data.onboarding?.state}
            bio={data.onboarding?.bio}
            skills={toStringList(data.onboarding?.skills)}
            degree={academicField(data.onboarding, "degree")}
            institution={academicField(data.onboarding, "institution")}
            yearOfGraduation={academicField(data.onboarding, "yearOfGraduation")}
            cgpa={academicField(data.onboarding, "cgpa")}
          />
        </div>
      </section>

      {/* ── Open roles, only while searching ─────────────────────── */}
      {!working && openRoles.length > 0 ? (
        <section className="mt-12 border-t border-ink-100 pt-8">
          <SectionHead
            title="Open roles"
            hint="Companies are hiring for these right now."
            action={
              <Link
                href="/intern/opportunities"
                className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                See all
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
            {openRoles.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/intern/opportunities/${p.id}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200/80 bg-white/95 p-5 shadow-xs transition-all duration-[var(--dur-standard)] hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 font-bold text-xs ring-1 ring-brand-600/20">
                        {p.companyName ? p.companyName.charAt(0).toUpperCase() : <Building2 className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-pretty text-base font-semibold tracking-tight text-ink-900 group-hover:text-brand-800 transition-colors">
                          {p.projectName}
                        </p>
                        <p className="text-xs font-medium text-ink-500">{p.companyName}</p>
                      </div>
                    </div>
                  </div>

                  {p.scopeOfWork ? (
                    <p className="mt-3.5 line-clamp-2 text-pretty text-xs leading-relaxed text-ink-600">
                      {p.scopeOfWork}
                    </p>
                  ) : null}

                  <div className="mt-auto flex items-center justify-between pt-4 border-t border-ink-100/70">
                    <span className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full ring-1 ring-brand-600/15">
                      Actively Hiring
                    </span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-brand-700 group-hover:text-brand-800">
                      Read brief
                      <ArrowRight
                        className="size-3.5 transition-transform duration-[var(--dur-instant)] group-hover:translate-x-1"
                        aria-hidden
                      />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink-900">{value}</dd>
    </div>
  );
}