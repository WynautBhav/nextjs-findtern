"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
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

  async function call(method: "POST" | "DELETE") {
    if (method === "DELETE" && !window.confirm("Close this drive's link? Every employer, including those already inside, loses access immediately.")) return;
    if (method === "POST" && !props.revoked && !window.confirm("Issue a new link? Companies already inside keep access, but anyone you sent the current link to who hasn't opened it yet will need the new one.")) return;
    setBusy(true);
    setError(null);
    const res = await csrfFetch(`/api/college/drives/${props.driveId}/link`, { method }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null;
    setBusy(false);
    if (!res?.ok) return setError(body?.error ?? "Couldn't update the link.");
    setUrl(method === "POST" ? body?.url ?? null : null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {url ? <ShareLink url={url} {...props} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => call("POST")}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] border border-ink-200 bg-white px-4 text-[14px] font-medium text-ink-800 shadow-2xs hover:bg-ink-50"
        >
          {props.revoked ? "Reopen with a new link" : "Issue a new link"}
        </button>
        {!props.revoked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => call("DELETE")}
            className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] px-4 text-[14px] font-medium text-danger hover:bg-danger-soft"
          >
            Close link now
          </button>
        ) : null}
        <span role="status" aria-live="polite" className="text-[14px] text-danger">
          {error}
        </span>
      </div>
    </div>
  );
}
