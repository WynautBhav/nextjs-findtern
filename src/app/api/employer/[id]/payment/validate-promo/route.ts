import { NextResponse } from "next/server";
import { z } from "zod";

import { payableCheckout, payRequestRefusal } from "@/lib/employer-payable";
import { getDb } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { assertProposalActionable } from "@/lib/projects/takedown-guard-server";
import { isFullWaiver } from "@/lib/full-waiver";
import { isWaiverCode, promoRefusal, quotePromoGuarded } from "@/lib/promo";
import { promoModeProblem } from "@/lib/promo-rules";

const bodySchema = z.object({
  code: z.string().trim().min(1),
  currency: z.enum(["INR", "USD"]).default("INR"),
  proposalIds: z.array(z.string().min(1)).length(1),
  mode: z.enum(["upfront", "monthly", "postpaid"]).default("upfront"),
});

/** Preview only: the order route re-prices the code against the same total. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Something is wrong with this request. Refresh the page and try again." }, { status: 400 });
  for (const pid of parsed.data.proposalIds) {
    const td = await assertProposalActionable(pid, id);
    if (!td.ok) return td.response;
  }

  // A full-waiver code works on every pay plan; an ordinary code only upfront.
  const modeProblem = (await isWaiverCode(parsed.data.code)) ? null : promoModeProblem(parsed.data.mode === "upfront" ? "upfront" : "monthly");
  if (modeProblem) return NextResponse.json({ error: modeProblem }, { status: 400 });

  // Priced exactly as the order route prices it: one hire, in the chosen mode.
  const checkout = await payableCheckout(id, { proposalIds: parsed.data.proposalIds, mode: parsed.data.mode });
  // An expired or CGPA-held offer gets no promo preview (and so no code is touched): the same 409 the order route gives.
  const held = await payRequestRefusal(getDb(), id, checkout, parsed.data.proposalIds);
  if (held) return NextResponse.json(held, { status: 409 });
  const { lines } = checkout;
  const paying = lines.filter((l) => l.currency === parsed.data.currency);
  const orderMinor = paying.reduce((s, l) => s + l.charge.totalMinor, 0);
  const feeMinor = paying.reduce((s, l) => s + l.charge.perHireMinor, 0);
  if (orderMinor <= 0) return NextResponse.json({ error: "There is nothing to pay on this offer right now. Refresh the page." }, { status: 400 });

  const quote = await quotePromoGuarded(req, id, { code: parsed.data.code, subjectId: id, orderMinor, currency: parsed.data.currency, audience: "employer", undiscountableMinor: feeMinor });
  if (!quote.ok) return promoRefusal(quote);
  return NextResponse.json({ code: quote.promo.code, discountMinor: quote.discountMinor, payableMinor: quote.payableMinor, ...(isFullWaiver(quote.promo) ? { fullWaiver: true } : {}) });
}
