import { redirect } from "next/navigation";

/** The College tab moved into Settings; old links, emails and notifications still land here. */
export default function InternCollegePage() {
  redirect("/intern/settings#college");
}
