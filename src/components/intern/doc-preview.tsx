"use client";

import { useState } from "react";
import { FileImage } from "lucide-react";

/** Image thumbnail for a document, with an icon if the file can't be shown. */
export function DocImagePreview({ href, label }: { href: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="grid aspect-[16/10] place-items-center bg-ink-50 text-ink-400">
        <span className="flex flex-col items-center gap-2 text-sm">
          <FileImage className="size-10" aria-hidden />
          Preview not available
        </span>
      </div>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="block bg-ink-50" aria-label={`Open ${label}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- per-request signed URL behind an access check */}
      <img src={href} alt="" loading="lazy" onError={() => setFailed(true)} className="aspect-[16/10] w-full object-contain" />
    </a>
  );
}
