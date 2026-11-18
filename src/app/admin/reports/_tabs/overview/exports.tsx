import { ExportList } from "@/components/admin/reports/export-list";
import { allows, EXPORT_PERMISSIONS } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";

/** The six raw files, each hidden unless this role may open it (the same check as the export route). */
export default async function Exports() {
  const session = await getSession();
  const all = [
    {
      title: "Intern master file",
      body: "Candidates with contact and profile status.",
      // Explicit columns: a bare link gets the Candidates default set, which has no email or phone.
      href: "/api/admin/export?type=interns&cols=email,phone,interview,score,profile,review,account,live,offerStatus,joined",
      type: "interns",
      format: "XLSX" as const,
    },
    { title: "Companies directory", body: "Partners, contacts, GST and setup progress.", href: "/api/admin/export?type=companies", type: "companies" },
    { title: "Projects catalog", body: "Listings, skills, offers and statuses.", href: "/api/admin/export?type=projects", type: "projects" },
    { title: "Payments ledger", body: "Receipts, order IDs, GST split and verification.", href: "/api/admin/export?type=payments", type: "payments" },
    { title: "Intern payouts", body: "Stipend transfers, references and schedule.", href: "/api/admin/export?type=payouts", type: "payouts" },
    { title: "Intern payments", body: "Activation fees, promo codes and GST split.", href: "/api/admin/export?type=intern-payments", type: "intern-payments" },
  ];
  return <ExportList items={all.filter((e) => allows(session?.permissions, EXPORT_PERMISSIONS[e.type] ?? null))} />;
}
