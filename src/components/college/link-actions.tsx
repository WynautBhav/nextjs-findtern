"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
import { inviteSentLine } from "@/lib/college/drive-invite-line";
import { buttonClass } from "@/components/ui/button";
import { InviteCompany } from "./invite-company";
import { ShareLink } from "./share-link";

/** The current link, Invite a company, Replace link (for a leaked one: the old one dies) and Close drive. */
export function LinkActions(props: {
  driveId: string;
  /** The current link, from the server while the drive is open; null for a drive made before links could be shown again. */
  initialUrl?: string | null;
  /** Open straight at the Close drive confirm (the hero's Close drive button). */
  askClose?: boolean;
  collegeName: string;
  driveTitle: string;
  startsAt: string;
  endsAt: string;
  kind: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(props.initialUrl ?? null);
  // The link the server last sent (another officer replaced it, the drive closed) wins over the one from our own call.
  const [seenUrl, setSeenUrl] = useState(props.initialUrl ?? null);
  if (seenUrl !== (props.initialUrl ?? null)) {
    setSeenUrl(props.initialUrl ?? null);
    setUrl(props.initialUrl ?? null);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Asked in the page, not window.confirm (as admin since QA-145): the
  // consequence is spelled out next to the yes/cancel pair.
  const [asking, setAsking] = useState<"POST" | "DELETE" | null>(props.askClose ? "DELETE" : null);

  // Cancel or Esc puts focus back on the button that asked (QA-159).
  const box = useRef<HTMLDivElement>(null);
  const returnTo = useRef<"POST" | "DELETE" | null>(null);
  function cancel() {
    returnTo.current = asking;
    setAsking(null);
  }
  useEffect(() => {
    if (asking || !returnTo.current) return;
    box.current?.querySelector<HTMLButtonElement>(`[data-ask="${returnTo.current}"]`)?.focus();
    returnTo.current = null;
  }, [asking]);

  async function call(method: "POST" | "DELETE") {
    setAsking(null);
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await csrfFetch(`/api/college/drives/${props.driveId}/link`, { method }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { url?: string; error?: string; invites?: { sent: string[]; failed: string[]; limited: string[] } } | null;
    setBusy(false);
    if (!res?.ok) return setError(body?.error ?? "Couldn't update the link.");
    setUrl(method === "POST" && body?.url ? new URL(body.url, window.location.origin).href : null);
    setNote(method === "POST" && body?.invites ? inviteSentLine(body.invites.sent, body.invites.failed, body.invites.limited) : null);
    router.refresh();
  }

  const consequence =
    asking === "DELETE"
      ? "The drive ends now and can't be reopened. Every employer, including those already inside, loses access immediately."
      : "The old link stops working and companies already inside are let out. Invited companies are emailed the new link; send it to any others. Shortlists are kept. To add a company, use Invite a company instead.";

  return (
    <div ref={box} className="space-y-4">
      {url ? (
        <ShareLink url={url} {...props} />
      ) : (
        // Drives made before the link could be re-derived: only a fingerprint of it is stored.
        <p className="text-sm text-ink-600">
          This drive&apos;s link was shown once, when it was made, and can&apos;t be shown again. To add a company, invite it below. If the link was lost or leaked, replace it.
        </p>
      )}
      {asking ? (
        <div
          role="group"
          aria-label="Confirm"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              cancel();
            }
          }}
          className="rounded-apple-md border border-ink-200 bg-ink-50 p-4"
        >
          <p className="text-sm text-ink-800">{consequence}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void call(asking)}
              className={buttonClass({ variant: asking === "DELETE" ? "dark" : "primary", size: "sm" })}
            >
              {asking === "DELETE" ? "Yes, close the drive" : "Yes, replace the link"}
            </button>
            {/* Cancel takes the focus: Enter on a focused "close" can't be undone. */}
            <button type="button" autoFocus onClick={cancel} className={buttonClass({ variant: "outline", size: "sm" })}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {/* Adding a company never touches the link: the safe way to bring one more in. */}
          <InviteCompany
            driveId={props.driveId}
            onNote={(text) => {
              setError(null);
              setNote(text);
            }}
          />
          <button
            type="button"
            data-ask="POST"
            disabled={busy}
            onClick={() => setAsking("POST")}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            Replace link
          </button>
          <button
            type="button"
            data-ask="DELETE"
            disabled={busy}
            onClick={() => setAsking("DELETE")}
            className={buttonClass({ variant: "ghost", size: "sm", className: "text-danger hover:bg-danger-soft" })}
          >
            Close drive
          </button>
        </div>
      )}
      <span role="status" aria-live="polite" className={error ? "text-sm text-danger" : "text-sm text-ink-600"}>
        {error ?? note}
      </span>
    </div>
  );
}
