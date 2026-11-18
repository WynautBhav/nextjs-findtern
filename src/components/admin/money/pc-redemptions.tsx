"use client";

import { Download, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Redemption } from "@/lib/admin/promo-redemptions";
import { formatIstStamp, formatMoney } from "@/lib/format";

export type RedemptionsView = {
  code: string;
  usedCount: number;
  totalDiscountInrMinor: number;
  redemptions: (Omit<Redemption, "redeemedAt"> & { redeemedAt: string | null })[];
};

/** Every use of one code: who, the order, the discount and when, as a ruled list with a CSV download. */
export function PromoRedemptions({
  promo,
  view,
  error,
  onClose,
}: {
  promo: { id: string; code: string } | null;
  view: RedemptionsView | null;
  error: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={promo !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-2xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold text-ink-900">{promo?.code} redemptions</DialogTitle>
          <DialogDescription className="text-sm text-ink-600">Every use of this code: who, the order and the discount given.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : !view ? (
          <p role="status" className="flex items-center gap-2 text-sm text-ink-600">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading redemptions
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="nums text-sm text-ink-800">
                <span className="font-semibold">{view.usedCount.toLocaleString("en-IN")}</span> used ·{" "}
                <span className="font-semibold">{formatMoney(view.totalDiscountInrMinor, "INR", { zeroLabel: false })}</span> discount given
              </p>
              <a href={`/api/admin/promo-codes/${promo?.id}/redemptions?format=csv`} download className={buttonClass({ variant: "light", size: "sm" })}>
                <Download className="size-4" aria-hidden />
                Download CSV
              </a>
            </div>
            {view.redemptions.length === 0 ? (
              <p className="border-y border-ink-200 py-6 text-sm text-ink-600">No one has used this code yet. Copy it from the list and share it.</p>
            ) : (
              <div className="max-h-[50dvh] overflow-auto">
                <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                  <caption className="sr-only">{promo?.code} redemptions</caption>
                  <thead>
                    <tr className="border-b-2 border-ink-800">
                      <th scope="col" className="py-2 pr-3 font-medium text-ink-700">Who</th>
                      <th scope="col" className="px-3 py-2 font-medium text-ink-700">Order</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium text-ink-700">Discount</th>
                      <th scope="col" className="py-2 pl-3 font-medium text-ink-700">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.redemptions.map((r, i) => (
                      <tr key={`${r.orderId}-${i}`} className="border-b border-ink-200">
                        <td className="py-2.5 pr-3">
                          <span className="block font-medium text-ink-900">{r.who ?? "Unknown"}</span>
                          <span className="block text-xs text-ink-600">
                            {r.kind === "employer" ? "Employer" : "Intern"}
                            {r.email ? ` · ${r.email}` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-ink-700">{r.orderId ?? "–"}</td>
                        <td className="nums px-3 py-2.5 text-right">{formatMoney(r.discountMinor, r.currency, { zeroLabel: false })}</td>
                        <td className="nums whitespace-nowrap py-2.5 pl-3 text-ink-700">{formatIstStamp(r.redeemedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
