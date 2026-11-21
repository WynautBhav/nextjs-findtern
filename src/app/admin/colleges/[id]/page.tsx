import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { CollegeDetailsForm, CollegeLogins, CollegeSwitches } from "@/components/admin/college-partners-manager";
import { CopyText } from "@/components/college/copy-text";
import { ApprovalsBoard } from "@/components/college/approvals-board";
import { approvalsFor } from "@/lib/college/approvals";
import { getSetting } from "@/lib/platform-settings";
import { CollegeLeavePanel } from "@/components/admin/college-leave-panel";
import { CollegeSeatBatches } from "@/components/admin/college-seat-batches";
import { CollegeWalletPanel } from "@/components/admin/college-wallet-panel";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { InfoList, InfoRow, RecordLayout } from "@/components/admin/record-layout";
import { StatusBadge } from "@/components/admin/status-badge";
import { flattenParams, toQueryString } from "@/lib/admin/params";
import { allows, canWrite } from "@/lib/admin/permissions";
import { maskTail } from "@/lib/admin/identity-mask";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { leaveRequestsForCollege } from "@/lib/college/leave-request-read";
import { seatInvoiceInput } from "@/lib/college/seat-invoice";
import { formatMoney } from "@/lib/format";
import { taxInvoiceHtml } from "@/lib/invoice";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { listOrders, listPendingReviews } from "@/lib/drives/admin-db";
import { walletLedger, walletSummary } from "@/lib/college/wallet-read";

import { DriveOrdersPanel } from "./drive-orders-panel";
import { CampaignPanel } from "./campaign-panel";
import { IdentityReviewQueue } from "./identity-review-queue";

export const dynamic = "force-dynamic";

// "seats" is gone: a college is charged through orders only (the Orders tab). Old links to ?tab=seats land there.
const TABS = ["drives", "students", "wallet", "logins", "details"] as const;
type Tab = (typeof TABS)[number];

export default async function AdminCollegePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = flattenParams(await searchParams);
  const tab: Tab = (TABS as readonly string[]).includes(query.tab ?? "") ? (query.tab as Tab) : "drives";
  const perms = (await getSession())?.permissions;
  const canEdit = canWrite(perms, "/admin/colleges");
  const canMoney = allows(perms, ["transactions:write"]);
  const canDrives = canWrite(perms, "/api/admin/drive-orders");
  const db = getDb();
  const [college] = await db.select().from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!college) notFound();
  const [approvals, defaultFeeMinor, [{ rosterCount }], orders, reviews, batches, [promo], summary, ledger, officers, [{ members }], leaveRows] = await Promise.all([
    approvalsFor(id, college.emailDomains),
    getSetting("college_fee_per_student_minor").then(Number),
    db.select({ rosterCount: sql<number>`count(*)::int` }).from(schema.collegeRoster).where(eq(schema.collegeRoster.collegeId, id)),
    listOrders(id),
    listPendingReviews(id),
    db.select().from(schema.collegeSeatBatches).where(eq(schema.collegeSeatBatches.collegeId, id)).orderBy(desc(schema.collegeSeatBatches.createdAt)),
    db.select({ code: schema.promoCodes.code, maxUsages: schema.promoCodes.maxUsages, usedCount: schema.promoCodes.usedCount }).from(schema.promoCodes).where(eq(schema.promoCodes.collegeId, id)).limit(1),
    walletSummary(id),
    walletLedger(id),
    db
      .select({ id: schema.collegeAdmins.id, name: schema.collegeAdmins.name, email: schema.collegeAdmins.email, lastLoginAt: schema.collegeAdmins.lastLoginAt })
      .from(schema.collegeAdmins)
      .where(and(eq(schema.collegeAdmins.collegeId, id), eq(schema.collegeAdmins.isActive, true)))
      .orderBy(asc(schema.collegeAdmins.name)),
    db.select({ members: sql<number>`count(*)::int` }).from(schema.collegeMemberships).where(and(eq(schema.collegeMemberships.collegeId, id), sql`${schema.collegeMemberships.leftAt} IS NULL`)),
    leaveRequestsForCollege(id),
  ]);
  const pendingLeaves = leaveRows.filter((r) => r.status === "requested").map((r) => ({ id: r.id, name: r.name, email: r.email, reason: r.reason, requestedAt: r.requestedAt }));
  const last4 = maskTail(college.bankAccountNumber).slice(-4);
  const bank = college.bankAccountNumber && college.bankIfsc ? { holder: college.bankAccountName ?? "", bankName: college.bankName ?? "", last4, ifsc: college.bankIfsc } : null;
  const seller = getInvoiceSeller();
  const rows = batches.map((b) => ({
    invoiceHtml: b.status === "paid" ? taxInvoiceHtml(seatInvoiceInput(b, college, seller)) : null,
    id: b.id, seats: b.seats, amountMinor: b.amountMinor, status: b.status, method: b.method, referenceId: b.referenceId, invoiceNumber: b.invoiceNumber, paidAt: b.paidAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(),
  }));
  const hasPaid = batches.some((b) => b.status === "paid");
  // Seat batches bought the old way. A batch that backs an order is that order's invoice record and shows with the order, not here.
  const legacyIds = new Set(batches.filter((b) => !b.driveOrderId).map((b) => b.id));
  const legacyRows = rows.filter((r) => legacyIds.has(r.id));
  const loginRows = officers.map((o) => ({ id: o.id, name: o.name, email: o.email, lastLoginAt: o.lastLoginAt?.toISOString() ?? null }));

  const base = `/admin/colleges/${id}`;
  const tabHref = (t: Tab) => `${base}${toQueryString({ tab: t === "drives" ? "" : t })}`;
  const tabs: AdminTabItem[] = [
    { key: "drives", label: "Orders and codes", count: reviews.length || undefined, href: tabHref("drives") },
    { key: "students", label: "Students", count: approvals.candidates.length + approvals.reviews.length || undefined, href: tabHref("students") },
    { key: "wallet", label: "Wallet", count: summary.openRequest ? 1 : undefined, href: tabHref("wallet") },
    { key: "logins", label: "Logins", count: loginRows.length, href: tabHref("logins") },
    { key: "details", label: "Details", href: tabHref("details") },
  ];
  // Only when something is waiting on staff; each line jumps to the tab where it is handled.
  const waiting: { text: string; href: string; cta: string }[] = [];
  if (summary.openRequest) waiting.push({ text: `Withdrawal of ${formatMoney(summary.openRequest.amountMinor, "INR", { zeroLabel: false })} requested.`, href: tabHref("wallet"), cta: "Open Wallet" });
  if (approvals.reviews.length) waiting.push({ text: `${approvals.reviews.length} ${approvals.reviews.length === 1 ? "student match needs" : "student matches need"} your check before the college can have them.`, href: tabHref("students"), cta: "Open Students" });
  if (reviews.length) waiting.push({ text: `${reviews.length} ${reviews.length === 1 ? "student match needs" : "student matches need"} your review.`, href: tabHref("drives"), cta: "Open Orders and codes" });

  // The Wallet tab shows the withdrawal itself, so a banner pointing at it from there repeats it.
  const waitingElsewhere = waiting.filter((w) => w.href !== tabHref(tab));

  const place = [college.city, college.state].filter(Boolean).join(", ");
  return (
    <RecordLayout
      title={college.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={college.isPartner ? "success" : "neutral"} label={college.isPartner ? "Partner" : "Not a partner"} dot={false} />
          {college.isActive ? null : <StatusBadge tone="neutral" label="Inactive" dot={false} />}
        </span>
      }
      backHref="/admin/colleges"
      backLabel="All colleges"
      left={
        <Panel>
          <PanelBody className="space-y-5">
            <InfoList>
              <InfoRow label="College code">
                {college.code ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono tracking-wider">{college.code}</span>
                    <CopyText text={college.code} label="Copy" />
                    {/^FT[A-Z2-9]{5}$/.test(college.code) ? <StatusBadge tone="neutral" label="Old format: rotate before sharing" dot={false} /> : null}
                  </span>
                ) : (
                  "-"
                )}
              </InfoRow>
              <InfoRow label="AISHE code">{college.aisheCode ?? "-"}</InfoRow>
              <InfoRow label="Place">{place || "-"}</InfoRow>
              <InfoRow label="GSTIN">{college.gstin ?? "-"}</InfoRow>
              <InfoRow label="Student email domains">{college.emailDomains.length ? college.emailDomains.map((d) => `@${d}`).join(", ") : "-"}</InfoRow>
            </InfoList>
            <CollegeSwitches college={{ id, name: college.name, isPartner: college.isPartner, showOnWebsite: college.showOnWebsite, isActive: college.isActive }} canEdit={canEdit} />
            <CollegeLeavePanel collegeId={id} canEdit={canEdit} members={members} pending={pendingLeaves} />
          </PanelBody>
        </Panel>
      }
    >
      {waitingElsewhere.length ? (
        <div role="status" className="space-y-2 rounded-[var(--radius-admin-card)] bg-warning-soft px-5 py-4 text-sm">
          {waitingElsewhere.map((w) => (
            <p key={w.href} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground">
              <span>{w.text}</span>
              <Link href={w.href} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{w.cta}</Link>
            </p>
          ))}
        </div>
      ) : null}

      <AdminTabs items={tabs} active={tab} label="College sections" />

      {tab === "students" ? (
        <Panel>
          <PanelHeader
            title="Students waiting to be added"
            description="Students who already had a Findtern account and match this college's list or email domain. The placement officer accepts or denies these in their console; you can do the same here, and only you can accept the weaker matches listed under Needs your check."
          />
          <PanelBody>
            <ApprovalsBoard candidates={approvals.candidates} removed={approvals.removed} reviews={approvals.reviews} endpoint={`/api/admin/colleges/${id}/students`} readOnly={!canEdit} />
          </PanelBody>
        </Panel>
      ) : null}
      {tab === "drives" ? (
        <>
          <Panel>
            <PanelHeader title="Orders and codes" description="The one way a college pays: create an order for a number of students, record the payment once, then add the students. Each student is emailed a personal code." />
            <PanelBody>
              <DriveOrdersPanel collegeId={id} collegeName={college.name} orders={orders} canMoney={canMoney} canWrite={canDrives} defaultFeeMinor={defaultFeeMinor} rosterCount={rosterCount} />
            </PanelBody>
          </Panel>
          <CampaignPanel orderIds={orders.filter((o) => o.status === "paid").map((o) => o.id)} canWrite={canDrives} />
          <Panel>
            <PanelHeader title="Identity review" description="Roster rows whose phone and name match a student with a different email. Nothing links until you approve it." />
            <PanelBody>
              <IdentityReviewQueue reviews={reviews} canWrite={canWrite(perms, "/api/admin/identity-reviews")} />
            </PanelBody>
          </Panel>
          {legacyRows.length > 0 ? (
            <details className="rounded-[var(--radius-admin-card)] bg-surface">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">
                Earlier seat purchases <span className="font-normal text-text-subtle">({legacyRows.length}, the old shared-code way; no new ones can be added)</span>
              </summary>
              <div className="px-5 pb-5">
                <CollegeSeatBatches collegeId={id} batches={legacyRows} seat={promo ? { code: promo.code, cap: promo.maxUsages, used: promo.usedCount } : null} canMoney={canMoney} allowNew={false} />
              </div>
            </details>
          ) : null}
        </>
      ) : null}

      {tab === "wallet" ? (
        <Panel>
          <PanelHeader title="Wallet" description="Incentives the college has earned, its bank account and any withdrawal waiting to be paid." />
          <PanelBody>
            <CollegeWalletPanel collegeId={id} summary={summary} ledger={ledger} bank={bank} canMoney={canMoney} />
          </PanelBody>
        </Panel>
      ) : null}

      {tab === "logins" ? (
        <Panel>
          <PanelHeader title="Placement officer logins" description="The people at the college who sign in to its console." />
          <PanelBody>
            <CollegeLogins collegeId={id} officers={loginRows} hasPaidBatch={hasPaid} canEdit={canEdit} />
          </PanelBody>
        </Panel>
      ) : null}

      {tab === "details" ? (
        <Panel>
          <PanelHeader title="Details" description="How the college is named and billed." />
          <PanelBody>
            <CollegeDetailsForm college={{ id, name: college.name, city: college.city, state: college.state, gstin: college.gstin, aisheCode: college.aisheCode, isPartner: college.isPartner, logoUrl: college.logoUrl, emailDomains: college.emailDomains }} canEdit={canEdit} />
          </PanelBody>
        </Panel>
      ) : null}
    </RecordLayout>
  );
}
