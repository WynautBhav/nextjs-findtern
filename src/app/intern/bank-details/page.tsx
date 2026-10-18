import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageHead } from "@/components/app/primitives";
import { BankDetailsForm, type BankDetails } from "@/components/intern/bank-details-form";

export const metadata: Metadata = {
  title: "Bank Details",
  robots: { index: false, follow: false },
};

export default async function InternBankDetailsPage() {
  const session = await requireRole("intern");

  let initialBank: BankDetails = {};
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, session.uid))
      .limit(1);

    if (row?.extraData) {
      const extra = row.extraData as Record<string, unknown>;
      const bank = (extra.bankDetails ?? extra.bank ?? {}) as BankDetails;
      initialBank = bank;
    }
  } catch {}

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHead
        title="Settings"
        lede="Manage your account settings and payout preferences"
      />

      <BankDetailsForm initialBank={initialBank} />
    </div>
  );
}
