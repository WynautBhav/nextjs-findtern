import type { Metadata } from "next";

import { MasterDataTable } from "@/components/college/master-data-table";
import { masterRowsForCollege } from "@/lib/college/master-data";
import { requireCollegeContext } from "@/lib/college/scope";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Master data" };

/** Request time for "last seen". Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 60) : undefined);

/** Every student, every field on the placement office's list, shaped into views and downloaded. */
export default async function MasterDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCollegeContext();
  const [rows, sp] = await Promise.all([masterRowsForCollege(ctx), searchParams]);
  const verified = rows.filter((r) => r.verified).length;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900">Master data</h1>
        <p className="nums mt-1 text-sm text-ink-600">
          {rows.length.toLocaleString("en-IN")} students{rows.length - verified ? `, ${(rows.length - verified).toLocaleString("en-IN")} waiting for your approval` : ""}. Pick a view, change the columns, and download what you see.
        </p>
      </div>
      <MasterDataTable rows={rows} collegeId={ctx.college.id} now={requestTime()} initial={{ view: one(sp.view), course: one(sp.course), mode: one(sp.mode) }} />
    </div>
  );
}
