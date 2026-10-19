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
  IndianRupee,
  Laptop,
  Loader2,
  Search,
  Send,
  X,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatCurrency } from "@/lib/format";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { Pill } from "@/components/app/primitives";
import { EmptyScene } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { employerProposalPill } from "@/components/app/status";
import type { Proposal, Project } from "@/lib/db/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { parseOffer } from "@/lib/offer";

export type ProposalItem = {
  proposal: Proposal;
  /** Identity only. `email` is null unless this employer has hired them. */
  user: { firstName: string; lastName: string; email: string | null } | null;
  project: Project | null;
  /** Hired by this employer on any project - the unmasking rule. */
  internHired: boolean;
};

/**
 * Redacted identity for one proposal row. Full name shows once this employer
 * has hired the intern on any project - same rule as the pool.
 */
function nameOf(item: ProposalItem): string {
  const first = item.user?.firstName?.trim() || "";
  const last = item.user?.lastName?.trim() || "";
  return displayNameOf(
    {
      fullName: `${first} ${last}`.trim() || "Candidate",
      initials: initialsOf(first, last),
    },
    item.internHired,
  );
}

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
    const projectName = (item.project?.projectName || "").toLowerCase();
    const roleTitle = String(
      (item.proposal.offerDetails as Record<string, unknown>)?.roleTitle || ""
    ).toLowerCase();

    // Project / role only - names are redacted, so matching on them would both
    // leak existence and return nothing useful.
    const matchesSearch =
      !search.trim() ||
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

  function getStatusBadge(status: string) {
    const s = employerProposalPill(status);
    return <Pill tone={s.tone}>{s.label}</Pill>;
  }

  return (
    <div className="space-y-6">
      {/* Metrics - one quiet strip, not four tinted cards. The numbers
          differ; the chrome must not. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-ink-200/70 bg-ink-100 sm:grid-cols-4">
        {[
          { label: "Total proposals", value: totalSent, hint: "All time offers sent" },
          { label: "Pending response", value: pendingCount, hint: "Awaiting candidate reply" },
          { label: "Accepted offers", value: acceptedCount, hint: "Ready to complete hire" },
          { label: "Closed", value: closedCount, hint: "Declined or retracted" },
        ].map((m) => (
          <div key={m.label} className="bg-white p-4">
            <p className="text-[13px] text-text-subtle">{m.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 tabular-nums">
              {m.value}
            </p>
            <p className="text-xs text-text-subtle">{m.hint}</p>
          </div>
        ))}
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative min-w-[14rem] max-w-md flex-1 basis-64">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project or role…"
            className="apple-spring min-h-11 w-full rounded-[10px] border border-ink-200 bg-white pl-9.5 pr-4 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="apple-spring absolute right-1 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-[10px] text-ink-600 hover:text-ink-700"
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
              className="apple-spring min-h-11 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] font-medium text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
            className="apple-spring min-h-11 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] font-medium text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="all">All Statuses</option>
            <option value="sent">Under Review</option>
            <option value="accepted">Accepted (Ready to Hire)</option>
            <option value="rejected">Declined</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="hired">Hired</option>
          </select>

          <ButtonLink
            href="/employer/candidates"
            variant="primary"
            size="sm"
            className="min-h-11 px-4 text-[13px] font-semibold"
          >
            <Send className="size-3.5" aria-hidden />
            <span>Send proposal</span>
          </ButtonLink>
        </div>
      </div>

      {/* Proposals List */}
      {filtered.length === 0 ? (
        <EmptyScene
          art
          title="No proposals found"
          body={
            search || statusFilter !== "all"
              ? "Try adjusting your search query or status filter."
              : "You haven't sent any proposals to candidates yet. Browse the pool and send the first one."
          }
          next={
            search || statusFilter !== "all"
              ? undefined
              : { label: "Browse candidates", href: "/employer/candidates" }
          }
          who={search || statusFilter !== "all" ? "You - loosen the filters" : "You - send the first proposal"}
        />
      ) : (
        <div className="space-y-3.5">
          {filtered.map((item) => {
            const offer = parseOffer(item.proposal.offerDetails, item.proposal.currency);
            const candidateName = nameOf(item);
            const candidateInitials = initialsOf(
              item.user?.firstName?.trim() || "",
              item.user?.lastName?.trim() || "",
            );
            const roleTitle = offer.roleTitle || "Internship";
            const stipendMinor = offer.monthlyMinor;
            const duration = `${offer.months} month${offer.months === 1 ? "" : "s"}`;
            const startDate = offer.startDate;
            const hasLaptop = offer.laptop === "company" || offer.laptop === "yes";

            const isPending = item.proposal.status === "sent";
            const isAccepted = item.proposal.status === "accepted";

            return (
              <div
                key={item.proposal.id}
                className="apple-spring overflow-hidden rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] hover:border-brand-200"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="grid size-11 place-items-center rounded-[10px] bg-brand-100 text-sm font-bold text-brand-800 shrink-0">
                      {candidateInitials === "?" ? "C" : candidateInitials}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-ink-900" title={candidateName}>{candidateName}</h3>
                        {getStatusBadge(item.proposal.status)}
                      </div>

                      <p className="mt-0.5 text-xs font-medium text-brand-800">
                        {roleTitle}
                        {item.project ? (
                          <span className="text-ink-600 font-normal"> · Project: {item.project.projectName}</span>
                        ) : null}
                      </p>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-text-subtle">
                        <span className="flex items-center gap-1">
                          <IndianRupee className="size-3 text-ink-500" />
                          <strong className="text-ink-800 font-semibold tabular-nums">
                            {stipendMinor != null ? formatCurrency(stipendMinor, offer.currency) : "—"}
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
                    {/* The full page carries every term (start date, hours,
                        rate, total, shift, leave, skills); a summary sheet here
                        showed a subset and hid the rest. */}
                    <Link
                      href={`/employer/proposal/${item.proposal.id}`}
                      className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-xs font-semibold text-ink-700 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900"
                    >
                      <Eye className="size-3.5" />
                      <span>View Details</span>
                    </Link>

                    {isAccepted && (
                      // Accepted offers are billed straight from checkout - the
                      // shortlist cart is not involved, so no staging step.
                      <Link
                        href="/employer/checkout"
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-xs font-semibold text-white shadow-2xs hover:bg-primary-hover"
                      >
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        <span>Proceed to hire</span>
                      </Link>
                    )}

                    {isPending && (
                      <button
                        type="button"
                        onClick={() => setWithdrawTarget(item)}
                        disabled={busyId === item.proposal.id}
                        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-rose-200 bg-rose-50/50 px-3.5 text-xs font-semibold text-rose-700 hover:bg-rose-100/70 disabled:opacity-60"
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
            <div className="rounded-[10px] border border-ink-200/70 bg-ink-50/50 p-3.5 text-xs space-y-1">
              <p className="font-semibold text-ink-900">
                {withdrawTarget ? nameOf(withdrawTarget) : ""}
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
              className="apple-spring apple-pressable min-h-11 rounded-[10px] border border-ink-200 bg-white px-4 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            >
              Keep Proposal
            </button>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={Boolean(busyId)}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busyId && <Loader2 className="size-3.5 animate-spin" />}
              <span>Confirm Withdrawal</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
