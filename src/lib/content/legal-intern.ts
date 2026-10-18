/**
 * Intern-facing legal documents: the TS fallbacks behind `getInternTerms()`
 * and `getInternNda()` (see `./index.ts`). The admin editors at
 * /admin/interns/terms and /admin/interns/non-disclosure write the DB rows
 * that override these.
 *
 * INTERN_TERMS is ported from the legacy hand-written page
 * (FindTern/client/src/pages/findtern-ui/InternTerms.tsx, `StaticTerms`), the
 * only intern terms text that has ever been public. Employer-only clauses
 * (employer pricing, the full-time conversion fee the client pays) moved to
 * the Company Terms, which already carry them; the verification clause no
 * longer promises an SMS OTP, which does not exist.
 */
import type { CmsLegalDoc } from "./types";

export const INTERN_TERMS: CmsLegalDoc = {
  id: "intern",
  title: "Intern Terms and Conditions",
  updated: "2026-10-18",
  href: "/intern-terms-and-conditions",
  html: `
<h2>1. Acceptance of Terms</h2>
<p>By registering, browsing, or using Findtern's website and services, you agree to be bound by these Terms and Conditions, the <a href="/terms-and-conditions">platform Terms and Conditions</a>, the <a href="/intern-nda">Internship Acceptance &amp; Non-Bypass Agreement</a> and our <a href="/privacy">Privacy Policy</a>. If you do not agree, please do not use our platform.</p>

<h2>2. User Registration &amp; Account Security</h2>
<h3>2.1 Account Creation</h3>
<ul>
<li>To access Findtern, you must register with a valid email ID and phone number.</li>
<li>You are responsible for maintaining the confidentiality of your account credentials.</li>
</ul>
<h3>2.2 Email Verification</h3>
<ul>
<li>Upon registration, you will receive a one-time verification code by email to confirm your identity. Your account is created only after the code is verified.</li>
<li>You must provide a phone number you can be reached on. Findtern uses it to contact you about opportunities, and may correct or remove numbers that turn out to be invalid.</li>
</ul>

<h2>3. Collection &amp; Use of Personal Data</h2>
<h3>3.1 Information We Collect</h3>
<p>By using Findtern, you agree that we may collect and store:</p>
<ul>
<li><strong>Personal Information</strong> – Name, email, phone number, academic details, resume, and employment history.</li>
<li><strong>Usage Data</strong> – Your activity on the platform, including searches, job applications, and messages.</li>
</ul>
<h3>3.2 How We Use Your Data</h3>
<p>Your data is collected to:</p>
<ul>
<li>Match you with relevant internships based on your skills and preferences.</li>
<li>Allow employers to view your profile and contact you for opportunities.</li>
<li>Improve our platform experience and offer better recommendations.</li>
</ul>
<h3>3.3 Data Security</h3>
<p>We implement strict security measures to protect your personal information. However, you acknowledge that no system is completely secure, and we cannot guarantee absolute data protection.</p>

<h2>4. Platform Usage &amp; Guidelines</h2>
<ul>
<li>You must provide accurate academic and skill-related information.</li>
<li>Misrepresentation of skills or submitting fake documents will result in account termination.</li>
<li>Findtern reserves the right to verify academic credentials and remove any fraudulent profiles.</li>
<li>Findtern does not guarantee an internship. However, if your profile score is above 60%, you are eligible for a paid internship. This means that any internship you get through Findtern will be a paid one.</li>
<li>Internship stipends may vary between ₹5,000 – ₹12,000 per month. If you are selected on an hourly basis, payment will be calculated on a pro-rata basis.</li>
<li>You must not share your personal information or direct contact details with clients outside of Findtern's platform. Any violation of this may lead to legal action.</li>
</ul>

<h2>5. Registration Fee &amp; Refunds</h2>
<ul>
<li>Findtern guarantees every registered candidate an internship within 18 months of completing their AI interview.</li>
<li>If we are unable to provide an internship within this period, the registration fee will be refunded in full.</li>
<li>Refunds will be processed only after the 18-month lock-in period is completed.</li>
<li>Placement opportunities are based on your AI interview performance and skill ratings. Stipends vary according to your Findtern score.</li>
<li>Fees paid in India include GST at the applicable rate. Your invoice shows the GST breakup.</li>
</ul>

<h2>6. Accepting a Proposal</h2>
<p>Accepting an internship proposal is a binding commitment governed by the <a href="/intern-nda">Internship Acceptance, Compliance &amp; Non-Bypass Agreement</a>, which you accept during onboarding. It covers the penalty for not joining after acceptance, and the requirement to route any full-time offer from a Findtern client through Findtern.</p>

<h2>7. Data Sharing &amp; Privacy</h2>
<h3>7.1 Who Can Access Your Data?</h3>
<ul>
<li>Your profile (excluding phone number and email) is visible to verified employers on Findtern. Your full name is shown to an employer only after they hire you.</li>
<li>We do not sell or share your data with third parties for marketing purposes.</li>
</ul>
<h3>7.2 Communication from Findtern</h3>
<p>By signing up, you agree to receive:</p>
<ul>
<li>Emails &amp; SMS notifications regarding job applications, internships, and account activity.</li>
<li>Promotional updates about new opportunities and platform improvements (you can opt-out anytime).</li>
</ul>

<h2>8. Account Suspension &amp; Termination</h2>
<p>Findtern reserves the right to suspend or delete accounts in case of:</p>
<ul>
<li>Providing false information (e.g., fake certificates or fraudulent activities).</li>
<li>Violation of platform rules (e.g., harassment, misuse of data).</li>
<li>Non-compliance with these Terms &amp; Conditions or the Non-Bypass Agreement.</li>
</ul>

<h2>9. Changes to Terms &amp; Conditions</h2>
<p>We may update these Terms &amp; Conditions from time to time. Continued use of Findtern after any changes implies your acceptance of the revised terms.</p>

<h2>10. Contact Us</h2>
<p>For any questions about these Terms &amp; Conditions, please reach out to us at <a href="mailto:admin@findtern.in">admin@findtern.in</a>.</p>
`.trim(),
};

export const INTERN_NDA: CmsLegalDoc = {
  id: "intern-nda",
  title: "Internship Acceptance, Compliance & Non-Bypass Agreement",
  updated: "2026-10-18",
  href: "/intern-nda",
  html: `
<p><strong>Important – Please read carefully.</strong> Before accepting any proposal on Findtern, please read and acknowledge the following.</p>

<h2>Proposal Review Confirmation</h2>
<p>By clicking “Accept,” you confirm that you have thoroughly reviewed and understood all terms, responsibilities, timelines, compensation details, and conditions mentioned in the proposal.</p>

<h2>Irreversible Commitment</h2>
<p>Acceptance of this proposal constitutes a binding professional commitment. Once accepted, the proposal <strong>cannot be withdrawn, cancelled, or reversed</strong> under any circumstances.</p>

<h2>Non-Compliance Penalty</h2>
<p>If you accept the proposal and subsequently fail to join or fail to fulfill your commitment without valid and documented justification, a <strong>legal penalty of ₹16,000</strong> will be applicable.</p>

<h2>Mandatory Engagement Through Findtern</h2>
<p>All internship-related communication, engagement, and employment transitions must be processed strictly through the Findtern portal.</p>
<p>If you are offered or selected for a full-time role after your internship, you are required to formally inform Findtern at <strong>communicate@findtern.in</strong> before accepting the offer.</p>
<p>Failure to disclose or bypass the platform may result in a monetary penalty equivalent to <strong>one month of your offered salary</strong>, and permanent blacklisting from Findtern and its partner organizations.</p>

<h2>Non-Disclosure of Contact Information</h2>
<p>You must not share your phone number, email, social profiles or any other direct contact details with a client, nor accept a client's direct contact details, outside the Findtern platform.</p>

<h2>Blacklisting Policy</h2>
<p>Failure to honor an accepted proposal or violation of platform policies will result in permanent blacklisting from the Findtern platform and its partner organizations.</p>

<h2>Professional Conduct Expectation</h2>
<p>Findtern operates on trust, credibility, and professional integrity. All candidates are expected to demonstrate responsibility, seriousness, and commitment when accepting opportunities.</p>
`.trim(),
};
