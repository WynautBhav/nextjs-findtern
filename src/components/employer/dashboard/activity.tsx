import type { Activity as ActivityData } from "@/lib/employer-dashboard";

/** `activity.weeks` is always 8 entries, oldest first. `activeWeeks < 2`: draw the fallback (figure plus tick row). */
export type ActivityProps = { activity: ActivityData };

/** WP2 fills this in. WP0 ships the contract only; it renders nothing. */
export function Activity(props: ActivityProps) {
  void props;
  return null;
}
