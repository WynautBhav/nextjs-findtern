"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  MapPin,
  Search,
  Send,
  Users,
  Video,
  X,
} from "lucide-react";

import { formatDate, formatMoney } from "@/lib/format";
import { AdminEmpty } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { ProposalStatusEditor } from "@/components/admin/proposal-status-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { parseOffer } from "@/lib/offer";

export type TrackerCompany = {
  id: string;
  companyName: string;
  companyEmail: string;
  city?: string | null;
  state?: string | null;
  isActive: boolean;
  proposalsCount: number;
  interviewsCount: number;
  /** Accepted or hired (lib/proposals `won`). */
  hiredCount: number;
  /** Rejected, withdrawn or expired. */
  rejectedCount: number;
  /** Won share of decided proposals; null until one is decided. */
  acceptanceRate: number | null;
};

/** One candidate's proposal history across companies. */
export type TrackerCandidate = {
  internId: string;
  name: string;
  email: string | null;
  phone: string | null;
  received: number;
  won: number;
  lost: number;
  open: number;
  companies: string[];
  lastReceivedAt: string | null;
};

type Tab = "companies" | "candidates" | "proposals" | "interviews";

export type TrackerProposal = {
  id: string;
  status: string;
  flowType: string | null;
  currency: string | null;
  offerDetails: Record<string, unknown> | null;
  createdAt: string | null;
  hiredAt: string | null;
  internId: string;
  internFirstName: string | null;
  internLastName: string | null;
  internEmail: string | null;
  internPhone?: string | null;
  employerId: string;
  companyName: string;
  projectId: string;
  projectName: string;
  /** Full-time offer (legacy "Full-time Hired" label and filter). */
  fullTime?: boolean;
};

export type TrackerInterview = {
  id: string;
  status: string;
  slot1: string | null;
  slot2: string | null;
  slot3: string | null;
  selectedSlot: number | null;
  timezone: string | null;
  meetingLink: string | null;
  notes: string | null;
  createdAt: string | null;
  internId: string;
  internFirstName: string | null;
  internLastName: string | null;
  internEmail: string | null;
  employerId: string;
  companyName: string;
  projectId: string | null;
  projectName: string | null;
};

export function ProposalTrackerView({
  companies,
  proposals,
  interviews,
  candidates,
  initialTab = "companies",
}: {
  companies: TrackerCompany[];
  proposals: TrackerProposal[];
  interviews: TrackerInterview[];
  candidates: TrackerCandidate[];
  initialTab?: Tab;
}) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | "fulltime" | "internship">("all");

  // Dialog States
  const [selectedProposal, setSelectedProposal] = useState<TrackerProposal | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<TrackerInterview | null>(null);
  const [companyModalType, setCompanyModalType] = useState<"proposals" | "interviews" | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<TrackerCompany | null>(null);

  // Filtered Companies
  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.companyEmail.toLowerCase().includes(q) ||
        (c.city && c.city.toLowerCase().includes(q))
    );
  }, [companies, search]);

  const filteredCandidates = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        c.companies.some((name) => name.toLowerCase().includes(q)),
    );
  }, [candidates, search]);

  // Filtered Proposals
  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        (p.internFirstName && p.internFirstName.toLowerCase().includes(q)) ||
        (p.internLastName && p.internLastName.toLowerCase().includes(q)) ||
        (p.internEmail && p.internEmail.toLowerCase().includes(q)) ||
        p.companyName.toLowerCase().includes(q) ||
        p.projectName.toLowerCase().includes(q);

      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      const matchFlow = flowFilter === "all" || p.flowType === flowFilter;
      const matchKind = kindFilter === "all" || (kindFilter === "fulltime" ? Boolean(p.fullTime) : !p.fullTime);

      return matchSearch && matchStatus && matchFlow && matchKind;
    });
  }, [proposals, search, statusFilter, flowFilter, kindFilter]);

  // Filtered Interviews
  const filteredInterviews = useMemo(() => {
    return interviews.filter((i) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        (i.internFirstName && i.internFirstName.toLowerCase().includes(q)) ||
        (i.internLastName && i.internLastName.toLowerCase().includes(q)) ||
        (i.internEmail && i.internEmail.toLowerCase().includes(q)) ||
        i.companyName.toLowerCase().includes(q) ||
        (i.projectName && i.projectName.toLowerCase().includes(q));

      const matchStatus = statusFilter === "all" || i.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [interviews, search, statusFilter]);

  // Modals data for selected company
  const companyProposals = useMemo(() => {
    if (!selectedCompany) return [];
    return proposals.filter((p) => p.employerId === selectedCompany.id);
  }, [proposals, selectedCompany]);

  const companyInterviews = useMemo(() => {
    if (!selectedCompany) return [];
    return interviews.filter((i) => i.employerId === selectedCompany.id);
  }, [interviews, selectedCompany]);

  return (
    <div className="space-y-6">
      {/* Main tabs - the ink-100 segmented control shared with payouts and messages */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-3">
        <div
          role="tablist"
          aria-label="Pipeline view"
          className="flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-ink-100 p-1"
        >
          {(
            [
              { key: "companies", label: "Company List", Icon: Building2, count: companies.length },
              { key: "proposals", label: "Proposals", Icon: Send, count: proposals.length },
              { key: "candidates", label: "Candidates", Icon: Users, count: candidates.length },
              { key: "interviews", label: "Interviews", Icon: Clock, count: interviews.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSearch("");
                setStatusFilter("all");
              }}
              className={`apple-spring apple-pressable inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[8px] px-4 text-[14px] font-medium tracking-[-0.01em] ${
                activeTab === tab.key ? "bg-white text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-800"
              }`}
            >
              <tab.Icon className="size-4" aria-hidden />
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                  activeTab === tab.key ? "bg-brand-50 text-brand-800" : "bg-ink-200/70 text-ink-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Global Search & Filters */}
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <div className="relative w-full min-w-[12rem] flex-1 sm:w-auto sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === "companies"
                  ? "Search companies, email..."
                  : activeTab === "candidates"
                  ? "Search candidate, email, phone, company..."
                  : activeTab === "proposals"
                  ? "Search candidate, company, project..."
                  : "Search candidate, company..."
              }
              className="min-h-11 w-full rounded-[10px] border border-ink-200 bg-white pl-9 pr-8 text-sm focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-[10px] text-ink-400 hover:text-ink-700"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {activeTab === "proposals" && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter proposals by status"
                className="min-h-11 rounded-[10px] border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:border-brand-500 focus:outline-hidden"
              >
                <option value="all">All Status</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
                <option value="hired">Hired</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
                <option value="withdrawn">Withdrawn</option>
              </select>

              <select
                value={flowFilter}
                onChange={(e) => setFlowFilter(e.target.value)}
                aria-label="Filter proposals by flow type"
                className="min-h-11 rounded-[10px] border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:border-brand-500 focus:outline-hidden"
              >
                <option value="all">All Flows</option>
                <option value="direct">Direct Offer</option>
                <option value="interview_first">Interview First</option>
              </select>

              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
                aria-label="Filter proposals by offer type"
                className="min-h-11 rounded-[10px] border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:border-brand-500 focus:outline-hidden"
              >
                <option value="all">Internship &amp; full-time</option>
                <option value="internship">Internship</option>
                <option value="fulltime">Full-time</option>
              </select>
            </>
          )}

          {activeTab === "interviews" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter interviews by status"
              className="min-h-11 rounded-[10px] border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:border-brand-500 focus:outline-hidden"
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="expired">Expired</option>
              <option value="missed">Missed</option>
            </select>
          )}
        </div>
      </div>

      {/* Tab 1: Company List View */}
      {activeTab === "companies" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCompanies.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-ink-200 bg-white">
              <AdminEmpty
                title="No companies match"
                body={search ? `Nothing matches "${search}". Try a shorter search.` : "No companies have sent proposals in this range."}
              />
            </div>
          ) : (
            filteredCompanies.map((c) => (
              <div
                key={c.id}
                className="group flex flex-col justify-between rounded-2xl border border-ink-200/80 bg-white p-5 shadow-2xs hover:border-brand-300 hover:shadow-md transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-base font-bold text-brand-800 border border-brand-200/50">
                        {c.companyName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-ink-900 group-hover:text-brand-800 transition-colors">
                          {c.companyName}
                        </h3>
                        <p className="flex min-w-0 items-center gap-1 text-2xs text-text-subtle">
                          <Mail className="size-3 shrink-0" />
                          <span className="truncate">{c.companyEmail}</span>
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0">
                      <StatusBadge value={c.isActive ? "active" : "inactive"} />
                    </span>
                  </div>

                  {c.city && (
                    <div className="mt-3 flex items-center gap-1 text-2xs text-ink-500">
                      <MapPin className="size-3" />
                      <span>
                        {c.city}
                        {c.state ? `, ${c.state}` : ""}
                      </span>
                    </div>
                  )}

                  {/* Stats Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-ink-50/70 p-3 text-center xl:grid-cols-4">
                    <div className="min-w-0">
                      <p className="truncate text-2xs text-text-subtle">Proposals</p>
                      <p className="text-base font-bold tabular-nums text-ink-900">{c.proposalsCount}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-2xs text-text-subtle">Interviews</p>
                      <p className="text-base font-bold tabular-nums text-ink-900">{c.interviewsCount}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-2xs text-text-subtle">Hired</p>
                      <p className="text-base font-bold tabular-nums text-emerald-700">{c.hiredCount}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-2xs text-text-subtle">Rejected</p>
                      <p className="text-base font-bold tabular-nums text-ink-700">{c.rejectedCount}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-2xs text-text-subtle">
                    {c.acceptanceRate === null
                      ? "No decided proposals yet"
                      : `${c.acceptanceRate}% acceptance on decided proposals`}
                  </p>
                </div>

                {/* Actions */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCompany(c);
                        setCompanyModalType("proposals");
                      }}
                      className="apple-spring inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-ink-200 bg-white px-2.5 text-2xs font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900 max-lg:min-h-11"
                    >
                      <FileText className="size-3 text-brand-600" />
                      <span>Proposals ({c.proposalsCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCompany(c);
                        setCompanyModalType("interviews");
                      }}
                      className="apple-spring inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-ink-200 bg-white px-2.5 text-2xs font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900 max-lg:min-h-11"
                    >
                      <Clock className="size-3 text-amber-600" />
                      <span>Interviews ({c.interviewsCount})</span>
                    </button>
                  </div>

                  <Link
                    href={`/admin/companies/${c.id}`}
                    className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap text-2xs font-semibold text-brand-700 hover:underline max-lg:min-h-11"
                  >
                    <span>360 View</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Candidates: who received proposals, from whom, and the outcome */}
      {activeTab === "candidates" && (
        <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-xs">
              <thead className="border-b border-ink-100 bg-ink-50/70 text-2xs uppercase tracking-wider text-text-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Candidate</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Contact</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Received</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Accepted / hired</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Rejected</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Open</th>
                  <th scope="col" className="px-4 py-3 font-semibold">From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-500">
                      No candidates received proposals in this range.
                    </td>
                  </tr>
                ) : (
                  filteredCandidates.map((c) => (
                    <tr key={c.internId} className="hover:bg-ink-50/50">
                      <td className="px-4 py-3">
                        <Link href={`/admin/interns/${c.internId}`} className="font-semibold text-ink-900 hover:text-brand-700 hover:underline">
                          {c.name}
                        </Link>
                        {c.lastReceivedAt ? (
                          <p className="text-2xs text-text-subtle">Last: {formatDate(c.lastReceivedAt)}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-ink-600">
                        <p>{c.email ?? "-"}</p>
                        <p className="tabular-nums">{c.phone ?? "-"}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-900">{c.received}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{c.won}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-700">{c.lost}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-500">{c.open}</td>
                      <td className="max-w-[16rem] px-4 py-3 text-ink-600">{c.companies.join(", ")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Proposals Table View */}
      {activeTab === "proposals" && (
        <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
                <tr>
                  <th className="px-5 py-3">Candidate</th>
                  <th className="px-5 py-3">Company & Project</th>
                  <th className="px-5 py-3">Monthly Offer</th>
                  <th className="px-5 py-3">Flow & Status</th>
                  <th className="px-5 py-3">Sent Date</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredProposals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-ink-500">
                      No proposals match current filters.
                    </td>
                  </tr>
                ) : (
                  filteredProposals.map((p) => {
                    const internName = `${p.internFirstName || ""} ${p.internLastName || ""}`.trim() || "Candidate";
                    const offer = parseOffer(p.offerDetails, p.currency);

                    return (
                      <tr key={p.id} className="hover:bg-ink-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/interns/${p.internId}`}
                            className="font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                          >
                            {internName}
                          </Link>
                          <p className="text-2xs text-text-subtle">{p.internEmail || "-"}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/companies/${p.employerId}`}
                            className="font-medium text-ink-800 hover:underline"
                          >
                            {p.companyName}
                          </Link>
                          <p className="text-2xs text-text-subtle">{p.projectName}</p>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-ink-900">
                          {offer.monthlyMinor != null ? `${formatMoney(offer.monthlyMinor, offer.currency)}/mo` : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {p.fullTime && p.status === "hired" ? (
                              <StatusBadge tone="success" label="Full-time Hired" />
                            ) : (
                              <StatusBadge value={p.status} />
                            )}
                            <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-600">
                              {p.flowType === "direct" ? "Direct" : "Interview"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-text-subtle">
                          {p.createdAt ? formatDate(p.createdAt) : "-"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedProposal(p)}
                            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-brand-50 hover:text-brand-800 hover:border-brand-300 transition-colors"
                          >
                            <Eye className="size-3.5" />
                            <span>View Details</span>
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

      {/* Tab 3: Interviews Table View */}
      {activeTab === "interviews" && (
        <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
                <tr>
                  <th className="px-5 py-3">Candidate</th>
                  <th className="px-5 py-3">Company & Project</th>
                  <th className="px-5 py-3">Scheduled Slots</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Meeting</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredInterviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-ink-500">
                      No interviews match current filters.
                    </td>
                  </tr>
                ) : (
                  filteredInterviews.map((i) => {
                    const internName = `${i.internFirstName || ""} ${i.internLastName || ""}`.trim() || "Candidate";
                    const slots = [i.slot1, i.slot2, i.slot3].filter(Boolean);

                    return (
                      <tr key={i.id} className="hover:bg-ink-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/interns/${i.internId}`}
                            className="font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                          >
                            {internName}
                          </Link>
                          <p className="text-2xs text-text-subtle">{i.internEmail || "-"}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/companies/${i.employerId}`}
                            className="font-medium text-ink-800 hover:underline"
                          >
                            {i.companyName}
                          </Link>
                          <p className="text-2xs text-text-subtle">{i.projectName || "General Interview"}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          {slots.length === 0 ? (
                            <span className="text-text-subtle">No slots specified</span>
                          ) : (
                            <div className="space-y-0.5">
                              {slots.map((s, idx) => (
                                <p
                                  key={idx}
                                  className={`text-2xs ${
                                    i.selectedSlot === idx + 1
                                      ? "font-bold text-brand-700"
                                      : "text-text-subtle"
                                  }`}
                                >
                                  {i.selectedSlot === idx + 1 ? "✓ " : "• "}
                                  {new Date(s!).toLocaleString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                              ))}
                            </div>
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
                              className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-700 hover:underline"
                            >
                              <Video className="size-3" />
                              <span>Join Link</span>
                            </a>
                          ) : (
                            <span className="text-2xs text-text-subtle">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedInterview(i)}
                            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-brand-50 hover:text-brand-800 hover:border-brand-300 transition-colors"
                          >
                            <Eye className="size-3.5" />
                            <span>View Details</span>
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

      {/* 1. Proposal Details Modal */}
      <Dialog
        open={selectedProposal !== null}
        onOpenChange={(open) => !open && setSelectedProposal(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <FileText className="size-5 text-brand-600" />
              <span>Proposal Terms & Details</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              Full offer parameters submitted between employer and candidate.
            </DialogDescription>
          </DialogHeader>

          {selectedProposal && (
            <div className="space-y-5 pt-3">
              {/* Header Box */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-ink-50 p-4 border border-ink-100">
                <div>
                  <h4 className="text-base font-bold text-ink-900">{selectedProposal.projectName}</h4>
                  <p className="text-xs text-text-subtle mt-0.5">
                    Offered by <span className="font-semibold text-ink-800">{selectedProposal.companyName}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={selectedProposal.status} />
                  <ProposalStatusEditor
                    proposalId={selectedProposal.id}
                    status={selectedProposal.status}
                  />
                </div>
              </div>

              {/* Candidate Info */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-ink-100 p-3">
                  <p className="text-2xs font-semibold uppercase text-text-subtle">Candidate</p>
                  <p className="mt-1 font-semibold text-ink-900">
                    {selectedProposal.internFirstName} {selectedProposal.internLastName}
                  </p>
                  <p className="text-2xs text-text-subtle">{selectedProposal.internEmail}</p>
                </div>
                <div className="rounded-xl border border-ink-100 p-3">
                  <p className="text-2xs font-semibold uppercase text-text-subtle">Flow Type</p>
                  <p className="mt-1 font-semibold text-ink-900 capitalize">
                    {selectedProposal.flowType === "direct" ? "Direct Offer" : "Interview First"}
                  </p>
                  <p className="text-2xs text-text-subtle">
                    Sent: {selectedProposal.createdAt ? formatDate(selectedProposal.createdAt) : "-"}
                  </p>
                </div>
              </div>

              {/* Offer Details Grid */}
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-2">
                  Agreed Offer Terms
                </h5>
                {selectedProposal.offerDetails && Object.keys(selectedProposal.offerDetails).length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries(selectedProposal.offerDetails).map(([key, val]) => (
                      <div key={key} className="rounded-lg bg-ink-50/70 p-2.5 border border-ink-100/60">
                        <p className="text-2xs font-medium uppercase text-text-subtle">
                          {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
                        </p>
                        <p className="mt-0.5 font-semibold text-xs text-ink-900 break-words">
                          {typeof val === "object" ? JSON.stringify(val) : String(val || "-")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-500 italic">No custom terms recorded on this proposal.</p>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedProposal(null)}
                  className="rounded-xl border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2. Interview Details Modal */}
      <Dialog
        open={selectedInterview !== null}
        onOpenChange={(open) => !open && setSelectedInterview(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <Clock className="size-5 text-amber-600" />
              <span>Interview Session Details</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              Evaluation interview time slots, video link and status.
            </DialogDescription>
          </DialogHeader>

          {selectedInterview && (
            <div className="space-y-4 pt-3">
              <div className="flex items-center justify-between rounded-xl bg-ink-50 p-3.5 border border-ink-100">
                <div>
                  <h4 className="font-bold text-ink-900">
                    {selectedInterview.internFirstName} {selectedInterview.internLastName}
                  </h4>
                  <p className="text-2xs text-text-subtle">
                    Company: <span className="font-semibold text-ink-800">{selectedInterview.companyName}</span>
                  </p>
                </div>
                <StatusBadge value={selectedInterview.status} />
              </div>

              {/* Slots List */}
              <div className="space-y-2">
                <p className="text-2xs font-bold uppercase tracking-wider text-ink-500">Offered Time Slots</p>
                {[
                  { num: 1, val: selectedInterview.slot1 },
                  { num: 2, val: selectedInterview.slot2 },
                  { num: 3, val: selectedInterview.slot3 },
                ].map((s) => (
                  <div
                    key={s.num}
                    className={`flex items-center justify-between rounded-xl p-3 border text-xs ${
                      selectedInterview.selectedSlot === s.num
                        ? "border-brand-500 bg-brand-50/60 font-semibold text-brand-900"
                        : "border-ink-100 bg-white text-ink-700"
                    }`}
                  >
                    <span>Slot {s.num}: {s.val ? new Date(s.val).toLocaleString("en-IN") : "Not provided"}</span>
                    {selectedInterview.selectedSlot === s.num && (
                      <span className="rounded-full bg-brand-600 px-2 py-0.5 text-2xs text-white">
                        Selected
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Meeting Link & Notes */}
              <div className="space-y-2">
                {selectedInterview.meetingLink && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                    <p className="text-2xs font-semibold text-brand-800 uppercase">Video Meeting URL</p>
                    <a
                      href={selectedInterview.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1.5 font-medium text-xs text-brand-700 hover:underline break-all"
                    >
                      <Video className="size-4 shrink-0" />
                      <span>{selectedInterview.meetingLink}</span>
                    </a>
                  </div>
                )}

                {selectedInterview.notes && (
                  <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-xs text-ink-700">
                    <p className="text-2xs font-semibold uppercase text-text-subtle mb-1">Session Notes</p>
                    <p>{selectedInterview.notes}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-ink-100 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedInterview(null)}
                  className="rounded-xl border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 3. Company Proposals Modal */}
      <Dialog
        open={companyModalType === "proposals"}
        onOpenChange={(open) => !open && setCompanyModalType(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <FileText className="size-5 text-brand-600" />
              <span>Proposals for {selectedCompany?.companyName}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              All offers and candidates linked to this employer.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 space-y-2">
            {companyProposals.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-500">No proposals sent yet.</p>
            ) : (
              companyProposals.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 transition-colors"
                >
                  <div>
                    <h5 className="font-semibold text-xs text-ink-900">
                      {p.internFirstName} {p.internLastName}
                    </h5>
                    <p className="text-2xs text-text-subtle">
                      {p.projectName} · {p.createdAt ? formatDate(p.createdAt) : "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={p.status} />
                    <button
                      type="button"
                      onClick={() => {
                        setCompanyModalType(null);
                        setSelectedProposal(p);
                      }}
                      className="rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-2xs font-semibold text-ink-700 hover:bg-brand-50 hover:text-brand-800"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 4. Company Interviews Modal */}
      <Dialog
        open={companyModalType === "interviews"}
        onOpenChange={(open) => !open && setCompanyModalType(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <Clock className="size-5 text-amber-600" />
              <span>Interviews for {selectedCompany?.companyName}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              All scheduled sessions and candidate evaluations for this employer.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 space-y-2">
            {companyInterviews.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-500">No interviews scheduled yet.</p>
            ) : (
              companyInterviews.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between rounded-xl border border-ink-100 p-3.5 hover:bg-ink-50/50 transition-colors"
                >
                  <div>
                    <h5 className="font-semibold text-xs text-ink-900">
                      {i.internFirstName} {i.internLastName}
                    </h5>
                    <p className="text-2xs text-text-subtle">
                      {i.projectName || "General"} · {i.createdAt ? formatDate(i.createdAt) : "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={i.status} />
                    <button
                      type="button"
                      onClick={() => {
                        setCompanyModalType(null);
                        setSelectedInterview(i);
                      }}
                      className="rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-2xs font-semibold text-ink-700 hover:bg-brand-50 hover:text-brand-800"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
