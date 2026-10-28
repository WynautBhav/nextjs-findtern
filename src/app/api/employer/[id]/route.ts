import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { normalizePhone, phoneChangeError } from "@/lib/phone";
import { escalationEmailDomainError, websiteDomainError } from "@/lib/company-domain";
import { REQUIRED_COMPANY_FIELDS, isPersonalEmail, needsBillingPincode } from "@/lib/employer-onboarding";

const LABEL = Object.fromEntries(REQUIRED_COMPANY_FIELDS) as Record<string, string>;
const required = (key: string) =>
  z
    .string({ error: `${LABEL[key]} is required` })
    .trim()
    .min(1, `${LABEL[key]} is required`);

const requiredText = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`);

// Both callers (onboarding, account) send the whole company profile, so every
// field the forms mark mandatory is mandatory here too - a blank one is a 400,
// not a silently cleared column. Optional fields (logo, GST) take null so a
// cleared input clears the column. The escalation contact is mandatory (client
// QA): name, role, email and phone. `companyEmail` is not in the schema, so a
// body that sends one has it stripped - the login email is never editable here.
const bodySchema = z.object({
  companyName: required("companyName"),
  websiteUrl: required("websiteUrl"),
  logoUrl: z.string().nullable().optional(),
  companySize: required("companySize"),
  country: required("country"),
  state: required("state"),
  city: required("city"),
  primaryContactName: required("primaryContactName"),
  primaryContactRole: required("primaryContactRole"),
  countryCode: z.string().trim().min(1, "Country code is required"),
  phoneNumber: required("phoneNumber"),
  escalationContactName: requiredText("Escalation contact name"),
  escalationContactRole: requiredText("Escalation contact role"),
  escalationContactEmail: requiredText("Escalation contact email").pipe(
    z.email("Enter a valid escalation contact email"),
  ),
  escalationContactCountryCode: z.string({ error: "Pick the escalation contact's country code" }).trim().min(1, "Pick the escalation contact's country code"),
  escalationContactPhone: requiredText("Escalation contact phone"),
  gstNumber: z.string().trim().toUpperCase().nullable().optional(),
  billingPincode: z
    .string()
    .trim()
    .nullable()
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // companyEmail is the login identity; it is not editable here, because
  // changing it would skip the email verification signup requires.
  const d = parsed.data;
  // A PIN only applies to an Indian billing address; elsewhere it is dropped
  // rather than rejected for not having six digits (QA-114).
  if (!needsBillingPincode(d.country)) d.billingPincode = null;
  if (needsBillingPincode(d.country) && !d.billingPincode) {
    return NextResponse.json({ error: "Billing PIN code is required for GST invoices in India" }, { status: 400 });
  }
  if (d.billingPincode && !/^[1-9]\d{5}$/.test(d.billingPincode)) {
    return NextResponse.json({ error: "PIN code must be 6 digits" }, { status: 400 });
  }
  const db = getDb();
  // The website must sit on the login email's domain (owner@acme.com ->
  // acme.com or a subdomain). The email comes from the row, never the body.
  const [account] = await db
    .select({
      companyEmail: schema.employers.companyEmail,
      websiteUrl: schema.employers.websiteUrl,
      escalationContactEmail: schema.employers.escalationContactEmail,
      countryCode: schema.employers.countryCode,
      phoneNumber: schema.employers.phoneNumber,
      escalationContactCountryCode: schema.employers.escalationContactCountryCode,
      escalationContactPhone: schema.employers.escalationContactPhone,
    })
    .from(schema.employers)
    .where(eq(schema.employers.id, id))
    .limit(1);
  if (!account) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  // Checked when the website is entered or changed; one already on file is
  // kept, so an older account with another domain can still save.
  const websiteUnchanged = (account.websiteUrl ?? "").trim() === d.websiteUrl.trim();
  const websiteProblem = websiteUnchanged
    ? null
    : websiteDomainError(d.websiteUrl, account.companyEmail ?? "", {
        // An old personal-mailbox login has no company domain to match.
        skipDomainCheck: !account.companyEmail || isPersonalEmail(account.companyEmail),
      });
  if (websiteProblem) return NextResponse.json({ error: websiteProblem }, { status: 400 });
  // Legacy R:4084-4186: the escalation contact is a second person, so a
  // company address and a different number from the primary contact.
  if (d.escalationContactEmail?.trim() && isPersonalEmail(d.escalationContactEmail)) {
    return NextResponse.json({ error: "Use a company email for the escalation contact." }, { status: 400 });
  }
  // A different person, so a different inbox from the company account's
  // (bug sheet 22 Oct). Compared with the login on file, not the body.
  if (d.escalationContactEmail.trim().toLowerCase() === (account.companyEmail ?? "").trim().toLowerCase()) {
    return NextResponse.json({ error: "The escalation contact needs a different email from the company account email." }, { status: 400 });
  }
  // Same company domain as the login (bug sheet 26 Oct). Checked when the
  // email is entered or changed, like the website, so an older account with
  // another domain on file can still save.
  const escalationUnchanged =
    (account.escalationContactEmail ?? "").trim().toLowerCase() === d.escalationContactEmail.trim().toLowerCase();
  const escalationProblem = escalationUnchanged
    ? null
    : escalationEmailDomainError(d.escalationContactEmail, account.companyEmail ?? "", {
        skipDomainCheck: !account.companyEmail || isPersonalEmail(account.companyEmail),
      });
  if (escalationProblem) return NextResponse.json({ error: escalationProblem }, { status: 400 });
  if (
    d.escalationContactPhone?.trim() &&
    normalizePhone(d.escalationContactPhone) === normalizePhone(d.phoneNumber) &&
    d.escalationContactCountryCode === d.countryCode
  ) {
    return NextResponse.json({ error: "The escalation contact needs a different phone number from the primary contact." }, { status: 409 });
  }
  // A number already on file passes unchanged, so an account made under an
  // older rule can still save the rest of its profile (EMH-46).
  const phoneProblem =
    phoneChangeError(d.countryCode, d.phoneNumber, { countryCode: account.countryCode, phone: account.phoneNumber }) ||
    (d.escalationContactPhone &&
      phoneChangeError(d.escalationContactCountryCode, d.escalationContactPhone, {
        countryCode: account.escalationContactCountryCode,
        phone: account.escalationContactPhone,
      }));
  if (phoneProblem) return NextResponse.json({ error: phoneProblem }, { status: 400 });

  // One phone per account across both roles, as at signup. Without this the
  // unique index answers with a 500, and an intern's number is not checked.
  const phone = normalizePhone(d.phoneNumber);
  const [[employerOwner], [internOwner]] = await Promise.all([
    db
      .select({ id: schema.employers.id })
      .from(schema.employers)
      .where(and(eq(schema.employers.countryCode, d.countryCode), eq(schema.employers.phoneNumber, phone), ne(schema.employers.id, id)))
      .limit(1),
    db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.countryCode, d.countryCode), eq(schema.users.phoneNumber, phone)))
      .limit(1),
  ]);
  if (employerOwner || internOwner) {
    return NextResponse.json({ error: "This phone number is already in use." }, { status: 409 });
  }

  // The escalation number belongs to one person too (legacy R:4146-4186,
  // EMH-32): not another company's primary or escalation number, not an
  // intern's phone, not an intern's emergency contact. Checked when entered
  // or changed, so an older account whose number collides can still save.
  const escalationPhone = normalizePhone(d.escalationContactPhone);
  const escalationPhoneChanged =
    escalationPhone !== normalizePhone(account.escalationContactPhone ?? "") ||
    d.escalationContactCountryCode !== (account.escalationContactCountryCode ?? "");
  if (escalationPhone && escalationPhoneChanged) {
    const code = d.escalationContactCountryCode;
    const [[asPrimary], [asEscalation], [asIntern], [asEmergency]] = await Promise.all([
      db
        .select({ id: schema.employers.id })
        .from(schema.employers)
        .where(and(eq(schema.employers.countryCode, code), eq(schema.employers.phoneNumber, escalationPhone), ne(schema.employers.id, id)))
        .limit(1),
      db
        .select({ id: schema.employers.id })
        .from(schema.employers)
        .where(
          and(
            eq(schema.employers.escalationContactCountryCode, code),
            sql`regexp_replace(coalesce(${schema.employers.escalationContactPhone}, ''), '\\D', '', 'g') = ${escalationPhone}`,
            ne(schema.employers.id, id),
          ),
        )
        .limit(1),
      db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.countryCode, code), eq(schema.users.phoneNumber, escalationPhone)))
        .limit(1),
      db
        .select({ id: schema.internOnboarding.id })
        .from(schema.internOnboarding)
        .where(
          sql`coalesce(${schema.internOnboarding.extraData} ->> 'emergencyCountryCode', '') = ${code}
            and regexp_replace(coalesce(${schema.internOnboarding.extraData} ->> 'emergencyPhone', ''), '\\D', '', 'g') = ${escalationPhone}`,
        )
        .limit(1),
    ]);
    if (asPrimary || asEscalation || asIntern || asEmergency) {
      return NextResponse.json({ error: "The escalation contact's phone number is already in use." }, { status: 409 });
    }
  }

  // Every required field passed validation above, so the company profile is
  // set up (legacy set this flag here; admin filters and counts read it).
  // `employers.name` is the primary contact's name (legacy R:4108): payment
  // prefill, emails and admin lists read it.
  await db
    .update(schema.employers)
    .set({ ...parsed.data, name: d.primaryContactName.trim(), phoneNumber: phone, setupCompleted: true })
    .where(eq(schema.employers.id, id));
  return NextResponse.json({ ok: true });
}
