import type { Metadata } from "next";

import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { MasterDataView } from "@/components/admin/master-data/master-data-view";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { loadMasterTab, type MasterData } from "@/lib/admin/master-data";
import { COLLEGE_FILTERS, EMPLOYER_FILTERS, STUDENT_FILTERS, countWhere, type AnyRow, type FilterDef, type TabKey } from "@/lib/admin/master-data-pure";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { allows, canWrite, requiredPermissions } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Master data" };

const TABS: { key: TabKey; label: string; page: string; one: string; many: string }[] = [
  { key: "students", label: "Students", page: "/admin/interns", one: "student", many: "students" },
  { key: "employers", label: "Employers", page: "/admin/companies", one: "employer", many: "employers" },
  { key: "colleges", label: "Colleges", page: "/admin/colleges", one: "college", many: "colleges" },
];
const FILTERS = { students: STUDENT_FILTERS, employers: EMPLOYER_FILTERS, colleges: COLLEGE_FILTERS } as unknown as Record<TabKey, FilterDef<AnyRow>[]>;

/** Request time for heat and "last seen". Dynamic page, so this is per request. */
function requestTime(): Date {
  return new Date();
}

/**
 * Every student, employer and college in one place, ranked by heat (what is at stake and how long it has been quiet),
 * with the admin's follow-up log. A tab shows only when this admin may open that kind of record's own page.
 */
export default async function MasterDataPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const session = await getSession();
  const perms = session?.permissions;
  const may = (href: string) => allows(perms, requiredPermissions(href));
  const allowed = TABS.filter((t) => may(t.page));
  const tab = allowed.find((t) => t.key === params.tab) ?? allowed[0];

  if (!tab) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title="Master data" subtitle="Your role cannot open students, employers or colleges." />
      </div>
    );
  }

  const now = requestTime();
  let data: MasterData;
  try {
    data = await loadMasterTab(tab.key, now);
  } catch (error) {
    console.error("[admin/master-data]", error);
    return (
      <div className="space-y-4">
        <AdminPageHeader title="Master data" />
        <Panel>
          <AdminLoadError what="master data" retryHref={`/admin/master-data?tab=${tab.key}`} />
        </Panel>
      </div>
    );
  }

  const rows = (data[tab.key] ?? []) as AnyRow[];
  const hot = countWhere(rows, FILTERS[tab.key], { heat: "hot" });
  const hotOpen = countWhere(rows, FILTERS[tab.key], { heat: "hot", followUp: "nothing" });
  const finding = rows.length === 0
    ? `No ${tab.many} yet.`
    : hot === 0
      ? `${rows.length.toLocaleString("en-IN")} ${rows.length === 1 ? tab.one : tab.many}, none hot right now.`
      : `${hot.toLocaleString("en-IN")} hot ${hot === 1 ? tab.one : tab.many}${hotOpen ? `, ${hotOpen.toLocaleString("en-IN")} not nudged or called yet` : ", all followed up"}. Highest first.`;

  const items: AdminTabItem[] = allowed.map((t) => ({ key: t.key, label: t.label, href: `/admin/master-data?tab=${t.key}` }));
  const write = canWrite(perms, "/api/admin/follow-ups") && canWrite(perms, tab.page);

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Master data" subtitle={finding} className="mb-2 lg:mb-3" />
      <AdminTabs items={items} active={tab.key} label="Master data" />
      <MasterDataView
        key={tab.key}
        tab={tab.key}
        rows={rows}
        now={now.getTime()}
        canWrite={write}
        canNudge={canWrite(perms, "/admin/notifications")}
        hrefBase={tab.page}
      />
    </div>
  );
}
