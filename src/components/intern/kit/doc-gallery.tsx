"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, FileImage, FileText, Video } from "lucide-react";

import { DocImagePreview } from "@/components/intern/doc-preview";
import { cn } from "@/lib/utils";

export type GalleryDoc = {
  id: string;
  href: string;
  label: string;
  fileName: string;
  contentType: string | null;
  size: number | null;
  /** Already formatted (dd/mm/yyyy) by the server page. */
  stamped: string | null;
};

/** Documents as a gallery: large thumbnails that rise in one after another and lift on hover. */
export function DocGallery({ docs, wide }: { docs: GalleryDoc[]; wide?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <ul className={cn("grid gap-4", wide ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
      {docs.map((doc, i) => {
        const type = (doc.contentType ?? "").toLowerCase();
        return (
          <motion.li
            key={doc.id}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={reduce ? undefined : { y: -3 }}
            transition={{ delay: reduce ? 0 : i * 0.05, type: "spring", stiffness: 260, damping: 26 }}
            className="group relative min-w-0 rounded-apple-lg bg-white p-2 shadow-[0_1px_2px_rgb(15_40_30/0.06),0_10px_24px_-14px_rgb(15_40_30/0.2)] ring-1 ring-ink-200/70 transition-shadow hover:shadow-[0_1px_2px_rgb(15_40_30/0.06),0_18px_32px_-14px_rgb(15_40_30/0.3)] focus-within:ring-2 focus-within:ring-brand-600"
          >
            <span className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-apple-md bg-ink-50 text-text-subtle">
              {type.startsWith("image/") ? (
                <DocImagePreview href={doc.href} fit={doc.label === "Profile photo" ? "cover" : "contain"} />
              ) : type.startsWith("video/") ? (
                <video muted preload="metadata" src={doc.href} className="size-full object-cover" aria-hidden />
              ) : (
                <span className="flex flex-col items-center gap-2 text-xs">
                  <DocIcon contentType={doc.contentType} />
                  {kindLabel(doc.contentType)}
                </span>
              )}
              <span aria-hidden className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-white/90 text-ink-700 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 touch:opacity-100">
                <ArrowUpRight className="size-4" />
              </span>
            </span>
            <div className="px-1.5 pb-1.5 pt-2.5">
              <a
                href={doc.href}
                target="_blank"
                rel="noreferrer"
                className="block break-words text-sm font-medium text-ink-900 after:absolute after:inset-0 after:rounded-apple-lg focus-visible:outline-none"
              >
                {doc.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <p className="nums mt-0.5 text-xs text-text-subtle [overflow-wrap:anywhere]">
                {doc.fileName} · {formatBytes(doc.size)}
                {doc.stamped ? ` · ${doc.stamped}` : ""}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

export function kindLabel(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("image/")) return `${t.slice(6).toUpperCase()} image`;
  if (t.startsWith("video/")) return "Video";
  if (t === "application/pdf") return "PDF";
  return "File";
}

function DocIcon({ contentType }: { contentType: string | null }) {
  const type = (contentType ?? "").toLowerCase();
  if (type.startsWith("video/")) return <Video className="size-5" aria-hidden />;
  if (type.startsWith("image/")) return <FileImage className="size-5" aria-hidden />;
  return <FileText className="size-5" aria-hidden />;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return "Size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
