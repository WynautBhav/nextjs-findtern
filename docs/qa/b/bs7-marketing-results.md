# Bug sheet 7: marketing rows, tester B

Build under test: production build on the local test port, Chromium, 1440 px and 375 px, signed out.
Scripts: `docs/qa/b/repro/bs7-marketing-*.mjs`. "S1" = Sheet1, "NC" = NEW CHANGES.
Sheet rows that are app-side (intern sidebar, onboarding, employer app, Google sign-in) are out of scope here.

| sheet-row | verdict | finding | screenshot |
|---|---|---|---|
| S1-r2 logo quality | PASS | Header logo is the real PNG (1200x361 source) shown at 186x56 px (1440) / 160x48 (375); at 2x device scale it is crisp, tagline "INTERNSHIP SIMPLIFIED" legible. | docs/qa/b/screens/bs7mk-logo-header-1440-2x.png |
| S1-r3 video overlaying | PASS | Hero (1440 and 375) has no video behind the headline. The only `<video>` sits in its own rounded band (1118x479 at 1440, 333x416 at 375) below the two audience cards, with no overlap with neighbouring sections; overlaid copy "Screened before you meet them" is legible. The complaint is vague, so this is judged on "nothing overlaps or hides behind the video". | docs/qa/b/screens/bs7mk-video-1440.png |
| S1-r4 steps 3 and 6 text | UNCLEAR | Sheet gives no target text. Current step 3 = "AI Interview: Candidates pick the skills they want to be hired for, and our AI interviews them on exactly those skills." Step 6 = "Findtern Score: Every intern gets one score out of 10, built from the AI interview, aptitude and coding results." Neither is broken. | docs/qa/b/screens/bs7mk-steps-1440.png |
| S1-r5 Intern non-bypass agreement UI | PASS | /intern-nda: title on two clean lines (no mid-word "Non-Bypass" break), "Important" callout box, numbered clauses 1 to 6 with bold titles on their own line, sub-bullets with consistent indent; same at 375 (no overflow in the document body). | docs/qa/b/screens/bs7mk-intern-nda-1440-s0.png |
| S1-r6 compare "Talk to us" goes to contact | PASS | Home "Compare every attribute" block: "Talk to us" href=`/contact`; the "Not sure which plan fits? Talk to us" button is also `/contact`. Neither points at /employers. | docs/qa/b/screens/bs7mk-home-1440-s6.png |
| S1-r7 About sliding companies wording | PASS | About strip reads "TRUSTED BY LEADING COMPANIES ACROSS INDIA"; home strip reads "WORKING WITH TEAMS AT LEADING ORGANISATIONS". No "working with 9 companies" text on either page (text search of both). | docs/qa/b/screens/bs7mk-about-1440-s1.png |
| S1-r8 no 4h/6h in "what an intern costs a month" | PASS | Calculator has only plan menu (Espresso/Cappuccino/Latte) and days menu ("5 days", "6 days"); copy says "Every day is a full 8-hour day". No 4 h or 6 h option anywhere on /pricing (text search, both widths). | docs/qa/b/screens/bs7mk-pricing-1440-s1.png |
| S1-r9 US client sees USD | PASS | `/pricing` with the INR/USD menu set to USD (and by default for a US-locale visitor): 0 occurrences of the rupee sign, 31 "$" values (e.g. "$1/hr", "$160 a month at 160 hours", "$50 per hire"). Menu offers only INR and USD. See X3 for pages outside /pricing that stay in INR. | docs/qa/b/screens/bs7mk-pricing-usd-1440.png |
| S1-r10 emails clickable (marketing) | PASS | Text-node scan of 15 marketing routes (accordions expanded, incl. both FAQ tabs): 0 email strings outside an `a[href^=mailto:]`. Header mobile menu, footer, FAQ answers, legal pages, contact page all linked. | docs/qa/b/screens/bs7mk-contact-1440-s0.png |
| S1-r11 contact phone digits fixed | PASS | /contact phone input: `type=tel`, `inputmode=numeric`, letters stripped (typed "abc98765432109876543" gives "9876543210"), maxlength 10 with +91; hint "10 digits starting with 6-9". For other countries the length is a 6 to 15 range (maxlength 15), not a single fixed length. | docs/qa/b/screens/bs7mk-contact-phone-1440.png |
| S1-r12 FAQ intern / employer buttons | PASS | /faq has two tab buttons: "I'm looking for an internship" (49 questions) and "I'm hiring" (40 questions); clicking switches the list; `/faq#interns` and `/faq#employers` open the right tab. Same at 375. | docs/qa/b/screens/bs7mk-faq-default-1440.png |
| S1-r13 guarantee: 30-day hide limit, 160+ hours explained | PASS | Terms card "4. Hiding your profile: You can hide your profile from employers when you need a break, but never for more than 30 days at a time." Card "6. What counts as a placement: A contracted engagement of 160 hours or more: a signed proposal ... hours logged on weekly timesheets, and a stipend paid through Findtern. About four full-time weeks." | docs/qa/b/screens/bs7mk-guar-terms-1440.png |
| S1-r14 /interns query mail is communicate@ | PASS | /interns: all 3 mailto links (page, header menu, footer) and every visible address are `communicate@findtern.in`; 0 `admin@` anywhere in the rendered page. | docs/qa/b/screens/bs7mk-interns-1440-s2.png |
| S1-r15 no pricing card on /interns | PASS | No plan cards (no Espresso/Cappuccino/Latte, no "/hr", no "a month"). One price line in the hero: "One-time fee ₹2,499, refunded in full if you are not placed. How the guarantee works", link href=`/guaranteed-internship-program`. | docs/qa/b/screens/bs7mk-interns-1440-s0.png |
| S1-r16 five stage times + colour of "Findtern" | PASS | Five numbered stage cards with a time chip each: "About 15 minutes", "30 to 60 minutes", "Once your results are reviewed", "Within the 18-month window", "Stipend paid monthly" (previously terse: "After review", "Until placed"). Heading "The **Findtern** Guarantee": word Findtern is gold `rgb(247, 206, 142)` with the underline curve, rest white (as on the legacy page). The sheet does not say which times were wanted; the owner should confirm the values. | docs/qa/b/screens/bs7mk-interns-1440-s1.png |
| S1-r18 home video has no pause/play | PASS | The only `<video>` has `controls=false`, muted, loop, autoplay-by-observer; 0 buttons with play/pause/mute/video in name or text on the page; the video is playing (paused=false, currentTime advancing) at both widths. | docs/qa/b/screens/bs7mk-video-375.png |
| NC-r2 logo size increased | PASS | Header logo height 56 px at top / 48 px scrolled at 1440 (source code shows it was 44 / 40 before); 48 / 44 at 375; footer logo 64 px high (was 56). But see X1: at 375 the larger header no longer fits. | docs/qa/b/screens/bs7mk-hero-hiring-1440.png |
| NC-r3 starts from hiring perspective | PASS | Hero now has an "I'm hiring / I'm a student" switch (aria-pressed). Clicking "I'm a student" swaps headline to "Get a paid internship, or get your fee back." with CTAs "Create my profile" / "How it works for interns"; a "For students" card sits beside "For employers" under the hero. Default is still the hiring side, as an owner choice. | docs/qa/b/screens/bs7mk-hero-student-1440.png |
| NC-r4 steps 3 to last font size | PASS | All 7 steps measured: label 11px/600, title 19px/600 (17.15px at 375), body 16px/400, line-height 26px; identical for steps 1 to 7 at both widths. | docs/qa/b/screens/bs7mk-steps-1440.png |
| NC-r5 "skill-based" label removed | PASS | No "skill-based" text on /, /about, /pricing, /contact, /interns, /employers, /guaranteed-internship-program, /blog, /opportunities. Only hit is the FAQ answer sentence "Skill-based questions, customized ..." (body copy, not the step label). | docs/qa/b/screens/bs7mk-steps-1440.png |
| NC-r6 Acceptance, Compliance & Non-Bypass Agreement page | PASS | Same evidence as S1-r5: title wraps at "Acceptance," / "Compliance & Non-Bypass Agreement", callout, numbered clause titles; no stray line breaks in clause text. | docs/qa/b/screens/bs7mk-intern-nda-375-s0.png |
| NC-r7 guarantee "does not cover": declined offers | PASS | Block "What the guarantee does not cover" has 4 items; the 4th is "More than 3 offers turned down: Reject more than 3 offers and you are no longer eligible for the refund. Only formal offers count, not interview requests." The owner's own sentence says "more than 3 times", which matches (a "3 or more" reading would differ by one offer). | docs/qa/b/screens/bs7mk-guar-notcover-1440.png |
| NC-r8 coffee section: admin email | PASS | Home and /pricing (the "Hire an intern for the price of a coffee" sections and their footers) show only `admin@findtern.in` as visible/mailto text; 0 visible `communicate@`. "Talk to us" goes to /contact, which labels both addresses. | docs/qa/b/screens/bs7mk-footer-bottom-home-375.png |
| NC-r9 phone country-code list is full | PASS | /contact country select has 170 options (+91 India, +93 Afghanistan, +355 Albania ... +263 Zimbabwe). The signup forms (/signup, /signup?role=intern, /signup?role=employer, /employer/signup) also have 170. No other marketing page has a phone field. | docs/qa/b/screens/bs7mk-contact-1440-s0.png |
| NC-r10 /interns communicate@ everywhere | PASS | Same evidence as S1-r14. | docs/qa/b/screens/bs7mk-interns-1440-s2.png |
| NC-r11 for employers: admin@ | PASS | /employers (and /pricing, /): all mailto and visible addresses are `admin@findtern.in`; 0 `communicate@` in visible text. | docs/qa/b/screens/bs7mk-footer-bottom-home-375.png |
| NC-r12 /terms-and-conditions#s-for-interns-5 | PASS | Anchor exists (`H3` "5.1 For Interns"); lands under the sticky header with the heading text visible at 1440 and 375. Numbered sub-headings 5.1 / 5.2 / 6.1 / 6.2 in accent colour, bullets indented, "Interns:" labels grouped. Heading box top is 60 px vs header bottom 65 px at 1440 (tight, text still visible). | docs/qa/b/screens/bs7mk-terms-anchor-landing-1440.png |
| NC-r13 /intern-terms numbering 2 then 2.1 | PASS | Measured all 16 numbered headings: level 1 = H2 at left edge (19 px), level 2 = H3 indented 20 px (16 px), identical at 1440 and 375; side TOC indents the 2.1 / 2.2 entries too. (TOC omits 7.1 although the body has "7.1 Who Can Access Your Data?": minor.) | docs/qa/b/screens/bs7mk-intern-terms-and-conditions-1440-s0.png |
| NC-r14 footer LEGAL spacing | PASS | LEGAL links y-pitch 44 px between every pair at 1440, 1024, 768 and 375; each label one line (label is now "Non-Bypass Agreement"). | docs/qa/b/screens/bs7mk-footer-bottom-home-375.png |
| NC-r29 FAQ and contact pages exist and are linked | PASS | /faq and /contact return 200; "Contact Us" and "FAQ" appear in header nav and footer at 1440 and in the mobile menu and footer at 375. | docs/qa/b/screens/bs7mk-mobile-menu-375.png |
| NC-r30 Ask me bigger + pop-up | PASS | Launcher is 141x64 px with the label "Ask me" at every width (source diff shows it was a 56 px icon-only circle on small screens); a prompt bubble "Questions about Findtern? Ask me" (228x53, 15 px text) appears about 3.0 s after load; clicking opens the chat panel (380x585 at 1440, 345x585 at 375). | docs/qa/b/screens/bs7mk-askme-open-375.png |
| NC-r31 header logo is real logo | PASS | Marketing header link holds 1 `<img alt="Findtern - Internship Simplified">` (findtern-logo-green.png) and no cap icon + text pair; footer uses findtern-logo-white.png. | docs/qa/b/screens/bs7mk-logo-header-1440-2x.png |
| NC-r32 header logo real, larger | PASS | Same evidence as NC-r31 and NC-r2 (56 px high at 1440 when not scrolled). | docs/qa/b/screens/bs7mk-logo-header-1440-2x.png |
| NC-r39 FAQ/contact option in nav or footer | PASS | Same evidence as NC-r29. | docs/qa/b/screens/bs7mk-mobile-menu-375.png |
| NC-r40 Ask me icon bigger | PASS | Chat icon is 28 px (`size-7`, was 24 px) inside a 64 px high button with a 12 px notification dot. | docs/qa/b/screens/bs7mk-askme-open-1440.png |
| X1 (extra) header at 375 | FAIL | On every marketing page at 375 the menu button spans x=344 to 384, so the header is 9 px wider than the viewport: `document.scrollWidth` 384 (385 on mobile emulation) vs `innerWidth` 375; the hamburger touches or is clipped by the right edge. Seen with and without mobile emulation. Likely caused by the larger logo (160 px) plus "Get started" plus menu button. | docs/qa/b/screens/bs7mk-header-overflow-faq-375-desktopmode.png |
| X2 (extra) floating Ask me vs footer at 375 | FAIL | At the bottom of any page the footer's last line is covered: the prompt bubble sits over "2026 © Findtern. All rights reserved." and stays up (still there after 11 s, dismissable only with its x); at 375x667 the launcher covers the footer "Copy email" icon on /faq and /about (`elementFromPoint` returns the launcher), and the page cannot scroll further. No overlap of the launcher with the header at any width. | docs/qa/b/screens/bs7mk-footer-overlap-faq-375x667.png |
| X3 (extra) USD mode on home and About | FAIL | With currency set to USD, the home and About stats strip still reads "₹5,000 Fixed per-hire fee" while /pricing and the home pricing section show "$50". A US client sees the rupee fee on two marketing pages. (₹2,499 intern fee on /interns, the guarantee page and FAQ stays INR; that looks intended.) | docs/qa/b/screens/bs7mk-home-usd-stats-1440.png |

## Defects

1. **X1, header overflows at 375**
   - Route: any marketing page, for example `/faq`; width 375.
   - Steps: open the page at 375 px; read the "Open menu" button bounds and `document.documentElement.scrollWidth`.
   - Expected: menu button right edge at or below 355 (20 px gutter); no horizontal overflow.
   - Actual: button spans 344 to 384; scrollWidth 384; the hamburger sits against or past the right edge.

2. **X2, Ask me prompt and launcher cover the footer at 375**
   - Route: `/faq`, `/about` (also `/`, `/contact`); width 375 (height 667 for the icon case).
   - Steps: wait 3 s, scroll to the very bottom.
   - Expected: nothing in the footer (copyright line, email, copy icon) hidden by the floating widget, or the page keeps enough bottom padding to scroll it clear.
   - Actual: prompt bubble covers the copyright line; launcher covers the "Copy communicate@findtern.in" icon (elementFromPoint = the launcher); page is at max scroll.

3. **X3, rupee fee shown in USD mode**
   - Route: `/` and `/about`; width 1440 (same at 375).
   - Steps: set the "Prices in" menu on `/pricing` to USD (or open with a US locale), then open `/` and scroll to the dark stats strip.
   - Expected: "$50 Fixed per-hire fee" (hiring fee 50 USD for non-India).
   - Actual: "₹5,000 Fixed per-hire fee".

## Observations (not rows, not scored)

- Pricing calculator hours are 5 days x 4 weeks = 160 h and 6 x 4 = 192 h; the owner decision is a flat 22 or 26 days a month (176 h / 208 h at 8 h a day). The calculator copy reads "8 h x 5 d x 4 weeks = 160 hours". Worth a product check; not part of S1-r8.
- USD price strings show "$0.5/hr" and "Was $0.5/hr" (no trailing zero).
- Organization JSON-LD in the HTML of every page (home and pricing too) lists `communicate@findtern.in` as the contact email; invisible, but employer pages carry the intern address in structured data.
- At 1440 the guarantee page's "What the guarantee does not cover" left column stacks "Get assessed" and "More questions" buttons on two rows.
- The "Important" callout on /intern-nda starts with a small black triangle glyph (warning sign rendered as a plain triangle).
- No "calendly" string appears in the HTML of /, /pricing, /about, /contact, /faq, /interns, /employers, /guaranteed-internship-program, /blog, /opportunities.

## Counts

Requested rows (35: 16 from Sheet1, 19 from NEW CHANGES): PASS 34, FAIL 0, UNCLEAR 1 (S1-r4).
Extra findings from the 375 px and USD checks (X1 to X3): FAIL 3.
Table totals: PASS 34, FAIL 3, UNCLEAR 1.
