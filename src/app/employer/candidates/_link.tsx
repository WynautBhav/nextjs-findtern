import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * A link that points back at the Candidates page itself. The results region answers its click in place (from the cache or one
 * small request), so the router's idle prefetch of the whole page (two dozen reads on the server, for every link in the list)
 * is pure waste: off by default. Hover and focus still warm the results (see _app.tsx).
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
