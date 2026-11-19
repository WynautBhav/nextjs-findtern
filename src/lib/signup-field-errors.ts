import { isPersonalEmail } from "./employer-onboarding.ts";
import { PASSWORD_RULES } from "./password-policy.ts";
import { phoneError } from "./phone.ts";

/**
 * Field-level messages for both signup forms (B-20). One module so the intern and
 * employer forms say the same thing, and so it is testable without a browser.
 * The forms show a message after the field is left or a submit is tried, and keep
 * the button enabled so the person is told what is wrong instead of facing a dead button.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function passwordFieldError(password: string): string | null {
  if (!password) return "Enter a password.";
  const missing = PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label);
  return missing.length ? `Password needs ${missing.join(", ")}.` : null;
}

export function phoneFieldError(countryCode: string, phone: string): string | null {
  if (!phone.trim()) return "Enter your phone number.";
  return phoneError(countryCode, phone);
}

export type SignupErrors = Partial<Record<"firstName" | "lastName" | "name" | "companyName" | "email" | "phoneNumber" | "password" | "agreedToTerms", string>>;

/**
 * Interns may use a personal or a college address; a college with its own registered domain is only known to
 * the server, so a work-looking address is not an error here (the form warns, send-otp decides).
 */
export function internSignupErrors(d: {
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  password: string;
  agreedToTerms: boolean;
}): SignupErrors {
  const errors: SignupErrors = {};
  if (d.firstName.trim().length < 2) errors.firstName = "Enter your first name (at least 2 letters).";
  if (d.lastName.trim().length < 2) errors.lastName = "Enter your last name (at least 2 letters).";
  const email = d.email.trim();
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL_SHAPE.test(email)) errors.email = "Enter a valid email address, like you@gmail.com.";
  const phone = phoneFieldError(d.countryCode, d.phoneNumber);
  if (phone) errors.phoneNumber = phone;
  const password = passwordFieldError(d.password);
  if (password) errors.password = password;
  if (!d.agreedToTerms) errors.agreedToTerms = "Accept the intern terms and the privacy policy to continue.";
  return errors;
}

export function employerSignupErrors(d: {
  name: string;
  companyName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  password: string;
  agreedToTerms: boolean;
}): SignupErrors {
  const errors: SignupErrors = {};
  if (d.name.trim().length < 2) errors.name = "Enter your name (at least 2 letters).";
  if (d.companyName.trim().length < 2) errors.companyName = "Enter the company name.";
  const email = d.email.trim();
  if (!email) errors.email = "Enter your company email address.";
  else if (!EMAIL_SHAPE.test(email)) errors.email = "Enter a valid email address, like hiring@acme.com.";
  else if (isPersonalEmail(email)) errors.email = "Use your company email address. Personal mailboxes such as Gmail, Outlook or Yahoo cannot register a company.";
  const phone = phoneFieldError(d.countryCode, d.phoneNumber);
  if (phone) errors.phoneNumber = phone;
  const password = passwordFieldError(d.password);
  if (password) errors.password = password;
  if (!d.agreedToTerms) errors.agreedToTerms = "Accept the employer terms and the privacy policy to continue.";
  return errors;
}
