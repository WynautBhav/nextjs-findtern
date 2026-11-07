import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { flattenParams, parsePageRequest, type RawSearchParams } from "@/lib/admin/params";
import { listRefunds, type RefundListRow } from "@/lib/refunds/refunds-db";
import { RefundsTable } from "./refunds-table";

export const metadata = { title: "Refunds · Admin" };
export const dynamic = "force-dynamic";

const STATUSES = ["eligible", "review", "pending", "initiated", "refunded", "failed"];

export default async function AdminRefundsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const status = STATUSES.includes(params.status ?? "") ? params.status : undefined;
  const reason = params.reason?.slice(0, 60) || undefined;

  let data: { rows: RefundListRow[]; total: number } | null = null;
  try {
    data = await listRefunds({ status, reason, limit: req.perPage, offset: req.offset });
  } catch (error) {
    console.error("[admin/refunds] load failed", error);
  }

  return (
    <div className="container-page section-y">
      <AdminPageHeader title="Refunds" subtitle="Students who paid the activation fee and then received a college drive seat." />
      <Panel>
        {data ? (
          <RefundsTable rows={data.rows} total={data.total} page={req.page} perPage={req.perPage} status={status ?? ""} reason={reason ?? ""} statuses={STATUSES} />
        ) : (
          <AdminLoadError what="the refunds list" retryHref="/admin/refunds" />
        )}
      </Panel>
    </div>
  );
}
