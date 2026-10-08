"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  IndianRupee,
  Laptop,
  Loader2,
  Search,
  Send,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Proposal, User as UserType, InternOnboarding, Project } from "@/lib/db/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export type ProposalItem = {
  proposal: Proposal;
  user: UserType | null;
  onboarding: InternOnboarding | null;
  project: Project | null;
};

export function ProposalsManager({
  initialProposals,
}: {
  initialProposals: ProposalItem[];
  employerId?: string;
}) {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalItem[]>(initialProposals);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const [activeProposal, setActiveProposal] = useState<ProposalItem | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<ProposalItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Projects list for filter
  const projectsMap = new Map<string, string>();
  proposals.forEach((p) => {
    if (p.project) projectsMap.set(p.project.id, p.project.projectName);
  });
  const projectOptions = Array.from(projectsMap.entries());

  // Metrics
  const totalSent = proposals.length;
  const pendingCount = proposals.filter((p) => p.proposal.status === "sent").length;
  const acceptedCount = proposals.filter((p) => p.proposal.status === "accepted").length;
  const closedCount = proposals.filter((p) => ["rejected", "withdrawn"].includes(p.proposal.status)).length;

  const filtered = proposals.filter((item) => {
    const candidateName = `${item.user?.firstName || ""} ${item.user?.lastName || ""}`.toLowerCase();
    const projectName = (item.project?.projectName || "").toLowerCase();
    const roleTitle = String(
      (item.proposal.offerDetails as Record<string, unknown>)?.roleTitle || ""
    ).toLowerCase();

    const matchesSearch =
      !search.trim() ||
      candidateName.includes(search.toLowerCase()) ||
      projectName.includes(search.toLowerCase()) ||
      roleTitle.includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || item.proposal.status === statusFilter;

    const matchesProject =
      projectFilter === "all" || item.proposal.projectId === projectFilter;

    return matchesSearch && matchesStatus && matchesProject;
  });

  async function handleWithdraw() {
    if (!withdrawTarget) return;
    setBusyId(withdrawTarget.proposal.id);
    setErrorMsg("");

    try {
      const res = await csrfFetch(`/api/proposals/${withdrawTarget.proposal.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "withdrawn" }),
      });

      if (res.ok) {
        setProposals((prev) =>
          prev.map((item) =>
            item.proposal.id === withdrawTarget.proposal.id
              ? {
                  ...item,
                  proposal: { ...item.proposal, status: "withdrawn", updatedAt: new Date() },
                }
              : item
          )
        );
        setWithdrawTarget(null);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Failed to withdraw proposal");
      }
    } catch {
      setErrorMsg("Network error occurred");
    } finally {
      setBusyId(null);
    }
  }

  async function handleProceedToHire(item: ProposalItem) {
    setBusyId(item.proposal.id);
    setErrorMsg("");

    try {
      // Stage candidate into cart checkout
      const res = await csrfFetch("/api/employer/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stage",
          internId: item.proposal.internId,
          projectId: item.proposal.projectId,
        }),
      });

      if (res.ok) {
        router.push("/employer/checkout");
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Failed to stage for hire checkout");
        setBusyId(null);
      }
    } catch {
      setErrorMsg("Network error occurred");
      setBusyId(null);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "sent":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-2xs font-bold text-amber-800">
            <Clock className="size-3 text-amber-600" />
            <span>Under Review</span>
          </span>
        );
      case "accepted":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-2xs font-bold text-emerald-800">
            <Sparkles className="size-3 text-emerald-600 fill-emerald-600" />
            <span>Accepted · Ready to Hire</span>
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200/80 px-2.5 py-0.5 text-2xs font-semibold text-rose-700">
            <XCircle className="size-3 text-rose-600" />
            <span>Declined by Candidate</span>
          </span>
        );
      case "withdrawn":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 border border-ink-200 px-2.5 py-0.5 text-2xs font-medium text-ink-600">
            <span>Withdrawn</span>
          </span>
        );
      case "hired":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-2xs font-bold text-blue-800">
            <CheckCircle2 className="size-3 text-blue-600" />
            <span>Hired & Active</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-700 capitalize">
            {status}
          </span>
        );
    }
  }

  return (
    <div className="space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <p className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
            Total Proposals
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink-900 tabular-nums">
            {totalSent}
          </p>
          <p className="text-2xs text-text-subtle">All time offers sent</p>
        </div>

        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/30 p-4 shadow-2xs">
          <p className="text-2xs font-semibold uppercase tracking-wider text-amber-800">
            Pending Response
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-amber-900 tabular-nums">
            {pendingCount}
          </p>
          <p className="text-2xs text-amber-700">Awaiting candidate reply</p>
        </div>

        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/30 p-4 shadow-2xs">
          <p className="text-2xs font-semibold uppercase tracking-wider text-emerald-800">
            Accepted Offers
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-900 tabular-nums">
            {acceptedCount}
          </p>
          <p className="text-2xs text-emerald-700">Ready to complete hire</p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <p className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
            Closed / Withdrawn
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink-700 tabular-nums">
            {closedCount}
          </p>
          <p className="text-2xs text-text-subtle">Declined or retracted</p>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by candidate or project…"
            className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-9.5 pr-4 text-xs text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {projectOptions.length > 0 && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 outline-none focus:border-brand-600"
            >
              <option value="all">All Projects</option>
              {projectOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 outline-none focus:border-brand-600"
          >
            <option value="all">All Statuses</option>
            <option value="sent">Under Review</option>
            <option value="accepted">Accepted (Ready to Hire)</option>
            <option value="rejected">Declined</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="hired">Hired</option>
          </select>

          <Link
            href="/employer/candidates"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800"
          >
            <Send className="size-3.5" />
            <span>Send New Proposal</span>
          </Link>
        </div>
      </div>

      {/* Proposals List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink-50 text-ink-400">
            <FileText className="size-6" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-ink-900">No proposals found</h3>
          <p className="mt-1 text-xs text-text-subtle">
            {search || statusFilter !== "all"
              ? "Try adjusting your search query or status filter."
              : "You haven't sent any proposals to candidates yet."}
          </p>
          <div className="mt-5">
            <Link
              href="/employer/candidates"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-800"
            >
              Explore Top Candidates
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((item) => {
            const offer = (item.proposal.offerDetails ?? {}) as Record<string, unknown>;
            const candidateName =
              `${item.user?.firstName || "Candidate"} ${item.user?.lastName || ""}`.trim();
            const roleTitle = String(offer.roleTitle || "Internship Role");
            const stipendMinor = Number(offer.monthlyAmountMinor ?? 1500000);
            const duration = String(offer.durationMonths || offer.duration || "3 months");
            const startDate = offer.startDate ? String(offer.startDate) : null;
            const hasLaptop = Boolean(offer.hasLaptop);

            const isPending = item.proposal.status === "sent";
            const isAccepted = item.proposal.status === "accepted";

            return (
              <div
                key={item.proposal.id}
                className="overflow-hidden rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs transition-all hover:border-brand-200 hover:shadow-xs"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="grid size-11 place-items-center rounded-xl bg-brand-100 text-sm font-bold text-brand-800 shrink-0">
                      {candidateName.charAt(0).toUpperCase()}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-ink-900">{candidateName}</h4>
                        {getStatusBadge(item.proposal.status)}
                      </div>

                      <p className="mt-0.5 text-xs font-medium text-brand-800">
                        {roleTitle}
                        {item.project ? (
                          <span className="text-ink-400 font-normal"> · Project: {item.project.projectName}</span>
                        ) : null}
                      </p>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-text-subtle">
                        <span className="flex items-center gap-1">
                          <IndianRupee className="size-3 text-ink-500" />
                          <strong className="text-ink-800 font-semibold">
                            {formatCurrency(
                              stipendMinor,
                              item.proposal.currency === "USD" ? "USD" : "INR"
                            )}
                          </strong>
                          <span>/ month</span>
                        </span>

                        <span className="flex items-center gap-1">
                          <Clock className="size-3 text-ink-500" />
                          <span>{duration}</span>
                        </span>

                        {startDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3 text-ink-500" />
                            <span>Starts {startDate}</span>
                          </span>
                        )}

                        {hasLaptop && (
                          <span className="flex items-center gap-1 text-brand-700">
                            <Laptop className="size-3" />
                            <span>Laptop provided</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex flex-wrap items-center gap-2 sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveProposal(item)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
                    >
                      <Eye className="size-3.5" />
                      <span>View Details</span>
                    </button>

                    {isAccepted && (
                      <button
                        type="button"
                        onClick={() => handleProceedToHire(item)}
                        disabled={busyId === item.proposal.id}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busyId === item.proposal.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        <span>Proceed to Hire</span>
                      </button>
                    )}

                    {isPending && (
                      <button
                        type="button"
                        onClick={() => setWithdrawTarget(item)}
                        disabled={busyId === item.proposal.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 px-3.5 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100/70 disabled:opacity-60"
                      >
                        <X className="size-3.5" />
                        <span>Withdraw</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Withdraw Confirmation Dialog */}
      <Dialog
        open={Boolean(withdrawTarget)}
        onOpenChange={(open) => !open && setWithdrawTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw Proposal</DialogTitle>
            <DialogDescription>
              Are you sure you want to retract this offer? The candidate will no longer be able to accept it.
            </DialogDescription>
          </DialogHeader>

          {withdrawTarget && (
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3.5 text-xs space-y-1">
              <p className="font-semibold text-ink-900">
                {withdrawTarget.user?.firstName} {withdrawTarget.user?.lastName}
              </p>
              <p className="text-text-subtle">
                Role: {String((withdrawTarget.proposal.offerDetails as Record<string, unknown>)?.roleTitle || "Internship")}
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setWithdrawTarget(null)}
              className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50"
            >
              Keep Proposal
            </button>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={Boolean(busyId)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busyId && <Loader2 className="size-3.5 animate-spin" />}
              <span>Confirm Withdrawal</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Proposal Details Sheet */}
      <Sheet
        open={Boolean(activeProposal)}
        onOpenChange={(open) => !open && setActiveProposal(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {activeProposal && (() => {
            const offer = (activeProposal.proposal.offerDetails ?? {}) as Record<string, unknown>;
            const candidateName =
              `${activeProposal.user?.firstName || "Candidate"} ${activeProposal.user?.lastName || ""}`.trim();
            const roleTitle = String(offer.roleTitle || "Internship Role");
            const stipendMinor = Number(offer.monthlyAmountMinor ?? 1500000);
            const duration = String(offer.durationMonths || offer.duration || "3 months");
            const workMode = String(offer.workMode || "Remote");
            const hasLaptop = Boolean(offer.hasLaptop);
            const scope = String(offer.scopeOfWork || offer.description || "As defined in internship plan.");

            return (
              <div className="space-y-6 pt-4">
                <SheetHeader>
                  <div className="flex items-center justify-between gap-2">
                    <SheetTitle className="text-base font-bold text-ink-900">
                      Proposal Details
                    </SheetTitle>
                    {getStatusBadge(activeProposal.proposal.status)}
                  </div>
                  <SheetDescription className="text-xs text-text-subtle">
                    Offer sent on {formatDate(activeProposal.proposal.createdAt)}
                  </SheetDescription>
                </SheetHeader>

                {/* Candidate Summary */}
                <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-100 text-sm font-bold text-brand-800">
                      {candidateName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-ink-900">{candidateName}</h4>
                      <p className="text-2xs font-medium text-brand-700">{roleTitle}</p>
                      <p className="text-2xs text-text-subtle">{activeProposal.user?.email}</p>
                    </div>
                  </div>
                </div>

                {/* Terms Overview */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-ink-100 bg-white p-3.5">
                    <p className="text-2xs uppercase tracking-wider text-text-subtle font-semibold">
                      Monthly Stipend
                    </p>
                    <p className="mt-1 text-sm font-bold text-brand-800">
                      {formatCurrency(
                        stipendMinor,
                        activeProposal.proposal.currency === "USD" ? "USD" : "INR"
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-ink-100 bg-white p-3.5">
                    <p className="text-2xs uppercase tracking-wider text-text-subtle font-semibold">
                      Duration
                    </p>
                    <p className="mt-1 text-sm font-bold text-ink-900">{duration}</p>
                  </div>

                  <div className="rounded-xl border border-ink-100 bg-white p-3.5">
                    <p className="text-2xs uppercase tracking-wider text-text-subtle font-semibold">
                      Work Mode
                    </p>
                    <p className="mt-1 text-sm font-bold text-ink-900 capitalize">{workMode}</p>
                  </div>

                  <div className="rounded-xl border border-ink-100 bg-white p-3.5">
                    <p className="text-2xs uppercase tracking-wider text-text-subtle font-semibold">
                      Laptop Provided
                    </p>
                    <p className="mt-1 text-sm font-bold text-ink-900">{hasLaptop ? "Yes" : "No"}</p>
                  </div>
                </div>

                {/* Scope of Work */}
                <div className="rounded-xl border border-ink-100 bg-white p-4 space-y-2">
                  <h4 className="text-xs font-bold text-ink-900">Scope of Work & Objectives</h4>
                  <p className="text-xs text-ink-700 leading-relaxed whitespace-pre-wrap">{scope}</p>
                </div>

                {/* Bottom Action */}
                <div className="pt-2 flex items-center justify-end gap-2">
                  {activeProposal.proposal.status === "accepted" && (
                    <button
                      type="button"
                      onClick={() => handleProceedToHire(activeProposal)}
                      disabled={busyId === activeProposal.proposal.id}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {busyId === activeProposal.proposal.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      <span>Proceed to Hire Candidate</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
