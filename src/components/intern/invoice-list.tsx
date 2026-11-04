"use client";

import { useState } from "react";
import { Download, Eye } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadInvoice } from "@/lib/invoice";
import type { InternInvoice } from "@/lib/intern-invoice";

/** The intern's own paid invoices; the HTML is rendered on the server from the session, same as the admin print. */
export function InvoiceList({ invoices }: { invoices: InternInvoice[] }) {
  const [error, setError] = useState<string | null>(null);

  if (!invoices.length) return <p className="text-sm text-text-subtle">No invoices yet. Your activation fee invoice appears here once the payment is received.</p>;

  async function download(i: InternInvoice) {
    setError(null);
    try {
      await downloadInvoice(i.html, `Invoice-${i.orderId.slice(-8).toUpperCase()}.pdf`);
    } catch {
      setError("The invoice could not be generated. Try again.");
    }
  }

  function view(i: InternInvoice) {
    const url = URL.createObjectURL(new Blob([i.html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div>
      <ul className="divide-y divide-ink-100">
        {invoices.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="nums break-all text-sm font-medium text-ink-900">{i.number}</p>
              <p className="text-xs text-text-subtle">
                {i.paidAt ? formatDate(i.paidAt) : "-"} · {formatMoney(i.amountMinor, i.currency === "USD" ? "USD" : "INR")}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => view(i)} className={buttonClass({ variant: "outline", size: "sm" })}>
                <Eye className="size-3.5" aria-hidden /> View
              </button>
              <button type="button" onClick={() => download(i)} className={buttonClass({ variant: "outline", size: "sm" })}>
                <Download className="size-3.5" aria-hidden /> Download
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
