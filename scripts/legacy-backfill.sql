-- Idempotent fixes for rows written by the legacy app or by early builds of
-- this one. Run by scripts/migrate.ts after every migration pass.

-- users.created_at arrived in 0001 and defaulted to the migration time.
-- Use the onboarding row's timestamp when it is earlier.
UPDATE users u SET created_at = o.created_at
FROM intern_onboarding o
WHERE o.user_id = u.id AND o.created_at IS NOT NULL AND o.created_at < u.created_at;

-- Payouts: "paid" is the only settled status both apps count.
UPDATE intern_payouts SET status = 'paid' WHERE status = 'completed';

-- Onboarding: a blank Aadhaar/PAN is NULL. Early builds stored "", which the
-- UNIQUE indexes then refused for every later intern (INT-32).
UPDATE intern_onboarding SET aadhaar_number = NULL WHERE aadhaar_number = '';
UPDATE intern_onboarding SET pan_number = NULL WHERE pan_number = '';
