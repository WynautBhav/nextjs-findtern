import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";

import { CollegeSeatBatches } from "@/components/admin/college-seat-batches";
import { CollegeWalletPanel } from "@/components/admin/college-wallet-panel";
import { CollegeReviewQueue } from "@/components/admin/college-review-queue";
import { CollegeRosterImports } from "@/components/admin/college-roster-imports";
import { BillingForm, ContactsForm } from "@/components/admin/college-partners-manager";
import { StatusBadge } from "@/components/admin/status-badge";
import { AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { allows, canWrite } from "@/lib/admin/permissions";
import { maskTail } from "@/lib/admin/identity-mask";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { seatInvoiceInput } from "@/lib/college/seat-invoice";
import { taxInvoiceHtml } from "@/lib/invoice";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { reviewQueue } from "@/lib/college/roster-import";
import { collegeParticipation } from "@/lib/college/scope";
import { walletLedger, walletSummary } from "@/lib/college/wallet-read";

const ROSTER_SHOWN = 100;
const MATCH: Record<string, { tone: "success" | "warning" | "neutral"; label: string }> = {
  email: { tone: "success", label: "Linked by email" },
  linked: { tone: "success", label: "Linked by admin" },
  review: { tone: "warning", label: "Needs review" },
  rejected: { tone: "neutral", label: "Match rejected" },
  unmatched: { tone: "neutral", label: "No account yet" },
};

export const dynamic = "force-dynamic";

export default async function AdminCollegePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perms = (await getSession())?.permissions;
  const db = getDb();
  const [college] = await db.select().from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!college) notFound();
  const R = schema.collegeRoster;
  const [batches, [promo], summary, ledger, part, review, rosterRows] = await Promise.all([
    db.select().from(schema.collegeSeatBatches).where(eq(schema.collegeSeatBatches.collegeId, id)).orderBy(desc(schema.collegeSeatBatches.createdAt)),
    db.select({ code: schema.promoCodes.code, maxUsages: schema.promoCodes.maxUsages, usedCount: schema.promoCodes.usedCount }).from(schema.promoCodes).where(eq(schema.promoCodes.collegeId, id)).limit(1),
    walletSummary(id),
    walletLedger(id),
    collegeParticipation(id),
    reviewQueue({ collegeId: id, limit: 50 }),
    db
      .select({ id: R.id, name: R.name, email: R.email, phone: R.phone, rollNo: R.rollNo, matchStatus: R.matchStatus, linkedEmail: sql<string | null>`(SELECT u.email FROM ${schema.users} u WHERE u.id = ${R.matchedUserId})` })
      .from(R)
      .where(eq(R.collegeId, id))
      .orderBy(R.name, R.email)
      .limit(ROSTER_SHOWN),
  ]);
  const canEdit = canWrite(perms, "/admin/colleges");
  const figures: [string, string | number][] = [
    ["On roster", part.roster],
    ["Matched to an account", part.matched],
    ["Verified students", part.verified],
    ["Code uses", part.codeUses],
    ["AI interviews done", part.interviewsDone],
    ["Refunds", part.refunds.total ? `${part.refunds.refunded} of ${part.refunds.total}` : 0],
  ];
  const last4 = maskTail(college.bankAccountNumber).slice(-4);
  const bank = college.bankAccountNumber && college.bankIfsc ? { holder: college.bankAccountName ?? "", bankName: college.bankName ?? "", last4, ifsc: college.bankIfsc } : null;
  const seller = getInvoiceSeller();
  const rows = batches.map((b) => ({
    invoiceHtml: b.status === "paid" ? taxInvoiceHtml(seatInvoiceInput(b, college, seller)) : null,
    id: b.id, seats: b.seats, amountMinor: b.amountMinor, status: b.status, method: b.method, referenceId: b.referenceId, invoiceNumber: b.invoiceNumber, paidAt: b.paidAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(),
  }));
  const hasPaid = batches.some((b) => b.status === "paid");

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={college.name}
        subtitle={[college.code ? `College code ${college.code}` : null, college.isPartner ? "Partner" : "Not a partner", college.isActive ? "Active" : "Inactive"].filter(Boolean).join(" · ")}
        action={<Link href="/admin/colleges" className="text-sm font-medium underline underline-offset-4">All colleges</Link>}
      />
      <Panel>
        <PanelHeader
          title="Participation"
          description={part.review > 0 ? `${part.review} roster ${part.review === 1 ? "row needs" : "rows need"} a decision below.` : "How far this college's students have got."}
        />
        <PanelBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
            {figures.map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-text-subtle">{label}</dt>
                <dd className="nums mt-0.5 text-xl font-semibold text-foreground">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</dd>
              </div>
            ))}
          </dl>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Contact details" description="Who at the college Findtern speaks to." />
        <PanelBody>
          <ContactsForm collegeId={id} contact={{ name: college.contactName, email: college.contactEmail, phone: college.contactPhone, address: college.address }} canEdit={canEdit} />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Billing details" description="State and GSTIN print on the seat invoice and decide CGST + SGST or IGST." />
        <PanelBody>
          <BillingForm collegeId={id} state={college.state} gstin={college.gstin} canEdit={canEdit} />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Seats" description={hasPaid ? undefined : "Awaiting first payment. The placement officer login and seat code are issued once the first batch is paid."} />
        <PanelBody>
          <CollegeSeatBatches collegeId={id} batches={rows} seat={promo ? { code: promo.code, cap: promo.maxUsages, used: promo.usedCount } : null} canMoney={allows(perms, ["transactions:write"])} />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Wallet" />
        <PanelBody>
          <CollegeWalletPanel collegeId={id} summary={summary} ledger={ledger} bank={bank} canMoney={allows(perms, ["transactions:write"])} />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Roster import" description="Upload the college's student list, check the preview, then confirm." />
        <PanelBody>
          <CollegeRosterImports collegeId={id} canEdit={canEdit} />
        </PanelBody>
      </Panel>
      {review.total > 0 ? (
        <Panel>
          <PanelHeader title={`Needs review (${review.total})`} description="Matched on phone or name only. Link the right account or reject." />
          <CollegeReviewQueue items={review.items} showCollege={false} canEdit={canEdit} />
        </Panel>
      ) : null}
      <Panel>
        <PanelHeader title={`Roster (${part.roster.toLocaleString("en-IN")})`} description={part.roster > ROSTER_SHOWN ? `Showing the first ${ROSTER_SHOWN}, A to Z.` : undefined} />
        {rosterRows.length === 0 ? (
          <PanelBody>
            <p className="text-sm text-text-subtle">No roster yet.</p>
          </PanelBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">College roster</caption>
              <thead className="border-b border-ink-100 text-xs font-semibold text-text-subtle">
                <tr>
                  <th scope="col" className="px-[var(--admin-pad-panel)] py-2">Student</th>
                  <th scope="col" className="px-3 py-2">Mobile</th>
                  <th scope="col" className="px-3 py-2">Match</th>
                  <th scope="col" className="px-3 py-2">Linked account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rosterRows.map((r) => {
                  const m = MATCH[r.matchStatus] ?? MATCH.unmatched;
                  return (
                    <tr key={r.id}>
                      <td className="px-[var(--admin-pad-panel)] py-2">
                        <p className="font-medium text-foreground">{r.name || "—"}</p>
                        <p className="break-all text-xs text-text-subtle">{[r.email, r.rollNo].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="nums px-3 py-2">{r.phone ?? "—"}</td>
                      <td className="px-3 py-2"><StatusBadge tone={m.tone} label={m.label} /></td>
                      <td className="break-all px-3 py-2">{r.linkedEmail ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
