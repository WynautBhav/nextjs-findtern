"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  IndianRupee,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Star,
  Video,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { toInrMinor } from "@/lib/admin/money";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/admin/status-badge";
import { InternPayoutTools } from "@/components/admin/intern-payout-tools";
import { owedMinor, stipendDues } from "@/lib/admin/stipend-dues";
import { InternSkillsEditor } from "@/components/admin/intern-skills-editor";
import { RatingsEditor } from "@/components/admin/ratings-editor";
import type {
  User as UserType,
  InternOnboarding,
  Interview,
  Proposal,
  Timesheet,
  InternPayout,
  InternDocuments,
} from "@/lib/db/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { draftFromRecord } from "@/lib/onboarding";

export type Intern360Props = {
  user: Omit<UserType, "password">;
  onboarding: InternOnboarding | null;
  documents: InternDocuments | null;
  interviews: Interview[];
  proposals: Proposal[];
  timesheets: Timesheet[];
  payouts: InternPayout[];
  employerNames: Record<string, string>;
  projectNames: Record<string, string>;
  /** Page-level controls (edit contact, view as, review status) rendered in the banner. */
  actions?: React.ReactNode;
};

export function Intern360View({
  actions,
  user,
  onboarding,
  documents,
  interviews,
  proposals,
  timesheets,
  payouts,
  employerNames,
  projectNames,
}: Intern360Props) {
  const [activeTab, setActiveTab] = useState<
    "documents" | "profile" | "interviews" | "proposals" | "timesheet" | "payments" | "bank"
  >("profile");

  // Bank unmasking state
  const [unmaskBank, setUnmaskBank] = useState(false);

  // Dialog inspection states
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);

  // Interview link editor state
  const [meetingLinkInput, setMeetingLinkInput] = useState("");
  const [feedbackLinkInput, setFeedbackLinkInput] = useState("");
  const [recordingLinkInput, setRecordingLinkInput] = useState("");
  const [savingLinks, setSavingLinks] = useState(false);
  const [linkSaveMsg, setLinkSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function openInterviewModal(i: Interview) {
    setSelectedInterview(i);
    setMeetingLinkInput(i.meetingLink ?? "");
    const notes = i.notes || "";
    const fbMatch = notes.match(/feedback:\s*(https?:\/\/[^\s]+)/i);
    const recMatch = notes.match(/recording:\s*(https?:\/\/[^\s]+)/i);
    setFeedbackLinkInput(fbMatch ? fbMatch[1] : (extra.aiFeedbackLink as string) || "");
    setRecordingLinkInput(recMatch ? recMatch[1] : (extra.aiRecordingLink as string) || "");
    setLinkSaveMsg(null);
  }

  async function handleSaveInterviewLinks() {
    if (!selectedInterview) return;
    setSavingLinks(true);
    setLinkSaveMsg(null);
    try {
      const res = await csrfFetch(`/api/admin/interviews/${selectedInterview.id}/meeting-link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingLink: meetingLinkInput.trim(),
          feedbackLink: feedbackLinkInput.trim() || null,
          recordingLink: recordingLinkInput.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save interview links");
      setLinkSaveMsg({ text: "Meeting link saved & candidate notified!", ok: true });
      if (data.interview) {
        setSelectedInterview(data.interview);
      }
    } catch (err: unknown) {
      setLinkSaveMsg({
        text: err instanceof Error ? err.message : "Error saving interview link",
        ok: false,
      });
    } finally {
      setSavingLinks(false);
    }
  }

  // Filters for sub-tabs
  const [interviewFilter, setInterviewFilter] = useState("all");
  const [proposalFilter, setProposalFilter] = useState("all");

  const extra = (onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = typeof extra.findternScore === "number" ? extra.findternScore : null;
  const ratings = (extra.ratings ?? {}) as Record<string, number>;
  const draft = onboarding ? draftFromRecord(onboarding) : null;
  const hasBank = Boolean(draft?.bank && (draft.bank.accountNumber || draft.bank.upiId));
  const bank = hasBank ? (draft!.bank as Record<string, unknown>) : null;
  const skills = draft?.skills ?? [];
  const resumeUrl = typeof extra.resumeUrl === "string" ? extra.resumeUrl : undefined;
  const academics = draft?.academics?.institution || draft?.academics?.degree ? [draft.academics] : [];

  const paidMinor = payouts
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + toInrMinor(p.amountMinor, p.currency), 0);
  const dues = stipendDues(proposals, payouts, typeof score === "number" ? score : null);
  const unlinkedPendingMinor = payouts
    .filter((p) => {
      const raw = (p.raw ?? {}) as Record<string, unknown>;
      return p.status !== "paid" && !raw.proposalId && !raw.proposal_id;
    })
    .reduce((sum, p) => sum + toInrMinor(p.amountMinor, p.currency), 0);
  const owedTotalMinor = owedMinor(dues, unlinkedPendingMinor);

  // Filtered interviews & proposals
  const filteredInterviews = interviews.filter((i) => {
    if (interviewFilter === "all") return true;
    return i.status === interviewFilter;
  });

  const filteredProposals = proposals.filter((p) => {
    if (proposalFilter === "all") return true;
    return p.status === proposalFilter;
  });

  // Assemble document rows
  const docRows = [
    {
      name: "Resume / Curriculum Vitae",
      type: "PDF Document",
      status: resumeUrl ? "Uploaded" : "Pending",
      href: resumeUrl,
      updatedAt: onboarding?.updatedAt ? formatDate(onboarding.updatedAt) : "-",
    },
    {
      name: "Government ID (Aadhaar)",
      type: documents?.aadhaarImageType || "ID Proof",
      status: documents?.aadhaarImageName ? "Uploaded" : "Pending",
      updatedAt: documents?.updatedAt ? formatDate(documents.updatedAt) : "-",
    },
    {
      name: "Tax Identifier (PAN Card)",
      type: documents?.panImageType || "Tax Document",
      status: documents?.panImageName ? "Uploaded" : "Pending",
      updatedAt: documents?.updatedAt ? formatDate(documents.updatedAt) : "-",
    },
    {
      name: "Profile Photo",
      type: documents?.profilePhotoType || "Image",
      status: documents?.profilePhotoName ? "Uploaded" : "Pending",
      updatedAt: documents?.updatedAt ? formatDate(documents.updatedAt) : "-",
    },
    {
      name: "Candidate Intro Video",
      type: documents?.introVideoType || "Video",
      status: documents?.introVideoName ? "Uploaded" : "Pending",
      updatedAt: documents?.updatedAt ? formatDate(documents.updatedAt) : "-",
    },
  ];

  const candidateFullName = `${user.firstName} ${user.lastName}`.trim() || "Candidate";

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb */}
      <div>
        <Link
          href="/admin/interns"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>All Interns</span>
        </Link>
      </div>

      {/* Top 5 Metrics Cards (matches 48-admin-intern-profile-detail.png) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-text-subtle">
            <span className="text-2xs font-semibold uppercase tracking-wider">FindScore</span>
            <Star className="size-4 text-emerald-600" />
          </div>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-ink-900 tabular-nums xl:text-2xl">
            {score !== null ? score.toFixed(1) : "-"}
          </p>
          <p className="text-2xs text-text-subtle">Overall Rating</p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-text-subtle">
            <span className="text-2xs font-semibold uppercase tracking-wider">Skills</span>
            <Sparkles className="size-4 text-blue-600" />
          </div>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-ink-900 tabular-nums xl:text-2xl">
            {skills.length}
          </p>
          <p className="text-2xs text-text-subtle">Top skills</p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-text-subtle">
            <span className="text-2xs font-semibold uppercase tracking-wider">Interviews</span>
            <Clock className="size-4 text-purple-600" />
          </div>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-ink-900 tabular-nums xl:text-2xl">
            {interviews.length}
          </p>
          <p className="text-2xs text-text-subtle">Attempts</p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-text-subtle">
            <span className="text-2xs font-semibold uppercase tracking-wider">Proposals</span>
            <FileText className="size-4 text-amber-600" />
          </div>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-ink-900 tabular-nums xl:text-2xl">
            {proposals.length}
          </p>
          <p className="text-2xs text-text-subtle">Received</p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-text-subtle">
            <span className="text-2xs font-semibold uppercase tracking-wider">Total Payouts</span>
            <IndianRupee className="size-4 text-brand-700" />
          </div>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-brand-800 tabular-nums xl:text-2xl">
            {/* zeroLabel off: the "Free" label is for prices, never money owed to an intern. */}
            {formatCurrency(paidMinor, "INR", { zeroLabel: false })}
          </p>
          <p className="truncate text-2xs text-text-subtle">
            Paid · {formatCurrency(owedTotalMinor, "INR", { zeroLabel: false })} owed
          </p>
        </div>
      </div>

      {/* Main Candidate Banner (matches 48-admin-intern-profile-detail.png) */}
      <div className="rounded-2xl border border-emerald-800/40 bg-gradient-to-r from-[#0E6049] to-[#094333] p-6 text-white shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-xl font-bold text-brand-800 shadow-md">
              {user.firstName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">{candidateFullName}</h1>
                <span className="whitespace-nowrap rounded-full bg-white/20 px-2.5 py-0.5 text-2xs font-semibold text-white">
                  {user.isActive ? "Active" : "Inactive"}
                </span>
                <span className="whitespace-nowrap rounded-full bg-emerald-400/30 px-2.5 py-0.5 text-2xs font-semibold text-white">
                  FindScore: {score !== null ? score.toFixed(1) : "-"}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/80">
                <MapPin className="size-3.5 shrink-0" />
                <span>{[onboarding?.city, onboarding?.state].filter(Boolean).join(", ") || "India"}</span>
                <span aria-hidden>•</span>
                <span className="whitespace-nowrap">Joined: {user.createdAt ? formatDate(user.createdAt) : "-"}</span>
              </p>
            </div>
          </div>

          {actions ? (
            <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:justify-end [&_label]:text-white/90">
              {actions}
            </div>
          ) : null}
        </div>

        {/* 4 Skill Category Ratings Row */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Communication", val: ratings.communication },
            { label: "Coding", val: ratings.coding },
            { label: "Aptitude", val: ratings.aptitude },
            { label: "AI Interview", val: ratings.interview },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 backdrop-blur-xs"
            >
              <span className="truncate text-xs font-medium text-white/90">{item.label}</span>
              <span className="whitespace-nowrap text-sm font-bold tabular-nums text-white">
                {typeof item.val === "number" ? `${item.val} / 10` : "-"}
              </span>
            </div>
          ))}
        </div>

        {/* Contact Info Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 text-xs text-white/80">
          <span className="flex items-center gap-1.5">
            <Mail className="size-3.5" />
            <span>{user.email}</span>
          </span>
          {user.phoneNumber && (
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5" />
              <span>
                {user.countryCode || "+91"} {user.phoneNumber}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* 7 Tabs Header (matches 48-54 tabs) */}
      <div
        role="tablist"
        aria-label="Candidate records"
        className="flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-ink-100 p-1"
      >
        {[
          { key: "documents" as const, label: "Documents", count: docRows.filter((d) => d.status === "Uploaded").length },
          { key: "profile" as const, label: "Profile", count: undefined },
          { key: "interviews" as const, label: "Interviews", count: interviews.length },
          { key: "proposals" as const, label: "Proposals", count: proposals.length },
          { key: "timesheet" as const, label: "Timesheet", count: timesheets.length },
          { key: "payments" as const, label: "Payments", count: payouts.length },
          { key: "bank" as const, label: "Bank Details", count: undefined },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`apple-spring apple-pressable inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[8px] px-4 text-[14px] font-medium tracking-[-0.01em] ${
              activeTab === tab.key
                ? "bg-white text-ink-900 shadow-xs"
                : "text-ink-600 hover:text-ink-800"
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-2xs tabular-nums ${
                  activeTab === tab.key ? "bg-brand-50 text-brand-800" : "bg-ink-200/70 text-ink-600"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 1: Documents */}
      {activeTab === "documents" && (
        <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
              <tr>
                <th className="px-5 py-3">Document</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Updated</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {docRows.map((doc) => (
                <tr key={doc.name} className="hover:bg-ink-50/40">
                  <td className="px-5 py-3.5 font-semibold text-ink-900">{doc.name}</td>
                  <td className="px-5 py-3.5 text-text-subtle">{doc.type}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-semibold ${
                        doc.status === "Uploaded"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-ink-100 text-ink-600"
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-text-subtle">{doc.updatedAt}</td>
                  <td className="px-5 py-3.5 text-right">
                    {doc.href ? (
                      <div className="flex items-center justify-end gap-2.5">
                        <a
                          href={doc.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-700 hover:underline"
                        >
                          <Eye className="size-3" />
                          <span>View</span>
                        </a>
                        <a
                          href={doc.href}
                          download={doc.name}
                          className="inline-flex items-center gap-1 text-2xs font-semibold text-ink-700 hover:text-brand-800 hover:underline"
                        >
                          <Download className="size-3" />
                          <span>Download</span>
                        </a>
                      </div>
                    ) : (
                      <span className="text-2xs text-text-subtle">No file</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Profile */}
      {activeTab === "profile" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Candidate Overview & Bio */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs">
              <h3 className="font-bold text-sm text-ink-900 mb-3">Professional Bio</h3>
              <p className="text-xs text-ink-700 leading-relaxed">
                {onboarding?.bio || "No professional bio provided by candidate."}
              </p>
            </div>

            <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs">
              <h3 className="font-bold text-sm text-ink-900 mb-3">Academic Background</h3>
              {academics.length > 0 ? (
                <div className="space-y-3">
                  {academics.map((acad, idx) => (
                    <div key={idx} className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-xs">
                      <p className="font-bold text-ink-900">{acad.institution || "Institution not given"}</p>
                      <p className="text-text-subtle">
                        {[acad.qualificationLevel, acad.degree, acad.branch].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-1 text-2xs text-text-subtle">
                        {acad.status} {acad.yearOfGraduation ? `· ${acad.yearOfGraduation}` : ""} {acad.cgpa ? `· Score ${acad.cgpa}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-600">No academic history records added.</p>
              )}
            </div>
          </div>

          {/* Skills & Ratings Editor */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs">
              <h3 className="font-bold text-sm text-ink-900 mb-2">Verified Skills</h3>
              <p className="text-xs text-text-subtle mb-4">
                Modify skills list displayed to hiring employers.
              </p>
              <InternSkillsEditor internId={user.id} skills={draft?.skillsWithRatings ?? skills.map((name) => ({ name, rating: "Beginner" as const }))} />
            </div>

            <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs">
              <h3 className="font-bold text-sm text-ink-900 mb-2">FindScore & Ratings Assessment</h3>
              <p className="text-xs text-text-subtle mb-4">
                Update benchmark category scores and overall rating.
              </p>
              <RatingsEditor
                internId={user.id}
                ratings={ratings}
                score={score}
                initialFeedbackLink={(extra.aiFeedbackLink as string) || null}
                initialRecordingLink={(extra.aiRecordingLink as string) || null}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Interviews */}
      {activeTab === "interviews" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-700">Interview Sessions ({interviews.length})</p>
            <select
              value={interviewFilter}
              onChange={(e) => setInterviewFilter(e.target.value)}
              aria-label="Filter interview status"
              className="rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-700"
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
                <tr>
                  <th className="px-5 py-3">Company</th>
                  <th className="px-5 py-3">Scheduled Slots</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Meeting Link</th>
                  <th className="px-5 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredInterviews.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-ink-600">
                      No interviews matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredInterviews.map((i) => {
                    const cName = employerNames[i.employerId] || "Company";
                    const slots = [i.slot1, i.slot2, i.slot3].filter(Boolean);
                    return (
                      <tr key={i.id} className="hover:bg-ink-50/40">
                        <td className="px-5 py-3.5 font-semibold text-ink-900">{cName}</td>
                        <td className="px-5 py-3.5">
                          {slots.length === 0 ? (
                            <span className="text-text-subtle">No slots</span>
                          ) : (
                            slots.map((s, idx) => (
                              <p
                                key={idx}
                                className={`text-2xs ${
                                  i.selectedSlot === idx + 1 ? "font-bold text-brand-700" : "text-text-subtle"
                                }`}
                              >
                                {i.selectedSlot === idx + 1 ? "✓ " : "• "}
                                {new Date(s!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              </p>
                            ))
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge value={i.status} />
                        </td>
                        <td className="px-5 py-3.5">
                          {i.meetingLink ? (
                            <a
                              href={i.meetingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-2xs font-semibold text-brand-700 hover:underline"
                            >
                              Join Link
                            </a>
                          ) : (
                            <span className="text-2xs text-text-subtle">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openInterviewModal(i)}
                            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-2xs font-semibold text-ink-700 hover:bg-brand-50 hover:text-brand-800"
                          >
                            <Eye className="size-3" />
                            <span>Manage / View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Proposals */}
      {activeTab === "proposals" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-700">Project Proposals ({proposals.length})</p>
            <select
              value={proposalFilter}
              onChange={(e) => setProposalFilter(e.target.value)}
              aria-label="Filter proposal status"
              className="rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-700"
            >
              <option value="all">All Status</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="hired">Hired</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
                <tr>
                  <th className="px-5 py-3">Company</th>
                  <th className="px-5 py-3">Project</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Sent Date</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredProposals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-ink-600">
                      No proposals matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredProposals.map((p) => {
                    const cName = (p.employerId && employerNames[p.employerId]) || "Company";
                    const pName = (p.projectId && projectNames[p.projectId]) || "Project";
                    return (
                      <tr key={p.id} className="hover:bg-ink-50/40">
                        <td className="px-5 py-3.5 font-semibold text-ink-900">{cName}</td>
                        <td className="px-5 py-3.5 text-ink-800">{pName}</td>
                        <td className="px-5 py-3.5">
                          <StatusBadge value={p.status} />
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-text-subtle">
                          {p.createdAt ? formatDate(p.createdAt) : "-"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedProposal(p)}
                            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-2xs font-semibold text-ink-700 hover:bg-brand-50 hover:text-brand-800"
                          >
                            <Eye className="size-3" />
                            <span>View Offer</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Timesheet */}
      {activeTab === "timesheet" && (
        <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
              <tr>
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3">Hours Logged</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Submission Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {timesheets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-ink-600">
                    No timesheets recorded for this candidate.
                  </td>
                </tr>
              ) : (
                timesheets.map((t) => (
                  <tr key={t.id} className="hover:bg-ink-50/40">
                    <td className="px-5 py-3.5 font-semibold text-ink-900">
                      {new Date(t.periodStart).toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3.5 font-bold tabular-nums text-ink-800">
                      {Array.isArray(t.entries)
                        ? (t.entries as Array<{ hours?: number | string }>).reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
                        : 0}{" "}
                      hrs
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge value={t.status} />
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-text-subtle">
                      {t.createdAt ? formatDate(t.createdAt) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 6: Payments & Payout Tools */}
      {activeTab === "payments" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs">
            <h3 className="font-bold text-base text-ink-900">Intern Payouts Ledger</h3>
            <p className="text-xs text-text-subtle mt-0.5 mb-4">
              Create and mark stipends disbursed to this student with bank reference verification.
            </p>
            <InternPayoutTools
              internId={user.id}
              payouts={payouts}
              placements={proposals
                .filter((p) => p.status === "hired")
                .map((p) => ({
                  id: p.id,
                  employerId: p.employerId ?? "",
                  label: `${(p.employerId && employerNames[p.employerId]) || "Company"} · ${(p.projectId && projectNames[p.projectId]) || "Project"}`,
                }))}
              dues={dues}
            />
          </div>
        </div>
      )}

      {/* Tab 7: Bank Details (with unmasking toggle) */}
      {activeTab === "bank" && (
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs">
          <div className="flex items-center justify-between border-b border-ink-100 pb-4 mb-4">
            <div>
              <h3 className="font-bold text-base text-ink-900">Bank Account for Stipend Payouts</h3>
              <p className="text-xs text-text-subtle mt-0.5">
                Held privately for accounting audit. Protected against unauthorized leakage.
              </p>
            </div>
            {bank && (
              <button
                type="button"
                onClick={() => setUnmaskBank(!unmaskBank)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50 shadow-2xs"
              >
                {unmaskBank ? <EyeOff className="size-3.5 text-ink-500" /> : <Eye className="size-3.5 text-brand-700" />}
                <span>{unmaskBank ? "Mask Number" : "Unmask Full Details"}</span>
              </button>
            )}
          </div>

          {bank ? (
            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
                <p className="text-2xs font-semibold uppercase text-text-subtle">Account Holder</p>
                <p className="mt-1 font-bold text-sm text-ink-900">
                  {String(bank.holder ?? bank.accountHolderName ?? "-")}
                </p>
              </div>

              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
                <p className="text-2xs font-semibold uppercase text-text-subtle">Bank Name</p>
                <p className="mt-1 font-bold text-sm text-ink-900">
                  {String(bank.bank ?? bank.bankName ?? "-")}
                </p>
              </div>

              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
                <p className="text-2xs font-semibold uppercase text-text-subtle">IFSC Code</p>
                <p className="mt-1 font-mono font-bold text-sm text-ink-900">
                  {String(bank.ifsc ?? bank.ifscCode ?? "-")}
                </p>
              </div>

              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
                <p className="text-2xs font-semibold uppercase text-text-subtle">Account Number</p>
                <p className="mt-1 font-mono font-bold text-sm text-ink-900">
                  {unmaskBank
                    ? String(bank.account ?? bank.accountNumber ?? "-")
                    : maskAccount(String(bank.account ?? bank.accountNumber ?? ""))}
                </p>
              </div>

              {Boolean(bank.upiId || bank.upi) && (
                <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4 sm:col-span-2">
                  <p className="text-2xs font-semibold uppercase text-text-subtle">UPI ID / VPA</p>
                  <p className="mt-1 font-mono font-bold text-sm text-ink-900">
                    {String(bank.upiId ?? bank.upi)}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-ink-600">
              No bank account submitted by candidate. Payouts require verified bank coordinates.
            </div>
          )}
        </div>
      )}

      {/* Proposal Details Modal */}
      <Dialog
        open={selectedProposal !== null}
        onOpenChange={(open) => !open && setSelectedProposal(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-ink-900">
              <FileText className="size-4 text-brand-600" />
              <span>Proposal Offer Details</span>
            </DialogTitle>
          </DialogHeader>

          {selectedProposal && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
                <p className="text-2xs uppercase text-text-subtle font-semibold">Project & Company</p>
                <h4 className="font-bold text-sm text-ink-900 mt-0.5">
                  {(selectedProposal.projectId && projectNames[selectedProposal.projectId]) || "Project Offer"}
                </h4>
                <p className="text-ink-700">
                  Company: {(selectedProposal.employerId && employerNames[selectedProposal.employerId]) || "Employer"}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge value={selectedProposal.status} />
                  <span className="text-2xs text-text-subtle">
                    Flow: {selectedProposal.flowType === "direct" ? "Direct" : "Interview First"}
                  </span>
                </div>
              </div>

              {selectedProposal.offerDetails && (
                <div className="rounded-xl border border-ink-100 p-3.5 space-y-2">
                  <p className="font-semibold text-ink-900">Agreed Parameters:</p>
                  <div className="grid grid-cols-2 gap-2 text-2xs">
                    {Object.entries(selectedProposal.offerDetails as Record<string, unknown>).map(
                      ([k, v]) => (
                        <div key={k} className="bg-ink-50 p-2 rounded-lg">
                          <span className="font-medium text-text-subtle uppercase">{k}: </span>
                          <span className="font-semibold text-ink-900">{String(v)}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Interview Details Modal */}
      <Dialog
        open={selectedInterview !== null}
        onOpenChange={(open) => !open && setSelectedInterview(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-ink-900">
              <Clock className="size-4 text-purple-600" />
              <span>Interview Session</span>
            </DialogTitle>
          </DialogHeader>

          {selectedInterview && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
                <p className="text-2xs uppercase text-text-subtle font-semibold">Employer</p>
                <h4 className="font-bold text-sm text-ink-900 mt-0.5">
                  {employerNames[selectedInterview.employerId] || "AI Assessment"}
                </h4>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge value={selectedInterview.status} />
                  <span className="text-2xs text-text-subtle">
                    Session ID: {selectedInterview.id.slice(0, 8)}...
                  </span>
                </div>
              </div>

              {/* Incruiter / Meeting Link Management Form */}
              <div className="rounded-xl border border-brand-200/90 bg-brand-50/40 p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-brand-950">
                  <Link2 className="size-4 text-brand-700" />
                  <span>Update Meeting & Assessment Links</span>
                </div>

                <div>
                  <label htmlFor="modal-meeting-link" className="block text-2xs font-semibold uppercase text-brand-900 mb-1">
                    Meeting Link (Incruiter or Google Meet) *
                  </label>
                  <input
                    id="modal-meeting-link"
                    type="url"
                    value={meetingLinkInput}
                    onChange={(e) => setMeetingLinkInput(e.target.value)}
                    placeholder="https://incruiter.com/test/... or Meet URL"
                    className="h-9 w-full rounded-lg border border-brand-200 bg-white px-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-hidden"
                  />
                  <p className="mt-1 text-2xs text-text-subtle">
                    For an AI interview, saving a link unlocks it for the candidate. For a company interview, both the candidate and the company are notified.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="modal-feedback-link" className="block text-2xs font-semibold uppercase text-brand-900 mb-1">
                      Feedback Report PDF URL
                    </label>
                    <input
                      id="modal-feedback-link"
                      type="url"
                      value={feedbackLinkInput}
                      onChange={(e) => setFeedbackLinkInput(e.target.value)}
                      placeholder="https://... report PDF"
                      className="h-8 w-full rounded-lg border border-brand-200 bg-white px-2.5 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-recording-link" className="block text-2xs font-semibold uppercase text-brand-900 mb-1">
                      Recording Video URL
                    </label>
                    <input
                      id="modal-recording-link"
                      type="url"
                      value={recordingLinkInput}
                      onChange={(e) => setRecordingLinkInput(e.target.value)}
                      placeholder="https://... recording URL"
                      className="h-8 w-full rounded-lg border border-brand-200 bg-white px-2.5 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveInterviewLinks}
                  disabled={savingLinks || !meetingLinkInput.trim()}
                  className="w-full inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white shadow-xs hover:bg-brand-600 disabled:opacity-60"
                >
                  {savingLinks ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-3.5" aria-hidden />
                  )}
                  <span>Save Link & Unlock Session</span>
                </button>

                {linkSaveMsg && (
                  <p
                    className={`mt-2 rounded-lg p-2 text-2xs font-medium ${
                      linkSaveMsg.ok
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {linkSaveMsg.text}
                  </p>
                )}
              </div>

              {selectedInterview.meetingLink && (
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
                  <p className="text-2xs uppercase font-semibold text-brand-800">Current Join URL</p>
                  <a
                    href={selectedInterview.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline break-all"
                  >
                    <Video className="size-3.5" />
                    <span>{selectedInterview.meetingLink}</span>
                  </a>
                </div>
              )}

              {selectedInterview.notes && (
                <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-ink-700">
                  <p className="text-2xs uppercase font-semibold text-text-subtle mb-1">Session Notes</p>
                  <p className="whitespace-pre-line">{selectedInterview.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function maskAccount(value: string): string {
  if (value.length <= 4) return value ? "••••" : "-";
  return `•••• ${value.slice(-4)}`;
}
