import assert from "node:assert/strict";
import test from "node:test";

import { emails, renderEmail, type EmailContent } from "./emails.ts";

process.env.PUBLIC_ORIGIN = "http://localhost:3000";

// Owner rule (6 Nov 2026): an employer never sees what the intern is paid.
const PAY = /stipend|bonus|payout/i;
const EVIL = "<script>alert(1)</script>";

/** One call per template, every user-supplied string set to `n`. `employer` marks mail an employer receives. */
const samples = (n: string): [name: keyof typeof emails, content: EmailContent, employer: boolean][] => [
  ["proposalReceived", emails.proposalReceived({ internName: n, companyName: n, role: n, proposalId: "p1" }), false],
  ["proposalDecision", emails.proposalDecision({ employerName: n, candidate: n, role: n, accepted: true, proposalId: "p1" }), true],
  ["proposalDecision", emails.proposalDecision({ employerName: n, candidate: n, role: n, accepted: false, proposalId: "p1", fullTime: true }), true],
  ["proposalWithdrawn", emails.proposalWithdrawn({ internName: n, role: n }), false],
  ["proposalClosed", emails.proposalClosed({ internName: n, role: n }), false],
  ["interviewInvitation", emails.interviewInvitation({ internName: n, companyName: n, project: n, slots: [n], timezone: n }), false],
  ["meetingScheduled", emails.meetingScheduled({ name: n, other: n, when: n, link: `https://meet.example.com/${n}`, forEmployer: true }), true],
  ["meetingScheduled", emails.meetingScheduled({ name: n, other: n, when: n, link: null, forEmployer: false }), false],
  ["interviewLinkReady", emails.interviewLinkReady({ name: n, link: `https://meet.example.com/${n}`, forEmployer: true }), true],
  ["aiInterviewLinkReady", emails.aiInterviewLinkReady({ name: n, link: `https://interview.example.com/${n}` }), false],
  ["interviewRescheduled", emails.interviewRescheduled({ name: n }), false],
  ["timesheetSubmitted", emails.timesheetSubmitted({ employerName: n, candidate: n, period: n, timesheetId: "t1" }), true],
  ["employerPaymentReceived", emails.employerPaymentReceived({ employerName: n, role: n, amount: n }), true],
  ["hireConfirmed", emails.hireConfirmed({ internName: n, companyName: n, role: n }), false],
  ["activationPaid", emails.activationPaid({ internName: n, amount: n }), false],
  ["stipendTransferred", emails.stipendTransferred({ internName: n, role: n, amount: n }), false],
  ["completionBonusPaid", emails.completionBonusPaid({ internName: n, role: n, amount: n }), false],
  ["collegeSeatsPaid", emails.collegeSeatsPaid({ collegeName: n, seats: 5, amount: n, cap: 10 }), false],
  ["collegePayoutRequested", emails.collegePayoutRequested({ collegeName: n, amount: n }), false],
  ["collegePayoutPaid", emails.collegePayoutPaid({ collegeName: n, amount: n, referenceId: n }), false],
  ["collegePayoutRejected", emails.collegePayoutRejected({ collegeName: n, amount: n, reason: n }), false],
  ["fullTimeOfferReceived", emails.fullTimeOfferReceived({ internName: n, companyName: n, role: n, proposalId: "p2" }), false],
  ["fullTimeOfferAdminAlert", emails.fullTimeOfferAdminAlert({ companyName: n, employerId: "e1", internName: n, internId: "i1", internEmail: `${n}@example.com`, proposalId: "p2", jobTitle: n, jobMode: "hybrid", jobLocation: n, timezone: n, shiftFrom: "09:00", shiftTo: "18:00", ctcCurrency: "INR", annualCtc: 900000, offerLetterUrl: `https://example.com/${n}` }), false],
  ["fullTimeFeePaid", emails.fullTimeFeePaid({ employerName: n, candidate: n, role: n, ctc: n, amount: n }), true],
  ["otp", emails.otp({ otp: n, ttlMinutes: 10, forEmployer: false }), false],
  ["otp", emails.otp({ otp: n, ttlMinutes: 10, forEmployer: true }), true],
  ["passwordReset", emails.passwordReset({ url: `https://example.com/reset?token=${n}`, ttlMinutes: 30 }), false],
  ["newMessage", emails.newMessage({ name: n, from: n, url: "https://example.com/employer/messages/t1" }), true],
  ["newMessage", emails.newMessage({ name: n, from: n, url: "https://example.com/intern/messages/t1" }), false],
  ...(["upcoming", "due", "overdue"] as const).map(
    (type) => ["paymentReminder", emails.paymentReminder({ name: n, type, k: 2, amount: n, dueOn: n, intern: n }), true] as [keyof typeof emails, EmailContent, boolean],
  ),
];

test("every template is covered by these checks", () => {
  assert.deepEqual([...new Set(samples("Asha").map(([name]) => name))].sort(), Object.keys(emails).sort());
});

test("html escapes user input: a name with <script> never lands raw", () => {
  for (const [name, content] of samples(EVIL)) {
    const { html } = renderEmail(content);
    assert.doesNotMatch(html, /<script/i, name);
    assert.match(html, /&lt;script&gt;/, name);
  }
});

test("every template carries a preheader, in the html and not just the subject again", () => {
  for (const [name, content] of samples("Asha")) {
    assert.ok(content.preheader && content.preheader !== content.subject, `${name} needs its own preheader`);
    assert.ok(renderEmail(content).html.includes(content.preheader), name);
  }
});

test("the button url is in both the html and the plain text", () => {
  for (const [name, content] of samples("Asha")) {
    if (!content.cta) continue;
    const { html, text } = renderEmail(content);
    assert.ok(html.includes(`href="${content.cta.url}"`), `${name} html`);
    assert.ok(text.includes(content.cta.url), `${name} text`);
  }
});

test("the plain text is complete: heading, greeting, facts, code, signoff, footer", () => {
  for (const [name, content] of samples("Asha")) {
    const { text } = renderEmail(content);
    for (const part of [content.heading, content.greeting, ...content.lines, ...(content.bullets ?? []), ...(content.facts ?? []).map(([k, v]) => `${k}: ${v}`)]) {
      assert.ok(text.includes(part), `${name}: ${part}`);
    }
    if (content.code) assert.ok(text.includes(`Verification code: ${content.code.value}`), name);
    assert.match(text, /Best,\nTeam Findtern/, name);
    assert.match(text, /Contact: http:\/\/localhost:3000\/contact/, name);
  }
});

test("the otp email shows the code in its own panel with the expiry under it", () => {
  const { html } = renderEmail(emails.otp({ otp: "482913", ttlMinutes: 10, forEmployer: false }));
  assert.match(html, /class="code[^"]*"[^>]*>482913</);
  assert.ok(html.indexOf("482913") < html.indexOf("This code expires in 10 minutes"));
});

test("no email an employer receives mentions stipend, bonus or payout", () => {
  for (const [name, content, employer] of samples("Asha")) {
    if (!employer) continue;
    const { subject, text, html } = renderEmail(content);
    assert.doesNotMatch(`${subject}\n${text}\n${html}`, PAY, name);
  }
});

test("no exclamation-mark cheer in any subject, heading or text", () => {
  for (const [name, content] of samples("Asha")) {
    const { subject, text } = renderEmail(content);
    assert.doesNotMatch(`${subject}\n${text}`, /!/, name);
  }
});
