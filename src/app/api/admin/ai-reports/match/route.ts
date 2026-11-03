import { and, eq, inArray, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { matchHeader, nameTokens, type CandidateLite } from "@/lib/admin/ai-report-match";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Admin: match the header read from each uploaded Incruiter PDF to candidates.
 * Read-only despite POST (it takes a body); CSRF and role still apply.
 *
 *  { headers: [{ key, name, canId, email, phone }] }  -> a result per key
 *  { search: "text" }                                  -> up to 8 candidates, for assigning a file by hand
 */

const headerSchema = z.object({
  key: z.string().min(1).max(80),
  name: z.string().max(120).nullable(),
  canId: z.string().max(32).nullable(),
  email: z.string().max(200).nullable(),
  phone: z.string().max(20).nullable(),
});
const bodySchema = z.union([
  z.object({ headers: z.array(headerSchema).min(1).max(50) }),
  z.object({ search: z.string().trim().min(2).max(80) }),
]);

const last10 = (v: string) => v.replace(/\D/g, "").slice(-10);

async function summarise(rows: (CandidateLite & { extra: Record<string, unknown> | null })[]) {
  return rows.map((r) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    phone: `${r.countryCode} ${r.phoneNumber}`.trim(),
    hasReport: typeof r.extra?.aiFeedbackLink === "string" && r.extra.aiFeedbackLink.trim() !== "",
  }));
}

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });

  const db = getDb();
  const u = schema.users;
  const columns = {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    countryCode: u.countryCode,
    phoneNumber: u.phoneNumber,
    extra: schema.internOnboarding.extraData,
  };
  const base = db.select(columns).from(u).leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, u.id));

  if ("search" in parsed.data) {
    const q = parsed.data.search;
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const digits = q.replace(/\D/g, "");
    const rows = await base
      .where(
        and(
          eq(u.role, "intern"),
          or(
            sql`${u.email} ilike ${like}`,
            sql`(${u.firstName} || ' ' || ${u.lastName}) ilike ${like}`,
            digits.length >= 4 ? sql`${u.phoneNumber} like ${`%${digits}%`}` : undefined,
          ),
        ),
      )
      .limit(8);
    return NextResponse.json({ candidates: await summarise(rows) });
  }

  const { headers } = parsed.data;
  const phones = [...new Set(headers.map((h) => (h.phone ? last10(h.phone) : "")).filter((p) => p.length === 10))];
  const emails = [...new Set(headers.map((h) => h.email?.trim().toLowerCase()).filter((e): e is string => !!e))];
  const names = [...new Set(headers.map((h) => nameTokens(h.name ?? "").join(" ")).filter(Boolean))];

  const conds = [
    phones.length ? sql`right(regexp_replace(${u.phoneNumber}, '\\D', '', 'g'), 10) in (${sql.join(phones.map((p) => sql`${p}`), sql`, `)})` : undefined,
    emails.length ? inArray(sql`lower(${u.email})`, emails) : undefined,
    names.length ? inArray(sql`lower(${u.firstName} || ' ' || ${u.lastName})`, names) : undefined,
  ].filter((c) => c !== undefined);

  const pool = conds.length ? await base.where(and(eq(u.role, "intern"), or(...conds))) : [];

  const results = headers.map((h) => {
    const result = matchHeader(h, pool);
    const ids = result.status === "matched" ? [result.internId] : result.status === "check" ? result.candidates.map((c) => c.id) : [];
    const byId = new Map(pool.map((p) => [p.id, p]));
    return {
      key: h.key,
      status: result.status,
      reasons: result.status === "matched" ? result.reasons : undefined,
      internId: result.status === "matched" ? result.internId : undefined,
      candidates: ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p),
    };
  });

  const out = await Promise.all(
    results.map(async (r) => ({ ...r, candidates: await summarise(r.candidates) })),
  );
  return NextResponse.json({ results: out });
}
