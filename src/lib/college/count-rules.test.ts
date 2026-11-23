import { test } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";

import { ACCEPTED_OFFER_STATUSES, acceptedStatusesSql, interviewExpiredSql, interviewUpcomingSql, interviewWaitingSql, offerLapsedSql, offerOpenSql, offerWaitingSql } from "./count-rules.ts";
import { startBegunSql } from "../offer-start-sql.ts";
import { offerPastStart, todayIst } from "../offer.ts";
import { internOfferKey } from "../intern-offer-view.ts";

const render = (q: SQL) => {
  const r = new PgDialect().sqlToQuery(q);
  return { text: r.sql.replace(/\s+/g, " "), params: r.params };
};

const NOW = new Date("2026-11-23T20:00:00Z"); // 01:30 IST on the 24th
const TODAY = todayIst(NOW);

test("the offer SQL compares the start day with the IST day offerPastStart uses", () => {
  assert.equal(TODAY, "2026-11-24");
  const { text, params } = render(startBegunSql(sql.raw("pr.offer_details"), TODAY));
  assert.match(text, /left\(pr\.offer_details->>'startDate', 10\) <= \$1/);
  assert.deepEqual(params, [TODAY]);
  // The TS rule it mirrors: the start day itself is already past.
  assert.equal(offerPastStart("2026-11-24", NOW), true);
  assert.equal(offerPastStart("2026-11-25", NOW), false);
});

test("offers waiting on the student are sent and not past their start day", () => {
  const { text, params } = render(offerWaitingSql("pr", TODAY));
  assert.match(text, /pr\.status = 'sent' AND pr\.hired_at IS NULL AND NOT coalesce\(left\(pr\.offer_details/);
  assert.deepEqual(params, [TODAY]);
  // The intern's screens read a sent offer past its start day as lapsed, so it is not waiting.
  assert.equal(internOfferKey({ status: "sent", offerDetails: { startDate: "2026-11-24" } }, NOW), "lapsed");
  assert.equal(internOfferKey({ status: "sent", offerDetails: { startDate: "2026-11-30" } }, NOW), "sent");
});

test("open offers exclude expired and lapsed ones; lapsed and no-reply expiries read as the intern's lapsed", () => {
  const open = render(offerOpenSql("pr", TODAY));
  assert.match(open.text, /pr\.status IN \('sent', 'interview_scheduled'\) AND NOT/);
  assert.doesNotMatch(open.text, /expired/);
  const lapsed = render(offerLapsedSql("pr", TODAY));
  assert.match(lapsed.text, /pr\.status = 'expired' AND pr\.offer_details->>'expiredReason' = 'no_reply_past_start'/);
  assert.equal(internOfferKey({ status: "expired", offerDetails: { expiredReason: "no_reply_past_start" } }, NOW), "lapsed");
});

test("a processing offer (payment under way) counts as accepted", () => {
  assert.ok(ACCEPTED_OFFER_STATUSES.includes("processing"));
  const { text, params } = render(acceptedStatusesSql());
  assert.equal(text, "$1, $2, $3, $4");
  assert.deepEqual(params, ["accepted", "processing", "hired", "completed"]);
  assert.equal(internOfferKey({ status: "processing", offerDetails: {} }, NOW), "accepted");
});

test("meetings are upcoming or waiting only while their time has not passed", () => {
  const nowIso = NOW.toISOString();
  const up = render(interviewUpcomingSql("iv", nowIso));
  assert.match(up.text, /^\(iv\.status = 'scheduled' AND NOT \(/);
  assert.ok(up.params.includes(nowIso));
  const wait = render(interviewWaitingSql("iv", nowIso));
  assert.match(wait.text, /^\(iv\.status = 'pending' AND NOT \(/);
  const gone = render(interviewExpiredSql("iv", nowIso));
  assert.match(gone.text, /iv\.status = 'expired' OR \(iv\.status IN \('pending', 'waiting', 'proposed', 'scheduled'\) AND/);
});

test("an offer with no start date (full-time offers keep theirs inside fullTimeOffer) has not begun, never NULL", () => {
  // NULL here made NOT(...) NULL as well, so such offers dropped out of "waiting" and "lapsed" alike.
  const { text } = render(startBegunSql(sql.raw("pr.offer_details"), TODAY));
  assert.match(text, /^coalesce\(/);
  assert.match(text, /, false\)$/);
});
