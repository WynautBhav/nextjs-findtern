"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
import { buttonClass } from "@/components/ui/button";
import { ShareLink } from "./share-link";

/** Issue a fresh link (old one dies) or close the drive to every employer at once. */
export function LinkActions(props: {
  driveId: string;
  revoked: boolean;
  collegeName: string;
  driveTitle: string;
  startsAt: string;
  endsAt: string;
  kind: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Asked in the page, not window.confirm (as admin since QA-145): the
  // consequence is spelled out next to the yes/cancel pair.
  const [asking, setAsking] = useState<"POST" | "DELETE" | null>(null);

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
    const res = await csrfFetch(`/api/college/drives/${props.driveId}/link`, { method }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null;
    setBusy(false);
    if (!res?.ok) return setError(body?.error ?? "Couldn't update the link.");
    setUrl(method === "POST" ? body?.url ?? null : null);
    router.refresh();
  }

  const consequence =
    asking === "DELETE"
      ? "Every employer, including those already inside, loses access immediately."
      : "Companies already inside keep access. Anyone you sent the current link to who hasn't opened it yet will need the new one.";

  return (
    <div ref={box} className="space-y-4">
      {url ? (
        <ShareLink url={url} {...props} />
      ) : !props.revoked ? (
        // Only a fingerprint of the link is stored, so it can't be shown again.
        <p className="text-sm text-ink-600">
          The link was shown once, when it was made, and can&apos;t be shown again. If you&apos;ve lost it, issue a new one.
        </p>
      ) : null}
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
              {asking === "DELETE" ? "Yes, close the link" : "Yes, issue a new link"}
            </button>
            {/* Cancel takes the focus: Enter on a focused "close" can't be undone. */}
            <button type="button" autoFocus onClick={cancel} className={buttonClass({ variant: "outline", size: "sm" })}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-ask="POST"
            disabled={busy}
            onClick={() => (props.revoked ? void call("POST") : setAsking("POST"))}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            {props.revoked ? "Reopen with a new link" : "Issue a new link"}
          </button>
          {!props.revoked ? (
            <button
              type="button"
              data-ask="DELETE"
              disabled={busy}
              onClick={() => setAsking("DELETE")}
              className={buttonClass({ variant: "ghost", size: "sm", className: "text-danger hover:bg-danger-soft" })}
            >
              Close link now
            </button>
          ) : null}
        </div>
      )}
      <span role="status" aria-live="polite" className="text-sm text-danger">
        {error}
      </span>
    </div>
  );
}
