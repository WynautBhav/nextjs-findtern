/**
 * The contract between the dashboard's data loader (lib/admin/dashboard-queues.ts)
 * and its triage UI (components/admin/triage/*). Plain serialisable data only:
 * it crosses from a server component into client components.
 */

/** Same keys and order as the rail and the old task list: money first, then meetings, then scores, then the rest. */
export type QueueKey = "calendar" | "payouts" | "nolink" | "unscored" | "messages" | "accepted" | "sheets";

export type QueueRecord = {
  /** Stable React key and selection id: unique across all groups, e.g. "payouts:<payoutId>". */
  id: string;
  queue: QueueKey;
  /** The person or company, e.g. "Ira Zugwwsv". */
  title: string;
  /** One line of context, e.g. "Brightwell US · October stipend". */
  subtitle: string;
  /** Rupees at stake in minor units (paise), converted to INR; null when the record is not money. */
  amountMinorInr: number | null;
  /** Whole days since the item became actionable (due date passed, offer accepted, signup finished); null when unknown. */
  ageDays: number | null;
  /** ISO timestamp the row is about (an interview slot, a due date); null when none. */
  when: string | null;
  /** The record's own page in the admin, where the work is finished. */
  href: string;
  /** 3 to 6 properties for the peek pane, already formatted for display. */
  props: { label: string; value: string }[];
  /** Only for queue "payouts": lets the peek pane embed the existing PayoutEditor (inline "mark paid + bank reference"). */
  payout?: { id: string; internId: string; status: string; reference: string | null; note: string | null };
};

export type QueueGroup = {
  key: QueueKey;
  /** Plural, display-ready, with the count NOT included, e.g. "Stipend payouts due". */
  label: string;
  /** Why it matters, one sentence (reuse the existing task copy). */
  detail: string;
  /** The true total in the queue (may exceed records.length). */
  count: number;
  /** Of which added in the last 7 days, when the queue can tell; else 0. */
  fresh: number;
  /** A state rather than a queue (the calendar flag): the label reads on its own without the figure. */
  flag?: boolean;
  /** Where the whole queue lives, for "See all N". */
  moreHref: string;
  moreLabel: string;
  /** The first (most urgent) records, at most 6. */
  records: QueueRecord[];
  /** This queue's query failed: count 0 and records [] are "unknown", never "all clear"; the UI shows a retry line instead. */
  error?: boolean;
};

export type MoneyStuck = {
  /** Sum of the offer value of accepted offers still awaiting employer payment, in INR minor units. */
  owedByEmployersMinor: number;
  employerOfferCount: number;
  /** Sum of pending stipend payouts due now or within 3 days, in INR minor units. */
  dueToInternsMinor: number;
  payoutCount: number;
  /** Collected in the last 7 India days, from lib/admin/revenue (the one money layer). */
  collectedWeekMinor: number;
};

export type DashboardQueues = {
  groups: QueueGroup[];
  money: MoneyStuck;
  /** Sum of group counts that are queues (not flags) plus active flags, same rule as attentionTotal in lib/admin/dashboard. */
  total: number;
  fresh: number;
};
