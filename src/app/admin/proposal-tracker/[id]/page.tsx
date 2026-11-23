import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { interviewLifecycle } from "@/lib/interview-lifecycle";
import { desc, eq } from "drizzle-orm";

import { AdminLoadError, AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { ProposalOfferSummary } from "@/components/admin/proposal-offer-summary";
import { StatusBadge } from "@/components/admin/status-badge";
import { CgpaSlaClock } from "@/components/app/cgpa-sla-clock";
import { DetailRow } from "@/components/app/primitives";
import { proposalTimeline } from "@/lib/admin/proposal-timeline";
import { cgpaBlocksPayment, proposalCgpaGate } from "@/lib/cgpa-verification";
import { getDb, schema } from "@/lib/db";
import { formatIstStamp } from "@/lib/format";
import { listAcceptances } from "@/lib/meetings/gate-service";
import { parseOffer } from "@/lib/offer";
import { expiryOf, EXPIRY_LABEL } from "@/lib/proposal-expiry";

export const metadata: Metadata = { title: "Proposal · Admin" };

/**
 * One proposal, read only: who, which project, the offer (role, hours, rate, dates), its status and expiry reason, the dated
 * steps and the interview it followed. Reached from "View proposal" on the pipeline. Same read permission as the pipeline
 * (the /admin/proposal-tracker path); nothing here writes.
 */
async function load(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      p: schema.proposals,
      internFirst: schema.users.firstName,
      internLast: schema.users.lastName,
      internEmail: schema.users.email,
      companyName: schema.employers.companyName,
      projectName: schema.projects.projectName,
    })
    .from(schema.proposals)
    .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
    .leftJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .where(eq(schema.proposals.id, id))
    .limit(1);
  if (!row) return null;
  const [interview] = row.p.interviewId
    ? await db.select().from(schema.interviews).where(eq(schema.interviews.id, row.p.interviewId)).limit(1)
    : [];
  const [onboarding] = await db
    .select({ extraData: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, row.p.internId))
    .orderBy(desc(schema.internOnboarding.createdAt))
    .limit(1);
  const acceptances = interview ? await listAcceptances(db, interview.id) : [];
  return { ...row, interview: interview ?? null, acceptances, internExtra: onboarding?.extraData ?? null };
}

export default async function AdminProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load(id);
  } catch (error) {
    console.error("[admin/proposal] load failed", error);
    return (
      <Panel>
        <AdminLoadError what="this proposal" retryHref={`/admin/proposal-tracker/${encodeURIComponent(id)}`} />
      </Panel>
    );
  }
  if (!data) notFound();
  const { p, interview } = data;
  const offer = parseOffer(p.offerDetails, p.currency);
  const expiry = expiryOf({ status: p.status, hiredAt: p.hiredAt, offerDetails: p.offerDetails, currency: p.currency });
  // The same hold the pipeline marks: shown on the offer's true status, and never on a full-time acceptance (the hire itself).
  const trueStatus = expiry.expired ? "expired" : p.status;
  const cgpaGate = trueStatus === "accepted" && !p.hiredAt && !offer.fullTime ? proposalCgpaGate({ status: trueStatus, extraData: data.internExtra, offerDetails: p.offerDetails, updatedAt: p.updatedAt }) : null;
  const cgpaHold = cgpaGate && cgpaBlocksPayment(cgpaGate) ? cgpaGate : null;
  const candidate = `${data.internFirst ?? ""} ${data.internLast ?? ""}`.trim() || "Candidate";
  const steps = proposalTimeline({ status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt, hiredAt: p.hiredAt, offerDetails: p.offerDetails, interviewAt: interview?.createdAt ?? null });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={`${candidate} · ${data.companyName ?? "Company"}`}
        subtitle={`${data.projectName ?? "Project"} · ${offer.fullTime ? "Full-time offer" : "Internship offer"}`}
        action={
          <Link href="/admin/proposal-tracker" className="text-sm font-medium text-brand-700 hover:underline">
            Back to the pipeline
          </Link>
        }
      />
      <Panel>
        <PanelHeader title="Status" />
        <PanelBody>
          <div className="flex flex-wrap items-center gap-3">
            {/* The offer's true status, as the pipeline, the intern and the employer read it (a lapsed "sent" offer is expired). */}
            <StatusBadge value={trueStatus} />
            {cgpaHold ? (
              <>
                <StatusBadge tone="warning" label={cgpaHold.state === "incorrect_unacked" ? "CGPA corrected: company to confirm" : "CGPA verifying"} />
                {cgpaHold.state === "incorrect_unacked" ? null : <CgpaSlaClock acceptedAt={cgpaHold.acceptedAt} />}
              </>
            ) : null}
            {expiry.expired && expiry.reason ? <span className="text-sm text-text-subtle">{EXPIRY_LABEL[expiry.reason]}</span> : null}
          </div>
          <dl className="mt-3 divide-y divide-[color:var(--admin-rule)]">
            <DetailRow label="Candidate" value={<Link href={`/admin/interns/${p.internId}`} className="text-brand-700 hover:underline">{candidate}</Link>} />
            <DetailRow label="Company" value={<Link href={`/admin/companies/${p.employerId}`} className="text-brand-700 hover:underline">{data.companyName ?? "Company"}</Link>} />
            <DetailRow label="Project" value={data.projectName ?? "-"} />
            <DetailRow label="Flow" value={p.flowType === "interview_first" ? "Interview first" : "Direct offer"} />
          </dl>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Offer" description="Role, hours, rate and dates as the company sent them." />
        <PanelBody>
          <ProposalOfferSummary proposalId={p.id} offerDetails={p.offerDetails} currency={p.currency} />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Timeline" />
        <PanelBody>
          <ol className="divide-y divide-[color:var(--admin-rule)]">
            {steps.map((s) => (
              <li key={s.key} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-sm font-medium text-foreground">{s.label}</span>
                <span className="nums text-sm text-text-subtle">{formatIstStamp(s.at)} IST</span>
              </li>
            ))}
          </ol>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Linked interview" />
        <PanelBody>
          {interview ? (
            <dl className="divide-y divide-[color:var(--admin-rule)]">
              <DetailRow label="Status" value={<StatusBadge value={interviewLifecycle(interview).status} />} />
              <DetailRow label="Booked" value={interview.createdAt ? `${formatIstStamp(interview.createdAt)} IST` : "-"} />
              <DetailRow label="Meeting link" value={interview.meetingLink ? <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Open link</a> : "No link"} />
              <DetailRow
                label="Rules agreed"
                value={
                  data.acceptances.length ? (
                    <ul className="space-y-0.5">
                      {data.acceptances.map((a) => (
                        <li key={`${a.userType}-${a.userId}-${a.version}`}>
                          {a.userType === "intern" ? candidate : (data.companyName ?? "Company")} ({a.userType}) · {formatIstStamp(a.acceptedAt)} IST · version {a.version}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "Nobody has agreed at the meeting gate yet"
                  )
                }
              />
            </dl>
          ) : (
            <p className="text-sm text-text-subtle">{p.flowType === "interview_first" ? "The interview record is no longer linked." : "This was a direct offer, with no interview."}</p>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
