import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, desc } from "drizzle-orm";

import { CmsAddButton, CmsEditorProvider, CmsRowActions, type CmsItem } from "@/components/admin/cms-editor";
import { DataTable, type Column } from "@/components/admin/data-table";
import { InlineToggle } from "@/components/admin/inline-control";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { Pill } from "@/components/app/primitives";
import { CMS_COLLECTIONS, CMS_TYPES, cmsImageSrc, matchesCmsSearch, type CmsType } from "@/lib/admin/cms-collections";
import { CMS_TABLES, cmsListColumns } from "@/lib/admin/cms-tables";
import { flattenParams, parsePageRequest, toPage } from "@/lib/admin/params";
import { getDb } from "@/lib/db";
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
  return rows as unknown as CmsItem[];
}

function dateIn(value: unknown): string {
  const d = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-apple-sm border border-ink-200/80 bg-ink-50">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- stored CMS images, any origin or inline
        <img src={src} alt="" loading="lazy" className="size-full object-contain" />
      ) : null}
    </span>
  );
}

function columnsFor(type: CmsType): Column<CmsItem>[] {
  const def = CMS_COLLECTIONS[type];
  const status: Column<CmsItem> = {
    header: "On the website",
    cell: (row) => (
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
    cell: (row) => (
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
        {def.image ? <Thumb src={cmsImageSrc(type, row.id, def.image, row[def.image])} /> : null}
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
        {String(row[key] ?? "") || <span className="text-text-subtle">-</span>}
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
          cell: (row) => <Pill tone={row.category === "Employer" ? "new" : "live"}>{String(row.category ?? "-").trim() || "-"}</Pill>,
        },
        order,
        status,
        actions,
      ];
    case "blog":
      return [
        titled("Post"),
        text("Slug", "slug", "font-mono text-xs"),
        {
          header: "Status",
          cell: (row) => (
            <StatusBadge
              tone={row.status === "published" ? "success" : "neutral"}
              label={row.status === "published" ? "Published" : "Draft"}
            />
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

  return (
    <div>
      <AdminPageHeader
        title="Website content"
        subtitle="Prices live under Pricing and fees; legal texts under Settings."
      />

      <nav aria-label="Content types" className="mb-6 flex max-w-full gap-1 overflow-x-auto rounded-apple-md bg-ink-100 p-1">
        {CMS_TYPES.map((t) => (
          <Link
            key={t}
            href={`/admin/cms?tab=${t}`}
            aria-current={t === active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-apple-sm px-4 text-sm font-medium max-lg:min-h-11",
              t === active ? "bg-white text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-900",
            )}
          >
            {CMS_COLLECTIONS[t].label}
            {counts[t] !== undefined ? <span className="nums text-xs text-text-subtle">{counts[t]}</span> : null}
          </Link>
        ))}
      </nav>

      {all === null ? (
        <Panel>
          <AdminLoadError what={def.label.toLowerCase()} retryHref={`/admin/cms?tab=${active}`} />
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
            columns={columnsFor(active)}
            rows={rows}
            noun={def.label.toLowerCase()}
            caption={def.label}
            searchPlaceholder={`Search ${def.label.toLowerCase()}…`}
            extraControls={<CmsAddButton noun={def.noun} />}
            empty={
              req.search
                ? { title: `No ${def.label.toLowerCase()} match "${req.search}"`, body: "Try a shorter search, or clear it to see every entry." }
                : { title: `No ${def.label.toLowerCase()} yet`, body: `Use "Add ${def.noun}" above. It shows on the public site as soon as it is saved.` }
            }
          />
        </CmsEditorProvider>
      )}
    </div>
  );
}
