import { count, inArray, sql } from "drizzle-orm";

import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { AddCollegeButton } from "@/components/admin/college-partners-manager";
import { DataTable, IdentityCell } from "@/components/admin/data-table";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { flattenParams, parsePageRequest, searchAny, toPage, toQueryString } from "@/lib/admin/params";
import { canWrite } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { q } from "@/lib/college/sql";
import { getDb, schema } from "@/lib/db";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

type View = "" | "students" | "withdrawals";

export default async function AdminCollegesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const canEdit = canWrite((await getSession())?.permissions, "/admin/colleges");
  const req = parsePageRequest(params);
  const view: View = params.view === "students" || params.view === "withdrawals" ? params.view : "";
  const db = getDb();
  const c = schema.colleges;
  const cid = q(c, c.id);

  const hasStudents = sql`EXISTS (SELECT 1 FROM ${schema.collegeMemberships} m WHERE m.college_id = ${cid} AND m.left_at IS NULL)`;
  const hasRequest = sql`EXISTS (SELECT 1 FROM ${schema.collegePayouts} p WHERE p.college_id = ${cid} AND p.status = 'requested')`;
  const viewWhere = {
    "": sql`${c.isPartner}`,
    students: sql`NOT ${c.isPartner} AND ${hasStudents}`,
    withdrawals: hasRequest,
  } satisfies Record<View, ReturnType<typeof sql>>;
  // A search looks through the whole directory and ignores the view, so a partner or a college
  // with students is never hidden by the tab it happens to be on.
  const where = req.search
    ? // The two codes have no trigram index, so they match exactly (as membership.ts does); name/city stay substring.
      sql`(${searchAny([sql`${c.name}`, sql`${c.city}`], req.search)} OR ${c.aisheCode} = ${req.search.trim().toUpperCase()} OR ${c.code} = ${req.search.trim().toUpperCase()})`
    : viewWhere[view];

  let loaded;
  try {
    const [[{ total }], [{ partners }], [{ withStudents }], [{ withdrawals }]] = await Promise.all([
      db.select({ total: count() }).from(c).where(where),
      db.select({ partners: count() }).from(c).where(viewWhere[""]),
      db.select({ withStudents: count() }).from(c).where(viewWhere.students),
      db.select({ withdrawals: count() }).from(c).where(viewWhere.withdrawals),
    ]);
    const page = Math.min(req.page, Math.max(1, Math.ceil(total / req.perPage))); // a page past the end shows the last one
    const rows = await db
      .select({
        college: c,
        members: sql<number>`(SELECT count(*)::int FROM ${schema.collegeMemberships} m WHERE m.college_id = ${cid} AND m.left_at IS NULL)`,
        drives: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDrives} d WHERE d.college_id = ${cid})`,
        openRequest: hasRequest.mapWith(Boolean),
        balance: sql<number>`(SELECT coalesce(sum(w.amount_minor), 0)::int FROM ${schema.collegeWalletEntries} w WHERE w.college_id = ${cid})`,
      })
      .from(c)
      .where(where)
      .orderBy(sql`${c.isPartner} DESC`, c.name, c.id)
      .limit(req.perPage)
      .offset((page - 1) * req.perPage);
    const ids = rows.map((r) => r.college.id).concat("");
    const [seatCodes, officers] = await Promise.all([
      db
        .select({ collegeId: schema.promoCodes.collegeId, maxUsages: schema.promoCodes.maxUsages, usedCount: schema.promoCodes.usedCount })
        .from(schema.promoCodes)
        .where(inArray(schema.promoCodes.collegeId, ids)),
      db
        .select({ collegeId: schema.collegeAdmins.collegeId, name: schema.collegeAdmins.name, lastLoginAt: schema.collegeAdmins.lastLoginAt })
        .from(schema.collegeAdmins)
        .where(sql`${schema.collegeAdmins.isActive} AND ${inArray(schema.collegeAdmins.collegeId, ids)}`),
    ]);
    loaded = { total, partners, withStudents, withdrawals, page, rows, seatCodes, officers };
  } catch (error) {
    console.error("[admin/colleges]", error);
    loaded = null;
  }

  const header = (subtitle?: string) => (
    <AdminPageHeader title="Colleges" subtitle={subtitle} action={canEdit ? <AddCollegeButton /> : undefined} />
  );
  if (!loaded) {
    return (
      <div className="space-y-4">
        {header()}
        <Panel>
          <AdminLoadError what="the college list" retryHref="/admin/colleges" />
        </Panel>
      </div>
    );
  }

  const { rows, seatCodes, officers } = loaded;
  const pg = toPage(rows, loaded.total, loaded.page, req.perPage);
  const viewHref = (v: View) => `/admin/colleges${toQueryString({ ...params, view: v, q: "", page: "" })}`;
  const tabs: AdminTabItem[] = [
    { key: "", label: "Partners", count: loaded.partners, href: viewHref("") },
    { key: "students", label: "Not partners, with students", count: loaded.withStudents, href: viewHref("students") },
    { key: "withdrawals", label: "Withdrawals to pay", count: loaded.withdrawals, href: viewHref("withdrawals") },
  ];

  return (
    <div className="space-y-4">
      {header(
        req.search
          ? `${formatNumber(loaded.total)} ${loaded.total === 1 ? "college matches" : "colleges match"} in the whole directory. Open one to make it a partner.`
          : `${formatNumber(loaded.partners)} partner ${loaded.partners === 1 ? "college" : "colleges"}. Search to find any college in the directory.`,
      )}
      {/* While searching no tab is selected: the search covers every college. */}
      <AdminTabs items={tabs} active={req.search ? "none" : view} label="College views" />
      <DataTable
        basePath="/admin/colleges"
        params={params}
        page={pg.page}
        pages={pg.pages}
        total={pg.total}
        perPage={pg.perPage}
        rows={rows}
        rowKey={(r) => r.college.id}
        rowHref={(r) => `/admin/colleges/${r.college.id}`}
        keyboardNav
        noun="colleges"
        caption="Colleges"
        searchPlaceholder="Search name, city, AISHE or college code"
        empty={
          view === "withdrawals"
            ? { title: "No withdrawals waiting", body: "When a college asks to withdraw its wallet balance, it shows up here." }
            : view === "students"
              ? { title: "No other colleges with students", body: "Colleges that are not partners but have students signed up appear here." }
              : { title: "No partner colleges yet", body: canEdit ? "Use Add college, then issue its placement officer a login once the first seat batch is paid." : "Partner colleges appear here once they are added." }
        }
        columns={[
          {
            header: "College",
            cell: ({ college: r, openRequest }) => (
              <div className="min-w-0 lg:max-w-80">
                <IdentityCell
                  name={r.name}
                  id={r.id}
                  href={`/admin/colleges/${r.id}`}
                  sub={[r.code ? `Code ${r.code}` : null, r.city].filter(Boolean).join(" · ") || undefined}
                />
                {openRequest || !r.isActive ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[3.25rem]">
                    {openRequest ? <StatusBadge tone="warning" label="Withdrawal requested" dot={false} className="h-5" /> : null}
                    {!r.isActive ? <StatusBadge tone="neutral" label="Inactive" dot={false} className="h-5" /> : null}
                  </div>
                ) : null}
              </div>
            ),
          },
          { header: "Students", align: "right", cell: (r) => formatNumber(r.members) },
          {
            header: "Seats used",
            align: "right",
            cell: (r) => {
              const seat = seatCodes.find((s) => s.collegeId === r.college.id);
              if (seat) return `${formatNumber(seat.usedCount)} of ${formatNumber(seat.maxUsages ?? 0)}`;
              return r.college.isPartner ? <span className="text-text-subtle">Awaiting payment</span> : <span className="text-text-subtle">-</span>;
            },
          },
          { header: "Drives", align: "right", cell: (r) => formatNumber(r.drives) },
          { header: "Wallet", align: "right", cell: (r) => <span className="nums">{formatMoney(r.balance, "INR", { zeroLabel: false })}</span> },
          {
            header: "Placement officer",
            cell: (r) => {
              const mine = officers.filter((o) => o.collegeId === r.college.id);
              if (mine.length === 0) return <span className="text-text-subtle">No login yet</span>;
              const [first] = mine;
              return (
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {first.name}
                    {mine.length > 1 ? <span className="font-normal text-text-subtle"> +{mine.length - 1} more</span> : null}
                  </p>
                  <p className="text-xs text-text-subtle">{first.lastLoginAt ? `Signed in ${formatDate(first.lastLoginAt)}` : "Never signed in"}</p>
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}
