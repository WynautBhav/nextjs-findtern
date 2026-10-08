import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Employer cart.
 *
 * `employer_cart_items` is keyed on (employer, project, intern, list_type), so
 * the same candidate can sit against two projects at once — the unique index
 * makes that explicit rather than accidental, and this route honours it with an
 * upsert so double-adding is a no-op instead of a 500.
 *
 * `list_type` is "cart" (a shortlist) or "checkout" (the staged set the
 * checkout page bills). `action: "stage"` is the move between them; the legacy
 * build called it `cart/sync`.
 *
 * The rewrite shipped the table but none of these routes, which is why the cart
 * page could only be read.
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    projectId: z.string().min(1),
    internId: z.string().min(1),
    listType: z.enum(["cart", "checkout"]).default("cart"),
  }),
  z.object({
    action: z.literal("remove"),
    projectId: z.string().min(1),
    internId: z.string().min(1),
    listType: z.enum(["cart", "checkout"]).default("cart"),
  }),
  z.object({
    action: z.literal("stage"),
    internId: z.string().min(1),
    /** Omit to stage this candidate against every project they are shortlisted on. */
    projectId: z.string().min(1).optional(),
  }),
  z.object({ action: z.literal("stage_all") }),
]);

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  const employerId = guard.session.uid;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();

  try {
    if (parsed.data.action === "add") {
      const { projectId, internId, listType } = parsed.data;
      // The project must belong to this employer, or the cart becomes a way to
      // attach your shortlist to somebody else's project id.
      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.id, projectId), eq(schema.projects.employerId, employerId)))
        .limit(1);
      if (!project) return NextResponse.json({ error: "Unknown project" }, { status: 404 });

      await db
        .insert(schema.employerCartItems)
        .values({ employerId, projectId, internId, listType })
        .onConflictDoNothing();
      return NextResponse.json({ ok: true, listType });
    }

    if (parsed.data.action === "remove") {
      const { projectId, internId, listType } = parsed.data;
      await db
        .delete(schema.employerCartItems)
        .where(
          and(
            eq(schema.employerCartItems.employerId, employerId),
            eq(schema.employerCartItems.projectId, projectId),
            eq(schema.employerCartItems.internId, internId),
            eq(schema.employerCartItems.listType, listType),
          ),
        );
      return NextResponse.json({ ok: true });
    }

    // stage / stage_all: promote shortlisted rows into the checkout set.
    // Shortlisted rows stay put — a shortlist is a browsing aid, the staged set
    // is the billable one, and conflating them makes "remove" ambiguous.
    const stageAll = parsed.data.action === "stage_all";
    const single = parsed.data.action === "stage" ? parsed.data : null;
    const filters = [
      eq(schema.employerCartItems.employerId, employerId),
      eq(schema.employerCartItems.listType, "cart"),
    ];
    if (single) filters.push(eq(schema.employerCartItems.internId, single.internId));
    if (single?.projectId) filters.push(eq(schema.employerCartItems.projectId, single.projectId));

    const rows = await db
      .select()
      .from(schema.employerCartItems)
      .where(and(...filters));

    if (rows.length === 0) {
      return NextResponse.json(
        { error: stageAll ? "Your shortlist is empty" : "That candidate is not shortlisted" },
        { status: 404 },
      );
    }

    for (const row of rows) {
      await db
        .insert(schema.employerCartItems)
        .values({
          employerId,
          projectId: row.projectId,
          internId: row.internId,
          listType: "checkout",
        })
        .onConflictDoNothing();
    }
    return NextResponse.json({ ok: true, staged: rows.length });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update the cart" },
      { status: 500 },
    );
  }
}