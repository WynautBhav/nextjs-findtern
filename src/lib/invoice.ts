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
  /** Billing location, printed under the name; the PIN is also what decides the place of supply. */
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  place: PlaceOfSupply;
};

/** "Jaipur, Rajasthan, India", leaving out what isn't on file. */
export function buyerAddress(buyer: Pick<InvoiceBuyer, "city" | "state" | "country">): string {
  return [buyer.city, buyer.state, buyer.country].map((p) => String(p ?? "").trim()).filter(Boolean).join(", ");
}

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
 * "021126-124": the IST date the payment settled, then the running serial at
 * that moment. The serial is one counter per financial year, so a number is
 * never reused; the date in front is what the accounts team reads.
 * 16 characters at most, digits and a hyphen only (GST rule 46).
 */
export function formatInvoiceNumber(paidAt: Date, serial: number): string {
  return `${dayKey(paidAt)}-${String(serial).padStart(2, "0")}`;
}

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

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** "021126": the day in DDMMYY, in the given clock (IST by default). The formatter is built once per zone (it is slow to construct). */
export function dayKey(at: Date, timeZone: string = LEGACY_INVOICE_TZ): string {
  let fmt = dayFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "2-digit" });
    dayFormatters.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("day")}${get("month")}${get("year")}`;
}

/**
 * Every legacy number at once: orderId -> { number, paidAtMs }. Same rule as
 * `legacyInvoiceNumber` (group by day, order by paid time then order id, NN is
 * the place in the day) in one pass, instead of re-scanning every payment per
 * invoice. The first ref wins when an order id repeats, as `findIndex` does.
 */
export function legacyInvoiceNumbers(paid: readonly PaidRef[], timeZone = LEGACY_INVOICE_TZ): Map<string, { number: string; paidAtMs: number }> {
  const byDay = new Map<string, { orderId: string; ms: number }[]>();
  for (const p of paid) {
    if (!p.paidAt) continue;
    const ms = new Date(p.paidAt).getTime();
    if (Number.isNaN(ms)) continue;
    const key = dayKey(new Date(ms), timeZone);
    const list = byDay.get(key);
    if (list) list.push({ orderId: p.orderId, ms });
    else byDay.set(key, [{ orderId: p.orderId, ms }]);
  }
  const out = new Map<string, { number: string; paidAtMs: number }>();
  for (const [key, list] of byDay) {
    list.sort((a, b) => a.ms - b.ms || a.orderId.localeCompare(b.orderId));
    list.forEach((p, i) => {
      if (!out.has(p.orderId)) out.set(p.orderId, { number: `${key}-${String(i + 1).padStart(2, "0")}`, paidAtMs: p.ms });
    });
  }
  return out;
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
 * The price column per line, GST included, as on the printed invoice. Lines
 * keep their own price only when those prices add up to what was paid (the
 * stipend line already carries any promo); otherwise they print "Included"
 * and the totals below tell the story. A single line is the whole order.
 */
export function lineRows(
  lines: readonly InvoiceLine[],
  grossMinor: number,
): { label: string; detail?: string | null; priceMinor: number | null }[] {
  if (lines.length === 1) return [{ label: lines[0].label, detail: lines[0].detail, priceMinor: grossMinor }];
  const priced = lines.filter((l) => l.amountMinor != null && l.amountMinor > 0);
  const split = priced.length > 0 && priced.reduce((sum, l) => sum + (l.amountMinor ?? 0), 0) === grossMinor;
  return lines.map((l) => ({
    label: l.label,
    detail: l.detail,
    priceMinor: split && l.amountMinor != null && l.amountMinor > 0 ? l.amountMinor : null,
  }));
}

/** "14-10-26": the invoice date as an Indian date, day-month-year. */
export function invoiceDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\//g, "-");
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
  const dateStr = invoiceDate(input.date);

  // Subtotal, then each tax, then Total: the same rows as the reference invoice (141026-01).
  const taxRows =
    split.mode === "intra"
      ? `<div class="row"><span>CGST 9%</span><span>${m(split.cgstMinor)}</span></div>
         <div class="row"><span>SGST 9%</span><span>${m(split.sgstMinor)}</span></div>`
      : split.mode === "inter"
        ? `<div class="row"><span>IGST 18%</span><span>${m(split.igstMinor)}</span></div>`
        : `<div class="row"><span>GST</span><span>Not applicable</span></div>`;

  const exportNote =
    split.mode === "export"
      ? `<p class="note">Export of services. Supply meant for export without payment of integrated tax.</p>`
      : "";
  const promoNote = input.promo
    ? `<p class="note">Promo ${esc(input.promo.code)} applied${
        input.promo.discountMinor ? `: you saved ${m(input.promo.discountMinor)}, already taken off the prices above` : ""
      }.</p>`
    : "";
  const gstLine = seller.gstin ? `GST: ${esc(seller.gstin)}` : `<span class="warn">GST: not configured</span>`;
  const sac = esc(input.sac ?? "998519");
  const address = buyerAddress(buyer);

  const items = input.lines?.length
    ? lineRows(input.lines, input.amountMinor).map(
        (row) => `<tr>
        <td><div class="item">${esc(row.label)}</div>${row.detail ? `<div class="muted">${esc(row.detail)}</div>` : ""}<div class="muted">SAC ${sac}</div></td>
        <td class="price">${row.priceMinor == null ? "Included" : m(row.priceMinor)}</td>
      </tr>`,
      )
    : [
        `<tr>
        <td><div class="item">${esc(input.description)}</div>${
          input.items?.length ? `<div class="muted">${input.items.map((item) => esc(item)).join("<br />")}</div>` : ""
        }<div class="muted">SAC ${sac}</div></td>
        <td class="price">${m(input.amountMinor)}</td>
      </tr>`,
      ];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${esc(input.invoiceNo)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #fff; line-height: 1.5; }
    .band { background: #07513c; color: #fff; padding: 36px 28px 40px; display: flex; justify-content: space-between; align-items: center; gap: 24px; }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .logo { height: 40px; width: auto; filter: brightness(0) invert(1); flex: none; }
    .seller { font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
    .seller strong { font-size: 14px; }
    .word { font-size: 34px; font-weight: 800; letter-spacing: -0.5px; }
    .body { padding: 36px 28px 28px; }
    .meta { display: flex; justify-content: space-between; gap: 32px; margin-bottom: 32px; }
    .k { font-size: 13px; font-weight: 600; color: #475569; }
    .v { font-size: 15px; margin: 4px 0 16px; overflow-wrap: anywhere; }
    .to { text-align: right; min-width: 0; }
    .to .v { margin-bottom: 2px; }
    .small { font-size: 12px; color: #475569; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #032a1f; color: #fff; text-align: left; padding: 10px 16px; font-size: 12px; letter-spacing: 0.03em; text-transform: uppercase; }
    thead th:last-child { text-align: right; }
    td { padding: 18px 16px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .item { font-size: 15px; font-weight: 500; }
    .muted { font-size: 12px; color: #64748b; }
    .price { text-align: right; font-weight: 700; font-size: 15px; white-space: nowrap; }
    .sum { margin-top: 4px; }
    .row { display: flex; justify-content: space-between; padding: 12px 16px; font-size: 14px; }
    .row:nth-child(even) { background: #f8fafc; }
    .row span:last-child { font-weight: 600; }
    .row.final { font-weight: 700; }
    .note { font-size: 12px; color: #475569; margin: 14px 16px 0; }
    .refs { margin: 20px 16px 0; font-size: 11px; color: #94a3b8; overflow-wrap: anywhere; }
    .warn { color: #fbbf24; }
    .foot { background: #07513c; color: #fff; margin: 12px 28px 28px; border-radius: 0 0 18px 18px; padding: 28px; display: flex; justify-content: space-between; gap: 24px; font-size: 14px; line-height: 1.7; }
    .foot h4 { margin: 0 0 8px; font-size: 13px; letter-spacing: 0.02em; text-transform: uppercase; }
    .foot .r { text-align: right; overflow-wrap: anywhere; }
    @media screen and (max-width: 600px) {
      .band, .meta, .foot { flex-direction: column; align-items: flex-start; }
      .to, .foot .r { text-align: left; }
      .band { padding: 24px 16px; }
      .body { padding: 24px 16px; }
      .foot { margin: 12px 16px 16px; padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="band">
    <div class="brand">
      <img class="logo" src="/logo.png" alt="Findtern" />
      <div class="seller"><strong>${esc(seller.name)}</strong><br />${esc(seller.address)}<br />${gstLine}</div>
    </div>
    <div class="word">INVOICE</div>
  </div>

  <div class="body">
    <div class="meta">
      <div>
        <div class="k">Invoice Date :</div>
        <div class="v">${esc(dateStr)}</div>
        <div class="k">Invoice Number :</div>
        <div class="v">${esc(input.invoiceNo)}</div>
      </div>
      <div class="to">
        <div class="k">Invoice to :</div>
        <div class="v">${esc(buyer.name)}</div>
        ${buyer.email ? `<div class="small">${esc(buyer.email)}</div>` : ""}
        ${address ? `<div class="small">${esc(address)}</div>` : ""}
        ${buyer.pincode?.trim() ? `<div class="small">PIN code: ${esc(buyer.pincode.trim())}</div>` : ""}
        ${buyer.gstin ? `<div class="small">GSTIN: ${esc(buyer.gstin)}</div>` : ""}
        <div class="small">Place of supply: ${esc(placeLabel(buyer.place))}</div>
      </div>
    </div>

    <table>
      <thead><tr><th>Item description</th><th>Price (${esc(currency)})</th></tr></thead>
      <tbody>
      ${items.join("")}
      </tbody>
    </table>

    <div class="sum">
      <div class="row"><span>Subtotal</span><span>${m(split.baseMinor)}</span></div>
      ${taxRows}
      <div class="row final"><span>Total</span><span>${m(split.totalMinor)}</span></div>
    </div>
    ${promoNote}
    ${exportNote}
    <div class="refs">Order ref: ${esc(input.orderId)} · Payment ID: ${esc(input.paymentId || "Captured")}</div>
  </div>

  <div class="foot">
    ${
      seller.bank
        ? `<div>
      <h4>Send payments to:</h4>
      Bank Account No: ${esc(seller.bank.accountNumber)}<br />
      Bank Name: ${esc(seller.bank.bankName)}<br />
      IFSC: ${esc(seller.bank.ifsc)}
    </div>`
        : "<div></div>"
    }
    <div class="r"><h4>Contact</h4>${esc(seller.email)}</div>
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
  // The frame is about:blank: a base lets "/logo.png" resolve to this site.
  const printable = html.replace("<head>", `<head><base href="${location.origin}/" />`);
  doc.write(printable.replace("<title>", `<title>${fileName.replace(/\.pdf$/i, "")} `));
  doc.close();
  await new Promise((r) => setTimeout(r, 150));
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 60_000);
}
