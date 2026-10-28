"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Download, Eye, EyeOff, FileText, Link2, Loader2, Video } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { toInrMinor } from "@/lib/admin/money";
import { formatDate, formatMoney, formatSlotTime, shortDate } from "@/lib/format";
import { StatusBadge, humanizeStatus } from "@/components/admin/status-badge";
import { InternPayoutTools } from "@/components/admin/intern-payout-tools";
import { owedMinor, stipendDues } from "@/lib/admin/stipend-dues";
import { InternSkillsEditor } from "@/components/admin/intern-skills-editor";
import { RatingsEditor } from "@/components/admin/ratings-editor";
import { DOCUMENT_SLOTS, type CandidateDocument } from "@/lib/admin/candidate-documents-list";
import { normaliseEntries, countStatuses } from "@/lib/employer-timesheets";
import { offerScore, parseOffer } from "@/lib/offer";
import { ProposalOfferSummary } from "@/components/admin/proposal-offer-summary";
import { draftFromRecord } from "@/lib/onboarding";
import type { RevealField } from "@/lib/admin/identity-mask";
import type { User as UserType, InternOnboarding, Interview, Proposal, Timesheet, InternPayout } from "@/lib/db/schema";
import { DetailRow, EmptyScene, PageHead, Pill, pillTabClass, SectionHead, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { StatCard, StatGrid } from "@/components/admin/stat-card";

/**
 * Candidate 360: everything staff need about one candidate on one page.
 *
 * Identity and the live controls (review, visibility, account) first, then
 * four figures, then the record in tabs: profile (every field the candidate
 * filled, ADP-01), documents with View / Download (ADP-28), interviews with
 * real times (ADP-32), structured offers (ADP-30), timesheets day by day
 * (ADP-08), payouts and bank details.
 */

export type Intern360Props = {
  user: Omit<UserType, "password">;
  onboarding: InternOnboarding | null;
  documents: CandidateDocument[];
  hasPhoto: boolean;
  interviews: Interview[];
  proposals: Proposal[];
  timesheets: Timesheet[];
  payouts: InternPayout[];
  employerNames: Record<string, string>;
  projectNames: Record<string, string>;
  /** Tab to open first (`?tab=` deep link, e.g. "payments"). */
  initialTab?: string;
  feePaid: boolean;
  profileComplete: boolean;
  /** Edit contact, View as. */
  actions?: React.ReactNode;
  /** Review, visibility and account controls. */
  controls?: React.ReactNode;
};

const TAB_KEYS = ["profile", "documents", "interviews", "proposals", "timesheets", "payments", "bank"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const IST = "Asia/Kolkata";
const MODE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const PROPOSAL_STATUSES = ["sent", "interview_scheduled", "accepted", "hired", "rejected", "withdrawn", "expired", "draft"];

export function Intern360View({
  actions,
  controls,
  user,
  onboarding,
  documents,
  hasPhoto,
  interviews,
  proposals,
  timesheets,
  payouts,
  employerNames,
  projectNames,
  initialTab,
  feePaid,
  profileComplete,
}: Intern360Props) {
  const [tab, setTab] = useState<TabKey>(() => TAB_KEYS.find((k) => k === initialTab) ?? "profile");
  const [photoFailed, setPhotoFailed] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [interviewFilter, setInterviewFilter] = useState("all");
  const [proposalFilter, setProposalFilter] = useState("all");

  const extra = (onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = typeof extra.findternScore === "number" ? extra.findternScore : null;
  const ratings = (extra.ratings ?? {}) as Record<string, number>;
  const draft = onboarding ? draftFromRecord(onboarding) : null;
  const skills = draft?.skills ?? [];
  const openToWork = extra.openToWork !== false;
  // What decides whether employers can see this candidate, first reason wins.
  const hiddenWhy =
    user.profileVisibility === "hidden"
      ? "Hidden by Findtern (the visibility switch)."
      : !openToWork
        ? extra.hiddenByAdmin === true
          ? "Hidden by an admin."
          : "The candidate turned off Open to work."
        : !profileComplete
          ? "The profile is incomplete."
          : "";
  const visibleToEmployers = !hiddenWhy;

  const paidMinor = payouts.filter((p) => p.status === "paid").reduce((sum, p) => sum + toInrMinor(p.amountMinor, p.currency), 0);
  const dues = stipendDues(proposals, payouts, score);
  const unlinkedPendingMinor = payouts
    .filter((p) => {
      const raw = (p.raw ?? {}) as Record<string, unknown>;
      return p.status === "pending" && !raw.proposalId && !raw.proposal_id;
    })
    .reduce((sum, p) => sum + toInrMinor(p.amountMinor, p.currency), 0);
  const owedTotalMinor = owedMinor(dues, unlinkedPendingMinor);
  const hiredCount = proposals.filter((p) => p.status === "hired" || p.hiredAt).length;
  const scheduledCount = interviews.filter((i) => i.status === "scheduled").length;

  const company = (id: string | null | undefined) => (id && employerNames[id]) || null;
  const project = (id: string | null | undefined) => (id && projectNames[id]) || null;

  const fullName = `${user.firstName} ${user.lastName}`.trim() || "Candidate";
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() || "?";
  const location = [draft?.city, draft?.state].filter(Boolean).join(", ");

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "profile", label: "Profile" },
    { key: "documents", label: "Documents", count: documents.length },
    { key: "interviews", label: "Interviews", count: interviews.length },
    { key: "proposals", label: "Proposals", count: proposals.length },
    { key: "timesheets", label: "Timesheets", count: timesheets.length },
    { key: "payments", label: "Payouts", count: payouts.length },
    { key: "bank", label: "Bank details" },
  ];

  const interviewStatuses = [...new Set(interviews.map((i) => i.status))];
  const filteredInterviews = interviews.filter((i) => interviewFilter === "all" || i.status === interviewFilter);
  const proposalStatuses = [...new Set([...PROPOSAL_STATUSES, ...proposals.map((p) => p.status)])];
  const filteredProposals = proposals.filter((p) => proposalFilter === "all" || p.status === proposalFilter);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/interns"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All candidates
      </Link>

      <PageHead
        className="mb-6"
        title={
          <span className="flex items-center gap-4">
            {hasPhoto && !photoFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- access-checked API route, not a static asset
              <img
                src={`/api/intern/avatar?id=${encodeURIComponent(user.id)}`}
                alt=""
                onError={() => setPhotoFailed(true)}
                // A failure before hydration never fires onError; catch it here.
                ref={(el) => {
                  if (el && el.complete && el.naturalWidth === 0) setPhotoFailed(true);
                }}
                className="size-16 shrink-0 rounded-full object-cover ring-1 ring-ink-200"
              />
            ) : (
              <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-100 text-xl font-semibold text-brand-800">
                {initials}
              </span>
            )}
            <span className="min-w-0 break-words">{fullName}</span>
          </span>
        }
        lede={
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-[0.9375rem]">
            <a href={`mailto:${user.email}`} className="break-all underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
              {user.email}
            </a>
            {user.phoneNumber ? (
              <span className="nums">
                {user.countryCode || "+91"} {user.phoneNumber}
              </span>
            ) : null}
            {location ? <span>{location}</span> : null}
            <span>Joined {formatDate(user.createdAt)}</span>
          </span>
        }
        action={actions}
      />

      <Surface className="flex flex-wrap items-start gap-x-8 gap-y-4 p-5">
        {controls}
        {/* One derived answer to "can employers see them?": the switch said
            Live beside a "Hidden by candidate" pill (critique A). */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 self-center text-sm text-ink-600">
          <Pill tone={visibleToEmployers ? "live" : "waiting"}>{visibleToEmployers ? "Employers can see them" : "Employers can't see them"}</Pill>
          {hiddenWhy ? <span>{hiddenWhy}</span> : null}
          <Pill tone={feePaid ? "paid" : "closed"}>{feePaid ? "Activation fee paid" : "Activation fee unpaid"}</Pill>
        </div>
      </Surface>

      {/* The admin summary strip, as on Company detail and the lists. */}
      <StatGrid cols={4}>
        <StatCard
          label="Findtern Score"
          value={score === null ? "-" : `${score.toFixed(1)}/10`}
          hint={
            score === null
              ? "Not scored yet"
              : `Comm ${ratings.communication ?? "-"} · Coding ${ratings.coding ?? "-"} · Apt ${ratings.aptitude ?? "-"} · AI ${ratings.interview ?? "-"}`
          }
        />
        <StatCard label="Proposals" value={proposals.length} hint={hiredCount ? `${hiredCount} hired` : proposals.length ? "None hired" : "None yet"} />
        <StatCard label="Interviews" value={interviews.length} hint={scheduledCount ? `${scheduledCount} scheduled` : interviews.length ? "None scheduled" : "None yet"} />
        <StatCard
          label="Paid to candidate"
          value={formatMoney(paidMinor, "INR", { zeroLabel: "₹0" })}
          hint={owedTotalMinor > 0 ? `${formatMoney(owedTotalMinor, "INR")} still owed` : paidMinor > 0 ? "Nothing owed" : "Nothing paid yet"}
          tone={owedTotalMinor > 0 ? "warning" : "neutral"}
        />
      </StatGrid>

      <div role="tablist" aria-label="Candidate record" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={pillTabClass(tab === t.key)}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className={cn("nums text-xs", tab === t.key ? "text-white/75" : "text-text-subtle")}>
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "profile" ? (
          <ProfileTab internId={user.id} onboarding={onboarding} draft={draft} extra={extra} ratings={ratings} score={score} skills={skills} />
        ) : null}

        {tab === "documents" ? <DocumentsTab internId={user.id} documents={documents} /> : null}

        {tab === "interviews" ? (
          <div className="space-y-4">
            <FilterBar
              label="Interview status"
              value={interviewFilter}
              onChange={setInterviewFilter}
              options={interviewStatuses}
              count={filteredInterviews.length}
              noun="interview"
            />
            {filteredInterviews.length === 0 ? (
              <EmptyScene
                title={interviews.length ? "No interviews with this status" : "No interviews yet"}
                body={interviews.length ? "Pick another status to see the rest." : "Interviews appear here once a company or the AI interview books one."}
                who="Companies and the candidate act next"
              />
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {filteredInterviews.map((i) => (
                  <InterviewCard
                    key={i.id}
                    interview={i}
                    company={company(i.employerId)}
                    project={project(i.projectId)}
                    onManage={() => setSelectedInterview(i)}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "proposals" ? (
          <div className="space-y-4">
            <FilterBar
              label="Proposal status"
              value={proposalFilter}
              onChange={setProposalFilter}
              options={proposalStatuses}
              count={filteredProposals.length}
              noun="proposal"
            />
            {filteredProposals.length === 0 ? (
              <EmptyScene
                title={proposals.length ? "No proposals with this status" : "No proposals yet"}
                body={proposals.length ? "Pick another status to see the rest." : "Offers from companies appear here."}
                who="Companies act next"
              />
            ) : (
              <Surface className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="border-b border-ink-100 bg-ink-50 text-xs font-semibold text-ink-600">
                    <tr>
                      <th scope="col" className="px-4 py-2.5">Company and project</th>
                      <th scope="col" className="px-4 py-2.5">Type</th>
                      <th scope="col" className="px-4 py-2.5 text-right">Monthly / CTC</th>
                      <th scope="col" className="px-4 py-2.5">Starts</th>
                      <th scope="col" className="px-4 py-2.5">Status</th>
                      <th scope="col" className="px-4 py-2.5">Sent</th>
                      <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {filteredProposals.map((p) => {
                      const offer = parseOffer(p.offerDetails, p.currency);
                      return (
                        <tr key={p.id} className="hover:bg-ink-50/60">
                          <td className="px-4 py-3">
                            {p.employerId && company(p.employerId) ? (
                              <Link href={`/admin/companies/${p.employerId}`} className="font-semibold text-ink-900 underline-offset-4 hover:underline">
                                {company(p.employerId)}
                              </Link>
                            ) : (
                              <span className="font-semibold text-ink-900">Company</span>
                            )}
                            <p className="text-ink-600">{offer.roleTitle || project(p.projectId) || "Project"}</p>
                          </td>
                          <td className="px-4 py-3 text-ink-700">{offer.fullTime ? "Full-time" : "Internship"}</td>
                          <td className="nums px-4 py-3 text-right font-medium text-ink-900">
                            {offer.fullTime
                              ? offer.fullTime.annualCtcMinor
                                ? `${formatMoney(offer.fullTime.annualCtcMinor, offer.currency)} a year`
                                : "-"
                              : offer.monthlyMinor
                                ? formatMoney(offer.monthlyMinor, offer.currency)
                                : "-"}
                          </td>
                          <td className="nums whitespace-nowrap px-4 py-3 text-ink-700">{offer.startDate ? formatDate(offer.startDate) : "-"}</td>
                          <td className="px-4 py-3"><StatusBadge value={p.status} /></td>
                          <td className="nums whitespace-nowrap px-4 py-3 text-ink-600">{formatDate(p.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <button type="button" onClick={() => setSelectedProposal(p)} className={buttonClass({ variant: "outline", size: "sm" })}>
                              <Eye className="size-4" aria-hidden />
                              View offer
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Surface>
            )}
          </div>
        ) : null}

        {tab === "timesheets" ? <TimesheetsTab timesheets={timesheets} company={company} project={project} proposals={proposals} /> : null}

        {tab === "payments" ? (
          <Surface className="p-5 sm:p-6">
            <SectionHead title="Stipend payouts" hint="What is owed per placement, and every payout recorded for this candidate." />
            <InternPayoutTools
              internId={user.id}
              payouts={payouts}
              placements={proposals
                .filter((p) => p.status === "hired" || p.hiredAt)
                .map((p) => ({
                  id: p.id,
                  employerId: p.employerId ?? "",
                  label: `${company(p.employerId) ?? "Company"} · ${project(p.projectId) ?? "Project"}`,
                }))}
              dues={dues}
            />
          </Surface>
        ) : null}

        {tab === "bank" ? (
          <Surface className="p-5 sm:p-6">
            <SectionHead
              title="Bank account for stipends"
              hint="The account number shows its last four. Reveal it only when you are making a payment; each reveal is logged."
            />
            {draft?.bank && (draft.bank.accountNumber || draft.bank.upiId) ? (
              <dl className="divide-y divide-ink-100">
                <DetailRow label="Account holder" value={draft.bank.accountHolderName || "-"} />
                <DetailRow label="Bank" value={draft.bank.bankName || "-"} />
                <DetailRow label="IFSC" value={draft.bank.ifscCode || "-"} mono />
                <DetailRow
                  label="Account number"
                  value={<RevealValue internId={user.id} field="bank" masked={draft.bank.accountNumber} label="account number" />}
                  mono
                />
                <DetailRow label="UPI ID" value={draft.bank.upiId || "-"} mono />
              </dl>
            ) : (
              <EmptyScene
                title="No bank details yet"
                body="The candidate adds these on the About step of their profile. Stipends can't be paid until they do."
                who="The candidate acts next"
              />
            )}
          </Surface>
        ) : null}
      </div>

      <ProposalDialog
        proposal={selectedProposal}
        onClose={() => setSelectedProposal(null)}
        company={company(selectedProposal?.employerId)}
        project={project(selectedProposal?.projectId)}
      />
      <InterviewDialog
        interview={selectedInterview}
        onClose={() => setSelectedInterview(null)}
        onSaved={setSelectedInterview}
        company={company(selectedInterview?.employerId)}
        extra={extra}
      />
    </div>
  );
}

/* ── Profile ───────────────────────────────────────────────────────── */

function ProfileTab({
  internId,
  onboarding,
  draft,
  extra,
  ratings,
  score,
  skills,
}: {
  internId: string;
  onboarding: InternOnboarding | null;
  draft: ReturnType<typeof draftFromRecord> | null;
  extra: Record<string, unknown>;
  ratings: Record<string, number>;
  score: number | null;
  skills: string[];
}) {
  if (!onboarding || !draft) {
    return (
      <EmptyScene
        title="No profile yet"
        body="This candidate signed up but has not started their profile. Ratings can still be imported in bulk from the candidate list."
        who="The candidate acts next"
      />
    );
  }
  const a = draft.academics;
  const yesNo = (v: boolean | null | undefined) => (v === true ? "Yes" : v === false ? "No" : "-");
  const phone = (cc: string | undefined, n: string | undefined) => (n ? `${cc || "+91"} ${n}` : "");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <Surface className="p-5 sm:p-6">
          <SectionHead title="About" />
          <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-800">{draft.bio || "No bio written yet."}</p>
          {draft.previewSummary ? <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">{draft.previewSummary}</p> : null}
        </Surface>

        <Surface className="p-5 sm:p-6">
          <SectionHead title="Profile details" hint="What the candidate entered during onboarding. Read-only." />
          <dl className="divide-y divide-ink-100">
            <DetailRow
              label="LinkedIn"
              value={
                draft.linkedinUrl ? (
                  <a href={draft.linkedinUrl} target="_blank" rel="noopener noreferrer" className="break-all text-brand-700 underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                    {draft.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                ) : (
                  "-"
                )
              }
            />
            <DetailRow label="Location" value={[draft.city, draft.state, draft.pinCode].filter(Boolean).join(", ") || "-"} />
            <DetailRow label="Work modes" value={draft.locationTypes?.length ? draft.locationTypes.map((m) => MODE[m] ?? m).join(", ") : "-"} />
            <DetailRow label="Preferred cities" value={draft.preferredLocations?.length ? draft.preferredLocations.join(", ") : "-"} />
            <DetailRow label="Has a laptop" value={yesNo(draft.hasLaptop)} />
            <DetailRow label="Aadhaar number" value={<RevealValue internId={internId} field="aadhaar" masked={draft.aadhaarNumber} label="Aadhaar number" />} mono />
            <DetailRow label="PAN" value={<RevealValue internId={internId} field="pan" masked={draft.panNumber} label="PAN" />} mono />
            <DetailRow
              label="Emergency contact"
              value={[draft.emergencyName, draft.emergencyRelation, phone(draft.emergencyCountryCode, draft.emergencyPhone)].filter(Boolean).join(" · ") || "-"}
            />
            {draft.secondPocName || draft.secondPocPhone ? (
              <DetailRow
                label="Second contact"
                value={[draft.secondPocName, draft.secondPocRelation, phone(draft.secondPocCountryCode, draft.secondPocPhone)].filter(Boolean).join(" · ")}
              />
            ) : null}
            <DetailRow label="NDA accepted" value={typeof extra.ndaAcceptedAt === "string" ? formatDate(extra.ndaAcceptedAt) : "No"} />
          </dl>
        </Surface>

        <Surface className="p-5 sm:p-6">
          <SectionHead title="Education" />
          {a?.institution || a?.degree ? (
            <div>
              <p className="font-semibold text-ink-900">{a.institution || "Institution not given"}</p>
              <p className="text-sm text-ink-700">{[a.qualificationLevel, a.degree, a.branch].filter(Boolean).join(" · ")}</p>
              <p className="nums mt-1 text-sm text-ink-600">
                {[
                  a.status,
                  a.startYear || a.yearOfGraduation ? `${a.startYear || "?"}–${a.yearOfGraduation || "?"}` : "",
                  a.cgpa ? `${a.scoreType === "percentage" ? "Percentage" : "CGPA"} ${a.cgpa}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-600">No academics added.</p>
          )}
          {[...(a?.professional ?? []).map((q) => ({ ...q, kind: "Professional course" })), ...(a?.certifications ?? []).map((q) => ({ ...q, kind: "Certification" }))].length ? (
            <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
              {[...(a?.professional ?? []).map((q) => ({ ...q, kind: "Professional course" })), ...(a?.certifications ?? []).map((q) => ({ ...q, kind: "Certification" }))].map((q, i) => (
                // Legacy rows often have no id, so the index keeps keys unique.
                <li key={`${q.kind}-${q.id ?? ""}-${i}`} className="py-3 text-sm">
                  <p className="font-medium text-ink-900">
                    {q.name || q.kind}
                    <span className="ml-2 text-xs font-normal text-text-subtle">{q.kind}</span>
                  </p>
                  <p className="text-ink-600">
                    {[q.issuer, q.completionDate ? formatDate(q.completionDate) : ""].filter(Boolean).join(" · ") || "-"}
                    {q.credentialUrl ? (
                      <>
                        {" · "}
                        <a href={q.credentialUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline-offset-4 hover:underline">
                          Credential
                        </a>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-sm text-ink-600">Marksheets and certificate files are on the Documents tab.</p>
        </Surface>

        <Surface className="p-5 sm:p-6">
          <SectionHead title="Experience" />
          {draft.experiences?.length ? (
            <ul className="divide-y divide-ink-100">
              {draft.experiences.map((e) => (
                <li key={e.id} className="py-3 first:pt-0">
                  <p className="font-medium text-ink-900">
                    {e.role || e.type} {e.company ? <span className="font-normal text-ink-600">at {e.company}</span> : null}
                  </p>
                  <p className="nums text-sm text-ink-600">
                    {e.type} · {e.from ? formatDate(e.from) : "?"} – {e.current ? "Present" : e.to ? formatDate(e.to) : "?"}
                  </p>
                  {e.description ? <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{e.description}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">No experience added.</p>
          )}
        </Surface>

        <div className="grid gap-4 md:grid-cols-2">
          <Surface className="p-5 sm:p-6">
            <SectionHead title="Languages" />
            {draft.languages?.length ? (
              <ul className="space-y-2 text-sm">
                {draft.languages.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink-900">{l.language || "-"}</span>
                    <span className="text-ink-600">
                      {l.level}
                      {[l.read && "read", l.write && "write", l.speak && "speak"].filter(Boolean).length
                        ? ` · ${[l.read && "read", l.write && "write", l.speak && "speak"].filter(Boolean).join(", ")}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">None added.</p>
            )}
          </Surface>
          <Surface className="p-5 sm:p-6">
            <SectionHead title="Extracurricular" />
            {draft.extracurriculars?.length ? (
              <ul className="space-y-2 text-sm">
                {draft.extracurriculars.map((x) => (
                  <li key={x.id}>
                    <span className="font-medium text-ink-900">{x.activity || "-"}</span>
                    <span className="text-ink-600"> · {[x.category, x.level].filter(Boolean).join(" · ")}</span>
                    {x.description ? <p className="text-ink-600">{x.description}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">None added.</p>
            )}
          </Surface>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <Surface className="p-5 sm:p-6">
          <SectionHead title="Skills" hint="What employers see on the candidate card." />
          <InternSkillsEditor internId={internId} skills={draft.skillsWithRatings ?? skills.map((name) => ({ name, rating: "Beginner" as const }))} />
        </Surface>
        <Surface className="p-5 sm:p-6">
          <SectionHead title="Score and ratings" hint="The Findtern Score is the mean of the four ratings; it sets the price band." />
          <RatingsEditor
            internId={internId}
            ratings={ratings}
            score={score}
            initialFeedbackLink={(extra.aiFeedbackLink as string) || null}
            initialRecordingLink={(extra.aiRecordingLink as string) || null}
          />
        </Surface>
      </div>
    </div>
  );
}

/* ── Documents ─────────────────────────────────────────────────────── */

function DocumentsTab({ internId, documents }: { internId: string; documents: CandidateDocument[] }) {
  const missing = DOCUMENT_SLOTS.filter((slot) => !documents.some((d) => d.label === slot));
  const href = (key: string, download = false) =>
    `/admin/interns/${encodeURIComponent(internId)}/documents/open?key=${encodeURIComponent(key)}${download ? "&download=1" : ""}`;
  return (
    <Surface className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="border-b border-ink-100 bg-ink-50 text-xs font-semibold text-ink-600">
          <tr>
            <th scope="col" className="px-4 py-2.5">Document</th>
            <th scope="col" className="px-4 py-2.5">Group</th>
            <th scope="col" className="px-4 py-2.5 text-right">Size</th>
            <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {documents.map((d) => (
            <tr key={d.key} className="hover:bg-ink-50/60">
              <td className="px-4 py-3 font-medium text-ink-900">{d.label}</td>
              <td className="px-4 py-3 text-ink-600">{d.group}</td>
              <td className="nums px-4 py-3 text-right text-ink-600">{d.size ? fileSize(d.size) : "-"}</td>
              <td className="px-4 py-3">
                <span className="flex justify-end gap-1.5">
                  <a href={href(d.key)} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                    <Eye className="size-4" aria-hidden />
                    View
                  </a>
                  <a href={href(d.key, true)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                    <Download className="size-4" aria-hidden />
                    Download
                  </a>
                </span>
              </td>
            </tr>
          ))}
          {missing.map((slot) => (
            <tr key={slot}>
              <td className="px-4 py-3 text-ink-700">{slot}</td>
              <td className="px-4 py-3 text-ink-600">{slot === "Aadhaar card" || slot === "PAN card" ? "Identity" : "Media"}</td>
              <td className="px-4 py-3 text-right text-text-subtle">-</td>
              <td className="px-4 py-3 text-right">
                <Pill tone="closed">Not uploaded</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Surface>
  );
}

/* ── Interviews ────────────────────────────────────────────────────── */

function InterviewCard({
  interview: i,
  company,
  project,
  onManage,
}: {
  interview: Interview;
  company: string | null;
  project: string | null;
  onManage: () => void;
}) {
  const slots = [i.slot1, i.slot2, i.slot3];
  const zone = i.timezone && i.timezone !== IST ? i.timezone : null;
  return (
    <Surface as="li" className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {company && i.employerId ? (
            <Link href={`/admin/companies/${i.employerId}`} className="font-semibold text-ink-900 underline-offset-4 hover:underline">
              {company}
            </Link>
          ) : (
            <p className="font-semibold text-ink-900">AI interview</p>
          )}
          <p className="text-sm text-ink-600">{project ?? (company ? "No project linked" : "Findtern assessment")}</p>
        </div>
        <StatusBadge value={i.status} />
      </div>
      <ul className="space-y-1.5 text-sm">
        {slots.every((s) => !s) ? <li className="text-ink-600">No time slots offered yet.</li> : null}
        {slots.map((s, idx) =>
          s ? (
            <li key={idx} className={cn("flex flex-wrap items-baseline gap-x-2", i.selectedSlot === idx + 1 ? "text-ink-900" : "text-ink-600")}>
              <span className="nums font-medium">{formatSlotTime(s, IST)}</span>
              {zone ? <span className="nums text-xs text-text-subtle">({formatSlotTime(s, zone)})</span> : null}
              {i.selectedSlot === idx + 1 ? <Pill tone="live">Booked</Pill> : null}
            </li>
          ) : null,
        )}
      </ul>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
        {i.meetingLink ? (
          <a href={i.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
            <Video className="size-4" aria-hidden />
            Meeting link
          </a>
        ) : (
          <span className="text-sm text-ink-600">No meeting link yet</span>
        )}
        <button type="button" onClick={onManage} className={buttonClass({ variant: "outline", size: "sm" })}>
          <Link2 className="size-4" aria-hidden />
          Manage links
        </button>
      </div>
    </Surface>
  );
}

function InterviewDialog({
  interview,
  onClose,
  onSaved,
  company,
  extra,
}: {
  interview: Interview | null;
  onClose: () => void;
  onSaved: (i: Interview) => void;
  company: string | null;
  extra: Record<string, unknown>;
}) {
  const [seen, setSeen] = useState<string | null>(null);
  const [meeting, setMeeting] = useState("");
  const [feedback, setFeedback] = useState("");
  const [recording, setRecording] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Reset the form when a different interview opens.
  if (interview && seen !== interview.id) {
    setSeen(interview.id);
    const notes = interview.notes || "";
    setMeeting(interview.meetingLink ?? "");
    setFeedback(notes.match(/feedback:\s*(https?:\/\/\S+)/i)?.[1] ?? ((extra.aiFeedbackLink as string) || ""));
    setRecording(notes.match(/recording:\s*(https?:\/\/\S+)/i)?.[1] ?? ((extra.aiRecordingLink as string) || ""));
    setMsg(null);
  }

  async function save() {
    if (!interview) return;
    const bad = [
      ["Meeting link", meeting],
      ["Report", feedback],
      ["Recording", recording],
    ].find(([, v], i) => (i === 0 || v.trim()) && !/^https?:\/\/\S+$/i.test(v.trim()));
    if (bad) {
      setMsg({ text: `${bad[0]} must be a full link starting with http:// or https://`, ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await csrfFetch(`/api/admin/interviews/${interview.id}/meeting-link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingLink: meeting.trim(), feedbackLink: feedback.trim() || null, recordingLink: recording.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the links.");
      setMsg({ text: "Saved. The candidate (and the company, for a company interview) has been notified.", ok: true });
      if (data.interview) onSaved(data.interview);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Could not save the links.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  const field = "h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/20";

  return (
    <Dialog open={interview !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-ink-900">{company ?? "AI interview"}</DialogTitle>
          <DialogDescription className="text-sm text-ink-600">
            {interview ? <>Status: {humanizeStatus(interview.status)}</> : null}
          </DialogDescription>
        </DialogHeader>
        {interview ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="iv-meeting" className="block text-sm font-medium text-ink-800">
                Meeting link
              </label>
              <input id="iv-meeting" type="url" value={meeting} onChange={(e) => setMeeting(e.target.value)} placeholder="https://meet.google.com/… or Incruiter link" className={cn(field, "mt-1")} />
              <p className="mt-1 text-xs text-text-subtle">
                For an AI interview, saving a link opens it to the candidate. For a company interview, both sides are notified.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="iv-feedback" className="block text-sm font-medium text-ink-800">
                  Report (PDF URL)
                </label>
                <input id="iv-feedback" type="url" value={feedback} onChange={(e) => setFeedback(e.target.value)} className={cn(field, "mt-1")} />
              </div>
              <div>
                <label htmlFor="iv-recording" className="block text-sm font-medium text-ink-800">
                  Recording URL
                </label>
                <input id="iv-recording" type="url" value={recording} onChange={(e) => setRecording(e.target.value)} className={cn(field, "mt-1")} />
              </div>
            </div>
            <button type="button" onClick={save} disabled={saving || !meeting.trim()} className={buttonClass({ variant: "primary", block: true })}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
              Save links
            </button>
            {msg ? (
              <p role={msg.ok ? "status" : "alert"} className={cn("rounded-apple-sm px-3 py-2 text-sm", msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                {msg.text}
              </p>
            ) : null}
            {interview.notes ? (
              <div className="rounded-apple-md bg-ink-50 p-3">
                <p className="text-xs font-semibold text-ink-600">Notes</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-800">{interview.notes}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ── Proposals ─────────────────────────────────────────────────────── */

function ProposalDialog({
  proposal,
  onClose,
  company,
  project,
}: {
  proposal: Proposal | null;
  onClose: () => void;
  company: string | null;
  project: string | null;
}) {
  const offer = proposal ? parseOffer(proposal.offerDetails, proposal.currency) : null;
  const score = proposal ? offerScore(proposal.offerDetails) : null;
  return (
    <Dialog open={proposal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-ink-900">
            <FileText className="size-5 text-brand-700" aria-hidden />
            {offer?.roleTitle || project || "Offer"}
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-600">
            {company ?? "Company"}
            {project && offer?.roleTitle ? ` · ${project}` : ""} · {offer?.fullTime ? "Full-time offer" : "Internship offer"}
          </DialogDescription>
        </DialogHeader>
        {proposal ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={proposal.status} />
              <span className="text-sm text-ink-600">
                {proposal.flowType === "direct" ? "Direct offer" : "Interview first"} · sent {formatDate(proposal.createdAt)}
                {proposal.hiredAt ? ` · hired ${formatDate(proposal.hiredAt)}` : ""}
                {score ? ` · priced on score ${score.toFixed(1)}` : ""}
              </span>
            </div>
            <ProposalOfferSummary proposalId={proposal.id} offerDetails={proposal.offerDetails} currency={proposal.currency} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ── Timesheets ────────────────────────────────────────────────────── */

type EntryExtra = { hours: number | null; note: string };

function entryExtras(entries: unknown): Map<string, EntryExtra> {
  const out = new Map<string, EntryExtra>();
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const date = typeof r.date === "string" ? r.date.slice(0, 10) : "";
    if (!date) continue;
    const hours = Number(r.hours);
    const note = [r.note, r.notes, r.remarks, r.description, r.task].find((v) => typeof v === "string" && v.trim()) as string | undefined;
    out.set(date, { hours: Number.isFinite(hours) && hours > 0 ? hours : null, note: note?.trim() ?? "" });
  }
  return out;
}

function TimesheetsTab({
  timesheets,
  proposals,
  company,
  project,
}: {
  timesheets: Timesheet[];
  proposals: Proposal[];
  company: (id: string | null | undefined) => string | null;
  project: (id: string | null | undefined) => string | null;
}) {
  if (!timesheets.length) {
    return <EmptyScene title="No timesheets yet" body="Timesheets appear once the candidate is hired and logs their days." who="The candidate acts next" />;
  }
  return (
    <ul className="space-y-3">
      {timesheets.map((t) => {
        const days = normaliseEntries(t.entries, t.periodStart, t.periodEnd);
        const counts = countStatuses(days);
        const extras = entryExtras(t.entries);
        const hours = [...extras.values()].reduce((s, e) => s + (e.hours ?? 0), 0);
        const proposal = proposals.find((p) => p.id === t.proposalId);
        const tally = Object.entries(counts)
          .filter(([status, n]) => status && n > 0)
          .map(([status, n]) => `${n} ${status.toLowerCase()}`)
          .join(" · ");
        const unfilled = counts[""] ?? 0;
        return (
          <Surface as="li" key={t.id} className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50/60 focus-visible:outline-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <p className="nums font-semibold text-ink-900">
                    {formatDate(t.periodStart)} – {formatDate(t.periodEnd)}
                  </p>
                  <p className="text-sm text-ink-600">
                    {company(t.employerId) ?? "Company"}
                    {proposal ? ` · ${project(proposal.projectId) ?? "Project"}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="nums text-sm text-ink-700">
                    {tally || "No days marked"}
                    {unfilled ? ` · ${unfilled} not filled` : ""}
                    {hours > 0 ? ` · ${hours} h` : ""}
                  </span>
                  <StatusBadge value={t.status} />
                  <span aria-hidden className="text-sm text-brand-700 group-open:hidden">Show days</span>
                  <span aria-hidden className="hidden text-sm text-brand-700 group-open:inline">Hide days</span>
                </div>
              </summary>
              <div className="border-t border-ink-100 px-5 py-4">
                {t.internNote || t.managerNote ? (
                  <dl className="mb-4 grid gap-3 sm:grid-cols-2">
                    {t.internNote ? (
                      <div className="rounded-apple-md bg-ink-50 p-3">
                        <dt className="text-xs font-semibold text-ink-600">Candidate&apos;s note</dt>
                        <dd className="mt-1 whitespace-pre-line text-sm text-ink-800">{t.internNote}</dd>
                      </div>
                    ) : null}
                    {t.managerNote ? (
                      <div className="rounded-apple-md bg-ink-50 p-3">
                        <dt className="text-xs font-semibold text-ink-600">Manager&apos;s note</dt>
                        <dd className="mt-1 whitespace-pre-line text-sm text-ink-800">{t.managerNote}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="text-xs font-semibold text-ink-600">
                      <tr className="border-b border-ink-100">
                        <th scope="col" className="py-2 pr-4">Day</th>
                        <th scope="col" className="py-2 pr-4">Status</th>
                        <th scope="col" className="py-2 pr-4 text-right">Hours</th>
                        <th scope="col" className="py-2">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {days.map((d) => {
                        const x = extras.get(d.date);
                        return (
                          <tr key={d.date}>
                            <td className="nums whitespace-nowrap py-2 pr-4 text-ink-800">
                              {shortDate(new Date(`${d.date}T00:00:00Z`), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                            </td>
                            <td className="py-2 pr-4">{d.status ? <span className="text-ink-800">{d.status}</span> : <span className="text-text-subtle">Not filled</span>}</td>
                            <td className="nums py-2 pr-4 text-right text-ink-700">{x?.hours ?? "-"}</td>
                            <td className="py-2 text-ink-700">{x?.note || ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="nums mt-3 text-xs text-text-subtle">
                  {t.submittedAt ? `Submitted ${formatDate(t.submittedAt)}` : "Not submitted"}
                  {t.approvedAt ? ` · approved ${formatDate(t.approvedAt)}` : ""}
                  {t.rejectedAt ? ` · sent back ${formatDate(t.rejectedAt)}` : ""}
                </p>
              </div>
            </details>
          </Surface>
        );
      })}
    </ul>
  );
}

/* ── Bits ──────────────────────────────────────────────────────────── */

function FilterBar({
  label,
  value,
  onChange,
  options,
  count,
  noun,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  count: number;
  noun: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="nums text-sm text-ink-600">
        {count} {noun}
        {count === 1 ? "" : "s"}
      </p>
      <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
        {label}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-800 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          <option value="all">All</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {humanizeStatus(o)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * An identity number as it arrives (last four only), with a Reveal that asks
 * the audit-logged route for the full value (QA-003). Hide forgets it again.
 */
function RevealValue({ internId, field, masked, label }: { internId: string; field: RevealField; masked: string | undefined; label: string }) {
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!masked) return <>-</>;

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/interns/${encodeURIComponent(internId)}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      const json = (await res.json().catch(() => null)) as { value?: string; error?: string } | null;
      if (!res.ok || !json?.value) throw new Error(json?.error ?? "Couldn't reveal it");
      setFull(json.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reveal it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <span>{full ?? masked}</span>
      <button
        type="button"
        onClick={() => (full ? setFull(null) : void reveal())}
        disabled={busy}
        aria-label={full ? `Hide ${label}` : `Reveal full ${label}`}
        className={buttonClass({ variant: "ghost", size: "sm", className: "text-brand-700" })}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : full ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        {full ? "Hide" : "Reveal"}
      </button>
      {error ? <span role="alert" className="basis-full text-xs text-danger">{error}</span> : null}
    </span>
  );
}
