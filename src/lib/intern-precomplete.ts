import { redirect } from "next/navigation";

import { loadInternData } from "@/lib/intern-data";
import { lockEnabled, precompleteVerdict } from "@/lib/intern-lock";
import { internUnlockState } from "@/lib/intern-unlock";
import { profileCompletion } from "@/lib/onboarding";

type InternRows = Awaited<ReturnType<typeof loadInternData>>;

/** Is the profile checklist done, from rows already loaded? null when it could not be worked out (callers fail open). */
export function profileCompleteFrom(data: Pick<InternRows, "onboarding" | "document">): boolean | null {
  try {
    return profileCompletion(data.onboarding, {
      hasPanImage: Boolean(data.document?.panImageName),
      hasAadhaarImage: Boolean(data.document?.aadhaarImageName),
      hasPhoto: Boolean(data.document?.profilePhotoName),
    }).complete;
  } catch {
    return null;
  }
}

/** Same, reading the rows (cache()d: the layout and the page of one render share one read). null when the read fails. */
export async function internProfileComplete(uid: string): Promise<boolean | null> {
  try {
    return profileCompleteFrom(await loadInternData(uid));
  } catch {
    return null;
  }
}

/**
 * Page-level guard for Documents and Your profile. The layout does not re-render
 * on a client-side move between two intern pages, so the layout's own check
 * (layout.tsx) cannot be the only one: each of these pages calls this first.
 * Paid, grandfathered and unknown-lookup interns (and the kill switch) pass untouched.
 */
export async function guardPrecomplete(uid: string, pathname: string): Promise<void> {
  if (!lockEnabled() || (await internUnlockState(uid)) !== "locked") return;
  const locked = true;
  if (precompleteVerdict({ pathname, complete: await internProfileComplete(uid), locked }) === "redirect_onboarding") {
    redirect("/intern/onboarding");
  }
}
