import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { quotePromo } from "@/lib/promo";

const bodySchema = z.object({ code: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const quote = await quotePromo({
    code: parsed.data.code,
    subjectId: id,
    orderMinor: await getInternActivationFeeMinor(),
    currency: "INR",
  });
  if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: quote.status });
  return NextResponse.json({
    discountType: quote.promo.discountType,
    discountValue: quote.promo.discountValue,
    discountMinor: quote.discountMinor,
  });
}
