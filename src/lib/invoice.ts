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
  /** "Send payments to" block (legacy invoices carried it, EMH-08). */
  bank?: { bankName: string; accountName: string; accountNumber: string; ifsc: string } | null;
};

/** One billed line: a hire ("Name - Role") or a full-time fee, with its price when known. */
export type InvoiceLine = {
  label: string;
  /** Second line under the label, e.g. the CTC the full-time fee is on. */
  detail?: string | null;
  /** Gross amount of this line (incl. GST), minor units; null when the order can't split it. */
  amountMinor?: number | null;
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
  /** Placements this payment covers, listed under the service line (legacy did). */
  items?: string[];
  /**
   * One table row per hire, each with its own price (legacy invoice). When
   * given, replaces the single service line and `items`.
   */
  lines?: InvoiceLine[];
  /** Promo applied; the total above is already net of it. */
  promo?: { code: string; discountMinor?: number | null } | null;
};

/**
 * The invoice number to print: the FY serial stored at payment
 * (lib/invoice-number), else the old id-derived form for rows paid before
 * numbering existed and not yet backfilled.
 */
export function invoiceNumberOf(row: { id: string; invoiceNumber?: string | null }, fallbackPrefix = "INV"): string {
  return row.invoiceNumber || `${fallbackPrefix}-${row.id.slice(0, 8).toUpperCase()}`;
}

/* ── Legacy invoice numbers (EMH-09) ────────────────────────────────────
 * Legacy never stored a number: it printed DDMMYY-NN when the invoice was
 * opened, NN being the payment's place among ALL employer payments paid that
 * day (by paid time, then order id). Customers already hold those numbers,
 * so a payment settled before the cutover (or settled by legacy after a
 * rollback, which leaves no stored number) keeps showing its legacy number;
 * everything the new app settles shows its stored FT/YYYY-YY/NNNN. */

/** First instant served by the new app. Payments paid before it were invoiced by legacy. */
export const LEGACY_INVOICE_CUTOFF = new Date("2026-10-28T00:00:00+05:30");
/** The legacy server's clock. Assumed IST; change here if accounts' copies disagree. */
export const LEGACY_INVOICE_TZ = "Asia/Kolkata";

type PaidRef = { orderId: string; paidAt: Date | string | null };

function dayKey(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("day")}${get("month")}${get("year")}`;
}

/** "281026-02": legacy's number for `row`, given every employer payment paid that day. */
export function legacyInvoiceNumber(row: PaidRef, sameDayPaid: readonly PaidRef[], timeZone = LEGACY_INVOICE_TZ): string | null {
  if (!row.paidAt) return null;
  const at = new Date(row.paidAt);
  if (Number.isNaN(at.getTime())) return null;
  const key = dayKey(at, timeZone);
  const sorted = sameDayPaid
    .filter((p) => p.paidAt && !Number.isNaN(new Date(p.paidAt).getTime()) && dayKey(new Date(p.paidAt), timeZone) === key)
    .sort((a, b) => new Date(a.paidAt!).getTime() - new Date(b.paidAt!).getTime() || a.orderId.localeCompare(b.orderId));
  const idx = sorted.findIndex((p) => p.orderId === row.orderId);
  const seq = idx >= 0 ? idx + 1 : sorted.length + 1;
  return `${key}-${String(seq).padStart(2, "0")}`;
}

/** The number this payment's customer knows it by. */
export function displayInvoiceNumber(
  row: PaidRef & { id: string; invoiceNumber?: string | null },
  allPaid: readonly PaidRef[],
  cutoff: Date = LEGACY_INVOICE_CUTOFF,
): string {
  const paidAt = row.paidAt ? new Date(row.paidAt) : null;
  const legacyEra = paidAt && !Number.isNaN(paidAt.getTime()) && paidAt < cutoff;
  if (legacyEra || (!row.invoiceNumber && paidAt)) {
    const legacy = legacyInvoiceNumber(row, allPaid);
    if (legacy) return legacy;
  }
  return invoiceNumberOf(row);
}

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

/**
 * Taxable value per line: each line's share of the order's taxable value, by
 * its gross price; the last priced line takes the rounding so the rows add up
 * to the total exactly. Lines without a price print "Included".
 */
export function lineRows(
  lines: readonly InvoiceLine[],
  baseMinor: number,
  grossMinor: number,
): { label: string; detail?: string | null; baseMinor: number | null }[] {
  const priced = lines.filter((l) => l.amountMinor != null && l.amountMinor > 0);
  const pricedGross = priced.reduce((s, l) => s + (l.amountMinor ?? 0), 0);
  // Prices that don't add up to what was paid (a promo, a partial split)
  // can't be shown per line without inventing figures.
  const split = priced.length > 0 && pricedGross === grossMinor;
  let left = baseMinor;
  let pricedSeen = 0;
  return lines.map((l) => {
    if (lines.length === 1) return { label: l.label, detail: l.detail, baseMinor };
    if (!split || l.amountMinor == null || l.amountMinor <= 0) return { label: l.label, detail: l.detail, baseMinor: null };
    pricedSeen += 1;
    const share = pricedSeen === priced.length ? left : Math.round((baseMinor * l.amountMinor) / grossMinor);
    left -= share;
    return { label: l.label, detail: l.detail, baseMinor: share };
  });
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
    .bank { margin-top: 32px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 360px; }
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
      ${
        input.lines?.length
          ? lineRows(input.lines, split.baseMinor, input.amountMinor)
              .map(
                (row, i) => `<tr>
        <td><strong>${esc(row.label)}</strong>${row.detail ? `<br /><span class="muted">${esc(row.detail)}</span>` : ""}${
          i === 0 ? `<br /><span class="muted">Order ref: ${esc(input.orderId)}</span>` : ""
        }</td>
        <td>${esc(input.sac ?? "998519")}</td>
        <td style="text-align: right">${row.baseMinor == null ? "Included" : m(row.baseMinor)}</td>
      </tr>`,
              )
              .join("")
          : `<tr>
        <td><strong>${esc(input.description)}</strong><br /><span class="muted">Order ref: ${esc(input.orderId)}</span>${
          input.items?.length
            ? `<br /><span class="muted">${input.items.map((item) => `• ${esc(item)}`).join("<br />")}</span>`
            : ""
        }</td>
        <td>${esc(input.sac ?? "998519")}</td>
        <td style="text-align: right">${m(split.baseMinor)}</td>
      </tr>`
      }
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Taxable value</span><span>${m(split.baseMinor)}</span></div>
    ${taxRows}
    ${
      input.promo
        ? `<div class="row"><span>Promo ${esc(input.promo.code)} applied</span><span>${
            input.promo.discountMinor ? `− ${m(input.promo.discountMinor)}` : "included"
          }</span></div>`
        : ""
    }
    <div class="row final"><span>Total paid</span><span>${m(split.totalMinor)}</span></div>
  </div>
  ${exportNote}
  ${
    seller.bank
      ? `<div class="bank">
    <div class="label">Send payments to</div>
    <div class="box">
      ${esc(seller.bank.accountName)}<br />
      ${esc(seller.bank.bankName)}<br />
      Account number: ${esc(seller.bank.accountNumber)}<br />
      IFSC: ${esc(seller.bank.ifsc)}
    </div>
  </div>`
      : ""
  }

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
