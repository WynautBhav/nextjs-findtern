import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";

import { ArrowLeft } from "lucide-react";

import { FilterTabs, type FilterTab } from "@/components/app/primitives";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { CollegeDetailsForm, CollegeLogins, CollegeSwitches } from "@/components/admin/college-partners-manager";
import { CopyText } from "@/components/college/copy-text";
import { CollegeSeatBatches } from "@/components/admin/college-seat-batches";
import { CollegeWalletPanel } from "@/components/admin/college-wallet-panel";
import { DetailRow } from "@/components/app/primitives";
import { StatusBadge } from "@/components/admin/status-badge";
import { flattenParams, toQueryString } from "@/lib/admin/params";
import { allows, canWrite } from "@/lib/admin/permissions";
import { maskTail } from "@/lib/admin/identity-mask";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
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

const TABS = ["seats", "drives", "wallet", "logins", "details"] as const;
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
  const tab: Tab = (TABS as readonly string[]).includes(query.tab ?? "") ? (query.tab as Tab) : "seats";
  const perms = (await getSession())?.permissions;
  const canEdit = canWrite(perms, "/admin/colleges");
  const canMoney = allows(perms, ["transactions:write"]);
  const canDrives = canWrite(perms, "/api/admin/drive-orders");
  const db = getDb();
  const [college] = await db.select().from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!college) notFound();
  const [orders, reviews, batches, [promo], summary, ledger, officers] = await Promise.all([
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
  ]);
  const last4 = maskTail(college.bankAccountNumber).slice(-4);
  const bank = college.bankAccountNumber && college.bankIfsc ? { holder: college.bankAccountName ?? "", bankName: college.bankName ?? "", last4, ifsc: college.bankIfsc } : null;
  const seller = getInvoiceSeller();
  const rows = batches.map((b) => ({
    invoiceHtml: b.status === "paid" ? taxInvoiceHtml(seatInvoiceInput(b, college, seller)) : null,
    id: b.id, seats: b.seats, amountMinor: b.amountMinor, status: b.status, method: b.method, referenceId: b.referenceId, invoiceNumber: b.invoiceNumber, paidAt: b.paidAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(),
  }));
  const hasPaid = batches.some((b) => b.status === "paid");
  const loginRows = officers.map((o) => ({ id: o.id, name: o.name, email: o.email, lastLoginAt: o.lastLoginAt?.toISOString() ?? null }));

  const base = `/admin/colleges/${id}`;
  const tabHref = (t: Tab) => `${base}${toQueryString({ tab: t === "seats" ? "" : t })}`;
  const tabs: FilterTab[] = [
    { key: "seats", label: "Seats" },
    { key: "drives", label: "Drives", count: reviews.length || undefined },
    { key: "wallet", label: "Wallet", count: summary.openRequest ? 1 : undefined },
    { key: "logins", label: "Logins", count: loginRows.length },
    { key: "details", label: "Details" },
  ];
  // Only when something is waiting on staff; each line jumps to the tab where it is handled.
  const waiting: { label: string; value: string; note: string; href: string; cta: string }[] = [];
  if (summary.openRequest) waiting.push({ label: "Withdrawal waiting to be paid", value: formatMoney(summary.openRequest.amountMinor, "INR", { zeroLabel: false }), note: "The college asked for its wallet balance. Check the bank account, pay it, then mark it paid.", href: tabHref("wallet"), cta: "Open the wallet" });
  if (reviews.length) waiting.push({ label: reviews.length === 1 ? "Student match to review" : "Student matches to review", value: String(reviews.length), note: "A roster row looks like a student who signed up with a different email. Nothing links until you approve it.", href: tabHref("drives"), cta: "Open drives" });
  const [first, ...others] = waiting;

  const place = [college.city, college.state].filter(Boolean).join(", ");
  const seat = promo ? { cap: promo.maxUsages ?? 0, used: promo.usedCount } : null;
  const nothing = <span className="font-normal text-text-subtle">-</span>;
  return (
    <div className="min-w-0 space-y-6">
      <header className="min-w-0">
        <Link href="/admin/colleges" className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-sm font-medium text-ink-700 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ArrowLeft className="size-4" aria-hidden />
          All colleges
        </Link>
        <h1 className="mt-2 text-balance font-display text-2xl font-semibold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere] sm:text-4xl">{college.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-subtle">
          {place ? <span>{place}</span> : null}
          {college.aisheCode ? <span>AISHE {college.aisheCode}</span> : null}
          {college.code ? (
            <span className="flex items-center gap-2">
              <span>College code</span>
              <span className="font-mono text-foreground">{college.code}</span>
              <CopyText text={college.code} label="Copy" />
            </span>
          ) : null}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge tone={college.isPartner ? "success" : "neutral"} label={college.isPartner ? "Partner" : "Not a partner"} dot={false} className="rounded-md" />
          {college.isActive ? null : <StatusBadge tone="neutral" label="Inactive" dot={false} className="rounded-md" />}
          {college.code && /^FT[A-Z2-9]{5}$/.test(college.code) ? <StatusBadge tone="warning" label="Old code format: rotate before sharing" dot={false} className="rounded-md" /> : null}
        </p>
      </header>

      <Overview
        lead={
          first ? (
            <LeadStat label={first.label} value={first.value} tone="signal" note={first.note} action={first.href === tabHref(tab) ? undefined : { label: first.cta, href: first.href }} />
          ) : (
            <LeadStat
              label="Seats used"
              value={seat ? `${seat.used} of ${seat.cap}` : "None yet"}
              tone={seat ? "brand" : "ink"}
              note={seat ? "Students who signed up with the college's shared code." : hasPaid ? "No seat code was found for this college." : "The shared code is issued once the first seat batch is paid."}
            />
          )
        }
        rest={
          <StatList
            items={[
              ...others.map((w) => ({ label: w.label, value: w.value })),
              ...(first && seat ? [{ label: "Seats used", value: `${seat.used} of ${seat.cap}` }] : []),
              { label: "Wallet balance", value: formatMoney(summary.balanceMinor, "INR", { zeroLabel: "₹0" }) },
              { label: "Placement officers", value: loginRows.length || "None yet" },
            ]}
          />
        }
      />

      <FilterTabs label="College sections" tabs={tabs} value={tab} hrefFor={(k) => tabHref(k as Tab)} />

      {tab === "seats" ? (
        <Section title="Seats" hint={hasPaid ? "One shared code for the whole college. Each paid batch adds seats to it." : "One shared code for the whole college. It is issued, with the placement officer login, once the first batch is paid."}>
          <CollegeSeatBatches collegeId={id} batches={rows} seat={promo ? { code: promo.code, cap: promo.maxUsages, used: promo.usedCount } : null} canMoney={canMoney} />
        </Section>
      ) : null}

      {tab === "drives" ? (
        <div className="space-y-10">
          <Section title="Drive orders" hint="One personal code per student. Create an order, record its payment, upload the roster, then confirm to issue the codes.">
            <DriveOrdersPanel collegeId={id} collegeName={college.name} orders={orders} canMoney={canMoney} canWrite={canDrives} />
          </Section>
          <CampaignPanel orderIds={orders.filter((o) => o.status === "paid").map((o) => o.id)} canWrite={canDrives} />
          <Section title="Identity review" hint="Roster rows whose phone and name match a student with a different email. Nothing links until you approve it.">
            <IdentityReviewQueue reviews={reviews} canWrite={canWrite(perms, "/api/admin/identity-reviews")} />
          </Section>
        </div>
      ) : null}

      {tab === "wallet" ? (
        <Section title="Wallet" hint="Incentives the college has earned, its bank account and any withdrawal waiting to be paid.">
          <CollegeWalletPanel collegeId={id} summary={summary} ledger={ledger} bank={bank} canMoney={canMoney} />
        </Section>
      ) : null}

      {tab === "logins" ? (
        <Section title="Placement officer logins" hint="The people at the college who sign in to its console.">
          <CollegeLogins collegeId={id} officers={loginRows} hasPaidBatch={hasPaid} canEdit={canEdit} />
        </Section>
      ) : null}

      {tab === "details" ? (
        <div className="grid items-start gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <Section title="Details" hint="How the college is named and billed.">
            <CollegeDetailsForm college={{ id, name: college.name, city: college.city, state: college.state, gstin: college.gstin, aisheCode: college.aisheCode, isPartner: college.isPartner }} canEdit={canEdit} />
          </Section>
          <div className="min-w-0 space-y-10">
            <Section title="Record">
              <dl className="divide-y divide-ink-200">
                <DetailRow label="GSTIN" value={college.gstin ?? nothing} mono />
                <DetailRow label="Student email domains" value={college.emailDomains.length ? college.emailDomains.map((d) => `@${d}`).join(", ") : nothing} />
              </dl>
            </Section>
            <Section title="Switches" hint="Each one saves as soon as you change it.">
              <CollegeSwitches college={{ id, name: college.name, isPartner: college.isPartner, showOnWebsite: college.showOnWebsite, isActive: college.isActive }} canEdit={canEdit} />
            </Section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
