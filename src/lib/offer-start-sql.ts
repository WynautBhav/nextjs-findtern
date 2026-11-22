import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * SQL twin of `offerPastStart` (offer.ts): the offer's start date is a real-looking day on or before `today`, the IST day
 * from `todayIst()` (an offer closes when its start day begins in India). `offerDetails` is the jsonb column or alias
 * expression. The sweeper (proposal-expiry-db.ts) and the college counts share this, so they cannot drift from the screens.
 * Relative imports only: the node tests load this file directly.
 */
export function startBegunSql(offerDetails: SQLWrapper, today: string): SQL {
  return sql`(left(${offerDetails}->>'startDate', 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and left(${offerDetails}->>'startDate', 10) <= ${today})`;
}
