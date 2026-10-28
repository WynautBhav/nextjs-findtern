# Owner questions from QA (Tester B, 28 Oct 2026)

One line each; the row or ledger ID says where it came from. Answers go next to each line. Details for every unclear bug-sheet row are at the end of `docs/qa/bug-sheet-7-results.md`.

1. **S1 r4** (home page, "From blank profile to signed offer"): what should step 3 and step 6 say? The sheet has no new text, and the current copy is not broken.
2. **S1 r46, NC r25, NC r27** (bank details): ask for bank details only on the "About you" step (as built, with the bank-name dropdown), only in Settings (as the legacy does and S1 r46 asks), or in both places?
3. **S1 r86** (proposal): which screen and what should change: the employer proposals list, the proposal page, or the intern's offer page?
4. **S1 r97** (compare): a candidate with 16 skills shows 16; should compare cap it (say 8, matches first, "+8 more")?
5. **S1 r110** (candidate filters, "same design as the previous one"): is the same filter set enough (it matches), or should the panel copy the legacy layout? If yes, which screen is the reference?
6. **S1 r111** (quick view): which part of the quick view should change, and to what?
7. **S1 r100** (offer letter, "same as the previous website"): the sections match the legacy page; do you want the legacy visual layout too?
8. **NC r16** (Google sign-in "redirect_uri_mismatch"): is the authorised redirect URI for the staging and the production hosts added in the Google console? (Configuration, not code.)
9. **NC r35, NC r36** (new account cannot sign in; several emails at once): which network were you on and what did the screen say (a "Too many requests" message would confirm QA-138, the per-address limit)? Do you want it loosened for campus drives (QA-138)?
10. **S1 r45 / QA-137**: confirm the reading of S1 r22 and r45: Aadhaar number mandatory, PAN image mandatory, Aadhaar image optional (as the legacy). A yes lets the builder fix QA-137 as a P1.
11. **QA-106** (pricing calculator): the owner decision is a flat 22 or 26 working days (176 / 208 h); the calculator uses 160 / 192 h. Change the calculator to the decision?
12. **QA-109** (emergency number): may two interns share one emergency number (siblings, one parent)? The build refuses a number any other account already uses.
