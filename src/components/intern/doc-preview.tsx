"use client";

import { useEffect, useRef, useState } from "react";
import { FileImage } from "lucide-react";

/** An image preview for a document (scans uncropped), with an icon if the file can't be shown. */
export function DocImagePreview({ href, fit = "cover" }: { href: string; fit?: "cover" | "contain" }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // A server-rendered <img> can fail before React attaches onError, which then never fires; check once on mount.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [href]);
  if (failed) {
    return (
      <span className="flex flex-col items-center gap-1.5 p-3 text-center text-xs text-text-subtle">
        <FileImage className="size-5" aria-hidden />
        No preview
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- per-request signed URL behind an access check
    <img ref={ref} src={href} alt="" loading="lazy" onError={() => setFailed(true)} className={fit === "cover" ? "size-full object-cover" : "size-full object-contain p-2"} />
  );
}
