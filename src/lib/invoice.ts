import { SELLER_STATE_CODE, splitGst, stateCodeFromGstin, type PlaceOfSupply } from "./gst.ts";
import { formatMoney } from "./format.ts";

/**
 * Tax invoice HTML, shared by the employer Orders page and the two admin
 * ledgers. Client-safe (no env, no DB): the seller block and each buyer's
 * place of supply are resolved on the server and passed in.
 *
 * Replaces three hand-copied templates that always printed "Integrated GST"
 * (even on USD orders) under a placeholder GSTIN.
 */

export type InvoiceSeller = {
  name: string;
  address: string;
  gstin: string | null;
  email: string;
};

export type InvoiceBuyer = {
  name: string;
  email?: string | null;
  gstin?: string | null;
  place: PlaceOfSupply;
};

export type InvoiceInput = {
  invoiceNo: string;
  date: Date;
  orderId: string;
  paymentId?: string | null;
  currency: string;
  amountMinor: number;
  description: string;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  /** SAC for the service line; 998519 = other employment & labour supply services. */
  sac?: string;
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(minor: number, currency: string): string {
  return formatMoney(minor, currency, { zeroLabel: false, decimals: 2 });
}

export function placeLabel(place: PlaceOfSupply): string {
  if (place.kind === "export") return "Outside India (export of services)";
  if (place.kind === "india") return `${place.stateName} (${place.stateCode})`;
  return "India (state not on file)";
}

export function taxInvoiceHtml(input: InvoiceInput): string {
  const { seller, buyer, currency } = input;
  const sellerState = stateCodeFromGstin(seller.gstin) ?? SELLER_STATE_CODE;
  const split = splitGst(input.amountMinor, buyer.place, sellerState);
  const m = (minor: number) => money(minor, currency);
  const dateStr = input.date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const taxRows =
    split.mode === "intra"
      ? `<div class="row"><span>CGST (9%)</span><span>${m(split.cgstMinor)}</span></div>
         <div class="row"><span>SGST (9%)</span><span>${m(split.sgstMinor)}</span></div>`
      : split.mode === "inter"
        ? `<div class="row"><span>IGST (18%)</span><span>${m(split.igstMinor)}</span></div>`
        : `<div class="row"><span>GST</span><span>Not applicable</span></div>`;

  const exportNote =
    split.mode === "export"
      ? `<p class="note">Export of services. Supply meant for export without payment of integrated tax.</p>`
      : "";
  const gstinLine = seller.gstin
    ? `GSTIN: ${esc(seller.gstin)}`
    : `<span style="color:#b45309">GSTIN: not configured</span>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Tax Invoice ${esc(input.invoiceNo)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 40px; margin: 0; background: #fff; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 32px; }
    .brand { font-size: 26px; font-weight: 800; color: #047857; letter-spacing: -0.5px; }
    .muted { font-size: 12px; color: #64748b; }
    .title { font-size: 26px; font-weight: 800; text-align: right; }
    .meta { font-size: 12px; color: #64748b; margin-top: 6px; text-align: right; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 32px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 700; margin-bottom: 8px; }
    .box { font-size: 13px; color: #334155; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    th { text-align: left; padding: 12px 16px; background: #f8fafc; font-size: 12px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; }
    td { padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    .totals { margin-left: auto; width: 320px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .row.final { font-size: 16px; font-weight: bold; border-top: 2px solid #0f172a; padding-top: 12px; margin-top: 4px; color: #047857; }
    .note { font-size: 12px; color: #475569; margin-top: 16px; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Findtern</div>
      <div class="muted">${esc(seller.name)} · ${gstinLine}</div>
    </div>
    <div>
      <div class="title">TAX INVOICE</div>
      <div class="meta">
        Invoice #: <strong>${esc(input.invoiceNo)}</strong><br />
        Date: ${esc(dateStr)}<br />
        Order ID: ${esc(input.orderId)}<br />
        Payment ID: ${esc(input.paymentId || "Captured")}
      </div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="label">Supplier</div>
      <div class="box">
        <strong>${esc(seller.name)}</strong><br />
        ${esc(seller.address)}<br />
        ${gstinLine}<br />
        Email: ${esc(seller.email)}
      </div>
    </div>
    <div>
      <div class="label">Billed to</div>
      <div class="box">
        <strong>${esc(buyer.name)}</strong><br />
        ${buyer.email ? `Email: ${esc(buyer.email)}<br />` : ""}
        ${buyer.gstin ? `GSTIN: ${esc(buyer.gstin)}<br />` : ""}
        Place of supply: ${esc(placeLabel(buyer.place))}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>SAC</th>
        <th style="text-align: right">Taxable value</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>${esc(input.description)}</strong><br /><span class="muted">Order ref: ${esc(input.orderId)}</span></td>
        <td>${esc(input.sac ?? "998519")}</td>
        <td style="text-align: right">${m(split.baseMinor)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Taxable value</span><span>${m(split.baseMinor)}</span></div>
    ${taxRows}
    <div class="row final"><span>Total paid</span><span>${m(split.totalMinor)}</span></div>
  </div>
  ${exportNote}

  <div class="footer">
    This is an electronically generated tax invoice. No signature required.<br />
    Thank you for choosing Findtern.
  </div>
</body>
</html>`;
}

/** Opens the print dialog for the invoice ("Save as PDF" gives the file). */
export async function downloadInvoice(html: string, fileName: string): Promise<void> {
  // Print from a hidden frame; the browser's "Save as PDF" produces the file.
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return;
  doc.open();
  doc.write(html.replace("<title>", `<title>${fileName.replace(/\.pdf$/i, "")} `));
  doc.close();
  await new Promise((r) => setTimeout(r, 150));
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 60_000);
}
