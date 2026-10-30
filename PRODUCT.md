# Findtern — Product Truth

Durable context for anyone designing or building in this repo. Visual decisions
live in `SPECS.md`, code rules in `ARCHITECTURE.md`; this file only records what the
product *is*, so those files can change without this one rotting.

## What Findtern is

A two-sided Indian marketplace. Students take an AI interview, receive a
**Findtern Score** out of 10, and employers shortlist and hire on that score
rather than on applications. The employer pays a per-hire charge plus the
internship; the student receives a stipend.

The category it is *not*: it is not an internship board collecting applications.
There is no apply button anywhere in the product, and that is deliberate —
companies search candidates, they do not receive a queue of forms. The profile
is the unit of work.

## The three surfaces

| Area | Who | What it is for |
|---|---|---|
| `/intern/**` | student / candidate | take the interview, read the score, track applications, interviews, timesheets, stipend |
| `/employer/**` | hiring company | browse candidates by score and skills, shortlist, send offers, schedule interviews, approve timesheets, pay |
| `/admin/**` | Findtern staff | run the marketplace: approve candidates, set ratings, run payouts, broadcast, edit site content |

## The commercial spine

1. **Free profile.** A student creates a profile; it is not visible to employers.
2. **₹2,499 activation, one-time.** Not a subscription. Covers the AI interview
   and produces the Findtern Score. This is the only student-side revenue.
3. **Score → shortlist.** The score is what employers filter and sort on. It is
   therefore the product's most load-bearing asset, and anything that makes it
   purchasable or arbitrary destroys the business.
4. **Per-hire charge + internship cost.** Priced in three bands — Espresso
   (under 6/10), Cappuccino (6–8), Latte (8+). The coffee metaphor is the
   brand's hook, not decoration.
5. **The 18-month guarantee.** If the placement does not happen, the fee comes
   back. It is the reason the fee is affordable and it must appear wherever the
   fee does.

## What must never be true

- **The score is not purchasable.** No paid badge, no paid "boost", no paid
  ranking. Internshala's own employer blog tells employers that a ₹499–999 paid
  certificate improves shortlisting odds — that is the model we are opposed to.
- **No urgency that is not real.** India's CCPA Dark Patterns Guidelines (2023)
  have already fined PhysicsWallah ₹5,00,000 for pre-selected options and a
  coaching platform for a false 24-hour timer. No invented countdowns.
- **Raw database enums never reach a user.** No `interview_first`, no
  `direct`, no `withdrawn` in a status slot.
- **A place that has no data is not the same as a place that is broken.**
  Every list must distinguish the two.
- **Nothing regresses without an explanation.** Progress that silently moves
  backwards is a support ticket.

## Roles, gating, and trust

- Payment → profile live → AI interview → score → employer visibility.
- An intern is not "hired" until a proposal is accepted; stages are derived from
  rows, never stored as a mutable status.
- Employers see masked candidate identity until they have sent an offer. That
  masking is a product feature and must not be casually removed for convenience.
- The intern and the employer must see **the same** score report. Black-box
  screening is the reason candidates distrust AI interviewers.

## Data facts worth knowing before designing

- `interviews` rows are keyed by `selectedSlot` 1–3 over `slot1..slot3`.
  Slot 2 being chosen is the single most common complaint in candidate research,
  so any interview UI must show all three and mark the chosen one.
- `proposals.status` and `timesheets.status` have **more than one** status
  vocabulary in the codebase history (`hired` and `accepted` both mean working).
  Treat the union.
- Money: `offer_details` is major units; every `*_payments` / `intern_payouts`
  amount column is minor. Conversion happens at the display boundary.
- The score is the mean of four axes (communication, coding, aptitude,
  interview) stored in `intern_onboarding.extra_data.ratings`, with the mean
  cached as `extra_data.findternScore`. Editing one axis moves the score.

## Constraints

- Next.js App Router, React Server Components, Tailwind v4, Postgres via Drizzle.
- Poppins is the only family. It is geometric with heavy terminals: at 700 it
  reads like a poster, and uppercase destroys its counters.
- Brand accent is `brand-700` `#0e6049`. One accent, under ~5% of pixels.
- UI primitives come from the Watermelon shadcn registry.
- Backend is migrating to Supabase; UI work must not assume a specific ORM call
  pattern in page code.