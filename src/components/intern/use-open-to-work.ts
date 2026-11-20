"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
import { announceOpenToWork, storedOpenToWork, subscribeOpenToWork } from "@/lib/open-to-work-sync";

/**
 * The shared "open to work" state for the Home banner and the switch. `on` follows the server's prop
 * (after router.refresh) and any save announced by another control on the page. `save` posts the
 * flag and returns the value the server stored, or null if the save failed (nothing changes then).
 */
export function useOpenToWork(initial: boolean) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setOn(initial);
  }
  useEffect(() => subscribeOpenToWork(setOn), []);

  async function save(next: boolean): Promise<boolean | null> {
    try {
      const res = await csrfFetch("/api/intern/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openToWork: next }),
      });
      if (!res.ok) return null;
      const stored = storedOpenToWork(await res.json().catch(() => null), next);
      announceOpenToWork(stored);
      router.refresh();
      return stored;
    } catch {
      return null;
    }
  }

  return { on, save };
}
