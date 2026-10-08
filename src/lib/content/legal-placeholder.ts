/**
 * Intern terms placeholder.
 *
 * `GET /api/website/intern-terms` returns `{ terms: null }` — the table is
 * empty upstream. The legacy page masked this by calling the *admin-gated*
 * `/api/admin/intern/terms`, which always 401s for a public visitor, so the
 * live page silently showed its own hand-written fallback instead.
 *
 * Rather than ship a page that looks official and says nothing, this states
 * what is missing and points at the two documents that do exist. Replace with
 * `PLATFORM_TERMS` once the CMS row is written.
 */
export const INTERN_TERMS_PLACEHOLDER = `
<h2>Intern terms are not published yet</h2>
<p>The intern-specific terms document is empty in the content management system. The public endpoint that serves it returns no document, so there is nothing to show here.</p>
<p>This is a gap on our side, not a link that has rotted. Two things cover interns in the meantime:</p>
<ul>
  <li><a href="/terms-and-conditions">Platform Terms and Conditions</a> — covers eligibility, account registration, the services, user responsibilities, payments, and dispute resolution for every Findtern user.</li>
  <li><a href="/guaranteed-internship-program">The Findtern Guarantee</a> — the deposit, the three refund conditions, the 18-month window, and the exclusions.</li>
</ul>
<p>If you have been asked to accept intern terms specifically, contact us and we will send the current version directly rather than point you at an empty page.</p>
`.trim();
