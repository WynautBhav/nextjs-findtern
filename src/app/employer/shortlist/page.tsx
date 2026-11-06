import { redirect } from "next/navigation";

/** The shortlist lives at /employer/cart; this is the address people guess. */
export default function ShortlistRedirect(): never {
  redirect("/employer/cart");
}
