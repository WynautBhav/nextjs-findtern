import { z } from "zod";

import { CONTACT_TYPES } from "./contact-types.ts";
import { phoneError } from "./phone.ts";

/**
 * Body of POST /api/website/contact. Phone is required: this schema is the
 * trust boundary, the form's own check is only a courtesy.
 */
export const contactBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().max(80).default(""),
    email: z.string().trim().email().max(200),
    countryCode: z.string().trim().max(6).default("+91"),
    phone: z
      .string({ error: "Phone number is required" })
      .transform((v) => v.replace(/\D/g, ""))
      .pipe(z.string().min(1, "Phone number is required").max(15)),
    queryType: z.enum(CONTACT_TYPES).default("general"),
    subject: z.string().trim().max(200).default(""),
    message: z.string().trim().min(2).max(5000),
  })
  .superRefine((d, ctx) => {
    if (!d.phone) return; // already reported as required
    const problem = phoneError(d.countryCode, d.phone);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["phone"] });
  });
