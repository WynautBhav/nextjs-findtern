import { schema } from "@/lib/db";
import { legalDocRoute } from "@/lib/admin/legal-route";

export const { GET, PUT } = legalDocRoute(schema.employerTerms, "Employer Terms");
