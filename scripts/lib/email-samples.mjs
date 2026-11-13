// One rendered sample per email template (and per variant that changes the layout).
// Fixture data only: names, amounts and URLs are made up and nothing here is ever sent.
import { driveCodeEmail, emails, renderEmail } from "../../src/lib/emails.ts";

process.env.PUBLIC_ORIGIN ??= "http://localhost:3000";

const meet = "https://meet.google.com/abc-defg-hij";
const long = "Bharatiya Vidyapeeth Institute of Management Studies and Research";
const u = { url: "http://localhost:3000/intern/messages/t1", settingsUrl: "http://localhost:3000/intern/settings#notifications" };

/** [file-safe id, content]. "stress" variants use long names / long codes to test narrow widths. */
export const samples = () => [
  ["unreadMessages-1", emails.unreadMessages({ name: "Asha", count: 1, from: "an employer", ...u })],
  ["unreadMessages-3", emails.unreadMessages({ name: "Rohan", count: 3, from: "a candidate", url: "http://localhost:3000/employer/messages/t1", settingsUrl: "http://localhost:3000/employer/account#notifications" })],
  ["unreadOffer", emails.unreadOffer({ name: "Asha", url: "http://localhost:3000/intern/proposals/p1", settingsUrl: u.settingsUrl })],
  ["proposalReceived", emails.proposalReceived({ internName: "Asha", companyName: "Acme Robotics", role: "Frontend Intern", proposalId: "p1" })],
  ["proposalDecision-accepted", emails.proposalDecision({ employerName: "Rohan", candidate: "Asha K.", role: "Frontend Intern", accepted: true, proposalId: "p1" })],
  ["proposalDecision-declined", emails.proposalDecision({ employerName: "Rohan", candidate: "Asha K.", role: "Frontend Intern", accepted: false, proposalId: "p1" })],
  ["proposalDecision-fulltime", emails.proposalDecision({ employerName: "Rohan", candidate: "Asha K.", role: "Software Engineer", accepted: true, proposalId: "p1", fullTime: true })],
  ["proposalWithdrawn", emails.proposalWithdrawn({ internName: "Asha", role: "Frontend Intern" })],
  ["proposalClosed", emails.proposalClosed({ internName: "Asha", role: "Frontend Intern" })],
  ["interviewInvitation-slots", emails.interviewInvitation({ internName: "Asha", companyName: "Acme Robotics", project: "Dashboard redesign", slots: ["Mon 16 Nov, 10:00 AM", "Tue 17 Nov, 3:30 PM"], timezone: "IST" })],
  ["interviewInvitation-noslots", emails.interviewInvitation({ internName: "Asha", companyName: "Acme Robotics" })],
  ["meetingScheduled-intern", emails.meetingScheduled({ name: "Asha", other: "Acme Robotics", when: "Mon 16 Nov 2026, 10:00 AM IST", link: meet, forEmployer: false })],
  ["meetingScheduled-employer-nolink", emails.meetingScheduled({ name: "Rohan", other: "Asha K.", when: "Mon 16 Nov 2026, 10:00 AM IST", link: null, forEmployer: true })],
  ["interviewReminder-pending", emails.interviewReminder({ name: "Asha", pending: true, text: "Acme Robotics is waiting for you to pick an interview slot.", link: null })],
  ["interviewReminder-booked", emails.interviewReminder({ name: "Asha", pending: false, text: "Your interview with Acme Robotics is on Mon 16 Nov at 10:00 AM.", link: meet })],
  ["interviewLinkReady", emails.interviewLinkReady({ name: "Asha", link: meet, forEmployer: false })],
  ["aiInterviewLinkReady", emails.aiInterviewLinkReady({ name: "Asha", link: "http://localhost:3000/ai-interview/abc123" })],
  ["interviewRescheduled", emails.interviewRescheduled({ name: "Asha" })],
  ["timesheetSubmitted", emails.timesheetSubmitted({ employerName: "Rohan", candidate: "Asha K.", period: "1–15 Nov 2026", timesheetId: "t1" })],
  ["employerPaymentReceived", emails.employerPaymentReceived({ employerName: "Rohan", role: "Frontend Intern", amount: "₹18,000" })],
  ["hireConfirmed", emails.hireConfirmed({ internName: "Asha", companyName: "Acme Robotics", role: "Frontend Intern" })],
  ["activationPaid", emails.activationPaid({ internName: "Asha", amount: "₹999" })],
  ["stipendTransferred", emails.stipendTransferred({ internName: "Asha", role: "Frontend Intern", amount: "₹12,000" })],
  ["completionBonusPaid", emails.completionBonusPaid({ internName: "Asha", role: "Frontend Intern", amount: "₹3,000" })],
  ["collegeSeatsPaid", emails.collegeSeatsPaid({ collegeName: "NIT Trichy", seats: 50, amount: "₹25,000", cap: 150 })],
  ["collegePayoutRequested", emails.collegePayoutRequested({ collegeName: "NIT Trichy", amount: "₹8,500" })],
  ["collegePayoutPaid", emails.collegePayoutPaid({ collegeName: "NIT Trichy", amount: "₹8,500", referenceId: "UTR123456789012" })],
  ["collegePayoutRejected", emails.collegePayoutRejected({ collegeName: "NIT Trichy", amount: "₹8,500", reason: "Bank details do not match." })],
  ["fullTimeOfferReceived", emails.fullTimeOfferReceived({ internName: "Asha", companyName: "Acme Robotics", role: "Software Engineer", proposalId: "p2" })],
  ["fullTimeFeePaid", emails.fullTimeFeePaid({ employerName: "Rohan", candidate: "Asha K.", role: "Software Engineer", ctc: "INR 900000", amount: "₹74,970" })],
  ["fullTimeOfferAdminAlert", emails.fullTimeOfferAdminAlert({ companyName: "Acme Robotics", employerId: "e1", internName: "Asha K.", internId: "i1", internEmail: "asha@example.com", proposalId: "p2", jobTitle: "Software Engineer", jobMode: "hybrid", jobLocation: "Bengaluru", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "18:00", ctcCurrency: "INR", annualCtc: 900000, offerLetterUrl: "https://files.example.com/offer-letters/2026/11/acme-robotics-asha-k-software-engineer-offer-letter.pdf" })],
  ["otp-intern", emails.otp({ otp: "482913", ttlMinutes: 10, forEmployer: false })],
  ["otp-employer", emails.otp({ otp: "482913", ttlMinutes: 10, forEmployer: true })],
  ["passwordReset", emails.passwordReset({ url: "http://localhost:3000/reset-password?token=3f9c1d0a7be84d6f9a2c5e1b8d7f4a60c2e9b15d", ttlMinutes: 30 })],
  ["paymentReminder-upcoming", emails.paymentReminder({ name: "Rohan", type: "upcoming", k: 2, amount: "₹18,000", dueOn: "20 Nov 2026", intern: "Asha K." })],
  ["paymentReminder-due", emails.paymentReminder({ name: "Rohan", type: "due", k: 2, amount: "₹18,000", dueOn: "20 Nov 2026", intern: "Asha K." })],
  ["paymentReminder-overdue", emails.paymentReminder({ name: "Rohan", type: "overdue", k: 2, amount: "₹18,000", dueOn: "20 Nov 2026", intern: "Asha K." })],
  ["driveCode", driveCodeEmail({ name: "Asha", collegeName: "NIT Trichy", code: "ABCD-EFGH-JKLM", validUntil: new Date("2027-01-15") })],
  // Stress: long names and strings that do not break on their own.
  ["stress-proposalReceived", emails.proposalReceived({ internName: "Aishwarya Venkataraghavan", companyName: long, role: "Senior Full-Stack Developer Intern (Remote, Flexible Hours)", proposalId: "p1" })],
  ["stress-collegeSeatsPaid", emails.collegeSeatsPaid({ collegeName: long, seats: 1000, amount: "₹5,00,000", cap: 2500 })],
  ["stress-unbroken", emails.proposalReceived({ internName: "A".repeat(48), companyName: "B".repeat(60), role: "C".repeat(50), proposalId: "p1" })],
  ["stress-facts-unbroken", emails.fullTimeFeePaid({ employerName: "Rohan", candidate: "a".repeat(45) + "@example.com", role: "R".repeat(44), ctc: "INR 9,00,000", amount: "₹74,970" })],
];

/** Everything the checks need, rendered. */
export const rendered = () => samples().map(([id, content]) => ({ id, content, ...renderEmail(content) }));
