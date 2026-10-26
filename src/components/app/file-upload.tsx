"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, FileUp, Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export type UploadResult = { key: string; url: string; contentType: string; bytes: number; name: string };

const MB = 1024 * 1024;

/** Display names for the types the upload route accepts. */
const TYPE_NAMES: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
  "video/mp4": "MP4",
  "video/webm": "WebM",
  "video/quicktime": "MOV",
};

/** Some browsers leave `File.type` empty (often .mov on Linux/Windows); the
 *  server rejects an untyped body, so the type is inferred from the name. */
const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

function typeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? "";
}

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
  noun,
  maxBytes,
  preview,
}: {
  kind: "profile_photo" | "aadhaar" | "pan" | "intro_video" | "marksheet" | "certificate" | "employer_logo" | "offer_letter" | "cms_image" | "support";
  accept: string;
  label: string;
  hint?: string;
  /** Name of a file already on record, shown until replaced. */
  current?: string | null;
  onUploaded?: (r: UploadResult) => void;
  className?: string;
  /** Word used in the button ("Upload {noun}"); defaults to the label in lowercase. */
  noun?: string;
  /** Checked before uploading so a too-large file fails at once, not after the upload. */
  maxBytes?: number;
  /** Show the uploaded video from the local file, so the candidate can check it. */
  preview?: "video";
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [name, setName] = useState<string | null>(current ?? null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const word = noun ?? label.toLowerCase();

  // Object URLs hold the file in memory until revoked.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function upload(file: File) {
    const allowed = accept.split(",").map((t) => t.trim());
    const type = typeOf(file);
    if (!allowed.includes(type)) {
      setState("error");
      setError(`That file type isn't accepted here. Use ${allowed.map((t) => TYPE_NAMES[t] ?? t).join(", ")}.`);
      if (input.current) input.current.value = "";
      return;
    }
    if (maxBytes && file.size > maxBytes) {
      setState("error");
      setError(`That file is ${(file.size / MB).toFixed(1)} MB. The limit is ${Math.round(maxBytes / MB)} MB.`);
      if (input.current) input.current.value = "";
      return;
    }
    setState("busy");
    setError(null);
    try {
      const res = await csrfFetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": type, "x-document-kind": kind, "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      const data = (await res.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };
      if (!res.ok || !data.key) throw new Error(data.error ?? "Upload failed. Try again.");
      setName(file.name);
      setState("done");
      if (preview) setPreviewUrl(URL.createObjectURL(file));
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
            "inline-flex min-h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-800 shadow-2xs hover:bg-ink-50 focus-within:ring-2 focus-within:ring-brand-500/30",
            state === "busy" && "pointer-events-none opacity-60",
          )}
        >
          {state === "busy" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <FileUp className="size-3.5 text-brand-600" aria-hidden />}
          {state === "busy" ? "Uploading…" : name ? `Replace ${word}` : `Upload ${word}`}
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
      {previewUrl ? (
        <video
          src={previewUrl}
          controls
          preload="metadata"
          className="mt-3 aspect-video w-full max-w-sm rounded-[10px] border border-ink-200 bg-ink-900"
        >
          <track kind="captions" />
        </video>
      ) : null}
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
