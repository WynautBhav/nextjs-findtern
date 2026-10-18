import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The Findtern logo, one component for every surface.
 *
 *  - `green` - the wordmark on light backgrounds (marketing header, admin).
 *  - `white` - for dark/brand-green backgrounds (footer, app sidebars).
 *
 * Until the official white logo file arrives, `white` renders the existing
 * light asset forced to pure white with a CSS filter. Swap WHITE_SRC (and drop
 * the filter) when the real file lands; every surface updates at once.
 */
const GREEN_SRC = "/media/findtern-logo.png";
const WHITE_SRC = "/media/logo-remove.png";
const WHITE_IS_PLACEHOLDER = true;

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
  const white = variant === "white";
  return (
    <Image
      src={white ? WHITE_SRC : GREEN_SRC}
      alt={alt}
      width={white ? 718 : 3363}
      height={white ? 347 : 1013}
      priority={priority}
      sizes="200px"
      className={cn("w-auto object-contain", white && WHITE_IS_PLACEHOLDER && "brightness-0 invert", className)}
    />
  );
}
