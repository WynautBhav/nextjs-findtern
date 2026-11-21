/**
 * The Schedule empty state (B-44). Someone on the shortlist can be booked whether or not they already have a
 * proposal (the shortlist lists them under "Already proposed"), so only an empty shortlist says to shortlist first.
 */
export function emptyScheduleCopy(shortlisted: number): { body: string; next: { label: string; href: string }; who: string } {
  if (shortlisted > 0) {
    return {
      body: `You have ${shortlisted} ${shortlisted === 1 ? "candidate" : "candidates"} on your shortlist, including any you have already sent a proposal. Book a meeting from your shortlist: you offer 3 time slots and they choose one.`,
      next: { label: "Open your shortlist", href: "/employer/cart" },
      who: "You - book from your shortlist",
    };
  }
  return {
    body: "Shortlist a candidate, then book a meeting from your shortlist: you offer 3 time slots and they choose one.",
    next: { label: "Browse candidates", href: "/employer/candidates" },
    who: "You - shortlist someone first",
  };
}
