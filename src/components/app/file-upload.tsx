"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, FileUp, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { announceTermsRequired, readCsrfCookie } from "@/lib/client-fetch";
import { UnreadableImageError, shrinkImage } from "@/lib/image-shrink";
import { cn } from "@/lib/utils";

import { PROGRESS_DELAY_MS, nextPercent } from "./upload-progress";

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

type PostResult = { ok: boolean; data: Partial<UploadResult> & { error?: string } };

/**
 * POST the raw file to /api/uploads. XMLHttpRequest rather than fetch(), because fetch cannot report
 * how much of a request body has gone out; everything else (endpoint, headers, CSRF token, cookies,
 * the terms pop-up on a 403) is what csrfFetch sent before. A network failure rejects with a
 * TypeError, as fetch does, so the caller's error message is unchanged.
 */
function postFile(
  file: File,
  type: string,
  kind: string,
  onProgress: (loaded: number, total: number) => void,
  onSent: () => void,
): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.setRequestHeader("Content-Type", type);
    xhr.setRequestHeader("x-document-kind", kind);
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    const csrf = readCsrfCookie();
    if (csrf) xhr.setRequestHeader("x-csrf-token", csrf);
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.upload.onload = onSent;
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.onabort = () => reject(new TypeError("Network request aborted"));
    xhr.onload = () => {
      let data: PostResult["data"] = {};
      try {
        data = JSON.parse(xhr.responseText) as PostResult["data"];
      } catch {
        // not JSON: the caller falls back to the generic message
      }
      if (xhr.status === 403) announceTermsRequired(data);
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
    };
    xhr.send(file);
  });
}

/**
 * One file input for every upload in the app. Posts the raw file to
 * /api/uploads with its kind; the server checks type and size, stores it and
 * links it to the right record. An upload still running after a second gets
 * a progress bar with the real share of bytes sent.
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
  shrink,
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
  /**
   * Shrink a JPG/PNG in the browser (to a JPEG under ~500 KB, EXIF applied) before the size check and
   * upload, so a phone photo is not refused for being over `maxBytes`. The server still checks it all.
   */
  shrink?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [name, setName] = useState<string | null>(current ?? null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // `percent` is bytes sent; `showBar` flips on only if the upload outlasts PROGRESS_DELAY_MS;
  // `sent` means every byte is out and the server is re-encoding / storing.
  const [percent, setPercent] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const [sent, setSent] = useState(false);
  const word = noun ?? label.toLowerCase();

  // Object URLs hold the file in memory until revoked.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function upload(picked: File) {
    const allowed = accept.split(",").map((t) => t.trim());
    let file = picked;
    let type = typeOf(file);
    if (!allowed.includes(type)) {
      setState("error");
      setError(`That file type isn't accepted here. Use ${allowed.map((t) => TYPE_NAMES[t] ?? t).join(", ")}.`);
      if (input.current) input.current.value = "";
      return;
    }
    if (shrink && type.startsWith("image/")) {
      setState("busy");
      setError(null);
      setPercent(0);
      setSent(false);
      setShowBar(false);
      try {
        file = (await shrinkImage(file)).file;
        type = file.type || type;
      } catch (e) {
        setState("error");
        setError(e instanceof UnreadableImageError ? e.message : "That image could not be read. Try a different JPG or PNG.");
        if (input.current) input.current.value = "";
        return;
      }
    }
    if (maxBytes && file.size > maxBytes) {
      setState("error");
      setError(`That file is ${(file.size / MB).toFixed(1)} MB. The limit is ${Math.round(maxBytes / MB)} MB.`);
      if (input.current) input.current.value = "";
      return;
    }
    setState("busy");
    setError(null);
    setPercent(0);
    setSent(false);
    setShowBar(false);
    const barTimer = setTimeout(() => setShowBar(true), PROGRESS_DELAY_MS);
    try {
      const { ok, data } = await postFile(
        file,
        type,
        kind,
        (loaded, total) => setPercent((prev) => nextPercent(prev, loaded, total)),
        () => {
          setPercent(100);
          setSent(true);
        },
      );
      if (!ok || !data.key) throw new Error(data.error ?? "Upload failed. Try again.");
      setName(file.name);
      setState("done");
      if (preview) setPreviewUrl(URL.createObjectURL(file));
      onUploaded?.({ key: data.key, url: data.url ?? "", contentType: data.contentType ?? file.type, bytes: data.bytes ?? file.size, name: file.name });
    } catch (e) {
      setState("error");
      setError(e instanceof TypeError || !(e instanceof Error) ? "Couldn't reach the server. Check your connection and try again." : e.message);
    } finally {
      clearTimeout(barTimer);
      setShowBar(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={className}>
      {/* The file name sits on its own line under the button, so two uploads
          side by side keep the same shape whatever the name's length. */}
      <div className="flex flex-col items-start gap-2">
        {/* The bar sits on the button's bottom edge, so it adds no height. */}
        <div className="relative inline-flex">
          <label
            htmlFor={id}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: cn(
                "min-h-11 cursor-pointer tabular-nums has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600",
                state === "busy" && "pointer-events-none opacity-60",
              ),
            })}
          >
            {state === "busy" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
            {state === "busy" ? (showBar ? (sent ? "Saving…" : `Uploading ${percent}%`) : "Uploading…") : name ? `Replace ${word}` : `Upload ${word}`}
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
          {state === "busy" && showBar ? (
            <span
              role="progressbar"
              aria-label={`Uploading ${word}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={sent ? "Sent, saving" : `${percent}%`}
              className="pointer-events-none absolute inset-x-2 bottom-1 h-1 overflow-hidden rounded-full bg-brand-100"
            >
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </span>
          ) : null}
        </div>
        {/* Always mounted, so the success is announced when it fills in. */}
        <span role="status" className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-sm text-ink-700 empty:-mt-2">
          {name ? (
            <>
              {state === "done" ? <Check className="size-4 shrink-0 text-brand-600" aria-hidden /> : null}
              {state === "done" ? <span className="sr-only">Uploaded:</span> : null}
              <span className="truncate">{name}</span>
            </>
          ) : null}
        </span>
      </div>
      {previewUrl ? (
        <video
          src={previewUrl}
          controls
          preload="metadata"
          className="mt-3 aspect-video w-full max-w-sm rounded-apple-sm border border-ink-200 bg-ink-900"
        >
          <track kind="captions" />
        </video>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
