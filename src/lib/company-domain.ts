/**
 * Company website vs company email domain.
 *
 * An employer's website must sit on the same domain as the email they signed
 * up with: owner@acme.com may list acme.com, www.acme.com/careers or
 * careers.acme.com, but not acme.io. Protocol, `www.`, port, path, query and
 * case are ignored. Pure (no imports) so the form, the API route and the unit
 * tests share one rule.
 */

/** Lower-cased host of a website the employer typed, without `www.`; null if it is not a URL. */
export function websiteHost(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    const tld = host.split(".").pop() ?? "";
    if (!host.includes(".") || tld.length < 2) return null;
    return host;
  } catch {
    return null;
  }
}

/** Lower-cased domain of an email address (after the last @), without `www.`. */
export function emailDomain(email: string | null | undefined): string {
  const value = (email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  return at < 0 ? "" : value.slice(at + 1).replace(/\.$/, "").replace(/^www\./, "");
}

/** True when the website's host is the email's domain or a subdomain of it. */
export function websiteMatchesEmailDomain(website: string, email: string): boolean {
  const host = websiteHost(website);
  const domain = emailDomain(email);
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * The message to show for a website that does not belong to the company
 * email's domain, or null when it is fine. `skipDomainCheck` covers accounts
 * whose login is not on a company domain (an old personal-mailbox account),
 * where there is no domain to match.
 */
export function websiteDomainError(
  website: string,
  email: string,
  { skipDomainCheck = false }: { skipDomainCheck?: boolean } = {},
): string | null {
  if (!websiteHost(website)) return "That does not look like a website - try acme.com.";
  if (skipDomainCheck) return null;
  const domain = emailDomain(email);
  if (!domain) return null;
  if (websiteMatchesEmailDomain(website, email)) return null;
  return `The website must be on your company email's domain (${domain}), e.g. ${domain} or careers.${domain}.`;
}

/**
 * The message for an escalation (secondary) contact email that is not on the
 * company's domain, or null when it is fine (bug sheet 26 Oct). The domains
 * may differ by a subdomain either way: hr@mail.acme.com and ops@acme.com are
 * the same company. `skipDomainCheck` as for `websiteDomainError`.
 */
export function escalationEmailDomainError(
  escalationEmail: string,
  companyEmail: string,
  { skipDomainCheck = false }: { skipDomainCheck?: boolean } = {},
): string | null {
  if (skipDomainCheck) return null;
  const domain = emailDomain(companyEmail);
  const other = emailDomain(escalationEmail);
  if (!domain || !other) return null;
  if (other === domain || other.endsWith(`.${domain}`) || domain.endsWith(`.${other}`)) return null;
  return `Use an email on your company domain (${domain}) for the escalation contact.`;
}
