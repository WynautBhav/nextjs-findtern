import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { verifyPassword, needsRehash, hashPassword } from "@/lib/security/password";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.login.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const db = getDb();
  const [admin] = await db
    .select()
    .from(schema.admins)
    .where(eq(schema.admins.email, parsed.data.email))
    .limit(1);

  if (!admin || !(await verifyPassword(parsed.data.password, admin.password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (needsRehash(admin.password)) {
    const upgraded = await hashPassword(parsed.data.password);
    await db
      .update(schema.admins)
      .set({ password: upgraded })
      .where(eq(schema.admins.id, admin.id));
  }

  // Resolve the admin's permissions from `admin_roles`, keyed by
  // `admins.role`.
  //
  // The legacy app did exactly this at `server/routes.ts:4310`:
  //
  //   const role = roleKey ? await storage.getAdminRoleByKey(roleKey) : undefined;
  //   const permissions =
  //     roleKey.toLowerCase() === "super_admin" ? ["*"] : (role?.permissions ?? []);
  //
  // This port hardcoded `role: "admin"` and resolved nothing, which left the
  // `admin_roles` table populated and completely inert. Romil Gupta
  // (exec_accounts), Somil Jangid (exec_operations) and Mishita Narang
  // (exec_sales) all hold deliberately narrow roles and all had unrestricted
  // admin access.
  //
  // A role key with no matching row resolves to no permissions rather than to
  // everything: an unrecognised role must fail closed.
  const roleKey = String(admin.role ?? "").trim();
  let permissions: string[] = [];

  if (roleKey.toLowerCase() === "super_admin") {
    permissions = ["*"];
  } else if (roleKey) {
    const [roleRow] = await db
      .select({ permissions: schema.adminRoles.permissions })
      .from(schema.adminRoles)
      .where(eq(schema.adminRoles.key, roleKey))
      .limit(1);
    permissions = Array.isArray(roleRow?.permissions) ? roleRow.permissions : [];
  }

  const res = NextResponse.json({
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      permissions,
    },
  });
  await issueCsrfCookie(res);
  return withSession(res, {
    uid: admin.id,
    role: "admin",
    email: admin.email,
    permissions,
  });
}