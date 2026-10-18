import { redirect } from "next/navigation";

/**
 * Bank details are edited in Settings, which renders the same form. This
 * route only survives for old links and bookmarks.
 */
export default function InternBankDetailsPage() {
  redirect("/intern/settings#bank");
}
