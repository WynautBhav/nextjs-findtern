# College Partners: decisions and open questions

## Settled by the founder's brief (27 Oct 2026), built that way
| Question | Decision | Where it lives |
|---|---|---|
| Can students see their own interview recording? | **No.** Only the college admin (and Findtern) can. | No student route exposes it; officer views are audited |
| CGPA vs Findtern score gating | **The college decides, per drive.** Either or both, plus hand-include ("the officer has the authority"). | Drive builder; `eligibility.ts` |
| How does a student join? | Picks the college from the list; nothing else. A roster or college-email match adds "verified". | `/intern/college` |
| Cohorts | 2nd year = internship, 3rd = internship + PPO, 4th = job | `labels.ts` |
| Who shares the drive link? | The college, with the employers it invites | Share-link panel + invitation text |
| Is the officer read-only? | Yes on student data. They can run drives, the roster and nudges. | `collegeAdminMay()` |

## Open product decisions (need an owner)
1. **Name reveal inside drives.** Today drive employers see initials, as on the marketplace (PRODUCT.md: masked until an offer). The employer also sees the student's face in the video call, so masking only protects contact details. Options:
   - (a) keep masking;
   - (b) reveal names inside a college's drive, because the college vouches;
   - (c) reveal after shortlist.

   *Recommend (b)*: it is the college's event, and masking makes "call Riya now" awkward. Contact details stay hidden.
2. **How colleges are billed.** The pitch is about ₹2.5 lakh for 500 students, with the AI interview at cost (~₹600 vs ~₹500 bulk). Still undecided:
   - (a) a flat annual fee per college;
   - (b) per student who has taken the interview;
   - (c) a flat platform fee plus interviews passed through.

   Also undecided: does a hire from a drive pay Findtern's normal per-hire charge, or is it covered by the college deal? (The founder: "we'll settle terms with the college".) Nothing is built for billing.
3. **CGPA when a student reported a percentage.** Today they fail a CGPA cutoff unless hand-included, because there's no honest conversion. Should we ask students for CGPA explicitly when they join a college?
4. **Freeze eligibility once a drive opens?** Handshake freezes it; we allow edits and show a warning. Decide whether shortlisted students should be protected from later tightening.
5. **Under-18 students.** We block them (an 18+ declaration is required). DPDP allows them only with verifiable parental consent, and bans tracking/presence for children. Decide whether we need first-years under 18 (if so: DigiLocker-based parental consent, presence off).
6. **Retention after a student withdraws consent.** Today rows are hidden immediately and kept (consent ledger + audit log ≥ 1 year as DPDP requires). Define an erasure job for everything else, and the retention period.
7. **A second channel for nudges and calls.** Today it's the in-app bell, email and web push. Push is unreliable on iPhones (Add to Home Screen only), and reviewers complain Superset's push doesn't arrive. WhatsApp Business is the real channel for Indian students. Budget/vendor decision.
8. **College picker inside onboarding.** Today it's a dashboard card plus `/intern/college`. The founder pictured a dropdown in the signup flow; adding it to the onboarding wizard's academics step is a small follow-up.
9. **AISHE list licence.** The AISHE site says reuse needs permission; the IndiaAI mirror is labelled OGL-India. Get written OK from the Ministry of Education before importing all ~73k institutions commercially. Until then: seed partners + a short Jaipur list.

## Questions for Incruiter (send before selling "500 interviews in one hour")
1. **Throughput:** can 500 candidates start an AI interview in the same 60-minute window? What are the hard limits on concurrent sessions per account, and the rate limits on invite/creation APIs?
2. **Time to result:** how long after a candidate finishes do the score, report PDF and recording become available, and does the webhook fire for each? (We promise "results the next hour".)
3. **Bulk price:** the price per interview at 500 / 2,000 / 10,000 a year, GST-inclusive. Is ~₹500 achievable at 500 per college, and can it be pooled across colleges?
4. **Failure handling at scale:** if 30 of 500 drop mid-interview (network), can they resume or retake? Is a retake charged?
5. **Integrity:** what proctoring is there (tab switch, second face, copy-paste)? Can a college see flags in the report?
6. **Data and DPDP:**
   - Where are recordings stored (region), and for how long?
   - Can we delete per candidate on withdrawal?
   - Will Incruiter sign a processor agreement naming Findtern as data fiduciary?
7. **Recording links:** can recording/report URLs be signed and expiring, so a forwarded link stops working?
8. **Branding:** can the candidate page show "JKLU × Findtern" co-branding?
9. **Bulk invite:** a CSV/API for 500 invites with one shared window, and webhooks per completion with our candidate id echoed back.
