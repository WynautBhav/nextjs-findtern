import type { Metadata } from "next";
import { asc, count, desc } from "drizzle-orm";

import { CmsAddButton, CmsEditorProvider, CmsRowActions, type CmsItem } from "@/components/admin/cms-editor";
import { DataTable, type Column } from "@/components/admin/data-table";
import { InlineToggle } from "@/components/admin/inline-control";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { FilterTabs, Pill } from "@/components/app/primitives";
import { LeadStat } from "@/components/app/stat";
import { UserDot } from "@/components/layout/shell-parts";
import { formatNumber } from "@/lib/format";
import { CMS_COLLECTIONS, CMS_TYPES, cmsImageSrc, matchesCmsSearch, type CmsType } from "@/lib/admin/cms-collections";
import { CMS_TABLES, cmsListColumns } from "@/lib/admin/cms-tables";
import { withLiveBenchCounts } from "@/lib/content";
import { flattenParams, parsePageRequest, toPage } from "@/lib/admin/params";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canWrite } from "@/lib/admin/permissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Website Content | Admin",
  robots: { index: false, follow: false },
};

const ORDER = {
  testimonial: (t: typeof CMS_TABLES.testimonial) => [asc(t.sortOrder), desc(t.createdAt)],
  partner: (t: typeof CMS_TABLES.partner) => [asc(t.sortOrder), desc(t.createdAt)],
  faq: (t: typeof CMS_TABLES.faq) => [asc(t.category), asc(t.sortOrder)],
  blog: (t: typeof CMS_TABLES.blog) => [desc(t.createdAt)],
  skill: (t: typeof CMS_TABLES.skill) => [asc(t.sortOrder)],
} as const;

async function loadCollection(type: CmsType): Promise<CmsItem[]> {
  const table = CMS_TABLES[type];
  const order = (ORDER[type] as (t: typeof table) => ReturnType<typeof asc>[])(table);
  const rows = await getDb()
    .select(cmsListColumns(type) as never)
    .from(table)
    .orderBy(...order);
  // The website shows each skill's live bench size, never the typed number: list what visitors see.
  if (type === "skill") return withLiveBenchCounts(rows as unknown as (CmsItem & { title: string; resourceCount: number })[]);
  return rows as unknown as CmsItem[];
}

const lc = (label: string) => (label === "FAQs" ? label : label.toLowerCase());

function dateIn(value: unknown): string {
  const d = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
}

function Thumb({ src, name }: { src: string | null; name: string }) {
  // A person without a photo gets the flat initials disc, never an empty box.
  if (!src && name) return <UserDot name={name} className="size-10 text-sm" />;
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-ink-100">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- stored CMS images, any origin or inline
        <img src={src} alt="" loading="lazy" className="size-full object-contain" />
      ) : null}
    </span>
  );
}

function columnsFor(type: CmsType, mayEdit: boolean): Column<CmsItem>[] {
  const def = CMS_COLLECTIONS[type];
  const status: Column<CmsItem> = {
    header: "On the website",
    cell: (row) => !mayEdit ? <span>{row.isActive !== false ? "Live" : "Hidden"}</span> : (
      <InlineToggle
        on={row.isActive !== false}
        onLabel="Live"
        offLabel="Hidden"
        turnOnLabel="Show"
        turnOffLabel="Hide"
        request={{ url: "/api/admin/cms", method: "PATCH", body: { type, id: row.id }, valueKey: "isActive" }}
      />
    ),
  };
  const order: Column<CmsItem> = { header: "Order", align: "right", cell: (row) => Number(row.sortOrder ?? 0) };
  const actions: Column<CmsItem> = {
    header: <span className="sr-only">Actions</span>,
    headerClassName: "w-px",
    cell: (row) => !mayEdit ? null : (
      <CmsRowActions
        item={row}
        viewHref={type === "blog" && row.status === "published" ? `/blog/${encodeURIComponent(String(row.slug))}` : null}
      />
    ),
  };
  const titled = (header: string): Column<CmsItem> => ({
    header,
    className: "max-w-[24rem]",
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-3">
        {def.image ? <Thumb src={cmsImageSrc(type, row.id, def.image, row[def.image])} name={type === "testimonial" ? String(row[def.title] ?? "") : ""} /> : null}
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink-900" title={String(row[def.title] ?? "")}>
            {String(row[def.title] ?? "") || "Untitled"}
          </span>
          {type === "testimonial" && row.title ? <span className="block truncate text-xs text-ink-600">{String(row.title)}</span> : null}
        </span>
      </span>
    ),
  });
  const text = (header: string, key: string, cls?: string): Column<CmsItem> => ({
    header,
    className: cn("max-w-[18rem]", cls),
    cell: (row) => (
      <span className="block truncate" title={String(row[key] ?? "")}>
        {String(row[key] ?? "") || <span className="text-ink-600">-</span>}
      </span>
    ),
  });

  switch (type) {
    case "testimonial":
      return [titled("Person"), text("Company or college", "company"), order, status, actions];
    case "partner":
      return [titled("Partner"), text("Website", "href"), order, status, actions];
    case "faq":
      return [
        titled("Question"),
        {
          header: "Shown to",
          cell: (row) => <Pill tone={row.category === "Employer" ? "new" : "paid"}>{String(row.category ?? "-").trim() || "-"}</Pill>,
        },
        order,
        status,
        actions,
      ];
    case "blog":
      return [
        titled("Post"),
        text("Slug", "slug", "text-xs text-ink-600"),
        {
          header: "Status",
          cell: (row) => (
            <Pill tone={row.status === "published" ? "paid" : "closed"}>{row.status === "published" ? "Published" : "Draft"}</Pill>
          ),
        },
        { header: "Published", align: "right", cell: (row) => dateIn(row.publishedAt) },
        { header: "Updated", align: "right", cell: (row) => dateIn(row.updatedAt ?? row.createdAt) },
        actions,
      ];
    case "skill":
      return [
        titled("Skill"),
        text("Caption", "metaText"),
        { header: "Candidates", align: "right", cell: (row) => Number(row.resourceCount ?? 0).toLocaleString("en-IN") },
        order,
        status,
        actions,
      ];
  }
}

export default async function AdminCmsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const active = (CMS_TYPES as string[]).includes(params.tab ?? "") ? (params.tab as CmsType) : "testimonial";
  const def = CMS_COLLECTIONS[active];
  const req = parsePageRequest(params);
  const mayEdit = canWrite((await getSession())?.permissions, "/api/admin/cms");

  let all: CmsItem[] | null = null;
  let counts: Partial<Record<CmsType, number>> = {};
  try {
    const db = getDb();
    const [rows, ...tabCounts] = await Promise.all([
      loadCollection(active),
      ...CMS_TYPES.map((t) => db.select({ n: count() }).from(CMS_TABLES[t])),
    ]);
    all = rows;
    counts = Object.fromEntries(CMS_TYPES.map((t, i) => [t, Number(tabCounts[i]?.[0]?.n ?? 0)]));
  } catch (e) {
    console.error("[admin/cms] load failed", e);
  }

  const filtered = all ? all.filter((item) => matchesCmsSearch(active, item, req.search)) : [];
  const page = toPage(filtered.slice(req.offset, req.offset + req.perPage), filtered.length, req.page, req.perPage);
  // toPage re-clamps the page; slice again if the request overshot.
  const rows = page.page === req.page ? page.rows : filtered.slice((page.page - 1) * req.perPage, page.page * req.perPage);

  // What visitors see now: blog posts by status, everything else by the on/off switch.
  const liveCount = all ? all.filter((i) => (active === "blog" ? i.status === "published" : i.isActive !== false)).length : 0;
  const offCount = all ? all.length - liveCount : 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Website content"
        subtitle="Prices live under Pricing and fees; legal texts under Settings."
      />

      <div className="grid items-start gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {all ? (
          <LeadStat
            label={`${def.label} on the website`}
            value={all.length === 0 ? "None" : formatNumber(liveCount)}
            note={all.length === 0 ? `Nothing added yet. Add the first ${def.noun} below.` : offCount ? `${formatNumber(offCount)} ${active === "blog" ? (offCount === 1 ? "draft is" : "drafts are") : offCount === 1 ? "is" : "are"} ${active === "blog" ? "not shown to visitors" : "hidden from visitors"}.` : `Every ${def.noun} you have is showing.`}
          />
        ) : (
          <div />
        )}
        <div className="lg:pt-6">
          <FilterTabs
            label="Content types"
            value={active}
            hrefFor={(t) => `/admin/cms?tab=${t}`}
            tabs={CMS_TYPES.map((t) => ({ key: t, label: CMS_COLLECTIONS[t].label, count: counts[t] }))}
          />
        </div>
      </div>

      {all === null ? (
        <Panel>
          <AdminLoadError what={lc(def.label)} retryHref={`/admin/cms?tab=${active}`} />
        </Panel>
      ) : (
        <CmsEditorProvider type={active} items={rows}>
          <DataTable<CmsItem>
            basePath="/admin/cms"
            params={params}
            page={page.page}
            pages={page.pages}
            total={page.total}
            perPage={req.perPage}
            columns={columnsFor(active, mayEdit)}
            rows={rows}
            noun={lc(def.label)}
            caption={def.label}
            searchPlaceholder={`Search ${lc(def.label)}…`}
            extraControls={mayEdit ? <CmsAddButton noun={def.noun} /> : undefined}
            empty={
              req.search
                ? { title: `No ${lc(def.label)} match "${req.search}"`, body: "Try a shorter search, or clear it to see every entry." }
                : { title: `No ${lc(def.label)} yet`, body: `Use "Add ${def.noun}" above. It shows on the public site as soon as it is saved.` }
            }
          />
        </CmsEditorProvider>
      )}
    </div>
  );
}
