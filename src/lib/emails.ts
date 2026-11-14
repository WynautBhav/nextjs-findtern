/**
 * Transactional emails: one layout, one small content block per event.
 * Copy follows the legacy templates (routes.ts send*Email), which interns and
 * employers already receive today.
 *
 * Layout rules (email clients are 2005-era HTML): tables, inline styles, a
 * 600px column that goes fluid on phones, a bulletproof button, and one small
 * <style> block that only adds media queries and dark mode (Gmail may drop it;
 * the inline styles stand alone).
 */

import { AI_INTERVIEW_INSTRUCTIONS } from "./ai-interview.ts";
import { linkTo, requirePublicOrigin } from "./origin.ts";

/** Meaning of the status pill: waiting on someone, finished, overdue/at risk, or just information. */
export type EmailTone = "wait" | "done" | "alert" | "neutral";

export type EmailContent = {
  subject: string;
  /** Hidden inbox preview line: a useful summary, not the subject again. Falls back to the first body line. */
  preheader?: string;
  heading: string;
  greeting: string;
  lines: string[];
  bullets?: string[];
  /** A short code (OTP) shown large in its own panel, with a note under it. */
  code?: { value: string; note: string };
  facts?: [label: string, value: string][];
  status?: string;
  /** Pill colour by meaning. Defaults to "wait". */
  tone?: EmailTone;
  cta?: { label: string; url: string };
  /** Why this person got the mail, when "you have a Findtern account" is not true. */
  reason?: string;
};

const BRAND = "#0e6049";
const INK = "#0f1a17";
const BODY = "#33433d";
const MUTED = "#4e5f58";
const LINE = "#dee6e2";
const FONT = "Poppins,'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif";

/** Pill colours: [background, text, border]. Text is at least 4.5:1 on its own background. */
const TONES: Record<EmailTone, [string, string, string]> = {
  wait: ["#fdf3e0", "#8f5a1f", "#fae4bd"],
  done: ["#f0f7f4", "#0a4a39", "#b9d7cc"],
  alert: ["#fdeceb", "#b3261e", "#f5c6c3"],
  neutral: ["#edf2ef", "#33433d", "#dee6e2"],
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Throws without PUBLIC_ORIGIN in production. Only renderEmail uses it (notify() catches it): templates must not. */
export function origin(): string {
  return requirePublicOrigin();
}

/**
 * A button to `path` on the public origin, or none when there is no origin. Templates run
 * as call arguments, after the write they report has committed: a throw here is a 500 on a
 * saved action. No origin costs the email's link (renderEmail then refuses the whole mail
 * inside notify's try), never the action.
 */
function ctaTo(label: string, path: string): EmailContent["cta"] {
  const url = linkTo(path);
  return url === null ? undefined : { label, url };
}

const isUrl = (v: string) => /^https?:\/\/\S+$/.test(v);
const isMoney = (v: string) => /^[₹$]/.test(v.trim());

/** The <style> block: phone fit and dark mode only. Everything else is inline. */
const STYLE = `
@media (max-width:620px){
.px{padding-left:20px!important;padding-right:20px!important}
.h1{font-size:22px!important;line-height:30px!important}
.btn{width:100%!important}
.code{font-size:32px!important}
}
/* Phones only: facts stack label over value (a right-aligned value that wraps reads as a ragged edge). */
@media (max-width:480px){
.fr{display:block!important;border-bottom:1px solid #dee6e2!important}
.fk{display:block!important;width:auto!important;padding:12px 0 0!important;border-bottom:0!important}
.fv{display:block!important;width:auto!important;text-align:left!important;padding:2px 0 12px!important;border-bottom:0!important}
}
.logo-dark{display:none;max-height:0;overflow:hidden;mso-hide:all}
@media (prefers-color-scheme:dark){
.fr{border-color:#0a4a39!important}
.bg-page{background-color:#041d17!important}
.bg-card{background-color:#072f24!important;border-color:#0a4a39!important}
.t-ink{color:#f7faf9!important}
.t-body{color:#dee6e2!important}
.t-muted{color:#b9d7cc!important}
.t-link{color:#8cbaa9!important}
.line{border-color:#0a4a39!important}
.amt{color:#f5bb63!important}
.btn-cell{background-color:#2e7d66!important}
.panel{background-color:#041d17!important;border-color:#0a4a39!important}
.pill-wait{background-color:#3b2b0f!important;color:#f7ce8e!important;border-color:#5a4116!important}
.pill-done{background-color:#0a4a39!important;color:#dcebe5!important;border-color:#166b54!important}
.pill-alert{background-color:#3d1613!important;color:#f4b4af!important;border-color:#6b2420!important}
.pill-neutral{background-color:#1e2b26!important;color:#dee6e2!important;border-color:#33433d!important}
.logo-light{display:none!important}
.logo-dark{display:block!important;max-height:none!important;overflow:visible!important}
}`;

export function renderEmail(c: EmailContent): { subject: string; text: string; html: string } {
  const site = esc(origin()); // env, not user input; escaped anyway so every interpolation is
  const host = new URL(site).host;
  const reason = c.reason ?? "You’re receiving this because you have a Findtern account.";
  const text = [
    c.heading,
    "",
    c.greeting,
    "",
    ...c.lines,
    ...(c.bullets?.length ? ["", ...c.bullets.map((b) => `- ${b}`)] : []),
    ...(c.code ? ["", `Verification code: ${c.code.value}`, c.code.note] : []),
    ...(c.facts?.length ? ["", ...c.facts.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.status ? ["", `Status: ${c.status}`] : []),
    ...(c.cta ? ["", `${c.cta.label}: ${c.cta.url}`] : []),
    "",
    "Best,\nTeam Findtern",
    "",
    `--\nFindtern\n${reason}\nContact: ${site}/contact\n${site}`,
  ].join("\n");

  const p = (s: string, strong = false) =>
    `<p class="${strong ? "t-ink" : "t-body"}" style="margin:16px 0 0;font-size:16px;line-height:26px;color:${strong ? INK : BODY};word-break:break-word;overflow-wrap:anywhere;">${esc(s)}</p>`;

  const bullets = c.bullets?.length
    ? `<ul class="t-body" style="margin:16px 0 0;padding:0 0 0 22px;font-size:16px;line-height:26px;color:${BODY};">${c.bullets
        .map((b) => `<li style="margin:0 0 6px;padding:0;word-break:break-word;overflow-wrap:anywhere;">${esc(b)}</li>`)
        .join("")}</ul>`
    : "";

  const code = c.code
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr><td class="panel" align="center" bgcolor="#f0f7f4" style="background-color:#f0f7f4;border:1px solid #b9d7cc;border-radius:12px;padding:24px 16px;">
<div class="code t-ink" style="font-size:36px;line-height:44px;font-weight:600;letter-spacing:0.2em;padding-left:0.2em;color:#072f24;font-variant-numeric:tabular-nums;">${esc(c.code.value)}</div>
<div class="t-muted" style="margin-top:12px;font-size:14px;line-height:22px;color:${MUTED};">${esc(c.code.note)}</div>
</td></tr></table>`
    : "";

  const facts = c.facts?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="line" style="margin-top:24px;border-top:1px solid ${LINE};">${c.facts
        .map(([k, v]) => {
          const value = isUrl(v)
            ? `<a class="t-link" href="${esc(v)}" style="color:${BRAND};font-weight:400;text-decoration:underline;word-break:break-all;">${esc(v)}</a>`
            : isMoney(v)
              ? `<span class="amt" style="font-size:18px;line-height:26px;color:${BRAND};">${esc(v)}</span>`
              : esc(v);
          return `<tr class="fr"><td class="fk line t-muted" valign="top" style="width:38%;padding:12px 16px 12px 0;word-break:break-word;overflow-wrap:anywhere;border-bottom:1px solid ${LINE};font-size:15px;line-height:24px;color:${MUTED};">${esc(k)}</td><td class="fv line t-ink" align="right" valign="top" style="padding:12px 0;border-bottom:1px solid ${LINE};font-size:15px;line-height:24px;font-weight:600;color:${INK};text-align:right;word-break:break-word;overflow-wrap:anywhere;font-variant-numeric:tabular-nums;">${value}</td></tr>`;
        })
        .join("")}</table>`
    : "";

  const tone = c.tone ?? "wait";
  const [pillBg, pillFg, pillBorder] = TONES[tone];
  const status = c.status
    ? `<p class="t-muted" style="margin:20px 0 0;font-size:15px;line-height:28px;color:${MUTED};">Status&nbsp;&nbsp;<span class="pill-${tone}" style="display:inline-block;padding:2px 12px;border:1px solid ${pillBorder};border-radius:999px;background-color:${pillBg};font-size:14px;line-height:22px;font-weight:600;color:${pillFg};">${esc(c.status)}</span></p>`
    : "";

  const cta = c.cta
    ? `<table role="presentation" class="btn" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;"><tr><td class="btn-cell" align="center" bgcolor="${BRAND}" style="background-color:${BRAND};border-radius:10px;mso-padding-alt:14px 28px;"><a href="${esc(c.cta.url)}" style="display:block;padding:14px 28px;font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;text-align:center;">${esc(c.cta.label)}</a></td></tr></table>
<p class="t-muted" style="margin:16px 0 0;font-size:13px;line-height:20px;color:${MUTED};">If the button does not work, copy this link into your browser:<br><a class="t-link" href="${esc(c.cta.url)}" style="color:${BRAND};text-decoration:underline;word-break:break-all;">${esc(c.cta.url)}</a></p>`
    : "";

  const preheaderText = c.preheader ?? c.lines[0];
  const preheader = preheaderText
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheaderText)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";

  // "...in your notification settings: <url>" reads as a link, not a pasted address. The text part keeps the full URL.
  const settings = reason.match(/^([\s\S]*?)\bnotification settings:\s*(https?:\/\/\S+)$/);
  const reasonHtml = settings
    ? `${esc(settings[1])}<a class="t-link" href="${esc(settings[2])}" style="color:${BRAND};text-decoration:underline;">notification settings</a>.`
    : esc(reason);

  const logoStyle = `display:block;border:0;outline:none;text-decoration:none;font-family:${FONT};font-size:24px;line-height:42px;font-weight:600;color:${BRAND};`;
  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><meta name="x-apple-disable-message-reformatting"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${esc(c.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&amp;display=swap" rel="stylesheet">
<style>${STYLE}</style></head>
<body class="bg-page" style="margin:0;padding:0;background-color:#edf2ef;font-family:${FONT};-webkit-text-size-adjust:100%;">
${preheader}
<table role="presentation" class="bg-page" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#edf2ef;"><tr><td align="center" style="padding:28px 12px;font-family:${FONT};">
<!--[if mso]><table role="presentation" width="600" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
<tr><td style="padding:0 4px 20px;"><a href="${site}" style="text-decoration:none;"><img class="logo-light" src="${site}/media/findtern-email-logo.png" width="140" height="42" alt="Findtern" style="${logoStyle}"><img class="logo-dark" src="${site}/media/findtern-email-logo-white.png" width="140" height="42" alt="Findtern" style="display:none;max-height:0;overflow:hidden;mso-hide:all;border:0;font-family:${FONT};font-size:24px;line-height:42px;font-weight:600;color:#f7faf9;"></a></td></tr>
<tr><td class="bg-card px" align="left" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:36px 32px;font-family:${FONT};">
<h1 class="h1 t-ink" style="margin:0;font-size:24px;line-height:32px;font-weight:600;color:${INK};word-break:break-word;overflow-wrap:anywhere;">${esc(c.heading)}</h1>
${p(c.greeting, true)}
${c.lines.map((l) => p(l)).join("\n")}
${bullets}
${code}
${facts}
${status}
${cta}
<p class="t-body" style="margin:32px 0 0;font-size:16px;line-height:26px;color:${BODY};">Best,<br>Team Findtern</p>
</td></tr>
<tr><td class="t-muted" style="padding:20px 4px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};"><strong class="t-ink" style="color:${INK};font-weight:600;">Findtern</strong><br>${reasonHtml}<br><a class="t-link" href="${site}/contact" style="color:${BRAND};text-decoration:underline;">Contact us</a> &nbsp;·&nbsp; <a class="t-link" href="${site}" style="color:${BRAND};text-decoration:underline;">${esc(host)}</a></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { subject: c.subject, text, html };
}

/* ── Templates ─────────────────────────────────────────────────────────── */

const INTERNAL_REASON = "This is an internal alert from the Findtern platform.";

const hi = (name: string) => `Hi ${name || "there"},`;

export const emails = {
  /** Sent once per thread when messages sit unread. Generic on purpose: no sender name, no message text. */
  unreadMessages: (o: { name: string; count: number; from: "an employer" | "a candidate"; url: string; settingsUrl: string }): EmailContent => ({
    subject: o.count === 1 ? "You have an unread message on Findtern" : `You have ${o.count} unread messages on Findtern`,
    preheader: `${o.count === 1 ? "A message is" : `${o.count} messages are`} waiting for you.`,
    heading: o.count === 1 ? "You have an unread message" : "You have unread messages",
    greeting: hi(o.name),
    lines: [`You have ${o.count === 1 ? "1 unread message" : `${o.count} unread messages`} from ${o.from} on Findtern.`],
    status: "Waiting for your reply",
    cta: { label: "Open messages", url: o.url },
    reason: `You’re getting this because you have unread messages on Findtern. Turn these emails off in your notification settings: ${o.settingsUrl}`,
  }),

  /** Sent once per proposal when an update sits unread. Generic: the company stays hidden until a hire. */
  unreadOffer: (o: { name: string; url: string; settingsUrl: string }): EmailContent => ({
    subject: "Your Findtern proposal has an update",
    preheader: "A proposal you received was updated and is waiting for your review.",
    heading: "A proposal was updated",
    greeting: hi(o.name),
    lines: ["A proposal you received was updated. Review the latest terms from your dashboard."],
    status: "Awaiting your review",
    cta: { label: "View proposal", url: o.url },
    reason: `You’re getting this because a proposal update is waiting for you on Findtern. Turn these emails off in your notification settings: ${o.settingsUrl}`,
  }),

  proposalReceived: (o: { internName: string; companyName: string; role: string; proposalId: string }): EmailContent => ({
    subject: "You’ve received a new internship proposal on Findtern",
    preheader: `${o.companyName} sent you a proposal for ${o.role}. Respond from your dashboard.`,
    heading: "You’ve received a new proposal",
    greeting: hi(o.internName),
    lines: [`${o.companyName} has sent you an internship proposal for the role of ${o.role}.`],
    bullets: ["Read the proposal details carefully", "Accept it if it fits your goals", "You can turn down up to 3 offers; a 4th decline or lapse ends the refund guarantee"],
    status: "Awaiting your response",
    cta: ctaTo("View proposal", `/intern/proposals/${o.proposalId}`),
  }),

  proposalDecision: (o: { employerName: string; candidate: string; role: string; accepted: boolean; proposalId: string; fullTime?: boolean }): EmailContent => ({
    subject: o.fullTime ? "Full-time offer update | Findtern" : "Candidate decision update | Findtern",
    preheader: o.accepted
      ? o.fullTime
        ? `${o.candidate} accepted. Pay the hiring fee to confirm the joining.`
        : `${o.candidate} accepted. Complete the payment to confirm the hire.`
      : `${o.candidate} declined. You can send an offer to another candidate.`,
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
    tone: o.accepted ? "done" : "neutral",
    cta: o.accepted
      ? ctaTo("Go to checkout", "/employer/checkout")
      : ctaTo("View proposal", `/employer/proposal/${o.proposalId}`),
  }),

  proposalWithdrawn: (o: { internName: string; role: string }): EmailContent => ({
    subject: "Update on a proposal | Findtern",
    preheader: "Nothing is needed from you. Your profile stays visible to other employers.",
    heading: "A proposal was withdrawn",
    greeting: hi(o.internName),
    lines: [`The company withdrew its proposal for ${o.role}. Nothing is needed from you.`, "Your profile stays visible to other employers."],
    cta: ctaTo("Open your dashboard", "/intern/dashboard"),
  }),

  /** Staff closed an offer. Neutral: it was not the company withdrawing. */
  proposalClosed: (o: { internName: string; role: string }): EmailContent => ({
    subject: "Update on an offer | Findtern",
    preheader: "Nothing is needed from you. Your profile stays visible to other employers.",
    heading: "An offer was closed",
    greeting: hi(o.internName),
    lines: [`The offer for ${o.role} has been closed by the Findtern team. Nothing is needed from you.`, "Your profile stays visible to other employers."],
    cta: ctaTo("See your offers", "/intern/proposals"),
  }),

  interviewInvitation: (o: { internName: string; companyName: string; project?: string | null; slots?: string[]; timezone?: string }): EmailContent => ({
    subject: "Interview invitation | Select a time slot on Findtern",
    preheader: `${o.companyName} invited you to an interview. Pick a time that suits you.`,
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
    cta: ctaTo("Pick a slot", "/intern/interviews"),
  }),

  meetingScheduled: (o: { name: string; other: string; when: string; link?: string | null; forEmployer: boolean }): EmailContent => ({
    subject: o.forEmployer ? "Meeting scheduled | Candidate confirmed a slot" : "Meeting scheduled successfully | Findtern",
    preheader: `${o.when} with ${o.other}.`,
    heading: "Your meeting is scheduled",
    greeting: hi(o.name),
    lines: [
      o.forEmployer ? "The candidate confirmed a slot." : "Your meeting has been scheduled. Please be available at this time.",
      ...(o.link ? [] : ["The meeting link will follow by email."]),
    ],
    facts: [[o.forEmployer ? "Candidate" : "Company", o.other], ["When", o.when], ...(o.link ? ([["Meet link", o.link]] as [string, string][]) : [])],
    cta: ctaTo("Open dashboard", `/${o.forEmployer ? "employer/schedule" : "intern/interviews"}`),
  }),

  /** The employer's nudge about a pending or scheduled interview (send-reminder route). `text` is the same line as the in-app note. */
  interviewReminder: (o: { name: string; pending: boolean; text: string; link: string | null }): EmailContent => ({
    subject: "Interview reminder | Findtern",
    preheader: o.pending ? "An employer is waiting for you to pick an interview slot." : "An interview you booked is coming up.",
    heading: o.pending ? "Pick your interview slot" : "Your interview is coming up",
    greeting: hi(o.name),
    lines: [o.text],
    facts: o.link ? [["Meet link", o.link]] : undefined,
    cta: ctaTo("Open interviews", "/intern/interviews"),
  }),

  /** Findtern added the meeting link by hand; no company name, the intern may not see it yet. */
  interviewLinkReady: (o: { name: string; link: string; forEmployer: boolean }): EmailContent => ({
    subject: "Your interview link is ready | Findtern",
    preheader: "The link is below and in your dashboard.",
    heading: "Your interview link is ready",
    greeting: hi(o.name),
    lines: ["The meeting link for your interview has been added."],
    facts: [["Meet link", o.link]],
    cta: ctaTo("Open dashboard", `/${o.forEmployer ? "employer/schedule" : "intern/interviews"}`),
  }),

  aiInterviewLinkReady: (o: { name: string; link: string }): EmailContent => ({
    subject: "Your AI interview link is ready | Findtern",
    preheader: "Your AI interview is open. Read the checklist before you start.",
    heading: "Your AI interview link is ready",
    greeting: hi(o.name),
    lines: ["Your AI interview is open. Before you start:"],
    bullets: [...AI_INTERVIEW_INSTRUCTIONS],
    facts: [["Interview link", o.link]],
    cta: { label: "Start AI interview", url: o.link },
  }),

  interviewRescheduled: (o: { name: string }): EmailContent => ({
    subject: "Interview rescheduled | Findtern",
    preheader: "Open your dashboard to pick a new time.",
    heading: "An interview was rescheduled",
    greeting: hi(o.name),
    lines: ["The company proposed new time slots. Pick the one that works for you."],
    cta: ctaTo("Open dashboard", "/intern/interviews"),
  }),

  timesheetSubmitted: (o: { employerName: string; candidate: string; period: string; timesheetId: string }): EmailContent => ({
    subject: "Timesheet submitted for approval | Findtern",
    preheader: `Review ${o.candidate}’s timesheet for ${o.period}.`,
    heading: "A timesheet needs your approval",
    greeting: hi(o.employerName),
    lines: [`${o.candidate} submitted a timesheet for ${o.period}.`],
    cta: ctaTo("Review timesheet", `/employer/timesheets/${o.timesheetId}`),
  }),

  employerPaymentReceived: (o: { employerName: string; role: string; amount: string }): EmailContent => ({
    subject: "Payment received successfully | Findtern",
    preheader: `Payment of ${o.amount} for ${o.role} is confirmed.`,
    heading: "We’ve received your payment",
    greeting: hi(o.employerName),
    lines: [`We’ve received your payment for ${o.role}.`, "The process now moves forward as agreed. Updates appear in your dashboard."],
    facts: [["Amount", o.amount]],
    cta: ctaTo("View orders and invoice", "/employer/orders"),
  }),

  hireConfirmed: (o: { internName: string; companyName: string; role: string }): EmailContent => ({
    subject: "You’re hired | Internship confirmed on Findtern",
    preheader: `${o.companyName} confirmed your engagement. Your dashboard has the next steps.`,
    heading: "You’re hired",
    greeting: hi(o.internName),
    lines: [
      `Congratulations. You’ve been hired for ${o.role} with ${o.companyName}.`,
      "The employer has completed the payment and your engagement is confirmed. They may reach out shortly to begin onboarding.",
      "Your dashboard now shows:",
    ],
    bullets: ["Engagement details", "Start date and next steps", "Timesheets for your first period"],
    cta: ctaTo("Open dashboard", "/intern/dashboard"),
  }),

  activationPaid: (o: { internName: string; amount: string }): EmailContent => ({
    subject: "Payment successful | Welcome to Findtern",
    preheader: "You now have full access. Your AI interview is the first step.",
    heading: "Your profile is activated",
    greeting: hi(o.internName),
    lines: ["Your Findtern sign-up fee payment has been received. You now have full access to the platform, starting with your AI interview."],
    facts: [["Amount", o.amount]],
    cta: ctaTo("Open dashboard", "/intern/dashboard"),
  }),

  stipendTransferred: (o: { internName: string; role: string; amount: string }): EmailContent => ({
    subject: "Stipend transferred successfully | Findtern",
    preheader: `${o.amount} for ${o.role} has been transferred.`,
    heading: "Your stipend is on its way",
    greeting: hi(o.internName),
    lines: [
      `Your stipend for ${o.role} has been transferred.`,
      "If you don’t see it in your account right away, allow standard bank processing time.",
    ],
    facts: [["Amount", o.amount]],
    cta: ctaTo("View payments", "/intern/earnings"),
  }),

  completionBonusPaid: (o: { internName: string; role: string; amount: string }): EmailContent => ({
    subject: "Completion bonus transferred | Findtern",
    preheader: `Your ${o.amount} completion bonus has been transferred.`,
    heading: "Your completion bonus is on its way",
    greeting: hi(o.internName),
    lines: [
      `Congratulations on completing ${o.role}. Your Findtern completion bonus has been transferred.`,
      "If you don’t see it in your account right away, allow standard bank processing time.",
    ],
    facts: [["Amount", o.amount]],
    cta: ctaTo("View earnings", "/intern/earnings"),
  }),

  collegeSeatsPaid: (o: { collegeName: string; seats: number; amount: string; cap: number }): EmailContent => ({
    subject: "Seat payment received | Findtern",
    preheader: `${o.seats} seats added. Your college code now covers ${o.cap} students.`,
    heading: "Your seats are active",
    greeting: hi(o.collegeName),
    lines: [`We’ve received your payment for ${o.seats} seats. Your college code now covers ${o.cap} students.`],
    facts: [
      ["Seats added", String(o.seats)],
      ["Amount", o.amount],
      ["Total seats", String(o.cap)],
    ],
    cta: ctaTo("View seats and invoice", "/college/seats"),
  }),

  collegePayoutRequested: (o: { collegeName: string; amount: string }): EmailContent => ({
    subject: `Payout requested: ${o.collegeName} | Findtern`,
    preheader: `${o.collegeName} asked to withdraw ${o.amount}.`,
    heading: "A college asked for a payout",
    greeting: "Hi team,",
    lines: [`${o.collegeName} has requested a withdrawal from its Findtern wallet.`],
    facts: [
      ["College", o.collegeName],
      ["Amount", o.amount],
    ],
    cta: ctaTo("Review in admin", "/admin/colleges"),
    reason: INTERNAL_REASON,
  }),

  collegePayoutPaid: (o: { collegeName: string; amount: string; referenceId: string }): EmailContent => ({
    subject: "Payout sent | Findtern",
    preheader: `${o.amount} has been paid to the bank account on file.`,
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
    cta: ctaTo("View earnings", "/college/earnings"),
  }),

  collegePayoutRejected: (o: { collegeName: string; amount: string; reason: string }): EmailContent => ({
    subject: "Payout request not approved | Findtern",
    preheader: "Nothing was debited. The amount is available in your wallet again.",
    heading: "Your payout request was not approved",
    greeting: hi(o.collegeName),
    lines: ["Nothing was debited, and the amount is available in your wallet again.", `Reason: ${o.reason}`],
    facts: [["Amount", o.amount]],
    cta: ctaTo("View earnings", "/college/earnings"),
  }),

  fullTimeOfferReceived: (o: { internName: string; companyName: string; role: string; proposalId: string }): EmailContent => ({
    subject: "Full-time job offer received | Findtern",
    preheader: `${o.companyName} offered you a full-time role as ${o.role}.`,
    heading: "You have a full-time offer",
    greeting: hi(o.internName),
    lines: [`Congratulations. ${o.companyName} has offered you a full-time position as ${o.role} through Findtern.`],
    bullets: ["Review the full offer carefully", "Accept or decline it from your dashboard"],
    status: "Awaiting your response",
    cta: ctaTo("View offer", `/intern/proposals/${o.proposalId}`),
  }),

  fullTimeFeePaid: (o: { employerName: string; candidate: string; role: string; ctc: string; amount: string }): EmailContent => ({
    subject: "Payment confirmation – hiring fee received | Findtern",
    preheader: `Hiring fee of ${o.amount} received for ${o.candidate}.`,
    heading: "Hiring fee received",
    greeting: hi(o.employerName),
    lines: [`We’ve received the full-time hiring fee for ${o.candidate}. Thank you for hiring through Findtern.`],
    facts: [["Candidate", o.candidate], ["Role", o.role], ["Annual CTC offered", o.ctc], ["Amount paid", o.amount]],
    cta: ctaTo("View orders and invoice", "/employer/orders"),
  }),

  /** Internal alert to the Findtern team when an employer sends a full-time offer (PPO). Same facts the plain-text alert carried. */
  fullTimeOfferAdminAlert: (o: {
    companyName: string;
    employerId: string;
    internName: string;
    internId: string;
    internEmail?: string | null;
    proposalId: string;
    jobTitle: string;
    jobMode: string;
    jobLocation?: string;
    timezone: string;
    shiftFrom: string;
    shiftTo: string;
    ctcCurrency: string;
    annualCtc: number;
    offerLetterUrl: string;
  }): EmailContent => ({
    subject: `PPO - Full-time offer proposal from ${o.companyName}`,
    preheader: `${o.companyName} offered ${o.internName} a full-time role as ${o.jobTitle}.`,
    heading: "Full-time offer sent",
    greeting: "Hi team,",
    lines: [`${o.companyName} sent ${o.internName} a full-time offer. The details are below.`],
    facts: [
      ["Employer", `${o.companyName} (${o.employerId})`],
      ["Candidate", `${o.internName} (${o.internId})`],
      ...(o.internEmail ? ([["Candidate email", o.internEmail]] as [string, string][]) : []),
      ["Proposal", o.proposalId],
      ["Job title", o.jobTitle],
      ["Job mode", o.jobMode],
      ...(o.jobLocation ? ([["Job location", o.jobLocation]] as [string, string][]) : []),
      ["Timezone", o.timezone],
      ["Shift", `${o.shiftFrom} - ${o.shiftTo}`],
      ["Annual CTC", `${o.ctcCurrency} ${o.annualCtc}`],
    ],
    cta: { label: "Open offer letter", url: o.offerLetterUrl },
    reason: INTERNAL_REASON,
  }),

  /** Signup code. Employers get the legacy "company email" wording. */
  otp: (o: { otp: string; ttlMinutes: number; forEmployer: boolean }): EmailContent => ({
    subject: o.forEmployer ? "Verify your company email | Findtern" : "Verify your Findtern email",
    preheader: `Enter this code on Findtern to verify your email. It expires in ${o.ttlMinutes} minutes.`,
    heading: o.forEmployer ? "Verify your company email" : "Verify your email",
    greeting: hi(""),
    lines: [
      o.forEmployer
        ? "Use the code below to confirm your company email address on Findtern."
        : "Use the code below to confirm your Findtern email address.",
    ],
    code: { value: o.otp, note: `This code expires in ${o.ttlMinutes} minutes. If you did not request it, you can ignore this email.` },
    reason: "You’re receiving this because this email address was used to sign up for Findtern.",
  }),

  passwordReset: (o: { url: string; ttlMinutes: number }): EmailContent => ({
    subject: "Reset your Findtern password",
    preheader: `Use the link to choose a new password. It expires in ${o.ttlMinutes} minutes.`,
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
      preheader: `For ${o.intern}. You can pay from your checkout.`,
      heading: title,
      greeting: hi(o.name),
      lines: [
        o.type === "upcoming"
          ? `This is a reminder that the month ${o.k} charge of ${o.amount} for ${o.intern} falls due on ${o.dueOn}. You can pay it now.`
          : `The month ${o.k} charge of ${o.amount} for ${o.intern} ${today ? "is due today" : `was due on ${o.dueOn} and is still unpaid`}.`,
        `Please pay ${o.type === "upcoming" ? `by ${o.dueOn}` : today ? "today" : "as soon as you can"}.`,
      ],
      facts: [["Intern", o.intern], ["Month", String(o.k)], ["Amount", o.amount], ["Due on", o.dueOn]],
      status: o.type === "overdue" ? "Overdue" : o.type === "due" ? (today ? "Due today" : "Past due") : "Due soon",
      tone: o.type === "overdue" || (o.type === "due" && !today) ? "alert" : "wait",
      cta: ctaTo("Pay now", "/employer/checkout"),
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

/** Drive code email: personal one-time code for a college drive. Every value is escaped by renderEmail; no tracking. */
export function driveCodeEmail(o: { name: string; collegeName: string; code: string; validUntil: Date }): EmailContent {
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const college = oneLine(o.collegeName) || "your college";
  const expiry = o.validUntil.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  return {
    subject: `Your Findtern access code from ${college}`,
    preheader: `Use this code before ${expiry}. It is personal to you.`,
    heading: "Your Findtern access code",
    greeting: hi(oneLine(o.name)),
    lines: [
      `${college} has set up your Findtern access. Sign in and enter this code on your activation step.`,
      "This code is personal to you. Do not share or forward it; it works for one student only.",
    ],
    code: { value: o.code, note: `Valid until ${expiry}` },
    facts: [["College", college], ["Valid until", expiry]],
    cta: ctaTo("Sign in to Findtern", "/login"),
    reason: "You’re receiving this because your college listed this email address for a Findtern drive.",
  };
}
