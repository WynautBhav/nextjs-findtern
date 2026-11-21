import { LUT_NUMBER } from "./gst.ts";
import { formatMoney } from "./format.ts";
import { buyerAddress, type InvoiceSeller } from "./invoice.ts";

/**
 * Export invoice for payroll-managed full-time hires paid from abroad (USD).
 * Pure and client-safe (no env, no DB): the seller block and wire details are
 * resolved on the server (getInvoiceSeller) and passed in. Deliberately its own
 * look, not the green GST template in invoice.ts: this is a zero-rated export
 * of services under LUT, so there are no GST rows and no SAC.
 *
 * Colours are the app tokens (globals.css ink-* / brand-* / accent-*) as hex,
 * because an HTML string cannot reach Tailwind.
 */

export type InvoiceWire = {
  accountName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  swift?: string | null;
  intermediaryBank?: string | null;
  intermediarySwift?: string | null;
  bankAddress?: string | null;
};

export type PayrollInvoiceLine = { label: string; detail?: string | null; amountMinor: number };

export type PayrollInvoiceInput = {
  invoiceNo: string;
  issuedOn: Date;
  /** YYYY-MM-DD */
  dueOn: string;
  /** YYYY-MM-DD each */
  period: { start: string; end: string };
  status: "due" | "paid" | "void";
  paidOn?: Date | null;
  wireReference?: string | null;
  currency: "USD";
  lines: PayrollInvoiceLine[];
  note?: string | null;
  intern: { name: string; role: string };
  seller: InvoiceSeller & { wire?: InvoiceWire | null };
  buyer: { name: string; email?: string | null; city?: string | null; state?: string | null; country?: string | null };
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const clean = (v: string | null | undefined) => String(v ?? "").trim();

const money = (minor: number) => formatMoney(minor, "USD", { zeroLabel: false, decimals: 2 });

const fmtDate = (d: Date, timeZone: string) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).replace(/\bSept\b/g, "Sep");

/** A YYYY-MM-DD string as a calendar date (no timezone shift); anything else is printed as given. */
function ymd(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}
const calendar = (value: string) => {
  const d = ymd(value);
  return d ? fmtDate(d, "UTC") : value;
};

/** "1 – 30 Nov 2026", "28 Oct – 27 Nov 2026", "28 Dec 2026 – 27 Jan 2027". */
export function formatPeriod(start: string, end: string): string {
  const a = ymd(start);
  const b = ymd(end);
  if (!a || !b) return `${start} – ${end}`;
  const part = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" }).replace(/\bSept\b/g, "Sep");
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${fmtDate(a, "UTC")} – ${fmtDate(b, "UTC")}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${part(a, { day: "numeric", month: "short" })} – ${fmtDate(b, "UTC")}`;
  return `${a.getUTCDate()} – ${fmtDate(b, "UTC")}`;
}

const STATUS_LABEL = { due: "Total due", paid: "Total paid", void: "Total (void)" } as const;

export function payrollInvoiceHtml(input: PayrollInvoiceInput): string {
  const { seller, buyer, intern, status } = input;
  const total = input.lines.reduce((sum, l) => sum + l.amountMinor, 0);
  const dueOn = calendar(input.dueOn);
  const address = buyerAddress(buyer);
  const note = clean(input.note);
  const hasDetail = input.lines.some((l) => clean(l.detail));

  const wire = seller.wire ?? null;
  const wireRows: [string, string][] = wire
    ? ([
        ["Account name", clean(wire.accountName)],
        ["Bank", clean(wire.bankName)],
        ["Account number", clean(wire.accountNumber)],
        ["SWIFT / BIC", clean(wire.swift)],
        ["Bank address", clean(wire.bankAddress)],
        ["Intermediary bank", clean(wire.intermediaryBank)],
        ["Intermediary SWIFT", clean(wire.intermediarySwift)],
        ["Payment reference", input.invoiceNo],
      ] as [string, string][]).filter(([, v]) => v)
    : [];
  const showWire = status !== "void" && !!wire && (!!clean(wire.swift) || !!clean(wire.accountNumber));

  const rows = input.lines
    .map(
      (l) => `<tr>
        <td class="desc">${esc(l.label)}</td>
        ${hasDetail ? `<td class="det">${esc(clean(l.detail))}</td>` : ""}
        <td class="amt">${money(l.amountMinor)}</td>
      </tr>`,
    )
    .join("");

  const stamp =
    status === "paid"
      ? `<div class="stamp paid" role="status"><b>Paid</b><span>${input.paidOn ? esc(fmtDate(input.paidOn, "Asia/Kolkata")) : ""}${
          clean(input.wireReference) ? `${input.paidOn ? " · " : ""}Ref ${esc(clean(input.wireReference))}` : ""
        }</span></div>`
      : status === "void"
        ? `<div class="stamp void" role="status"><b>Void</b><span>This invoice is cancelled</span></div>`
        : "";

  const gstin = clean(seller.gstin);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice ${esc(input.invoiceNo)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0; background: #dee6e2; color: #0f1a17; line-height: 1.5; font-size: 14px;
      font-family: Poppins, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-variant-numeric: tabular-nums lining-nums;
    }
    ::selection { background: #f5bb63; color: #0b1512; }
    .serif { font-family: Fraunces, Newsreader, "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif; }
    .sheet { position: relative; width: 100%; max-width: 210mm; min-height: 296mm; margin: 0 auto; background: #fff; display: flex; flex-direction: column; }

    .top { background: #0b1512; color: #fff; padding: 44px 48px 40px; display: flex; justify-content: space-between; align-items: flex-end; gap: 32px; border-bottom: 4px solid #f0b24a; }
    .word { font-size: 34px; line-height: 1; letter-spacing: -0.02em; font-weight: 500; }
    .seller { margin: 18px 0 0; font-style: normal; font-size: 12px; line-height: 1.6; color: #b9d7cc; overflow-wrap: anywhere; }
    .seller strong { color: #fff; font-weight: 600; }
    .doc { text-align: right; }
    .doc h1 { margin: 0; font-size: 15px; font-weight: 500; letter-spacing: 0.01em; color: #f0b24a; }
    .doc .no { margin: 6px 0 0; font-size: 26px; line-height: 1.1; letter-spacing: -0.01em; overflow-wrap: anywhere; }

    main { padding: 40px 48px 0; flex: 1; }
    .k { margin: 0 0 4px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.01em; color: #4e5f58; }
    .v { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
    .intro { display: grid; grid-template-columns: 46% 1fr; gap: 0; }
    .to .name { font-size: 18px; font-weight: 600; line-height: 1.3; margin: 0 0 4px; color: #0f1a17; overflow-wrap: anywhere; }
    .to p { margin: 0; color: #33433d; font-size: 13px; overflow-wrap: anywhere; }
    .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px; align-content: start; }
    .dates .wide { grid-column: 1 / -1; }

    .subject { margin: 44px 0 14px; font-size: 22px; line-height: 1.25; font-weight: 400; letter-spacing: -0.01em; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; padding: 0 0 10px; font-size: 11.5px; font-weight: 600; color: #4e5f58; border-bottom: 2px solid #0b1512; }
    th.amt, td.amt { text-align: right; padding-left: 16px; white-space: nowrap; }
    td { padding: 16px 0; border-bottom: 1px solid #dee6e2; vertical-align: top; }
    td.desc { font-weight: 600; padding-right: 16px; overflow-wrap: anywhere; }
    .lines.wide td.desc, .lines.wide th:first-child { width: 46%; }
    td.det { color: #33433d; padding-right: 16px; overflow-wrap: anywhere; }
    td.amt { font-weight: 500; }
    tr { break-inside: avoid; }

    .close { display: flex; justify-content: space-between; align-items: flex-start; gap: 40px; margin-top: 28px; break-inside: avoid; }
    .export { max-width: 340px; text-wrap: balance; font-size: 12px; line-height: 1.6; color: #33433d; }
    .export p { margin: 0; }
    .export .lut { margin-top: 6px; color: #0f1a17; font-weight: 600; }
    .total { text-align: right; position: relative; }
    .total .k { margin-bottom: 2px; }
    .total .sum { font-size: 46px; line-height: 1.05; letter-spacing: -0.02em; font-weight: 500; white-space: nowrap; padding-top: 14px; border-top: 3px solid #d8973a; }
    .void .total .sum { color: #5a6b63; text-decoration: line-through; text-decoration-thickness: 2px; }
    .cur { font-family: Poppins, Inter, sans-serif; font-size: 12px; font-weight: 600; color: #4e5f58; letter-spacing: 0.04em; margin-left: 6px; }

    .stamp { display: inline-block; margin: 0 0 14px; padding: 6px 14px 7px; border: 2px solid currentColor; border-radius: 3px; transform: rotate(-3deg); text-align: center; line-height: 1.25; }
    .stamp b { display: block; font-size: 18px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; }
    .stamp span { display: block; font-size: 11.5px; font-weight: 600; overflow-wrap: anywhere; }
    .stamp.paid { color: #0e6049; }
    .stamp.void { color: #9b1c1c; }
    .sheet.void .lines td, .sheet.void .subject { color: #5a6b63; }

    .wire { margin-top: 36px; padding: 22px 26px 24px; background: #edf2ef; break-inside: avoid; }
    .wire h2, .terms h2 { margin: 0 0 12px; font-size: 13px; font-weight: 600; }
    .wire dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 32px; }
    .wire dd { margin: 0; font-size: 13.5px; font-weight: 500; overflow-wrap: anywhere; }
    .wire .ref dd { font-weight: 700; }
    .terms { margin-top: 24px; font-size: 13px; color: #33433d; break-inside: avoid; }
    .terms p { margin: 0; }
    .terms strong { color: #0f1a17; font-weight: 600; }
    .terms .memo { margin-top: 10px; }

    footer { margin-top: 40px; padding: 18px 48px 26px; border-top: 1px solid #dee6e2; display: flex; justify-content: space-between; gap: 24px; font-size: 11.5px; color: #4e5f58; }
    footer span { overflow-wrap: anywhere; }

    @media screen and (max-width: 640px) {
      .sheet { min-height: 0; }
      .top { padding: 28px 20px 26px; flex-direction: column; align-items: flex-start; gap: 24px; }
      .doc { text-align: left; }
      main { padding: 28px 20px 0; }
      .intro { grid-template-columns: 1fr; gap: 24px; }
      .lines.wide td.desc { width: auto; }
      .subject { margin-top: 32px; font-size: 19px; }
      thead { display: none; }
      tr { display: grid; grid-template-columns: 1fr auto; column-gap: 16px; padding: 14px 0; border-bottom: 1px solid #dee6e2; }
      td { border: 0; padding: 0; }
      td.desc { grid-column: 1 / -1; width: auto; padding: 0; }
      td.det { grid-column: 1; padding: 2px 0 0; font-size: 13px; }
      td.amt { grid-column: 2; grid-row: 2; padding: 2px 0 0; }
      tr:not(:has(td.det)) td.amt { grid-row: 1; grid-column: 2; }
      tr:not(:has(td.det)) td.desc { grid-column: 1; }
      .close { flex-direction: column-reverse; gap: 24px; }
      .total { text-align: left; width: 100%; }
      .total .sum { font-size: 40px; }
      .export { max-width: none; }
      .wire { padding: 20px; }
      .wire dl { grid-template-columns: 1fr; gap: 12px; }
      footer { padding: 16px 20px 22px; flex-direction: column; gap: 4px; }
    }
    @media print {
      body { background: #fff; }
      .sheet { max-width: none; }
    }
  </style>
</head>
<body>
  <div class="sheet${status === "void" ? " void" : ""}">
    <header class="top">
      <div>
        <div class="word serif">Findtern</div>
        <address class="seller"><strong>${esc(seller.name)}</strong><br />${esc(seller.address)}<br />${
          gstin ? `GSTIN ${esc(gstin)} · ` : ""
        }${esc(seller.email)}</address>
      </div>
      <div class="doc">
        <h1>Invoice</h1>
        <p class="no serif">${esc(input.invoiceNo)}</p>
      </div>
    </header>

    <main>
      <section class="intro" aria-label="Invoice details">
        <div class="to">
          <p class="k">Billed to</p>
          <p class="name">${esc(buyer.name)}</p>
          ${clean(buyer.email) ? `<p>${esc(clean(buyer.email))}</p>` : ""}
          ${address ? `<p>${esc(address)}</p>` : ""}
        </div>
        <div class="dates">
          <div><p class="k">Issued</p><p class="v">${esc(fmtDate(input.issuedOn, "Asia/Kolkata"))}</p></div>
          <div><p class="k">Due</p><p class="v">${esc(dueOn)}</p></div>
          <div class="wide"><p class="k">Service period</p><p class="v">${esc(formatPeriod(input.period.start, input.period.end))}</p></div>
        </div>
      </section>

      <h2 class="subject serif">Payroll for ${esc(intern.name)}, ${esc(intern.role)}</h2>
      <table class="lines${hasDetail ? " wide" : ""}">
        <thead><tr><th>Description</th>${hasDetail ? "<th>Detail</th>" : ""}<th class="amt">Amount (USD)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <section class="close">
        <div class="export">
          <p>Export of services under LUT without payment of IGST</p>
          <p class="lut">LUT No.: ${esc(LUT_NUMBER)}</p>
        </div>
        <div class="total">
          ${stamp}
          <p class="k">${STATUS_LABEL[status]}</p>
          <div class="sum serif">${money(total)}<span class="cur">USD</span></div>
        </div>
      </section>

      ${
        showWire
          ? `<section class="wire" aria-label="Wire instructions">
        <h2>Pay by international wire</h2>
        <dl>${wireRows
          .map(([k, v]) => `<div${k === "Payment reference" ? ' class="ref"' : ""}><dt class="k">${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
          .join("")}</dl>
      </section>`
          : ""
      }

      <section class="terms">
        ${
          status === "void"
            ? `<p><strong>Cancelled.</strong> This invoice is void and nothing is payable against it.</p>`
            : status === "due"
              ? `<p><strong>Due by ${esc(dueOn)}.</strong> Please quote ${esc(input.invoiceNo)} as the payment reference.</p>`
              : ""
        }
        ${note ? `<p class="memo">${esc(note)}</p>` : ""}
      </section>
    </main>

    <footer>
      <span>${esc(seller.name)}${gstin ? ` · GSTIN ${esc(gstin)}` : ""}</span>
      <span>Questions about this invoice: ${esc(seller.email)}</span>
    </footer>
  </div>
</body>
</html>`;
}
