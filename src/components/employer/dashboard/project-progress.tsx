export type ProjectProgressProps = {
  id: string;
  name: string;
  /** Not open for hiring (closed, taken down). */
  closed: boolean;
  hired: number;
  /** Offers in play (awaiting a reply or accepted). */
  open: number;
  /** Declined, withdrawn or expired: the hatched share of the bar. */
  declined: number;
  /** The one action for this project, or null when closed with nothing to do. */
  action: { label: string; href: string } | null;
  /** True from the 4th project: hide below `sm` so phones show 3 rows. */
  hiddenOnPhone: boolean;
};

/** WP3 fills this in. WP0 ships the contract only; it renders nothing. */
export function ProjectProgress(props: ProjectProgressProps) {
  void props;
  return null;
}
