import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal-document";
import { SITE } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Findtern collects, why, how long it is kept, and how to have it deleted. Including what employers can and cannot see before you respond to them.",
  alternates: { canonical: "/privacy" },
};

/**
 * Privacy policy.
 *
 * This page did not exist. The legacy build linked to /privacy from the auth
 * pages and the footer, and it 404'd - which on a page collecting Aadhaar and
 * PAN numbers is not a cosmetic problem.
 *
 * There is no CMS row behind it (the `website_terms` family covers only the
 * three terms documents), so it is authored here and names the same systems
 * the codebase actually uses. Two things must be confirmed before launch:
 *
 *  1. Retention periods. The draft states 24 months after the last engagement.
 *     Nothing in the schema enforces that - there is no purge job, and the
 *     149 files sitting in the legacy `uploads/` directory are the visible
 *     consequence of that gap.
 *  2. The data-subject request route. It says email, and there is no automated
 *     handling behind it. That is true as written, so it is written as written.
 *
 * Placeholders are marked inline so nothing here reads as a reviewed legal
 * document when it has not been through one.
 */
const PRIVACY = `
<h2>What this covers</h2>
<p>This policy covers Findtern's handling of personal data for interns, employers and anyone who contacts us. It describes what we hold, why, and what you can ask us to do with it.</p>

<h2>What we collect</h2>
<h3>When you register as an intern</h3>
<ul>
  <li>Name, email address, country code and phone number.</li>
  <li>Academic records, skills, languages, and what you want to work on.</li>
  <li>Availability, preferred locations, and whether you have a laptop.</li>
  <li>Documents you upload for verification: profile photo, introduction video, Aadhaar and PAN images.</li>
  <li>Your assessment responses and the score derived from them.</li>
</ul>
<h3>When you register as an employer</h3>
<ul>
  <li>Company name, work email, phone, website, logo, company size and location.</li>
  <li>Banking details, for paying stipends and issuing refunds.</li>
  <li>Tax identifiers where required for invoicing.</li>
</ul>
<h3>When you use the platform</h3>
<ul>
  <li>Project and requirement descriptions you post.</li>
  <li>Proposals, interview schedules, and meeting links.</li>
  <li>Timesheet entries and approvals.</li>
  <li>Payment records, and notifications we send you.</li>
</ul>

<h2>What an employer can see</h2>
<p>Before you respond to an employer, they can see your score, your skills, your academic record, your availability, and any work samples you have uploaded. They cannot see your phone number or your email address.</p>
<p>Those become visible when you respond to them.</p>

<h2>Why we collect it</h2>
<ul>
  <li>To verify your academic record and identity before your profile is shown to an employer.</li>
  <li>To produce and publish your Findtern Score.</li>
  <li>To match you against posted requirements.</li>
  <li>To run the engagement: scheduling, timesheets, and payment.</li>
  <li>To meet our own legal and tax obligations, including identity verification for Aadhaar and PAN.</li>
</ul>
<p>We do not sell your data. We do not use it for third-party advertising. We do not share it with employers beyond the fields listed above.</p>

<h2>How long we keep it</h2>
<p>Engagement records - proposals, timesheets, invoices, payment records - are kept for the period required by tax law.</p>
<p>Everything else is deleted 24 months after the last engagement ends.</p>
<p>Backups roll off on their own schedule and may retain deleted data for up to 90 days.</p>

<h2>Your documents</h2>
<p>Aadhaar and PAN images are the most sensitive data we hold, and they are handled accordingly:</p>
<ul>
  <li>They are stored privately and are not served from a public URL.</li>
  <li>They are visible only to you and to staff performing verification.</li>
  <li>They are never shown to an employer.</li>
</ul>

<h2>What you can ask us to do</h2>
<ul>
  <li>Tell you what we hold about you.</li>
  <li>Correct anything inaccurate.</li>
  <li>Delete your account and your data, except records we are legally required to keep.</li>
  <li>Withdraw a consent you previously gave.</li>
  <li>Port your data to another provider.</li>
</ul>
<p>Email <a href="mailto:${SITE.email}">${SITE.email}</a> with the subject "Data request". We respond within 30 days.</p>

<h2>Cookies</h2>
<p>We set a session cookie to keep you signed in, and analytics cookies to understand which pages are used. The session cookie is required; the analytics cookies are not, and can be declined without losing functionality.</p>

<h2>Changes</h2>
<p>If we change this policy in a way that affects your rights, we will say so on this page and, for material changes, by email before it takes effect.</p>

<h2>Contact</h2>
<p>${SITE.email} · ${SITE.address}</p>
`.trim();

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      html={PRIVACY}
      backHref="/"
      backLabel="Home"
    />
  );
}
