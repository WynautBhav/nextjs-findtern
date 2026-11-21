import type { Metadata } from "next";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { InternsTab } from "@/components/admin/invoices/interns-tab";
import { PayrollTab } from "@/components/admin/invoices/payroll-tab";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { allows } from "@/lib/admin/permissions";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { loadPayrollPlacements } from "@/lib/admin/payroll-load";
import { getSession } from "@/lib/auth";
import { getInvoiceSeller } from "@/lib/invoice-seller";
import { todayIst } from "@/lib/offer";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "Invoices · Admin Ledger",
};

const TABS = [
  { key: "interns", label: "Interns", href: "/admin/invoices?tab=interns" },
  { key: "payroll", label: "Payroll (abroad)", href: "/admin/invoices?tab=payroll" },
];

/**
 * Invoices staff make by hand. Interns: an activation fee paid outside checkout. Payroll: the monthly invoice of a
 * full-time hire abroad, built from the approved timesheet. Reading needs transactions:read (the route rule);
 * every write button needs transactions:write, and the routes check it again.
 */
export default async function AdminInvoicesPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const tab = params.tab === "payroll" ? "payroll" : "interns";
  const canWrite = allows((await getSession())?.permissions, ["transactions:write"]);

  return (
    <div>
      <AdminPageHeader
        title="Invoices"
        subtitle="Invoices staff create by hand: an intern fee paid outside checkout, and the monthly payroll invoice for full-time hires abroad."
      />
      <AdminTabs items={TABS} active={tab} label="Invoice types" className="mb-6" />
      {tab === "payroll" ? <Payroll canWrite={canWrite} /> : <Interns canWrite={canWrite} />}
    </div>
  );
}

async function Interns({ canWrite }: { canWrite: boolean }) {
  const feeMinor = canWrite ? await getInternActivationFeeMinor().catch(() => null) : null;
  return <InternsTab canWrite={canWrite} feeMinor={feeMinor} />;
}

async function Payroll({ canWrite }: { canWrite: boolean }) {
  const seller = getInvoiceSeller();
  const placements = await loadPayrollPlacements(seller).catch((error) => {
    console.error("[admin/invoices] payroll load failed", error);
    return null;
  });
  if (!placements) {
    return (
      <Panel>
        <AdminLoadError what="the payroll placements" retryHref="/admin/invoices?tab=payroll" />
      </Panel>
    );
  }
  return <PayrollTab placements={placements} wire={seller.wire} canWrite={canWrite} today={todayIst()} />;
}
