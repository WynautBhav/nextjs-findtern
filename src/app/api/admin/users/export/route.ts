import { NextResponse } from "next/server";

import { csvFilename, csvResponse, toCsv } from "@/lib/admin/csv";
import { flattenParams } from "@/lib/admin/params";
import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { loadAccounts, USER_SORTS, type UserSort } from "@/lib/admin/users-list";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

/** CSV of the Registered Users list, with the filters on screen. A read: no CSRF. */
export async function GET(req: Request) {
  // Live role (not the login cookie): a demoted admin loses exports at once.
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const permissions = session.permissions;
  if (!allows(permissions, ["users:read"])) {
    return new NextResponse("Your role doesn't include this export.", { status: 403 });
  }

  const params = flattenParams(Object.fromEntries(new URL(req.url).searchParams.entries()));
  const sort: UserSort = USER_SORTS.find((k) => k === params.sort) ?? "created";
  const { rows } = await loadAccounts(params, {
    showStaff: allows(permissions, ["roles:write"]),
    sort,
    dir: params.dir === "asc" ? "asc" : "desc",
    limit: 10_000,
    offset: 0,
  });

  // Fail closed: no audit row, no file.
  try {
    await recordAdminAudit(getDb(), { adminId: session.uid, action: "export.users", targetType: "user", meta: { rows: rows.length, filters: params } }, { strict: true });
  } catch (err) {
    console.error("[admin/users/export] audit insert failed", err);
    return NextResponse.json({ error: "Could not record the export" }, { status: 500 });
  }

  return csvResponse(
    toCsv(rows, [
      { header: "ID", value: (r) => r.id },
      { header: "Type", value: (r) => r.kind },
      { header: "Name", value: (r) => r.name },
      { header: "Company", value: (r) => r.company ?? "" },
      { header: "Email", value: (r) => r.email },
      { header: "Phone", value: (r) => r.phone },
      { header: "Status", value: (r) => (r.isActive ? "active" : "inactive") },
      { header: "Email verified", value: (r) => (r.emailVerified ? "Yes" : "No") },
      { header: "Registered", value: (r) => r.createdAt?.toISOString().slice(0, 10) ?? "" },
    ]),
    csvFilename("users"),
  );
}
