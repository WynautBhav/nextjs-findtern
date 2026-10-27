import { count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { Pagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { MessagesInbox, type InboxMessage } from "@/components/admin/messages-inbox";
import { parseContactMessage } from "@/lib/admin/contact-meta";
import { formatNumber } from "@/lib/format";
import { getSession } from "@/lib/auth";
import { allows } from "@/lib/admin/permissions";

export const metadata = { title: "Inbound messages" };

const t = schema.contactMessages;

/**
 * Legacy kinds (admin-contact-messages.tsx): in-app reports and feedback
 * carry a "kind:" header line; everything else came from the website form.
 */
const KIND_SQL: Record<string, SQL> = {
  report: sql`${t.message} ~* '^\\s*kind:\\s*report'`,
  feedback: sql`${t.message} ~* '^\\s*kind:\\s*feedback'`,
  website: sql`${t.message} !~* '^\\s*kind:\\s*(report|feedback)'`,
};

/** Sender role: the "userType:" header wins, else the legacy query type. */
const noUserType = sql`${t.message} !~* '(^|\\n)usertype:'`;
const queryType = sql`lower(trim(coalesce(${t.queryType}, '')))`;
const ROLE_SQL: Record<string, SQL> = {
  intern: sql`(${t.message} ~* '(^|\\n)usertype:\\s*intern' or (${noUserType} and ${queryType} = 'intern'))`,
  employer: sql`(${t.message} ~* '(^|\\n)usertype:\\s*employer' or (${noUserType} and ${queryType} in ('hiring', 'employer')))`,
};

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);

  // Legacy buckets: staff see only the messages their role handles.
  const session = await getSession();
  const seeIntern = allows(session?.permissions, ["contact:intern:read", "contact:intern:write"]);
  const seeEmployer = allows(session?.permissions, ["contact:employer:read", "contact:employer:write"]);
  const isInternMsg = sql`${queryType} = 'intern'`;
  const bucket: SQL | undefined =
    seeIntern && seeEmployer ? undefined : seeIntern ? isInternMsg : seeEmployer ? sql`not ${isInternMsg}` : sql`false`;

  const conditions = [
    bucket,
    searchAny([sql`${t.firstName}`, sql`${t.lastName}`, sql`${t.email}`, sql`${t.subject}`, sql`${t.message}`], req.search),
    params.status === "unread" ? eq(t.isRead, false) : undefined,
    params.status === "read" ? eq(t.isRead, true) : undefined,
    KIND_SQL[params.kind ?? ""],
    ROLE_SQL[params.role ?? ""],
  ].filter((c): c is SQL => Boolean(c));
  const where = conditions.length ? sql.join(conditions, sql` and `) : undefined;

  const filters = (
    <TableToolbar
      searchPlaceholder="Search sender, subject or message"
      filters={[
        {
          key: "status",
          label: "Status",
          allLabel: "Read and unread",
          options: [
            { value: "unread", label: "Unread" },
            { value: "read", label: "Read" },
          ],
        },
        {
          key: "kind",
          label: "Kind",
          allLabel: "Every kind",
          options: [
            { value: "report", label: "In-app problem reports" },
            { value: "feedback", label: "In-app feedback" },
            { value: "website", label: "Website contact form" },
          ],
        },
        {
          key: "role",
          label: "From",
          allLabel: "Anyone",
          options: [
            { value: "intern", label: "Candidates" },
            { value: "employer", label: "Employers" },
          ],
        },
      ]}
    />
  );

  let loaded: { rows: InboxMessage[]; total: number; all: number; unread: number } | null = null;
  try {
    const db = getDb();
    const [rows, [filtered], [all], [unread]] = await Promise.all([
      db.select().from(t).where(where).orderBy(desc(t.createdAt)).limit(req.perPage).offset(req.offset),
      db.select({ c: count() }).from(t).where(where),
      db.select({ c: count() }).from(t).where(bucket),
      db.select({ c: count() }).from(t).where(bucket ? sql`${bucket} and ${t.isRead} = false` : eq(t.isRead, false)),
    ]);

    const parsed = rows.map((row) => ({ row, meta: parseContactMessage(row.message, row.queryType) }));

    // Who sent it: the header's user id (in-app reports), else the email.
    const ids = [...new Set(parsed.map((p) => p.meta.userId).filter((x): x is string => Boolean(x)))];
    const emails = [...new Set(parsed.map((p) => p.row.email.trim().toLowerCase()).filter(Boolean))];
    const [interns, employers] = await Promise.all([
      ids.length || emails.length
        ? db
            .select({ id: schema.users.id, first: schema.users.firstName, last: schema.users.lastName, email: schema.users.email })
            .from(schema.users)
            .where(
              sql`${ids.length ? inArray(schema.users.id, ids) : sql`false`} or ${emails.length ? inArray(sql`lower(${schema.users.email})`, emails) : sql`false`}`,
            )
        : Promise.resolve([]),
      ids.length || emails.length
        ? db
            .select({ id: schema.employers.id, company: schema.employers.companyName, name: schema.employers.name, email: schema.employers.companyEmail })
            .from(schema.employers)
            .where(
              sql`${ids.length ? inArray(schema.employers.id, ids) : sql`false`} or ${emails.length ? inArray(sql`lower(${schema.employers.companyEmail})`, emails) : sql`false`}`,
            )
        : Promise.resolve([]),
    ]);

    const internById = new Map(interns.map((u) => [u.id, u]));
    const internByEmail = new Map(interns.map((u) => [u.email.toLowerCase(), u]));
    const employerById = new Map(employers.map((e) => [e.id, e]));
    const employerByEmail = new Map(employers.filter((e) => e.email).map((e) => [String(e.email).toLowerCase(), e]));

    const internSender = (u: (typeof interns)[number]) => ({
      name: `${u.first ?? ""} ${u.last ?? ""}`.trim() || u.email,
      href: `/admin/interns/${u.id}`,
      role: "intern" as const,
    });
    const employerSender = (e: (typeof employers)[number]) => ({
      name: e.company || e.name || e.email || "Employer",
      href: `/admin/companies/${e.id}`,
      role: "employer" as const,
    });

    const enriched: InboxMessage[] = parsed.map(({ row, meta }) => {
      const email = row.email.trim().toLowerCase();
      let sender: InboxMessage["sender"] = null;
      if (meta.userId) {
        const i = internById.get(meta.userId);
        const e = employerById.get(meta.userId);
        sender = meta.role === "employer" ? (e ? employerSender(e) : i ? internSender(i) : null) : i ? internSender(i) : e ? employerSender(e) : null;
      }
      if (!sender) {
        const i = internByEmail.get(email);
        const e = employerByEmail.get(email);
        sender = meta.role === "employer" ? (e ? employerSender(e) : i ? internSender(i) : null) : i ? internSender(i) : e ? employerSender(e) : null;
      }
      return {
        id: row.id,
        name: `${row.firstName} ${row.lastName}`.trim() || row.email,
        email: row.email,
        phone: row.phone ? `${row.countryCode ? `${row.countryCode} ` : ""}${row.phone}` : null,
        subject: row.subject,
        queryType: row.queryType,
        isRead: row.isRead,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        meta,
        sender,
      };
    });

    loaded = { rows: enriched, total: Number(filtered?.c ?? 0), all: Number(all?.c ?? 0), unread: Number(unread?.c ?? 0) };
  } catch (error) {
    console.error("admin messages load failed", error);
  }

  const page = loaded ? toPage(loaded.rows, loaded.total, req.page, req.perPage) : null;
  const filtering = Boolean(req.search || params.status || params.kind || params.role);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Messages"
        subtitle={
          loaded
            ? loaded.unread
              ? `${formatNumber(loaded.unread)} unread of ${formatNumber(loaded.all)}. Website enquiries, in-app problem reports and feedback, newest first.`
              : `All ${formatNumber(loaded.all)} read. Website enquiries, in-app problem reports and feedback, newest first.`
            : "Website enquiries, in-app problem reports and feedback."
        }
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-5 py-3.5">{filters}</div>
        {loaded && page ? (
          <>
            <MessagesInbox messages={page.rows} filtering={filtering} />
            <Pagination
              page={page.page}
              pages={page.pages}
              total={page.total}
              perPage={page.perPage}
              rowsShown={page.rows.length}
              params={params}
              basePath="/admin/messages"
              noun="messages"
            />
          </>
        ) : (
          <AdminLoadError what="the inbox" retryHref="/admin/messages" />
        )}
      </Panel>
    </div>
  );
}
