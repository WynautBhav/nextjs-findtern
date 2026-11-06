"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

/**
 * Save a role (OA3): the heart. Saving raises the student in that employer's
 * matches for the project; it is not an application and costs nothing. The
 * name stays "Save <role>" and `aria-pressed` carries the state, so a screen
 * reader hears one toggle, not two different buttons.
 */
export function SaveRoleButton({
  projectId,
  projectName,
  initialSaved,
  showLabel = false,
  className,
}: {
  projectId: string;
  projectName: string;
  initialSaved: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !saved;
    setBusy(true);
    setSaved(next);
    setMessage("");
    setFailed(false);
    try {
      const res = await csrfFetch("/api/intern/saved-projects", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSaved(!next);
        setFailed(true);
        setMessage(data.error ?? "Couldn't update your saved roles. Try again.");
        return;
      }
      setMessage(next ? `Saved ${projectName}.` : `Removed ${projectName} from your saved roles.`);
    } catch {
      setSaved(!next);
      setFailed(true);
      setMessage("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        aria-label={`Save ${projectName}`}
        aria-busy={busy || undefined}
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-apple-sm px-2.5 text-sm font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
          saved ? "text-brand-700 hover:bg-brand-50" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
          className,
        )}
      >
        <Heart className={cn("size-5 shrink-0", saved && "fill-current")} aria-hidden />
        {showLabel ? <span aria-hidden>{saved ? "Saved" : "Save role"}</span> : null}
      </button>
      <span role="status" className="sr-only">
        {failed ? "" : message}
      </span>
      {failed ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {message}
        </span>
      ) : null}
    </>
  );
}
