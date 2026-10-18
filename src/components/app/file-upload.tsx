"use client";

import { useId, useRef, useState } from "react";
import { Check, FileUp, Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export type UploadResult = { key: string; url: string; contentType: string; bytes: number; name: string };

/**
 * One file input for every upload in the app. Posts the raw file to
 * /api/uploads with its kind; the server checks type and size, stores it and
 * links it to the right record.
 */
export function FileUpload({
  kind,
  accept,
  label,
  hint,
  current,
  onUploaded,
  className,
}: {
  kind: "profile_photo" | "aadhaar" | "pan" | "intro_video" | "marksheet" | "employer_logo" | "offer_letter" | "cms_image" | "support";
  accept: string;
  label: string;
  hint?: string;
  /** Name of a file already on record, shown until replaced. */
  current?: string | null;
  onUploaded?: (r: UploadResult) => void;
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [name, setName] = useState<string | null>(current ?? null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setState("busy");
    setError(null);
    try {
      const res = await csrfFetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": file.type, "x-document-kind": kind, "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      const data = (await res.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };
      if (!res.ok || !data.key) throw new Error(data.error ?? "Upload failed. Try again.");
      setName(file.name);
      setState("done");
      onUploaded?.({ key: data.key, url: data.url ?? "", contentType: data.contentType ?? file.type, bytes: data.bytes ?? file.size, name: file.name });
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={id}
          className={cn(
            "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-800 shadow-2xs hover:bg-ink-50 focus-within:ring-2 focus-within:ring-brand-500/30",
            state === "busy" && "pointer-events-none opacity-60",
          )}
        >
          {state === "busy" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <FileUp className="size-3.5 text-brand-600" aria-hidden />}
          {state === "busy" ? "Uploading…" : name ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          <input
            ref={input}
            id={id}
            type="file"
            accept={accept}
            className="sr-only"
            disabled={state === "busy"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
        {name ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-600">
            {state === "done" ? <Check className="size-3.5 text-brand-600" aria-hidden /> : null}
            <span className="truncate">{name}</span>
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
