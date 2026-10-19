/* eslint-disable @next/next/no-img-element -- see the note below on why the
   logo bypasses next/image. */
import { cn } from "@/lib/utils";

/**
 * The Findtern logo, one component for every surface.
 *
 *  - `green` - the wordmark on light backgrounds (marketing header, admin).
 *  - `white` - for dark/brand-green backgrounds (footer, app sidebars).
 *
 * Both files are trimmed, true-colour 1200px masters cut from the original
 * artwork. They are served as-is rather than through next/image: the
 * optimiser re-encoded the flat-colour mark to lossy WebP at quality 75 and
 * sized it for 200px, which is what made the edges look soft and the small
 * type smudge on high-density screens. At ~66 KB / 36 KB the originals are
 * cheaper than the quality loss.
 */
const SRC = {
  green: "/media/findtern-logo-green.png",
  white: "/media/findtern-logo-white.png",
} as const;

/** Intrinsic size of both masters, so the browser reserves the right box. */
const WIDTH = 1200;
const HEIGHT = 361;

export function Logo({
  variant = "green",
  className,
  priority,
  alt = "Findtern",
}: {
  variant?: "green" | "white";
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  return (
    <img
      src={SRC[variant]}
      alt={alt}
      width={WIDTH}
      height={HEIGHT}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={cn("w-auto object-contain", className)}
    />
  );
}
