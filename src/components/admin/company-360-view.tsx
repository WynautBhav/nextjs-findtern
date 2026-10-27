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
import { AdminEmpty } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { parseOffer } from "@/lib/offer";
import { toInrMinor } from "@/lib/admin/money";

export type Company360Props = {
  company: Omit<Employer, "password">;
  projects: Project[];
  proposals: (Proposal & { internName?: string; internEmail?: string })[];
  interviews: (Interview & { internName?: string; internEmail?: string })[];
  payments: EmployerPayment[];
  hiredInterns: {
    proposal: Proposal;
    intern: UserType | null;
    projectName: string;
  }[];
  /** Monthly-plan placements with the next month still to pay. */
  dues: { proposalId: string; internName: string; role: string; monthsPaid: number; months: number; nextMinor: number | null; currency: string }[];
  /** Page-level controls (edit contact, view as, activate, delete) rendered beside the name. */
  actions?: React.ReactNode;
};

export function Company360View({
  company,
  projects,
  proposals,
  interviews,
  payments,
  hiredInterns,
  dues,
  actions,
}: Company360Props) {
  const [activeTab, setActiveTab] = useState<
    "projects" | "proposals" | "interviews" | "payments" | "upcoming" | "hired"
  >("projects");

  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<
    (Interview & { internName?: string; internEmail?: string }) | null
  >(null);

  // Same "active" rule as the projects list: anything not closed; empty counts as active.
  const activeProjectsCount = projects.filter(
    (p) => !["inactive", "closed", "archived"].includes(String(p.status || "active").toLowerCase()),
  ).length;
  // USD orders converted at ₹100/$ so the total is one currency.
  const totalRevenueMinor = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + toInrMinor(p.amountMinor, p.currency), 0);

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

        <div className="mt-2.5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-100 text-lg font-bold text-brand-800 border border-brand-200/60 shadow-2xs">
              {company.companyName.charAt(0).toUpperCase()}
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-ink-900">
                  {company.companyName}
                </h1>
                <StatusBadge value={company.isActive ? "active" : "inactive"} />
                {company.setupCompleted ? (
                  <span className="whitespace-nowrap rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-2xs font-semibold text-emerald-800">
                    Setup Complete
                  </span>
                ) : (
                  <span className="whitespace-nowrap rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-2xs font-semibold text-amber-800">
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

          {actions ? (
            <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:justify-end">{actions}</div>
          ) : null}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      <div
        role="tablist"
        aria-label="Company records"
        className="flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-ink-100 p-1"
      >
        {([
          { key: "projects" as const, label: "Projects", count: projects.length },
          { key: "proposals" as const, label: "Proposals", count: proposals.length },
          { key: "interviews" as const, label: "Interviews", count: interviews.length },
          { key: "payments" as const, label: "Payments", count: payments.length },
          { key: "upcoming" as const, label: "Upcoming Dues", count: dues.length },
          { key: "hired" as const, label: "Hired Interns", count: hiredInterns.length },
        ] as const).map((tab) => (
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
            <span
              className={`rounded-full px-1.5 py-0.5 text-2xs tabular-nums ${
                activeTab === tab.key
                  ? "bg-brand-50 text-brand-800"
                  : "bg-ink-200/70 text-ink-600"
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
                <TableHead className="hidden px-5 py-3 text-xs font-semibold text-ink-700 xl:table-cell">Skills</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Status</TableHead>
                <TableHead className="px-5 py-3 text-xs font-semibold text-ink-700">Date Posted</TableHead>
                <TableHead className="px-5 py-3 text-right text-xs font-semibold text-ink-700">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <AdminEmpty title="No projects yet" body="This company has not posted an internship project." />
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
                    {/* Hidden below xl: at the sidebar breakpoint the chips
                        stacked one per line and tripled the row height. */}
                    <TableCell className="hidden px-5 py-3.5 xl:table-cell">
                      <div className="flex flex-nowrap items-center gap-1">
                        {(proj.skills ?? []).slice(0, 3).map((s) => (
                          <span key={s} className="whitespace-nowrap rounded-md bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-700">
                            {s}
                          </span>
                        ))}
                        {(proj.skills ?? []).length > 3 && (
                          <span className="whitespace-nowrap text-2xs text-ink-600">
                            +{(proj.skills ?? []).length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge value={proj.status || "active"} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs text-ink-600">
                      {formatDate(proj.createdAt)}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedProject(proj)}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-2xs font-semibold text-ink-700 hover:bg-brand-50 hover:text-brand-800"
                      >
                        <Eye className="size-3" />
                        <span>Quick View</span>
                      </button>
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
                  <TableCell colSpan={6} className="p-0">
                    <AdminEmpty title="No proposals yet" body="This company has not sent a proposal to any candidate." />
                  </TableCell>
                </TableRow>
              ) : (
                proposals.map((prop) => {
                  const offer = parseOffer(prop.offerDetails, prop.currency);
                  const stipendMinor = offer.monthlyMinor;
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
                        {offer.roleTitle || "Internship"}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs font-semibold tabular-nums text-ink-900">
                        {stipendMinor != null ? `${formatCurrency(stipendMinor, offer.currency)}/mo` : "—"}
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <StatusBadge value={prop.status} />
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-ink-600">
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
                <TableHead className="px-5 py-3 text-right text-xs font-semibold text-ink-700">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <AdminEmpty title="No interviews" body="No interview has been scheduled with this company." />
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
                    <TableCell className="px-5 py-3.5 text-xs text-ink-600">
                      {formatDate(iv.createdAt)}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedInterview(iv)}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-2xs font-semibold text-ink-700 hover:bg-brand-50 hover:text-brand-800"
                      >
                        <Eye className="size-3" />
                        <span>View</span>
                      </button>
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
                  <TableCell colSpan={5} className="p-0">
                    <AdminEmpty title="No payments" body="No payment transaction has been recorded for this employer." />
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
                      {pay.paymentId || "-"}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <StatusBadge value={pay.status} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-xs text-ink-600">
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
        dues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white">
            <AdminEmpty
              icon={Clock}
              title="No monthly dues"
              body="No placement on a monthly plan has a month left to pay."
            />
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
            {dues.map((d) => (
              <li key={d.proposalId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <span>
                  <span className="font-semibold text-ink-900">{d.internName}</span>
                  <span className="text-text-subtle"> · {d.role}</span>
                </span>
                <span className="text-xs text-text-subtle">
                  Month {d.monthsPaid + 1} of {d.months} due
                  {d.nextMinor != null ? ` · ${formatCurrency(d.nextMinor, d.currency === "USD" ? "USD" : "INR")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )
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
                  <TableCell colSpan={5} className="p-0">
                    <AdminEmpty title="No hired interns" body="No candidate has been hired by this employer yet." />
                  </TableCell>
                </TableRow>
              ) : (
                hiredInterns.map((h) => {
                  const offer = parseOffer(h.proposal.offerDetails, h.proposal.currency);
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
                        {offer.roleTitle || "Internship"}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-ink-600">
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
            const offer = parseOffer(selectedProposal.offerDetails, selectedProposal.currency);
            return (
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex justify-between border-b border-ink-100 pb-2">
                  <span className="text-text-subtle">Role Title:</span>
                  <span className="font-semibold text-ink-900">{offer.roleTitle || "Internship"}</span>
                </div>
                <div className="flex justify-between border-b border-ink-100 pb-2">
                  <span className="text-text-subtle">Stipend:</span>
                  <span className="font-semibold text-brand-800">
                    {offer.monthlyMinor != null ? `${formatCurrency(offer.monthlyMinor, offer.currency)}/mo` : "Not stated"}
                  </span>
                </div>
                <div className="flex justify-between border-b border-ink-100 pb-2">
                  <span className="text-text-subtle">Duration:</span>
                  <span className="font-semibold text-ink-900">{`${offer.months} month${offer.months === 1 ? "" : "s"}`}</span>
                </div>
                <div className="flex justify-between border-b border-ink-100 pb-2">
                  <span className="text-text-subtle">Work Mode:</span>
                  <span className="font-semibold text-ink-900 capitalize">{offer.mode || "Not stated"}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-text-subtle">Scope of Work:</span>
                  <p className="rounded-xl border border-ink-100 bg-ink-50/50 p-2.5 text-2xs text-ink-800 leading-relaxed">
                    {offer.jd || "Not stated."}
                  </p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* Project Quick View Modal */}
      <Dialog
        open={Boolean(selectedProject)}
        onOpenChange={(open) => !open && setSelectedProject(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Project Quick View</DialogTitle>
            <DialogDescription>
              Internship project specifications and parameters.
            </DialogDescription>
          </DialogHeader>

          {selectedProject && (
            <div className="space-y-3 pt-2 text-xs">
              <div className="flex justify-between border-b border-ink-100 pb-2">
                <span className="text-text-subtle">Project Title:</span>
                <span className="font-semibold text-ink-900">{selectedProject.projectName}</span>
              </div>
              <div className="flex justify-between border-b border-ink-100 pb-2">
                <span className="text-text-subtle">Work Mode:</span>
                <span className="font-semibold text-ink-900 capitalize">
                  {selectedProject.locationType || "Remote"}
                </span>
              </div>
              <div className="flex justify-between border-b border-ink-100 pb-2">
                <span className="text-text-subtle">Status:</span>
                <StatusBadge value={selectedProject.status || "active"} />
              </div>
              <div className="flex justify-between border-b border-ink-100 pb-2">
                <span className="text-text-subtle">Full Time Offer:</span>
                <span className="font-semibold text-ink-900">
                  {selectedProject.fullTimeOffer ? "Yes (PPO Available)" : "Internship Only"}
                </span>
              </div>
              <div>
                <span className="text-text-subtle">Required Skills:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(selectedProject.skills ?? []).map((s) => (
                    <span key={s} className="rounded-md bg-ink-100 px-2 py-0.5 text-2xs text-ink-800">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              {selectedProject.scopeOfWork && (
                <div className="space-y-1">
                  <span className="text-text-subtle">Scope of Work:</span>
                  <p className="rounded-xl border border-ink-100 bg-ink-50/50 p-2.5 text-2xs text-ink-800 leading-relaxed">
                    {selectedProject.scopeOfWork}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Interview Session Modal */}
      <Dialog
        open={Boolean(selectedInterview)}
        onOpenChange={(open) => !open && setSelectedInterview(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Interview Session Details</DialogTitle>
            <DialogDescription>
              Evaluation schedule for candidate.
            </DialogDescription>
          </DialogHeader>

          {selectedInterview && (
            <div className="space-y-3 pt-2 text-xs">
              <div className="flex justify-between border-b border-ink-100 pb-2">
                <span className="text-text-subtle">Candidate:</span>
                <span className="font-semibold text-ink-900">
                  {selectedInterview.internName || "Candidate"}
                </span>
              </div>
              <div className="flex justify-between border-b border-ink-100 pb-2">
                <span className="text-text-subtle">Status:</span>
                <StatusBadge value={selectedInterview.status} />
              </div>
              <div className="space-y-1 border-b border-ink-100 pb-2">
                <span className="text-text-subtle">Offered Slots:</span>
                <div className="space-y-0.5 mt-1">
                  {[selectedInterview.slot1, selectedInterview.slot2, selectedInterview.slot3]
                    .filter(Boolean)
                    .map((s, idx) => (
                      <p key={idx} className="text-2xs text-ink-800">
                        • {formatDate(s)}
                      </p>
                    ))}
                </div>
              </div>
              {selectedInterview.meetingLink && (
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-2.5">
                  <span className="text-2xs font-semibold text-brand-800 uppercase">Meeting Link:</span>
                  <a
                    href={selectedInterview.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block font-semibold text-xs text-brand-700 hover:underline break-all"
                  >
                    {selectedInterview.meetingLink}
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
