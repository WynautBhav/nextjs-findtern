import Link from "next/link";
import { ArrowLeft, ExternalLink, Globe, Mail, MapPin, Phone } from "lucide-react";

import { CompanyActiveToggle, CompanyDeleteButton, CompanyFteSelect } from "@/components/admin/company-controls";
import { fteOf } from "@/lib/admin/fte";
import { DataTable } from "@/components/admin/data-table";
import { ProposalStatusEditor } from "@/components/admin/proposal-status-editor";
import { StatusBadge } from "@/components/admin/status-badge";
import { DetailRow, PageHead, Pill, SectionHead, StatTile, Surface } from "@/components/app/primitives";
import { toQueryString } from "@/lib/admin/params";
import type { CompanyLedger, HireLedger } from "@/lib/admin/company-ledger";
import type { Employer, EmployerPayment, Interview, Project, Proposal } from "@/lib/db/schema";
import { formatDate, formatMoney, formatSlotTime } from "@/lib/format";
import { parseOffer } from "@/lib/offer";
import { cn } from "@/lib/utils";

/**
 * Company 360 (legacy admin-company-detail.tsx): a profile first (ADP-04),
 * then one tab per record type. Tabs are links (`?tab=`), so a tab can be
 * shared and the back button works; every list is the shared DataTable.
 */

export type Company360Tab = "profile" | "projects" | "proposals" | "interviews" | "payments" | "dues" | "hired";

type InternLite = { id: string; firstName: string | null; lastName: string | null; email: string | null };

const money = (minor: number | null | undefined, currency: string | null | undefined) =>
  minor == null ? "-" : formatMoney(minor, String(currency).toUpperCase() === "USD" ? "USD" : "INR");

const ACTIVE_PROJECT = (status: string | null) =>
  !["inactive", "closed", "archived"].includes(String(status || "active").toLowerCase());

function slotOf(i: Interview): Date | null {
  const s = i.selectedSlot === 1 ? i.slot1 : i.selectedSlot === 2 ? i.slot2 : i.selectedSlot === 3 ? i.slot3 : null;
  return s ?? null;
}

export function Company360View({
  tab,
  params,
  company,
  projects,
  proposals,
  interviews,
  payments,
  interns,
  ledger,
  actions,
}: {
  tab: Company360Tab;
  params: Record<string, string>;
  company: Omit<Employer, "password">;
  projects: Project[];
  proposals: Proposal[];
  interviews: Interview[];
  payments: EmployerPayment[];
  interns: InternLite[];
  ledger: CompanyLedger;
  actions?: React.ReactNode;
}) {
  const base = `/admin/companies/${company.id}`;
  const internName = new Map(interns.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Candidate"]));
  const projectName = new Map(projects.map((p) => [p.id, p.projectName]));
  const nameOf = (id: string) => internName.get(id) ?? "Candidate";

  const now = new Date().getTime();
  const upcoming = interviews.filter((i) => i.status === "scheduled" && (slotOf(i)?.getTime() ?? 0) > now).length;
  const hired = proposals.filter((p) => p.status === "hired");
  const activeProjects = projects.filter((p) => ACTIVE_PROJECT(p.status)).length;
  const dues = ledger.hires.filter((h) => h.dueMinor > 0 || h.plan === "monthly");
  const fte = fteOf(company.internationalFteStatus);

  const tabs: { key: Company360Tab; label: string; count?: number }[] = [
    { key: "profile", label: "Profile" },
    { key: "projects", label: "Projects", count: projects.length },
    { key: "proposals", label: "Proposals", count: proposals.length },
    { key: "interviews", label: "Interviews", count: interviews.length },
    { key: "payments", label: "Payments", count: payments.length },
    { key: "dues", label: "Dues per hire", count: dues.length },
    { key: "hired", label: "Hired", count: hired.length },
  ];

  const location = [company.city, company.state].filter(Boolean).join(", ");

  return (
    <div className="min-w-0 space-y-8">
      <div>
        <Link
          href="/admin/companies"
          className="mb-4 inline-flex items-center gap-1.5 rounded-apple-sm text-sm font-medium text-ink-600 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All companies
        </Link>
        <PageHead
          className="mb-0"
          eyebrow="Company 360"
          title={company.companyName}
          lede={
            <span className="flex flex-col gap-3">
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge value={company.isActive ? "active" : "inactive"} />
                <Pill tone={company.onboardingCompleted ? "live" : "waiting"}>
                  {company.onboardingCompleted ? "Onboarding complete" : "Onboarding pending"}
                </Pill>
                {fte !== "none" ? <Pill tone={fte === "approved" ? "paid" : "waiting"}>International FTE {fte}</Pill> : null}
              </span>
              <span className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Mail className="size-4 shrink-0 text-ink-400" aria-hidden />
                  <span className="truncate">{company.companyEmail}</span>
                </span>
                <span className="nums inline-flex items-center gap-1.5">
                  <Phone className="size-4 shrink-0 text-ink-400" aria-hidden />
                  {company.countryCode} {company.phoneNumber}
                </span>
                {location || company.country ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4 shrink-0 text-ink-400" aria-hidden />
                    {[location, company.country].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </span>
            </span>
          }
          action={actions}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Projects" value={projects.length} hint={`${activeProjects} active`} href={`${base}?tab=projects`} />
        <StatTile label="Proposals sent" value={proposals.length} hint={`${hired.length} hired`} href={`${base}?tab=proposals`} />
        <StatTile
          label="Interviews"
          value={interviews.length}
          hint={upcoming ? `${upcoming} upcoming` : "None upcoming"}
          href={`${base}?tab=interviews`}
        />
        <StatTile
          label="Paid to date"
          value={formatMoney(ledger.totals.paidInrMinor, "INR", { zeroLabel: "₹0" })}
          hint={
            ledger.totals.remainingInrMinor > 0
              ? `${formatMoney(ledger.totals.remainingInrMinor, "INR")} still due of ${formatMoney(ledger.totals.billedInrMinor, "INR")}`
              : "Nothing due"
          }
          href={`${base}?tab=dues`}
        />
      </div>

      <nav aria-label="Company records" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex min-w-max gap-1 border-b border-ink-200/80">
          {tabs.map((t) => {
            const active = t.key === tab;
            return (
              <li key={t.key}>
                <Link
                  href={`${base}${toQueryString({ tab: t.key === "profile" ? "" : t.key })}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-600",
                    active ? "border-brand-700 text-ink-900" : "border-transparent text-ink-600 hover:text-ink-900",
                  )}
                >
                  {t.label}
                  {t.count !== undefined ? (
                    <span className={cn("nums rounded-full px-2 py-0.5 text-xs", active ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-600")}>
                      {t.count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "profile" ? <ProfileTab company={company} fte={fte} /> : null}

      {tab === "projects" ? (
        <DataTable
          basePath={base}
          params={params}
          page={1}
          pages={1}
          total={projects.length}
          perPage={Math.max(projects.length, 1)}
          rows={projects}
          noun="projects"
          caption="Projects posted by this company"
          empty={{ title: "No projects yet", body: "This company hasn't posted a project. Projects appear here once they create one." }}
          columns={[
            {
              header: "Project",
              cell: (p) => (
                <div className="min-w-0 max-w-72">
                  <p className="truncate font-medium text-ink-900" title={p.projectName}>
                    {p.projectName}
                  </p>
                  {p.scopeOfWork ? (
                    <p className="truncate text-xs text-ink-600" title={p.scopeOfWork}>
                      {p.scopeOfWork}
                    </p>
                  ) : null}
                </div>
              ),
            },
            { header: "Work mode", cell: (p) => <span className="capitalize">{p.locationType || "Remote"}</span> },
            {
              header: "Location",
              cell: (p) => [p.city, p.state].filter(Boolean).join(", ") || (p.preferredLocations ?? []).slice(0, 2).join(", ") || "-",
            },
            { header: "Timezone", cell: (p) => p.timezone || "-" },
            {
              header: "Skills",
              cell: (p) => {
                const skills = p.skills ?? [];
                return skills.length ? (
                  <span className="block max-w-56 truncate" title={skills.join(", ")}>
                    {skills.join(", ")}
                  </span>
                ) : (
                  "-"
                );
              },
            },
            { header: "Full-time", cell: (p) => (p.fullTimeOffer ? "Yes" : "No") },
            { header: "Status", cell: (p) => <StatusBadge value={ACTIVE_PROJECT(p.status) ? "active" : p.status || "closed"} /> },
            { header: "Posted", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(p.createdAt)}</span> },
          ]}
        />
      ) : null}

      {tab === "proposals" ? (
        <DataTable
          basePath={base}
          params={params}
          page={1}
          pages={1}
          total={proposals.length}
          perPage={Math.max(proposals.length, 1)}
          rows={proposals}
          noun="proposals"
          caption="Proposals sent by this company"
          empty={{ title: "No proposals yet", body: "This company hasn't sent an offer. Offers appear here as soon as one is sent." }}
          columns={[
            {
              header: "Candidate",
              cell: (p) => (
                <Link href={`/admin/interns/${p.internId}`} className="font-medium text-brand-700 hover:underline">
                  {nameOf(p.internId)}
                </Link>
              ),
            },
            {
              header: "Role",
              cell: (p) => {
                const o = parseOffer(p.offerDetails, p.currency);
                return (
                  <div className="min-w-0 max-w-60">
                    <p className="truncate text-ink-900">{o.roleTitle || "Internship"}</p>
                    <p className="truncate text-xs text-ink-600">{projectName.get(p.projectId) ?? "Project"}</p>
                  </div>
                );
              },
            },
            {
              header: "Type",
              cell: (p) => {
                const o = parseOffer(p.offerDetails, p.currency);
                return o.fullTime ? "Full-time" : `Internship · ${o.months} mo`;
              },
            },
            {
              header: "Amount",
              align: "right",
              cell: (p) => {
                const o = parseOffer(p.offerDetails, p.currency);
                return o.fullTime ? (
                  <span className="whitespace-nowrap">{money(o.fullTime.annualCtcMinor, o.currency)} CTC</span>
                ) : o.monthlyMinor != null ? (
                  <span className="whitespace-nowrap">{money(o.monthlyMinor, o.currency)}/mo</span>
                ) : (
                  "-"
                );
              },
            },
            { header: "Start", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(parseOffer(p.offerDetails, p.currency).startDate)}</span> },
            { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
            { header: "Sent", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(p.createdAt)}</span> },
            { header: "Change", cell: (p) => <ProposalStatusEditor proposalId={p.id} status={p.status} /> },
          ]}
        />
      ) : null}

      {tab === "interviews" ? (
        <DataTable
          basePath={base}
          params={params}
          page={1}
          pages={1}
          total={interviews.length}
          perPage={Math.max(interviews.length, 1)}
          rows={interviews}
          noun="interviews"
          caption="Interviews with this company"
          empty={{ title: "No interviews", body: "This company hasn't asked any candidate for an interview yet." }}
          columns={[
            {
              header: "Candidate",
              cell: (i) => (
                <Link href={`/admin/interns/${i.internId}`} className="font-medium text-brand-700 hover:underline">
                  {nameOf(i.internId)}
                </Link>
              ),
            },
            { header: "Project", cell: (i) => (i.projectId ? projectName.get(i.projectId) ?? "-" : "-") },
            {
              header: "Slots",
              cell: (i) => {
                const chosen = slotOf(i);
                if (chosen) return <span className="nums whitespace-nowrap font-medium text-ink-900">{formatSlotTime(chosen, i.timezone)}</span>;
                const offered = [i.slot1, i.slot2, i.slot3].filter((s): s is Date => Boolean(s));
                return offered.length ? (
                  <ul className="nums space-y-0.5 whitespace-nowrap text-ink-700">
                    {offered.map((s, n) => (
                      <li key={n}>{formatSlotTime(s, i.timezone)}</li>
                    ))}
                  </ul>
                ) : (
                  "No slot offered"
                );
              },
            },
            { header: "Timezone", cell: (i) => i.timezone || "Asia/Kolkata" },
            {
              header: "Meeting",
              cell: (i) =>
                i.meetingLink ? (
                  <a href={i.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                    Open link <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span className="text-ink-500">No link</span>
                ),
            },
            { header: "Status", cell: (i) => <StatusBadge value={i.status} /> },
            { header: "Created", cell: (i) => <span className="nums whitespace-nowrap">{formatDate(i.createdAt)}</span> },
          ]}
        />
      ) : null}

      {tab === "payments" ? (
        <DataTable
          basePath={base}
          params={params}
          page={1}
          pages={1}
          total={payments.length}
          perPage={Math.max(payments.length, 1)}
          rows={payments}
          noun="payments"
          caption="Payments by this company"
          empty={{ title: "No payments", body: "No order has been opened by this company. Paid and unfinished checkouts both appear here." }}
          columns={[
            { header: "Order", cell: (p) => <span className="font-mono text-xs text-ink-800">{p.orderId || p.id.slice(0, 10)}</span> },
            {
              header: "Candidates",
              cell: (p) => {
                const ids = ledger.payments.get(p.id)?.proposalIds ?? [];
                const names = ids.map((id) => proposals.find((x) => x.id === id)).filter(Boolean).map((x) => nameOf(x!.internId));
                return names.length ? <span className="block max-w-52 truncate" title={names.join(", ")}>{names.join(", ")}</span> : "-";
              },
            },
            {
              header: "Project",
              cell: (p) => {
                const ids = ledger.payments.get(p.id)?.proposalIds ?? [];
                const names = [...new Set(ids.map((id) => proposals.find((x) => x.id === id)?.projectId).filter(Boolean).map((pid) => projectName.get(pid!) ?? "Project"))];
                return names.length ? <span className="block max-w-52 truncate" title={names.join(", ")}>{names.join(", ")}</span> : "-";
              },
            },
            {
              header: "Type",
              cell: (p) => {
                const info = ledger.payments.get(p.id);
                return info?.type ? `${info.type} · ${info.mode}` : info?.mode ?? "-";
              },
            },
            { header: "Amount", align: "right", cell: (p) => <span className="font-semibold text-ink-900">{money(p.amountMinor, p.currency)}</span> },
            { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
            { header: "Paid", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(p.paidAt)}</span> },
            { header: "Created", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(p.createdAt)}</span> },
          ]}
        />
      ) : null}

      {tab === "dues" ? <DuesTab base={base} params={params} hires={ledger.hires} ledger={ledger} nameOf={nameOf} projectName={projectName} /> : null}

      {tab === "hired" ? (
        <DataTable
          basePath={base}
          params={params}
          page={1}
          pages={1}
          total={hired.length}
          perPage={Math.max(hired.length, 1)}
          rows={hired}
          noun="hires"
          caption="Candidates hired by this company"
          empty={{ title: "No hires yet", body: "A candidate shows here once the company has paid for an accepted offer." }}
          columns={[
            {
              header: "Candidate",
              cell: (p) => (
                <Link href={`/admin/interns/${p.internId}`} className="font-medium text-brand-700 hover:underline">
                  {nameOf(p.internId)}
                </Link>
              ),
            },
            { header: "Project", cell: (p) => projectName.get(p.projectId) ?? "-" },
            { header: "Role", cell: (p) => parseOffer(p.offerDetails, p.currency).roleTitle || "Internship" },
            { header: "Type", cell: (p) => (parseOffer(p.offerDetails, p.currency).fullTime ? "Full-time" : "Internship") },
            { header: "Start", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(parseOffer(p.offerDetails, p.currency).startDate)}</span> },
            { header: "Hired on", cell: (p) => <span className="nums whitespace-nowrap">{formatDate(p.hiredAt ?? p.updatedAt)}</span> },
          ]}
        />
      ) : null}
    </div>
  );
}

function ProfileTab({ company, fte }: { company: Omit<Employer, "password">; fte: "none" | "applied" | "approved" }) {
  const website = company.websiteUrl ? (/^https?:\/\//i.test(company.websiteUrl) ? company.websiteUrl : `https://${company.websiteUrl}`) : null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Surface className="p-6 lg:row-span-2">
        <SectionHead title="Company information" />
        <dl className="divide-y divide-ink-100">
          <DetailRow label="Company name" value={company.companyName} />
          <DetailRow label="Account holder" value={company.name || "-"} />
          <DetailRow label="Email" value={<span className="break-all">{company.companyEmail}</span>} />
          <DetailRow
            label="Website"
            value={
              website ? (
                <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-brand-700 hover:underline">
                  <Globe className="size-3.5 shrink-0" aria-hidden />
                  {company.websiteUrl}
                </a>
              ) : (
                "-"
              )
            }
          />
          <DetailRow label="Company size" value={company.companySize || "-"} />
          <DetailRow label="City / state" value={[company.city, company.state].filter(Boolean).join(", ") || "-"} />
          <DetailRow label="Country" value={company.country || "-"} />
          <DetailRow label="Billing PIN" value={company.billingPincode || "-"} mono />
          <DetailRow label="GSTIN" value={company.gstNumber ? <span className="font-mono">{company.gstNumber}</span> : "-"} />
          <DetailRow label="Member since" value={formatDate(company.createdAt)} />
        </dl>
      </Surface>

      <Surface className="p-6">
        <SectionHead title="Primary contact" hint="First point of contact" />
        <dl className="divide-y divide-ink-100">
          <DetailRow label="Name" value={company.primaryContactName || company.name || "-"} />
          <DetailRow label="Role" value={company.primaryContactRole || "-"} />
          <DetailRow label="Phone" value={`${company.countryCode} ${company.phoneNumber}`} mono />
          <DetailRow label="Email" value={<span className="break-all">{company.companyEmail}</span>} />
        </dl>
        <div className="mt-6">
          <SectionHead title="Escalation contact" hint="Second point of contact" />
          <dl className="divide-y divide-ink-100">
            <DetailRow label="Name" value={company.escalationContactName || "-"} />
            <DetailRow label="Role" value={company.escalationContactRole || "-"} />
            <DetailRow
              label="Phone"
              value={[company.escalationContactCountryCode, company.escalationContactPhone].filter(Boolean).join(" ") || "-"}
              mono
            />
            <DetailRow label="Email" value={company.escalationContactEmail ? <span className="break-all">{company.escalationContactEmail}</span> : "-"} />
          </dl>
        </div>
      </Surface>

      <Surface className="p-6">
        <SectionHead title="Account and access" hint="Changes save as soon as you make them." />
        <dl className="divide-y divide-ink-100">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <dt className="text-sm text-ink-600">Sign-in</dt>
            <dd>
              <CompanyActiveToggle id={company.id} isActive={company.isActive} refresh />
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <dt className="text-sm text-ink-600">
              International FTE
              <span className="block text-xs text-ink-500">
                {fte === "applied" ? "Requested; approve, or set back to Not approved to decline." : "Lets the company send full-time offers in USD."}
              </span>
            </dt>
            <dd>
              <CompanyFteSelect id={company.id} value={company.internationalFteStatus} refresh />
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <dt className="text-sm text-ink-600">
              Delete company
              <span className="block text-xs text-ink-500">Only possible before any proposal, interview or payment.</span>
            </dt>
            <dd>
              <CompanyDeleteButton id={company.id} />
            </dd>
          </div>
        </dl>
      </Surface>
    </div>
  );
}

function DuesTab({
  base,
  params,
  hires,
  ledger,
  nameOf,
  projectName,
}: {
  base: string;
  params: Record<string, string>;
  hires: HireLedger[];
  ledger: CompanyLedger;
  nameOf: (id: string) => string;
  projectName: Map<string, string>;
}) {
  const { totals } = ledger;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Billed" value={formatMoney(totals.billedInrMinor, "INR", { zeroLabel: "₹0" })} hint="Paid plus still due, in INR" />
        <StatTile label="Paid" value={formatMoney(totals.paidInrMinor, "INR", { zeroLabel: "₹0" })} hint="Every paid order" />
        <StatTile label="Remaining" value={formatMoney(totals.remainingInrMinor, "INR", { zeroLabel: "₹0" })} hint="Unpaid offers and monthly instalments left" />
      </div>
      <DataTable
        basePath={base}
        params={params}
        page={1}
        pages={1}
        total={hires.length}
        perPage={Math.max(hires.length, 1)}
        rows={hires}
        noun="hires"
        caption="What each hire has cost and still owes"
        empty={{ title: "Nothing billed yet", body: "Accepted and hired offers appear here with what was paid and what is still due." }}
        columns={[
          {
            header: "Candidate",
            cell: (h) => (
              <div className="min-w-0">
                <Link href={`/admin/interns/${h.internId}`} className="font-medium text-brand-700 hover:underline">
                  {nameOf(h.internId)}
                </Link>
                <p className="truncate text-xs text-ink-600">{h.projectId ? projectName.get(h.projectId) ?? "Project" : "Project"}</p>
              </div>
            ),
          },
          {
            header: "Plan",
            cell: (h) => (
              <span className="whitespace-nowrap">
                {h.fullTime ? "Full-time" : h.plan === "monthly" ? "Monthly" : h.plan === "upfront" ? "Paid upfront" : "Not paid yet"}
              </span>
            ),
          },
          {
            header: "Monthly / CTC",
            align: "right",
            cell: (h) => (h.fullTime ? `${money(h.ctcMinor, h.currency)} CTC` : h.monthlyMinor != null ? `${money(h.monthlyMinor, h.currency)}/mo` : "-"),
          },
          { header: "Total", align: "right", cell: (h) => money(h.totalMinor, h.currency) },
          { header: "Paid", align: "right", cell: (h) => money(h.paidMinor, h.currency) },
          {
            header: "Due",
            align: "right",
            cell: (h) => (h.dueMinor > 0 ? <span className="font-semibold text-ink-900">{money(h.dueMinor, h.currency)}</span> : <span className="text-ink-500">Nothing</span>),
          },
          {
            header: "Months",
            align: "right",
            cell: (h) => (h.fullTime ? "-" : `${h.monthsPaid} of ${h.months}${h.monthsLeft ? ` · ${h.monthsLeft} left` : ""}`),
          },
          { header: "Next due", cell: (h) => <span className="nums whitespace-nowrap">{h.dueMinor > 0 ? formatDate(h.nextDueDate) : "-"}</span> },
          { header: "Status", cell: (h) => <StatusBadge value={h.status} /> },
        ]}
      />
    </div>
  );
}
