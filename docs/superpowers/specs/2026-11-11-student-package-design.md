# Student package: one college payment, one sheet upload

Status: draft for approval. Nothing is built.

## Intent
A college pays once for N students and gives a sheet (name, phone, email). When the team confirms the
upload, those students are told, and their activation fee (₹800) is shown as paid by the college. The
team sees one flow, not Seats and Drives.

## Goals
- One tab per college: Student package (pay, upload, confirm). Rename Drives; hide Seats for new colleges.
- On confirm, a student whose verified account email is on the sheet is waived at once (₹0 `college_drive`
  payment, college membership) and sees a dashboard notification: "Your fee was paid by <College> to Findtern".
- A student the sheet cannot be matched to (personal email, no account yet) gets an email with a code, sent
  automatically on confirm. The code is the only way in for them; matched students never need it.
- Phone-and-name matches keep going to Identity review; approving one waives that student.

## Non-goals
- No change to price, GST, refunds, or how a college is paid (admin still records the bank payment).
- No new verification method (no OTP to the college email). Not needed while the code is the fallback.
- Existing Seats (Jecrc 300, Poornima 120, 0 used) keep working as they are. Not migrated.

## Anti-goals
- A student must never be waived on an unverified claim (roster row alone, phone alone).
- Confirm must not fail or roll back because an email or notification failed.

## Approaches considered
1. Extend Drives (chosen): payment, import, preview, confirm, codes and redeem already exist; only the
   confirm step and the wording change.
2. Build on Seats: no roster, so the import would be rebuilt. Rejected.
3. A third product: more confusion for the team. Rejected.

## Design
- `confirmImport` (admin-db.ts): after linking, for each linked student call the existing waiver
  (`waiverPaymentRow` + membership) in the same transaction as the link; skip if already waived.
- After the transaction: `notify()` each linked student (in-app, deduped per order+student); queue the
  existing `drive_code` email only for rows with no linked student. Both best-effort.
- Dashboard: the existing notification list shows it; add the "paid by your college" line to the intern
  fee screen when a `college_drive` payment exists.
- UI: Drives tab and panel copy renamed; Seats tab hidden when a college has no seat batches.

## Left to the builder
Exact copy, the notification dedupe key, and whether the fee line sits in the checkout or the dashboard.

## My calls (change if wrong)
- Existing Seats stay; only hidden for colleges with none.
- Unmatched students get a code by email, not a second upload.
