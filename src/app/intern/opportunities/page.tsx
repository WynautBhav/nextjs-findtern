import { redirect } from "next/navigation";

/**
 * The signed-in open-roles list was removed: companies search candidates, so
 * students no longer browse roles inside the app. This route only survives so
 * old bookmarks and emails land on Home instead of a 404. The public list at
 * /opportunities is unchanged.
 */
export default function InternOpportunitiesPage() {
  redirect("/intern/dashboard");
}
