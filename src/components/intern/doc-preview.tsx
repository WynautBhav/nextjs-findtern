"use client";

import { useState } from "react";
import { FileImage } from "lucide-react";

/** An image preview for a document (scans uncropped), with an icon if the file can't be shown. */
export function DocImagePreview({ href, fit = "cover" }: { href: string; fit?: "cover" | "contain" }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <FileImage className="size-5 text-text-subtle" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element -- per-request signed URL behind an access check
  return <img src={href} alt="" loading="lazy" onError={() => setFailed(true)} className={fit === "cover" ? "size-full object-cover" : "size-full object-contain p-2"} />;
}
