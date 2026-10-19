import { NextResponse } from "next/server";
import { z } from "zod";

import { payableCheckout } from "@/lib/employer-payable";
import { requireMutation } from "@/lib/guards-mutation";
import { quotePromo } from "@/lib/promo";

const bodySchema = z.object({
  code: z.string().trim().min(1),
  currency: z.enum(["INR", "USD"]).default("INR"),
  proposalIds: z.array(z.string().min(1)).length(1),
  mode: z.enum(["upfront", "monthly"]).optional(),
});

/** Preview only: the order route re-prices the code against the same total. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Priced exactly as the order route prices it: one hire, upfront.
  const { lines } = await payableCheckout(id, { proposalIds: parsed.data.proposalIds, mode: "upfront" });
  const orderMinor = lines.filter((l) => l.currency === parsed.data.currency).reduce((s, l) => s + l.charge.totalMinor, 0);
  if (orderMinor <= 0) return NextResponse.json({ error: "Nothing payable in this currency" }, { status: 400 });

  const quote = await quotePromo({ code: parsed.data.code, subjectId: id, orderMinor, currency: parsed.data.currency, audience: "employer" });
  if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: quote.status });
  return NextResponse.json({ code: quote.promo.code, discountMinor: quote.discountMinor, payableMinor: quote.payableMinor });
}
