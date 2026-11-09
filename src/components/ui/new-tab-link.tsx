import Link from "next/link";
import { NEW_TAB_ATTRS, NEW_TAB_HINT } from "./new-tab";

/** Visually hidden, so screen-reader users hear that the link leaves this tab. */
export function NewTabHint() {
  return <span className="sr-only">{NEW_TAB_HINT}</span>;
}

/** next/link that opens in a new tab (marketing pages linked from the signed-in apps and from forms). */
export function NewTabLink({ children, ...rest }: React.ComponentProps<typeof Link>) {
  return (
    <Link {...rest} {...NEW_TAB_ATTRS}>
      {children}
      <NewTabHint />
    </Link>
  );
}
