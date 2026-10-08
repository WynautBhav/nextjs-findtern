import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { toArray } from "@/lib/journey";
import { Panel, PanelHeader, PanelBody } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { InternPayoutTools } from "@/components/admin/intern-payout-tools";
import { InternSkillsEditor } from "@/components/admin/intern-skills-editor";
import { RatingsEditor } from "@/components/admin/ratings-editor";

export const metadata: Metadata = { title: "Intern" };

/**
 * One intern, everything about them.
 *
 * The legacy admin had a 360 view with seven tabs — profile, documents,
 * interviews, proposals, timesheets, payments, bank — and this build had a list
 * with no row to click. Everything it showed came from endpoints that still
 * exist, so this page is a read plus two controls: the payout tools
 * (create / mark paid) and the skills editor.
 *
 * Payouts are the reason this page matters. Stipends are paid by hand, so the
 * row behind "payout" is the record of what the company owes this person, and
 * `referenceId` is the bank reference an auditor would ask for later. Nothing
 * here can mark a payout paid without that reference being on the row.
 */
export default async function AdminInternDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!user) notFound();

  const [onboarding] = await db
    .select()
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, id))
    .limit(1);

  const [interviews, proposals, timesheets, payouts] = await Promise.all([
    db.select().from(schema.interviews).where(eq(schema.interviews.internId, id)).orderBy(desc(schema.interviews.createdAt)),
    db.select().from(schema.proposals).where(eq(schema.proposals.internId, id)).orderBy(desc(schema.proposals.createdAt)),
    db.select().from(schema.timesheets).where(eq(schema.timesheets.internId, id)).orderBy(desc(schema.timesheets.createdAt)),
    db.select().from(schema.internPayouts).where(eq(schema.internPayouts.internId, id)).orderBy(desc(schema.internPayouts.createdAt)),
  ]);

  const employerIds = Array.from(new Set(proposals.map((p) => p.employerId).filter(Boolean))) as string[];
  const employerNames = new Map<string, string>();
  if (employerIds.length > 0) {
    const rows = await db
      .select({ id: schema.employers.id, companyName: schema.employers.companyName })
      .from(schema.employers)
      .where(inArray(schema.employers.id, employerIds));
    for (const r of rows) employerNames.set(r.id, r.companyName);
  }

  // Score, ratings and open-to-work live in extra_data — the same place
  // lib/employer-candidates.ts reads them from, so an admin screen and an
  // employer screen cannot disagree about a candidate's score.
  const extra = (onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = typeof extra.findternScore === "number" ? extra.findternScore : null;
  const openToWork = extra.openToWork === true;
  const ratings = (extra.ratings ?? {}) as Record<string, number>;
  const bank = (extra.bank ?? null) as Record<string, unknown> | null;
  const skills = toArray<string>(onboarding?.skills);
  const paidMinor = payouts.filter((p) => p.status === "paid").reduce((sum, p) => sum + (p.amountMinor ?? 0), 0);
  const owedMinor = payouts.filter((p) => p.status !== "paid").reduce((sum, p) => sum + (p.amountMinor ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/interns"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All interns
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
          {`${user.firstName} ${user.lastName}`.trim()}
        </h1>
        <p className="mt-1 text-sm text-text-subtle">
          {user.email}
          {user.phoneNumber ? ` · ${user.countryCode}${user.phoneNumber}` : ""}
          {user.isActive ? "" : " · deactivated"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Metric label="Findtern Score" value={score !== null ? score.toFixed(1) : "—"} />
        <Metric label="Interviews" value={String(interviews.length)} />
        <Metric label="Proposals" value={String(proposals.length)} />
        <Metric
          label="Paid / owed"
          value={`${formatMoney(paidMinor, "INR")} / ${formatMoney(owedMinor, "INR")}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Profile" description="What a company sees." />
          <PanelBody className="space-y-3 text-sm">
            <Row label="City" value={[onboarding?.city, onboarding?.state].filter(Boolean).join(", ") || "—"} />
            <Row label="Score" value={score !== null ? score.toFixed(1) : "Not scored"} />
            <Row label="Open to work" value={openToWork ? "Yes" : "No"} />
            <Row label="Onboarded" value={onboarding ? "Yes" : "No"} />
            <Row
              label="Skills"
              value={skills.length > 0 ? skills.join(", ") : "None recorded"}
            />
            {onboarding?.bio ? (
              <p className="border-t border-ink-100 pt-3 text-pretty leading-relaxed text-ink-600">
                {onboarding.bio}
              </p>
            ) : null}
            <InternSkillsEditor internId={id} skills={skills} />
            <RatingsEditor
              internId={id}
              ratings={ratings}
              score={typeof extra.findternScore === "number" ? extra.findternScore : null}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Payouts" description="What this person is owed, and what has been sent." />
          <PanelBody>
            <InternPayoutTools internId={id} payouts={payouts} />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Interviews" description={`${interviews.length} scheduled`} />
          <PanelBody className="p-0">
            {interviews.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-500">No interviews.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {interviews.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">
                        {employerNames.get(i.employerId) ?? "Company"}
                      </p>
                      <p className="text-2xs text-ink-500">
                        {[i.slot1, i.slot2, i.slot3]
                          .filter(Boolean)
                          .map((s) => new Date(s!).toLocaleDateString("en-IN", { day: "numeric", month: "short" }))
                          .join(" · ")}
                      </p>
                    </div>
                    <StatusBadge value={i.status} />
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Proposals" description={`${proposals.length} sent`} />
          <PanelBody className="p-0">
            {proposals.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-500">No proposals.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {proposals.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">
                        {employerNames.get(p.employerId) ?? "Company"}
                      </p>
                      <p className="text-2xs text-ink-500">
                        {p.createdAt
                          ? new Date(p.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "No date"}
                      </p>
                    </div>
                    <StatusBadge value={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Timesheets" description={`${timesheets.length} submitted`} />
        <PanelBody className="p-0">
          {timesheets.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">No timesheets.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {timesheets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <p className="text-sm text-ink-700">
                    {new Date(t.periodStart).toLocaleDateString("en-IN", {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <StatusBadge value={t.status} />
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Bank details" description="Held for payouts. Never shown to employers." />
        <PanelBody>
          {bank ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label="Account holder" value={String(bank.holder ?? bank.accountHolderName ?? "—")} />
              <Row label="Bank" value={String(bank.bank ?? bank.bankName ?? "—")} />
              <Row label="IFSC" value={String(bank.ifsc ?? bank.ifscCode ?? "—")} />
              <Row label="Account" value={maskAccount(String(bank.account ?? bank.accountNumber ?? ""))} />
            </dl>
          ) : (
            <p className="text-sm text-ink-500">
              No bank details on file. A payout without them cannot be transferred.
            </p>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-4">
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-ink-900">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-800">{value}</dd>
    </div>
  );
}

/** Only the last four digits: an admin screen is not the place to read out a full account number. */
function maskAccount(value: string): string {
  if (value.length <= 4) return value ? "••••" : "—";
  return `•••• ${value.slice(-4)}`;
}