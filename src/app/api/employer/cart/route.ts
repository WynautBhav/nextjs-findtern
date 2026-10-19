import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { poolInternIds } from "@/lib/employer-pool";

/**
 * Employer cart.
 *
 * `employer_cart_items` is keyed on (employer, project, intern, list_type), so
 * the same candidate can sit against two projects at once - the unique index
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

      // Only someone in the candidate pool can be shortlisted, and not anyone
      // this employer already hired or has an offer out to - legacy refused
      // both and sent the employer to the existing proposal instead.
      if (!(await poolInternIds(db, [internId])).has(internId)) {
        return NextResponse.json({ error: "This candidate is not available" }, { status: 404 });
      }
      const [existing] = await db
        .select({ id: schema.proposals.id, status: schema.proposals.status })
        .from(schema.proposals)
        .where(
          and(
            eq(schema.proposals.employerId, employerId),
            eq(schema.proposals.internId, internId),
            inArray(schema.proposals.status, ["sent", "accepted", "processing", "hired"]),
          ),
        )
        .limit(1);
      if (existing) {
        return NextResponse.json(
          {
            error:
              existing.status === "hired"
                ? "You have already hired this candidate"
                : "You already have an offer out to this candidate",
            proposalId: existing.id,
          },
          { status: 409 },
        );
      }

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

    // stage / stage_all (sheet row 62): nobody is hired straight from the
    // shortlist. A hire starts with a proposal the candidate accepts, and
    // accepted offers are paid at /employer/checkout.
    if (parsed.data.action === "stage" || parsed.data.action === "stage_all") {
      return NextResponse.json(
        { error: "Send this candidate a proposal first. Accepted offers are paid at checkout." },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    console.error("[employer/cart]", e);
    return NextResponse.json(
      { error: "Could not update your shortlist. Try again shortly." },
      { status: 500 },
    );
  }
}