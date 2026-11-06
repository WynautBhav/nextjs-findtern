/**
 * Transactional emails: one layout, one small content block per event.
 * Copy follows the legacy templates (routes.ts send*Email), which interns and
 * employers already receive today.
 */

import { AI_INTERVIEW_INSTRUCTIONS } from "./ai-interview.ts";
import { requirePublicOrigin } from "./origin.ts";

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
  return requirePublicOrigin();
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
    bullets: ["Review the proposal details carefully", "Accept if it aligns with your goals", "You can turn down up to 3 offers; a 4th decline or lapse ends the refund guarantee"],
    status: "Awaiting your response",
    cta: { label: "View proposal", url: `${origin()}/intern/proposals/${o.proposalId}` },
  }),

  proposalDecision: (o: { employerName: string; candidate: string; role: string; accepted: boolean; proposalId: string; fullTime?: boolean }): EmailContent => ({
    subject: o.fullTime ? "Full-time offer update | Findtern" : "Candidate decision update | Findtern",
    heading: o.fullTime
      ? o.accepted
        ? "Your full-time offer was accepted"
        : "Your full-time offer was declined"
      : o.accepted
        ? "Your offer was accepted"
        : "Your offer was declined",
    greeting: hi(o.employerName),
    lines: [
      `${o.candidate} has responded to your ${o.fullTime ? "full-time offer" : "proposal"} for ${o.role}.`,
      o.accepted
        ? o.fullTime
          ? "Complete the full-time hiring fee (8.33% of the annual CTC) to confirm the joining."
          : "Complete the payment to confirm the hire. Names and contact details unlock once it’s done."
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

  /** Staff closed an offer. Neutral: it was not the company withdrawing. */
  proposalClosed: (o: { internName: string; role: string }): EmailContent => ({
    subject: "Update on an offer | Findtern",
    heading: "An offer was closed",
    greeting: hi(o.internName),
    lines: [`The offer for ${o.role} has been closed by the Findtern team. Nothing is needed from you.`, "Your profile stays visible to other employers."],
    cta: { label: "See your offers", url: `${origin()}/intern/proposals` },
  }),

  interviewInvitation: (o: { internName: string; companyName: string; project?: string | null; slots?: string[]; timezone?: string }): EmailContent => ({
    subject: "Interview invitation | Select a time slot on Findtern",
    heading: "You’ve been invited to an interview",
    greeting: hi(o.internName),
    lines: [
      `You’ve received a meeting invitation from ${o.companyName}${o.project ? ` for ${o.project}` : ""}.`,
      o.slots?.length
        ? `Pick one of these times${o.timezone ? ` (${o.timezone})` : ""}:`
        : "They’ve shared a few time slots.",
    ],
    bullets: o.slots?.length ? o.slots : ["View the available slots", "Select the time that works best for you", "Confirm the meeting"],
    status: "Awaiting your slot selection",
    cta: { label: "Pick a slot", url: `${origin()}/intern/interviews` },
  }),

  meetingScheduled: (o: { name: string; other: string; when: string; link?: string | null; forEmployer: boolean }): EmailContent => ({
    subject: o.forEmployer ? "Meeting scheduled | Candidate confirmed a slot" : "Meeting scheduled successfully | Findtern",
    heading: "Your meeting is scheduled",
    greeting: hi(o.name),
    lines: [
      o.forEmployer ? "The candidate confirmed a slot." : "Your meeting has been scheduled. Please be available at this time.",
      ...(o.link ? [] : ["The meeting link will follow by email."]),
    ],
    facts: [[o.forEmployer ? "Candidate" : "Company", o.other], ["When", o.when], ...(o.link ? ([["Meet link", o.link]] as [string, string][]) : [])],
    cta: { label: "Open dashboard", url: `${origin()}/${o.forEmployer ? "employer/schedule" : "intern/interviews"}` },
  }),

  /** Findtern added the meeting link by hand; no company name, the intern may not see it yet. */
  interviewLinkReady: (o: { name: string; link: string; forEmployer: boolean }): EmailContent => ({
    subject: "Your interview link is ready | Findtern",
    heading: "Your interview link is ready",
    greeting: hi(o.name),
    lines: ["The meeting link for your interview has been added."],
    facts: [["Meet link", o.link]],
    cta: { label: "Open dashboard", url: `${origin()}/${o.forEmployer ? "employer/schedule" : "intern/interviews"}` },
  }),

  aiInterviewLinkReady: (o: { name: string; link: string }): EmailContent => ({
    subject: "Your AI interview link is ready | Findtern",
    heading: "Your AI interview link is ready",
    greeting: hi(o.name),
    lines: ["Your AI interview is open. Before you start:", ...AI_INTERVIEW_INSTRUCTIONS],
    facts: [["Interview link", o.link]],
    cta: { label: "Start AI interview", url: o.link },
  }),

  interviewRescheduled: (o: { name: string }): EmailContent => ({
    subject: "Interview rescheduled | Findtern",
    heading: "An interview was rescheduled",
    greeting: hi(o.name),
    lines: ["The company proposed new time slots. Pick the one that works for you."],
    cta: { label: "Open dashboard", url: `${origin()}/intern/interviews` },
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

  completionBonusPaid: (o: { internName: string; role: string; amount: string }): EmailContent => ({
    subject: "Completion bonus transferred | Findtern",
    heading: "Your completion bonus is on its way",
    greeting: hi(o.internName),
    lines: [
      `Congratulations on completing ${o.role}. Your Findtern completion bonus has been transferred.`,
      "If you don’t see it in your account right away, allow standard bank processing time.",
    ],
    facts: [["Amount", o.amount]],
    cta: { label: "View earnings", url: `${origin()}/intern/earnings` },
    signoff: "Team Findtern\nTransparent payments, zero confusion\nwww.findtern.in",
  }),

  collegeSeatsPaid: (o: { collegeName: string; seats: number; amount: string; cap: number }): EmailContent => ({
    subject: "Seat payment received | Findtern",
    heading: "Your seats are active",
    greeting: hi(o.collegeName),
    lines: [`We have received your payment for ${o.seats} seats. Your college code now covers ${o.cap} students.`],
    facts: [
      ["Seats added", String(o.seats)],
      ["Amount", o.amount],
      ["Total seats", String(o.cap)],
    ],
    cta: { label: "View seats and invoice", url: `${origin()}/college/seats` },
    signoff: "Team Findtern\nTransparent payments, zero confusion\nwww.findtern.in",
  }),

  collegePayoutRequested: (o: { collegeName: string; amount: string }): EmailContent => ({
    subject: `Payout requested: ${o.collegeName} | Findtern`,
    heading: "A college asked for a payout",
    greeting: "Hi team,",
    lines: [`${o.collegeName} has requested a withdrawal from its Findtern wallet.`],
    facts: [
      ["College", o.collegeName],
      ["Amount", o.amount],
    ],
    cta: { label: "Review in admin", url: `${origin()}/admin/colleges` },
  }),

  collegePayoutPaid: (o: { collegeName: string; amount: string; referenceId: string }): EmailContent => ({
    subject: "Payout sent | Findtern",
    heading: "Your payout is on its way",
    greeting: hi(o.collegeName),
    lines: [
      "Your withdrawal request has been paid out to the bank account on file.",
      "If you don’t see it right away, allow standard bank processing time.",
    ],
    facts: [
      ["Amount", o.amount],
      ["Reference", o.referenceId],
    ],
    cta: { label: "View earnings", url: `${origin()}/college/earnings` },
    signoff: "Team Findtern\nTransparent payments, zero confusion\nwww.findtern.in",
  }),

  collegePayoutRejected: (o: { collegeName: string; amount: string; reason: string }): EmailContent => ({
    subject: "Payout request not approved | Findtern",
    heading: "Your payout request was not approved",
    greeting: hi(o.collegeName),
    lines: ["Nothing was debited, and the amount is available in your wallet again.", `Reason: ${o.reason}`],
    facts: [["Amount", o.amount]],
    cta: { label: "View earnings", url: `${origin()}/college/earnings` },
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

  /** Signup code. Employers get the legacy "company email" wording. */
  otp: (o: { otp: string; ttlMinutes: number; forEmployer: boolean }): EmailContent => ({
    subject: o.forEmployer ? "Verify your company email | Findtern" : "Verify your Findtern email",
    heading: o.forEmployer ? "Verify your company email" : "Verify your email",
    greeting: hi(""),
    lines: [
      o.forEmployer
        ? "Use the code below to confirm your company email address on Findtern."
        : "Use the code below to confirm your Findtern email address.",
      `This code expires in ${o.ttlMinutes} minutes. If you did not request it, you can ignore this email.`,
    ],
    facts: [["Verification code", o.otp]],
  }),

  passwordReset: (o: { url: string; ttlMinutes: number }): EmailContent => ({
    subject: "Reset your Findtern password",
    heading: "Reset your password",
    greeting: hi(""),
    lines: [
      "We received a request to reset your Findtern password.",
      `The link works once and expires in ${o.ttlMinutes} minutes. If you did not ask for this, you can ignore this email and your password stays the same.`,
    ],
    cta: { label: "Reset password", url: o.url },
  }),
  /** `dueOn` is a readable date. "due" covers the due day and the 2 days after, so only say "today" when it is. */
  paymentReminder: (o: { name: string; type: "upcoming" | "due" | "overdue"; k: number; amount: string; dueOn: string; dueToday?: boolean; intern: string }): EmailContent => {
    const today = o.type === "due" && o.dueToday !== false;
    const title = {
      upcoming: `Month ${o.k} charge of ${o.amount} is due on ${o.dueOn}`,
      due: today ? `Month ${o.k} charge of ${o.amount} is due today` : `Month ${o.k} charge of ${o.amount} was due on ${o.dueOn}`,
      overdue: `Month ${o.k} charge of ${o.amount} is overdue`,
    }[o.type];
    return {
      subject: `${title} | Findtern`,
      heading: title,
      greeting: hi(o.name),
      lines: [
        o.type === "upcoming"
          ? `This is a reminder that the month ${o.k} charge of ${o.amount} for ${o.intern} falls due on ${o.dueOn}. You can pay it now.`
          : `The month ${o.k} charge of ${o.amount} for ${o.intern} ${today ? "is due today" : `was due on ${o.dueOn} and is still unpaid`}.`,
        `We would be grateful if you could pay ${o.type === "upcoming" ? `by ${o.dueOn}` : today ? "today" : "as soon as you can"}. Thank you.`,
      ],
      facts: [["Intern", o.intern], ["Month", String(o.k)], ["Amount", o.amount], ["Due on", o.dueOn]],
      status: o.type === "overdue" ? "Overdue" : o.type === "due" ? (today ? "Due today" : "Past due") : "Due soon",
      cta: { label: "Pay now", url: `${origin()}/employer/checkout` },
    };
  },
};

/** A calendar invite attachment (.ics) for a scheduled meeting. */
/**
 * A calendar file for ONE recipient. Interviews send each side its own file
 * (uid suffixed per party) with no attendee list, so neither party learns the
 * other's email and the intern's copy can keep the company masked. `cancel`
 * withdraws a previously sent copy with the same uid; `sequence` must grow
 * for a later file to replace an earlier one.
 */
export function icsInvite(o: {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description: string;
  url?: string | null;
  cancel?: boolean;
  sequence?: number;
}) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const fold = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const method = o.cancel ? "CANCEL" : "REQUEST";
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Findtern//Interviews//EN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${o.uid}@findtern.in`,
    `SEQUENCE:${o.sequence ?? 0}`,
    ...(o.cancel ? ["STATUS:CANCELLED"] : []),
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(o.start)}`,
    `DTEND:${stamp(o.end)}`,
    `SUMMARY:${fold(o.title)}`,
    `DESCRIPTION:${fold(o.description)}`,
    ...(o.url ? [`URL:${o.url}`, `LOCATION:${o.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return { filename: o.cancel ? "cancel.ics" : "invite.ics", content: body, contentType: `text/calendar; method=${method}` };
}
