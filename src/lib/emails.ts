/**
 * Transactional emails: one layout, one small content block per event.
 * Copy follows the legacy templates (routes.ts send*Email), which interns and
 * employers already receive today.
 */

export type EmailContent = {
  subject: string;
  heading: string;
  greeting: string;
  lines: string[];
  bullets?: string[];
  facts?: [label: string, value: string][];
  status?: string;
  cta?: { label: string; url: string };
  signoff?: string;
};

const BRAND = "#0E6049";
const SUBTLE = "#6B7280";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function origin(): string {
  return (process.env.PUBLIC_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}

export function renderEmail(c: EmailContent): { subject: string; text: string; html: string } {
  const signoff = c.signoff ?? "Team Findtern\nBuilding trust in internship hiring\nwww.findtern.in";
  const text = [
    c.greeting,
    "",
    ...c.lines,
    ...(c.bullets?.length ? ["", ...c.bullets.map((b) => `- ${b}`)] : []),
    ...(c.facts?.length ? ["", ...c.facts.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.status ? ["", `Status: ${c.status}`] : []),
    ...(c.cta ? ["", `${c.cta.label}: ${c.cta.url}`] : []),
    "",
    `Best,\n${signoff}`,
  ].join("\n");

  const p = (s: string) => `<p style="margin:10px 0 0;font-size:14px;line-height:22px;color:${SUBTLE};">${esc(s)}</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:30px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
<tr><td style="padding:0 4px 14px;font-size:18px;font-weight:900;color:#111827;">Findtern</td></tr>
<tr><td style="background:#fff;border-radius:16px;box-shadow:0 6px 24px rgba(17,24,39,.08);padding:22px 20px;">
<div style="font-size:16px;line-height:22px;font-weight:900;color:#111827;">${esc(c.heading)}</div>
${p(c.greeting)}
${c.lines.map(p).join("\n")}
${c.bullets?.length ? `<ul style="margin:10px 0 0 18px;padding:0;color:${SUBTLE};font-size:14px;line-height:22px;">${c.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
${
  c.facts?.length
    ? `<table role="presentation" style="margin-top:14px;width:100%;font-size:14px;line-height:22px;">${c.facts
        .map(([k, v]) => `<tr><td style="color:${SUBTLE};padding:2px 12px 2px 0;">${esc(k)}</td><td style="color:#111827;font-weight:700;">${esc(v)}</td></tr>`)
        .join("")}</table>`
    : ""
}
${c.status ? `<div style="margin-top:14px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:14px;padding:12px 14px;"><div style="font-size:12px;color:${SUBTLE};">Status</div><div style="margin-top:4px;font-size:14px;font-weight:900;color:#064E3B;">${esc(c.status)}</div></div>` : ""}
${c.cta ? `<div style="margin-top:18px;"><a href="${esc(c.cta.url)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:11px 14px;border-radius:12px;font-weight:800;font-size:13px;">${esc(c.cta.label)}</a></div>` : ""}
<div style="margin-top:18px;font-size:12px;line-height:18px;color:${SUBTLE};">Best,<br>${esc(signoff).replace(/\n/g, "<br>")}</div>
</td></tr>
<tr><td style="padding:14px 6px 0;font-size:12px;color:${SUBTLE};text-align:center;">Sent by Findtern · <a href="${origin()}/contact" style="color:${BRAND};">Contact us</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: c.subject, text, html };
}

/* ── Templates ─────────────────────────────────────────────────────────── */

const hi = (name: string) => `Hi ${name || "there"},`;

export const emails = {
  proposalReceived: (o: { internName: string; companyName: string; role: string; proposalId: string }): EmailContent => ({
    subject: "You’ve received a new internship proposal on Findtern",
    heading: "You’ve received a new proposal",
    greeting: hi(o.internName),
    lines: [`Good news! You’ve received a new internship proposal from ${o.companyName} for the role of ${o.role}.`],
    bullets: ["Review the proposal details carefully", "Accept if it aligns with your goals", "Reject if it’s not the right fit — no pressure, no penalties"],
    status: "Awaiting your response",
    cta: { label: "View proposal", url: `${origin()}/intern/proposals/${o.proposalId}` },
  }),

  proposalDecision: (o: { employerName: string; candidate: string; role: string; accepted: boolean; proposalId: string }): EmailContent => ({
    subject: "Candidate decision update | Findtern",
    heading: o.accepted ? "Your offer was accepted" : "Your offer was declined",
    greeting: hi(o.employerName),
    lines: [
      `${o.candidate} has responded to your proposal for ${o.role}.`,
      o.accepted
        ? "Complete the payment to confirm the hire. Names and contact details unlock once it’s done."
        : "You can send an offer to another candidate from your shortlist.",
    ],
    status: o.accepted ? "Accepted" : "Declined",
    cta: o.accepted
      ? { label: "Go to checkout", url: `${origin()}/employer/checkout` }
      : { label: "View proposal", url: `${origin()}/employer/proposal/${o.proposalId}` },
  }),

  proposalWithdrawn: (o: { internName: string; role: string }): EmailContent => ({
    subject: "Update on a proposal | Findtern",
    heading: "A proposal was withdrawn",
    greeting: hi(o.internName),
    lines: [`The company withdrew its proposal for ${o.role}. Nothing is needed from you.`, "Your profile stays visible to other employers."],
    cta: { label: "See open roles", url: `${origin()}/intern/opportunities` },
  }),

  interviewInvitation: (o: { internName: string; companyName: string; project?: string | null }): EmailContent => ({
    subject: "Interview invitation | Select a time slot on Findtern",
    heading: "You’ve been invited to an interview",
    greeting: hi(o.internName),
    lines: [`You’ve received a meeting invitation from ${o.companyName}${o.project ? ` for ${o.project}` : ""}. They’ve shared a few time slots.`],
    bullets: ["View the available slots", "Select the time that works best for you", "Confirm the meeting"],
    status: "Awaiting your slot selection",
    cta: { label: "Pick a slot", url: `${origin()}/intern/interviews` },
  }),

  meetingScheduled: (o: { name: string; other: string; when: string; link?: string | null; forEmployer: boolean }): EmailContent => ({
    subject: o.forEmployer ? "Meeting scheduled | Candidate confirmed a slot" : "Meeting scheduled successfully | Findtern",
    heading: "Your meeting is scheduled",
    greeting: hi(o.name),
    lines: [o.forEmployer ? "The candidate confirmed a slot." : "Your meeting has been scheduled. Please be available at this time."],
    facts: [[o.forEmployer ? "Candidate" : "Company", o.other], ["When", o.when], ...(o.link ? ([["Meet link", o.link]] as [string, string][]) : [])],
    cta: { label: "Open dashboard", url: `${origin()}/${o.forEmployer ? "employer/schedule" : "intern/interviews"}` },
  }),

  interviewRescheduled: (o: { name: string; byEmployer: boolean }): EmailContent => ({
    subject: "Interview rescheduled | Findtern",
    heading: "An interview was rescheduled",
    greeting: hi(o.name),
    lines: [o.byEmployer ? "The company proposed new time slots. Pick the one that works for you." : "The candidate asked to reschedule. Please propose new slots."],
    cta: { label: "Open dashboard", url: `${origin()}/${o.byEmployer ? "intern/interviews" : "employer/schedule"}` },
  }),

  timesheetSubmitted: (o: { employerName: string; candidate: string; period: string; timesheetId: string }): EmailContent => ({
    subject: "Timesheet submitted for approval | Findtern",
    heading: "A timesheet needs your approval",
    greeting: hi(o.employerName),
    lines: [`${o.candidate} submitted a timesheet for ${o.period}.`],
    cta: { label: "Review timesheet", url: `${origin()}/employer/timesheets/${o.timesheetId}` },
  }),

  employerPaymentReceived: (o: { employerName: string; role: string; amount: string }): EmailContent => ({
    subject: "Payment received successfully | Findtern",
    heading: "We’ve received your payment",
    greeting: hi(o.employerName),
    lines: [`We’ve successfully received your payment for ${o.role}.`, "The process now moves forward as agreed. Updates appear in your dashboard."],
    facts: [["Amount", o.amount]],
    cta: { label: "View orders and invoice", url: `${origin()}/employer/orders` },
    signoff: "Team Findtern\nSecure, transparent hiring\nwww.findtern.in",
  }),

  hireConfirmed: (o: { internName: string; companyName: string; role: string }): EmailContent => ({
    subject: "You’re hired! | Internship confirmed on Findtern",
    heading: "You’re hired",
    greeting: hi(o.internName),
    lines: [
      `Congratulations! You’ve been officially hired for ${o.role} with ${o.companyName}.`,
      "The employer has completed the payment and your engagement is confirmed. They may reach out shortly to begin onboarding.",
    ],
    bullets: ["Engagement details", "Start date and next steps", "Timesheets for your first period"],
    cta: { label: "Open dashboard", url: `${origin()}/intern/dashboard` },
    signoff: "Team Findtern\nTurning opportunities into outcomes\nwww.findtern.in",
  }),

  activationPaid: (o: { internName: string; amount: string }): EmailContent => ({
    subject: "Payment successful | Welcome to Findtern",
    heading: "Your profile is activated",
    greeting: hi(o.internName),
    lines: ["Your Findtern sign-up fee payment has been received. You now have full access to the platform, starting with your AI interview."],
    facts: [["Amount", o.amount]],
    cta: { label: "Open dashboard", url: `${origin()}/intern/dashboard` },
  }),

  stipendTransferred: (o: { internName: string; role: string; amount: string }): EmailContent => ({
    subject: "Stipend transferred successfully | Findtern",
    heading: "Your stipend is on its way",
    greeting: hi(o.internName),
    lines: [
      `Your stipend for ${o.role} has been transferred.`,
      "If you don’t see it in your account right away, allow standard bank processing time.",
    ],
    facts: [["Amount", o.amount]],
    cta: { label: "View payments", url: `${origin()}/intern/earnings` },
    signoff: "Team Findtern\nTransparent payments, zero confusion\nwww.findtern.in",
  }),

  fullTimeOfferReceived: (o: { internName: string; companyName: string; role: string; proposalId: string }): EmailContent => ({
    subject: "Full-time job offer received | Findtern",
    heading: "You have a full-time offer",
    greeting: hi(o.internName),
    lines: [`Congratulations. ${o.companyName} has offered you a full-time position as ${o.role} through Findtern.`],
    bullets: ["Review the full offer carefully", "Accept or decline it from your dashboard"],
    status: "Awaiting your response",
    cta: { label: "View offer", url: `${origin()}/intern/proposals/${o.proposalId}` },
  }),

  fullTimeFeePaid: (o: { employerName: string; candidate: string; role: string; ctc: string; amount: string }): EmailContent => ({
    subject: "Payment confirmation – hiring fee received | Findtern",
    heading: "Hiring fee received",
    greeting: hi(o.employerName),
    lines: [`We’ve received the full-time hiring fee for ${o.candidate}. Thank you for hiring through Findtern.`],
    facts: [["Candidate", o.candidate], ["Role", o.role], ["Annual CTC offered", o.ctc], ["Amount paid", o.amount]],
    cta: { label: "View orders and invoice", url: `${origin()}/employer/orders` },
  }),
};

/** A calendar invite attachment (.ics) for a scheduled meeting. */
export function icsInvite(o: { uid: string; start: Date; end: Date; title: string; description: string; url?: string | null }) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const fold = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Findtern//Interviews//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${o.uid}@findtern.in`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(o.start)}`,
    `DTEND:${stamp(o.end)}`,
    `SUMMARY:${fold(o.title)}`,
    `DESCRIPTION:${fold(o.description)}`,
    ...(o.url ? [`URL:${o.url}`, `LOCATION:${o.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return { filename: "invite.ics", content: body, contentType: "text/calendar; method=REQUEST" };
}
