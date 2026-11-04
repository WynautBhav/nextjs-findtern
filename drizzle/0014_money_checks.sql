-- Hand-written. Closes the NULL hole in the 0013 partial unique indexes (REVIEW-7 M-1): a completion_bonus payout
-- must name its proposal, an incentive wallet entry must name its proposal. Idempotent: DROP IF EXISTS then ADD.
-- NOT VALID then VALIDATE keeps the ADD cheap; VALIDATE fails loudly if an existing row breaks the rule.
-- SET LOCAL: scoped to the runner's transaction.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "intern_payouts" DROP CONSTRAINT IF EXISTS "intern_payouts_bonus_has_proposal";
--> statement-breakpoint
ALTER TABLE "intern_payouts" ADD CONSTRAINT "intern_payouts_bonus_has_proposal" CHECK ("kind" <> 'completion_bonus' OR "bonus_proposal_id" IS NOT NULL) NOT VALID;
--> statement-breakpoint
ALTER TABLE "intern_payouts" VALIDATE CONSTRAINT "intern_payouts_bonus_has_proposal";
--> statement-breakpoint
ALTER TABLE "college_wallet_entries" DROP CONSTRAINT IF EXISTS "college_wallet_incentive_has_proposal";
--> statement-breakpoint
ALTER TABLE "college_wallet_entries" ADD CONSTRAINT "college_wallet_incentive_has_proposal" CHECK ("kind" <> 'incentive' OR "proposal_id" IS NOT NULL) NOT VALID;
--> statement-breakpoint
ALTER TABLE "college_wallet_entries" VALIDATE CONSTRAINT "college_wallet_incentive_has_proposal";
