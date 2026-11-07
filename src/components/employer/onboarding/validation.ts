import { escalationEmailDomainError, websiteDomainError } from "@/lib/company-domain";
import { gstinStateError } from "@/lib/gst";
import { isIndiaCountry } from "@/lib/data/countries";
import { phoneChangeError } from "@/lib/phone";
import { isPersonalEmail, type CompanyDraft } from "@/lib/employer-onboarding";

/** The company domain the website must match, or "" for a personal-mailbox login. */
export function companyDomainOf(email: string): string {
  const e = email.trim();
  if (!e.includes("@") || isPersonalEmail(e)) return "";
  return e.split("@").pop()!.toLowerCase();
}

export function companyErrors(c: CompanyDraft, saved: CompanyDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const email = c.companyEmail.trim();
  if (c.companyName.trim().length < 2) errors.companyName = "Company name is required.";
  if (!c.companySize) errors.companySize = "Pick a company size.";
  if (!c.websiteUrl.trim()) {
    errors.websiteUrl = "Website is required.";
  } else if (c.websiteUrl.trim() !== saved.websiteUrl.trim()) {
    // A website already on file is kept; the domain rule applies when it is
    // entered or changed (the route checks the same).
    const problem = websiteDomainError(c.websiteUrl, email, { skipDomainCheck: !companyDomainOf(email) });
    if (problem) errors.websiteUrl = problem;
  }
  if (!c.country.trim()) errors.country = "Country is required.";
  if (!c.state.trim()) errors.state = "State is required.";
  if (!c.city.trim()) errors.city = "City is required.";
  if (isIndiaCountry(c.country) && !/^[1-9]\d{5}$/.test(c.billingPincode.trim())) {
    errors.billingPincode = "Enter the 6-digit PIN code of your billing address.";
  }
  if (c.gstNumber.trim() && !/^[0-9A-Z]{15}$/.test(c.gstNumber.trim())) {
    errors.gstNumber = "A GST number is 15 characters, letters and digits only.";
  } else if (c.gstNumber.trim() && (c.gstNumber.trim() !== saved.gstNumber.trim() || c.state.trim() !== saved.state.trim())) {
    const problem = gstinStateError(c.gstNumber, c.state);
    if (problem) errors.gstNumber = problem;
  }
  if (c.primaryContactName.trim().length < 2) errors.primaryContactName = "A primary contact name is required.";
  if (c.primaryContactRole.trim().length < 2) errors.primaryContactRole = "Their role is required, e.g. Talent acquisition.";
  const primaryPhone = phoneChangeError(c.primaryContactCountryCode, c.primaryContactPhone, {
    countryCode: saved.primaryContactCountryCode,
    phone: saved.primaryContactPhone,
  });
  if (primaryPhone) errors.primaryContactPhone = primaryPhone;

  // The escalation contact is mandatory (bug sheet 7 S1 r92): name, role,
  // email and phone, a different person from the primary contact.
  if (!c.escalationContactName.trim()) errors.escalationContactName = "An escalation contact name is required.";
  if (!c.escalationContactRole.trim()) errors.escalationContactRole = "Their role is required.";
  const escalationEmail = c.escalationContactEmail.trim();
  if (!escalationEmail) {
    errors.escalationContactEmail = "An escalation contact email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(escalationEmail)) {
    errors.escalationContactEmail = "Enter a valid email address.";
  } else if (isPersonalEmail(escalationEmail)) {
    errors.escalationContactEmail = "Use a company email for the escalation contact.";
  } else if (escalationEmail.toLowerCase() === email.toLowerCase()) {
    errors.escalationContactEmail = "Use a different email from your sign-in email.";
  } else if (escalationEmail.toLowerCase() !== saved.escalationContactEmail.trim().toLowerCase()) {
    const problem = escalationEmailDomainError(escalationEmail, email, { skipDomainCheck: !companyDomainOf(email) });
    if (problem) errors.escalationContactEmail = problem;
  }
  if (!c.escalationContactPhone.trim()) {
    errors.escalationContactPhone = "An escalation contact phone is required.";
  } else {
    const problem = phoneChangeError(c.escalationContactCountryCode, c.escalationContactPhone, {
      countryCode: saved.escalationContactCountryCode,
      phone: saved.escalationContactPhone,
    });
    if (problem) errors.escalationContactPhone = problem;
    else if (
      c.escalationContactCountryCode === c.primaryContactCountryCode &&
      c.escalationContactPhone.replace(/\D/g, "") === c.primaryContactPhone.replace(/\D/g, "")
    ) {
      errors.escalationContactPhone = "Use a different number from the primary contact's.";
    }
  }
  return errors;
}
