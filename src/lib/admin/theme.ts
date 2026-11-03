/**
 * The admin console's light/dark choice, kept in a cookie so the server renders the right theme on
 * the first paint (no flash). A plain module on purpose, for the same reason as `@/lib/rail`: the
 * shell is "use client", and a server layout importing a constant from it would get a client
 * reference instead of the string.
 */
export const ADMIN_THEME_COOKIE = "ft_admin_theme";

export type AdminTheme = "light" | "dark";

/** Light is the default: anything but the exact string "dark" reads as light. */
export function parseAdminTheme(value: string | undefined | null): AdminTheme {
  return value === "dark" ? "dark" : "light";
}
