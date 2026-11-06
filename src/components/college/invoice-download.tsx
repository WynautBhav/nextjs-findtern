"use client";

import { buttonClass } from "@/components/ui/button";
import { downloadInvoice } from "@/lib/invoice";

export function InvoiceDownload({ html, fileName }: { html: string; fileName: string }) {
  return (
    <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => downloadInvoice(html, fileName)}>
      Download invoice
    </button>
  );
}
