import type { Metadata } from "next";
import Link from "next/link";

import { CompaniesTable } from "@/components/college/companies-table";
import { MasterDataTable } from "@/components/college/master-data-table";
import { pendingApprovalCount } from "@/lib/college/approvals";
import { companiesForCollege } from "@/lib/college/companies-db";
import { masterRowsForCollege } from "@/lib/college/master-data";
import { requireCollegeContext } from "@/lib/college/scope";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Master data" };

/** Request time for "last seen". Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 60) : undefined);

const TABS = [
  { id: "students", label: "Students", href: "/college/master-data" },
  { id: "companies", label: "Companies", href: "/college/master-data?tab=companies" },
] as const;

/** Every student, every field on the placement office's list, shaped into views and downloaded; and, on its own tab, every company from the college's drives. */
export default async function MasterDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCollegeContext();
  const sp = await searchParams;
  const tab = one(sp.tab) === "companies" ? "companies" : "students";
  const now = requestTime();

  const tabs = (
    <nav aria-label="Master data" className="-mb-px flex gap-4 border-b border-ink-200">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={tab === t.id ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
            tab === t.id ? "border-ink-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (tab === "companies") {
    const companies = await companiesForCollege(ctx);
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900">Master data</h1>
          <p className="nums mt-1 text-sm text-ink-600">
            {companies.length.toLocaleString("en-IN")} {companies.length === 1 ? "company" : "companies"} from your campus drives. Call them again, and download the list.
          </p>
        </div>
        {tabs}
        <CompaniesTable rows={companies.map((c) => ({ ...c, lastDriveAt: c.lastDriveAt.toISOString(), lastSeenAt: c.lastSeenAt?.toISOString() ?? null }))} now={now} />
      </div>
    );
  }

  // The same count as the dashboard tile and the Approvals page: students the officer can accept now.
  const [rows, toAccept] = await Promise.all([masterRowsForCollege(ctx), pendingApprovalCount(ctx.college.id, ctx.college.emailDomains).catch(() => 0)]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900">Master data</h1>
        <p className="nums mt-1 text-sm text-ink-600">
          {rows.length.toLocaleString("en-IN")} students{toAccept ? `, ${toAccept.toLocaleString("en-IN")} waiting for your approval` : ""}. Pick a view, change the columns, and download what you see.
        </p>
      </div>
      {tabs}
      <MasterDataTable rows={rows} collegeId={ctx.college.id} now={now} initial={{ view: one(sp.view), course: one(sp.course), mode: one(sp.mode), year: one(sp.year), band: one(sp.band), marks: one(sp.marks), status: one(sp.status), placement: one(sp.placement), outcome: one(sp.outcome) }} />
    </div>
  );
}
