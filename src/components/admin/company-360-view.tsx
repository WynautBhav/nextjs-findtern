"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Eye,
  Globe,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";

import { formatCurrency, formatDate } from "@/lib/format";
import type { Employer, Project, Proposal, Interview, EmployerPayment, User as UserType } from "@/lib/db/schema";
import { StatusBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type Company360Props = {
  company: Employer;
  projects: Project[];
  proposals: (Proposal & { internName?: string; internEmail?: string })[];
  interviews: (Interview & { internName?: string; internEmail?: string })[];
  payments: EmployerPayment[];
  hiredInterns: {
    proposal: Proposal;
    intern: UserType | null;
    projectName: string;
  }[];
};

export function Company360View({
  company,
  projects,
  proposals,
  interviews,
  payments,
  hiredInterns,
}: Company360Props) {
  const [activeTab, setActiveTab] = useState<
    "projects" | "proposals" | "interviews" | "payments" | "upcoming" | "hired"
  >("projects");

  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

  const activeProjectsCount = projects.filter((p) => p.status === "active").length;
  const totalRevenueMinor = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + (p.amountMinor ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Header */}
      <div>
        <Link
          href="/admin/companies"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>All Companies</span>
        </Link>

        <div className="mt-2.5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-100 text-lg font-bold text-brand-800 border border-brand-200/60 shadow-2xs">
              {company.companyName.charAt(0).toUpperCase()}
            </span>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-ink-900">
                  {company.companyName}
                </h1>
                <StatusBadge value={company.isActive ? "active" : "inactive"} />
                {company.setupCompleted ? (
                  <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-2xs font-semibold text-emerald-800">
                    Setup Complete
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-2xs font-semibold text-amber-800">
                    Pending Onboarding
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
                <span className="flex items-center gap-1">
                  <User className="size-3.5 text-ink-400" />
                  <span>{company.primaryContactName || "No contact named"}</span>
                </span>

                <span className="flex items-center gap-1">
                  <Mail className="size-3.5 text-ink-400" />
                  <span>{company.companyEmail}</span>
                </span>

                <span className="flex items-center gap-1">
                  <Phone className="size-3.5 text-ink-400" />
                  <span>{company.countryCode} {company.phoneNumber}</span>
                </span>

                {company.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5 text-ink-400" />
                    <span>{company.city}{company.state ? `, ${company.state}` : ""}</span>
                  </span>
                )}

                {company.websiteUrl && (
                  <a
                    href={company.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <Globe className="size-3.5" />
                    <span>Website</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <p className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
            Projects Posted
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-ink-900 tabular-nums">
              {projects.length}
            </span>
            <span className="text-2xs font-medium text-emerald-700">
              ({activeProjectsCount} active)
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <p className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
            Proposals Sent
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink-900 tabular-nums">
            {proposals.length}
          </p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <p className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
            Interviews Held
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink-900 tabular-nums">
            {interviews.length}
          </p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs">
          <p className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
            Total Revenue
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-brand-800 tabular-nums">
            {formatCurrency(totalRevenueMinor, "INR")}
          </p>
        </div>
      </div>

      {/* 6 Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-ink-100 pb-2">
        {([
          { key: "projects" as const, label: "Projects", count: projects.length },
          { key: "proposals" as const, label: "Proposals", count: proposals.length },
          { key: "interviews" as const, label: "Interviews", count: interviews.length },
          { key: "payments" as const, label: "Payments", count: payments.length },
          { key: "upcoming" as const, label: "Upcoming Dues", count: 0 },
          { key: "hired" as const, label: "Hired Interns", count: hiredInterns.length },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors shrink-0 ${
              activeTab === tab.key
                ? "bg-brand-700 text-white shadow-2xs"
                : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-2xs ${
                activeTab === tab.key
                  ? "bg-white/20 text-white"
                  : "bg-ink-100 text-ink-700"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {activeTab === "projects" && (
        <div className="rounded-2xl border border-ink-100 bg-white shadow-2xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-ink-50/60">
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Project Title</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Work Mode</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Skills</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Status</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Date Posted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-ink-500">
                    No internship projects posted by this company yet.
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((proj) => (
                  <TableRow key={proj.id} className="hover:bg-ink-50/60">
                    <TableCell className="px-5 py-3.5 font-semibold text-xs text-ink-900">
                      {proj.projectName}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs text-ink-700 capitalize">
                      {proj.locationType || "Remote"}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(proj.skills ?? []).slice(0, 3).map((s) => (
                          <span key={s} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-700">
                            {s}
                          </span>
                        ))}
                        {(proj.skills ?? []).length > 3 && (
                          <span className="text-2xs text-ink-500">
                            +{(proj.skills ?? []).length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge value={proj.status || "active"} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs text-ink-500">
                      {formatDate(proj.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === "proposals" && (
        <div className="rounded-2xl border border-ink-100 bg-white shadow-2xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-ink-50/60">
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Candidate</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Role Title</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Stipend</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Status</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Sent Date</TableHead>
                <TableHead className="px-5 py-3 text-right text-xs font-semibold text-ink-700">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-ink-500">
                    No proposals sent by this company yet.
                  </TableCell>
                </TableRow>
              ) : (
                proposals.map((prop) => {
                  const offer = (prop.offerDetails ?? {}) as Record<string, unknown>;
                  const stipendMinor = Number(offer.monthlyAmountMinor ?? 1500000);
                  return (
                    <TableRow key={prop.id} className="hover:bg-ink-50/60">
                      <TableCell className="px-5 py-3.5">
                        <Link
                          href={`/admin/interns/${prop.internId}`}
                          className="font-semibold text-xs text-brand-700 hover:underline"
                        >
                          {prop.internName || "Candidate"}
                        </Link>
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-ink-800">
                        {String(offer.roleTitle || "Internship")}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs font-semibold tabular-nums text-ink-900">
                        {formatCurrency(stipendMinor, prop.currency === "USD" ? "USD" : "INR")}/mo
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <StatusBadge value={prop.status} />
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-ink-500">
                        {formatDate(prop.createdAt)}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedProposal(prop)}
                          className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-2xs font-semibold text-ink-700 hover:bg-ink-50"
                        >
                          <Eye className="size-3" />
                          <span>View</span>
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === "interviews" && (
        <div className="rounded-2xl border border-ink-100 bg-white shadow-2xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-ink-50/60">
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Candidate</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Proposed Slots</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Timezone</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Status</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-ink-500">
                    No interviews scheduled.
                  </TableCell>
                </TableRow>
              ) : (
                interviews.map((iv) => (
                  <TableRow key={iv.id} className="hover:bg-ink-50/60">
                    <TableCell className="px-5 py-3.5">
                      <Link
                        href={`/admin/interns/${iv.internId}`}
                        className="font-semibold text-xs text-brand-700 hover:underline"
                      >
                        {iv.internName || "Candidate"}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-2xs text-ink-700">
                      {[iv.slot1, iv.slot2, iv.slot3]
                        .filter(Boolean)
                        .map((s) => formatDate(s))
                        .join(" · ") || "No slot defined"}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-2xs font-mono text-ink-600">
                      {iv.timezone || "Asia/Kolkata"}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge value={iv.status} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs text-ink-500">
                      {formatDate(iv.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="rounded-2xl border border-ink-100 bg-white shadow-2xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-ink-50/60">
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Order ID</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Amount</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Payment ID</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Status</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-ink-500">
                    No payment transactions recorded for this employer.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((pay) => (
                  <TableRow key={pay.id} className="hover:bg-ink-50/60">
                    <TableCell className="px-5 py-3.5 text-xs font-mono text-ink-800">
                      {pay.orderId || pay.id.slice(0, 10)}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs font-bold text-brand-800">
                      {formatCurrency(pay.amountMinor, pay.currency === "USD" ? "USD" : "INR")}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs font-mono text-ink-600">
                      {pay.paymentId || "—"}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge value={pay.status} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs text-ink-500">
                      {formatDate(pay.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === "upcoming" && (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink-50 text-ink-400">
            <Clock className="size-6" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-ink-900">No pending milestone dues</h3>
          <p className="mt-1 text-xs text-text-subtle">
            All recurring monthly stipends and per-hire fees for this employer are up to date.
          </p>
        </div>
      )}

      {activeTab === "hired" && (
        <div className="rounded-2xl border border-ink-100 bg-white shadow-2xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-ink-50/60">
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Intern</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Project</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Role</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Hired On</TableHead>
                <TableHead className="px-5 py-3 text-right text-xs font-semibold text-ink-700">Profile</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hiredInterns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-ink-500">
                    No active hired interns under this employer.
                  </TableCell>
                </TableRow>
              ) : (
                hiredInterns.map((h) => {
                  const offer = (h.proposal.offerDetails ?? {}) as Record<string, unknown>;
                  const internName = `${h.intern?.firstName || ""} ${h.intern?.lastName || ""}`.trim();
                  return (
                    <TableRow key={h.proposal.id} className="hover:bg-ink-50/60">
                      <TableCell className="px-5 py-3.5 font-semibold text-xs text-ink-900">
                        {internName || "Intern"}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-ink-800">
                        {h.projectName}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-ink-700">
                        {String(offer.roleTitle || "Intern")}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-ink-500">
                        {formatDate(h.proposal.hiredAt || h.proposal.updatedAt)}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-right">
                        {h.intern && (
                          <Link
                            href={`/admin/interns/${h.intern.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                          >
                            <span>Intern 360</span>
                            <ExternalLink className="size-3" />
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Proposal Details Modal */}
      <Dialog
        open={Boolean(selectedProposal)}
        onOpenChange={(open) => !open && setSelectedProposal(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Proposal Details</DialogTitle>
            <DialogDescription>
              Details of offer sent to candidate.
            </DialogDescription>
          </DialogHeader>

          {selectedProposal && (() => {
            const offer = (selectedProposal.offerDetails ?? {}) as Record<string, unknown>;
            return (
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex justify-between border-b border-ink-100 pb-2">
                  <span className="text-text-subtle">Role Title:</span>
                  <span className="font-semibold text-ink-900">{String(offer.roleTitle || "Internship")}</span>
                </div>
                <div className="flex justify-between border-b border-ink-100 pb-2">
                  <span className="text-text-subtle">Stipend:</span>
                  <span className="font-semibold text-brand-800">
                    {formatCurrency(
                      Number(offer.monthlyAmountMinor ?? 1500000),
                      selectedProposal.currency === "USD" ? "USD" : "INR"
                    )}/mo
                  </span>
                </div>
                <div className="flex justify-between border-b border-ink-100 pb-2">
                  <span className="text-text-subtle">Duration:</span>
                  <span className="font-semibold text-ink-900">{String(offer.durationMonths || "3 months")}</span>
                </div>
                <div className="flex justify-between border-b border-ink-100 pb-2">
                  <span className="text-text-subtle">Work Mode:</span>
                  <span className="font-semibold text-ink-900 capitalize">{String(offer.workMode || "Remote")}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-text-subtle">Scope of Work:</span>
                  <p className="rounded-xl border border-ink-100 bg-ink-50/50 p-2.5 text-2xs text-ink-800 leading-relaxed">
                    {String(offer.scopeOfWork || "Standard project milestones.")}
                  </p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
