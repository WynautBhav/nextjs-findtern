import Link from "next/link";
import { count, desc, eq, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";
import { RatingsImport } from "@/components/admin/ratings-import";

import { getDb, schema } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import {
  AdminEmpty,
  AdminPageHeader,
  AttentionBanner,
  Panel,
} from "@/components/admin/panel";
import { Pagination } from "@/components/admin/pagination";
import { PageSizeSelect } from "@/components/admin/page-size-select.tsx";
import { TableToolbar, type ToolbarFilter } from "@/components/admin/table-toolbar.tsx";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  BulkSelectProvider,
  RowCheckbox,
  SelectAllCheckbox,
  type BulkActionSpec,
} from "@/components/admin/bulk-select.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Intern management - the screen an admin actually lives in.
 *
 * Carries more surface than any other admin page: search across four fields,
 * three facets, a profile-completeness signal, admin-controlled directory
 * visibility, and bulk actions.
 *
 * **Architecture note.** The table body is a server component; only the
 * checkboxes and the action bar are client components, wired together by
 * `BulkSelectProvider`. The obvious alternative - a client table taking a
 * `columns` array of render functions - cannot work here: React refuses to
 * serialise a function across the server/client boundary. See bulk-select.tsx.
 */

type InternRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  isActive: boolean;
  visibility: string;
  createdAt: string;
  proposalCount: number;
  interviewCount: number;
  hasProfile: boolean;
};

const FILTERS: ToolbarFilter[] = [
  {
    key: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
  {
    key: "profile",
    label: "Profile",
    options: [
      { value: "complete", label: "Complete" },
      { value: "incomplete", label: "Incomplete" },
    ],
  },
  {
    key: "visibility",
    label: "Visibility",
    options: [
      { value: "live", label: "Live" },
      { value: "hidden", label: "Hidden" },
    ],
  },
];

const ACTIONS: BulkActionSpec[] = [
  {
    label: "Show",
    endpoint: "/api/admin/interns/visibility",
    payload: { visibility: "live" },
    icon: "eye",
    confirm: "Make {n} intern(s) visible in the public directory and employer search?",
  },
  {
    label: "Hide",
    endpoint: "/api/admin/interns/visibility",
    payload: { visibility: "hidden" },
    icon: "eye-off",
    confirm: "Hide {n} intern(s) from the public directory? Their accounts stay active.",
  },
  {
    label: "Activate",
    endpoint: "/api/admin/interns/status",
    payload: { isActive: true },
    icon: "check",
    confirm: "Activate {n} account(s)?",
  },
  {
    label: "Deactivate",
    endpoint: "/api/admin/interns/status",
    payload: { isActive: false },
    icon: "ban",
    tone: "danger",
    confirm: "Deactivate {n} account(s)? They will not be able to sign in.",
  },
];

export default async function AdminInterns({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const db = getDb();

  const conditions: (SQL | undefined)[] = [
    searchAny(
      [
        sql`${schema.users.firstName}`,
        sql`${schema.users.lastName}`,
        sql`${schema.users.email}`,
        sql`${schema.users.phoneNumber}`,
      ],
      req.search,
    ),
    params.status ? eq(schema.users.isActive, params.status === "active") : undefined,
    params.visibility ? eq(schema.users.profileVisibility, params.visibility) : undefined,
    params.profile === "complete"
      ? sql`${schema.internOnboarding.id} is not null`
      : undefined,
    params.profile === "incomplete" ? sql`${schema.internOnboarding.id} is null` : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  // Correlated subqueries rather than a second round trip per intern: the old
  // dashboard ran 2N additional queries to draw one screen.
  const proposalCount = sql<number>`(
    select count(*)::int from ${schema.proposals} p where p.intern_id = ${schema.users.id}
  )`;
  const interviewCount = sql<number>`(
    select count(*)::int from ${schema.interviews} i where i.intern_id = ${schema.users.id}
  )`;

  const [rawRows, [totalRow], [signupsRow], [incompleteRow]] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        countryCode: schema.users.countryCode,
        phoneNumber: schema.users.phoneNumber,
        isActive: schema.users.isActive,
        visibility: schema.users.profileVisibility,
        createdAt: schema.users.createdAt,
        proposalCount,
        interviewCount,
        hasProfile: sql<boolean>`(${schema.internOnboarding.id} is not null)`,
      })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.users.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db
      .select({ c: count() })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(where),
    db.select({ c: count() }).from(schema.users),
    db
      .select({ c: count() })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(sql`${schema.internOnboarding.id} is null`),
  ]);

  // Dates cross into the client boundary for `SelectAllCheckbox`, which receives
  // the id list - the ids are strings, and the rows stay on the server.
  const rows: InternRow[] = rawRows.map((row) => ({
    ...row,
    createdAt: row.createdAt?.toISOString() ?? "",
  }));

  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);
  const exportHref = `/api/admin/export?type=interns&${new URLSearchParams(params).toString()}`;

  return (
    <div>
      <AdminPageHeader
        title="Interns"
        subtitle="Every registered intern, their profile state, and directory visibility."
        action={
          <div className="flex flex-wrap items-center gap-2">
          <RatingsImport />
          <a
            href={exportHref}
            className="apple-spring apple-pressable inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
          </div>
        }
      />

      <div className="space-y-4">
        <AttentionBanner
          count={Number(incompleteRow?.c ?? 0)}
          total={Number(signupsRow?.c ?? 0)}
          noun="interns"
          href="/admin/interns?profile=incomplete"
        />

        <BulkSelectProvider actions={ACTIONS} noun="interns">
          <Panel className="overflow-visible">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                <TableToolbar
                  searchPlaceholder="Search interns…"
                  filters={FILTERS}
                />
              </div>
              <PageSizeSelect />
            </div>

            {rows.length === 0 ? (
              <AdminEmpty
                title="No interns match"
                body="Try a different search term, or clear the filters to see everyone."
              />
            ) : (
              <>
                <Table>
                  <TableHeader className="apple-material-bar sticky top-0 z-10">
                    <TableRow className="group/row hover:bg-transparent">
                      <TableHead scope="col" className="w-10 px-3 py-3">
                        <SelectAllCheckbox
                          ids={rows.map((row) => row.id)}
                          noun="interns"
                        />
                      </TableHead>
                      <TableHead scope="col" className="px-3 py-3 text-[12px] font-semibold tracking-[0.02em] text-ink-600 capitalize">
                        Candidate
                      </TableHead>
                      <TableHead
                        scope="col"
                        className="hidden px-3 py-3 text-[12px] font-semibold tracking-[0.02em] text-ink-600 capitalize md:table-cell"
                      >
                        Pipeline
                      </TableHead>
                      <TableHead scope="col" className="px-3 py-3 text-[12px] font-semibold tracking-[0.02em] text-ink-600 capitalize">
                        State
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id} className="apple-spring group/row hover:bg-ink-50/70">
                        <TableCell className="px-3 py-3">
                          <RowCheckbox id={row.id} />
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              aria-hidden
                              className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-800"
                            >
                              {row.firstName.charAt(0)}
                              {row.lastName.charAt(0)}
                            </span>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/interns/${row.id}`}
                                className="apple-spring block truncate text-[15px] font-semibold tracking-[-0.01em] text-ink-900 underline-offset-4 hover:underline"
                              >
                                {row.firstName} {row.lastName}
                              </Link>
                              <p className="mt-0.5 truncate text-[13px] text-text-subtle">
                                {row.email} · Joined{" "}
                                {row.createdAt ? formatDate(row.createdAt) : "-"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden px-3 py-3 md:table-cell">
                          <span className="inline-flex items-center gap-4">
                            <span>
                              <span className="block text-[17px] font-semibold tabular-nums text-ink-900">
                                {row.proposalCount}
                              </span>
                              <span className="block text-[12px] text-text-subtle">
                                Proposals
                              </span>
                            </span>
                            <span aria-hidden className="text-ink-300">→</span>
                            <span>
                              <span className="block text-[17px] font-semibold tabular-nums text-ink-900">
                                {row.interviewCount}
                              </span>
                              <span className="block text-[12px] text-text-subtle">
                                Interviews
                              </span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <span className="flex flex-col items-start gap-1.5">
                            <StatusBadge
                              tone={row.hasProfile ? "success" : "warning"}
                              label={row.hasProfile ? "Complete" : "Incomplete"}
                            />
                            <span className="inline-flex items-center gap-2 text-[12px] text-text-subtle">
                              <span className="inline-flex items-center gap-1">
                                <span
                                  aria-hidden
                                  className={
                                    row.isActive
                                      ? "size-1.5 rounded-full bg-emerald-600"
                                      : "size-1.5 rounded-full bg-ink-300"
                                  }
                                />
                                {row.isActive ? "Active" : "Inactive"}
                              </span>
                              <span aria-hidden className="text-ink-300">·</span>
                              <span className="inline-flex items-center gap-1 capitalize">
                                <span
                                  aria-hidden
                                  className={
                                    row.visibility === "live"
                                      ? "size-1.5 rounded-full bg-emerald-600"
                                      : "size-1.5 rounded-full bg-ink-300"
                                  }
                                />
                                {row.visibility}
                              </span>
                            </span>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination
                  page={page.page}
                  pages={page.pages}
                  total={page.total}
                  perPage={page.perPage}
                  rowsShown={rows.length}
                  params={params}
                  basePath="/admin/interns"
                  noun="interns"
                />
              </>
            )}
          </Panel>
        </BulkSelectProvider>
      </div>
    </div>
  );
}
