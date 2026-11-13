/*
  The guarantee's terms of record: one copy, read by the public page
  (/guaranteed-internship-program) and the intern's own (/intern/guarantee),
  so the two cannot drift apart. Plain data, no React.
*/

export const STEPS = [
  {
    n: "01",
    title: "Sign Up & Apply",
    text: "Join Findtern and activate the Guaranteed Internship Program with complete transparency.",
  },
  {
    n: "02",
    title: "AI Interview & Rating",
    text: "Take our structured AI-powered interview to evaluate your coding, problem solving, and communication.",
  },
  {
    n: "03",
    title: "Profile Visibility",
    text: "Your verified rubric and badge are instantly surfaced to vetted employers and hiring managers.",
  },
  {
    n: "04",
    title: "Internship Placement",
    text: "Matched directly to approved internship opportunities tailored to your proven skills.",
  },
  {
    n: "05",
    title: "Guaranteed Outcome",
    text: "Get placed within 6 months, or receive a 100% full refund if we fail to place you.",
  },
];

export const PROGRAM_TERMS = [
  {
    title: "1. 6-Month Placement Window",
    text: "You will be matched and placed in a qualified internship within 6 months of your AI interview.",
  },
  {
    title: "2. 100% Refund Assurance",
    text: "If we are unable to secure you an internship placement within the period, we release a full 100% refund.",
  },
  {
    title: "3. Defined Execution Window",
    text: "The program features an active placement runway. Refunds are issued within 7 working days after the 6-month guarantee window closes.",
  },
  {
    title: "4. Hiding your profile",
    text: "You can hide your profile from employers when you need a break. It stays hidden until you switch it back on. The guarantee only runs while employers can see you.",
  },
  {
    title: "5. Active Engagement & Integrity",
    text: "You agree to remain reachable and interview with matched employers. As long as you participate actively, our placement guarantee stands.",
  },
  {
    title: "6. What counts as a placement",
    text: "A contracted engagement of 160 hours or more: a signed proposal with an employer, hours logged on a monthly timesheet (sent on the period's last day), and a stipend paid through Findtern. About four full-time weeks. Shorter work does not count.",
  },
];

export const CONDITIONS = [
  {
    n: "01",
    title: "Your assessment is scored",
    body: "You complete the full assessment. A low score is not a disqualifier - it changes which employers see you, not your guarantee.",
  },
  {
    n: "02",
    title: "You stay reachable",
    body: "You respond to employer requests inside the window. Going quiet hands the placement back to us, not to you.",
  },
  {
    n: "03",
    title: "You turn down or let lapse no more than 3 offers",
    body: "You can turn down or let lapse up to 3 offers in the window. Turning down or letting a 4th lapse ends the obligation. Not getting offers never counts against you.",
  },
];

export const termsFor = (fee: number) => [
  { label: "Fee", value: `₹${fee.toLocaleString("en-IN")}`, note: "refundable on conditions" },
  { label: "Clock starts", value: "Your AI interview", note: "not your sign-up date" },
  { label: "Refund timing", value: "After 6 months", note: "not during the window" },
  { label: "Counts as placed", value: "160+ hours", note: "contracted engagement" },
];

export const FAQS = [
  {
    id: "g-what-is",
    category: "Program",
    question: "What is the Guaranteed Internship Program?",
    answer:
      "It’s a structured, transparent process where you complete candidate onboarding and an AI-powered evaluation, become visible to verified hiring employers, and we work to get you placed within 6 months — or your fee is refunded in full.",
  },
  {
    id: "g-how-works",
    category: "Process",
    question: "How does the program work step by step?",
    answer:
      "You sign up, complete your evaluation and AI interview, earn a verified score rubric, and get matched to active employer requirements. You apply, interview, and receive formal offers directly on the platform.",
  },
  {
    id: "g-eligible",
    category: "Eligibility",
    question: "Who is eligible for the guarantee?",
    answer:
      "College students and early-career candidates who complete onboarding, submit accurate profile verification, and finish the AI interview evaluation.",
  },
  {
    id: "g-charges",
    category: "Pricing",
    question: "Are there any hidden charges?",
    answer:
      "No. You pay one fee, once. It is refunded in full if we do not place you within 6 months and you met the three conditions. There are no hidden or recurring charges.",
  },
  {
    id: "g1",
    category: "Refund",
    question: "When exactly does the 6-month clock start?",
    answer:
      "On the date your assessment is scored, not the date you signed up. This follows the standard consumer-law convention where the clock starting early is the usual trick, so it is stated explicitly here.",
  },
  {
    id: "g2",
    category: "Refund",
    question: "Can I get a partial refund during the window?",
    answer:
      "No. The refund is all-or-nothing after the window closes. There is no mid-window payment, and we cannot pay out faster than six months even if we wanted to.",
  },
  {
    id: "g3",
    category: "Refund",
    question: "What is excluded from the guarantee?",
    answer:
      "Anything that was never a placement request, and any engagement under the 160-hour minimum that the Skilled and Assured bands carry. If it did not clear the bar, it was not a placement, and the guarantee stands.",
  },
  {
    id: "g4",
    category: "Refund",
    question: "How many offers can I turn down?",
    answer:
      "Up to 3 during the 6-month window. Turning down or letting a 4th offer lapse ends the guarantee. Only formal offers count - an interview request you pass on is not an offer.",
  },
  {
    id: "g4a",
    category: "Refund",
    question: "Can I hide my profile during the window?",
    answer:
      "Yes. It stays hidden until you switch it back on. While your profile is hidden employers cannot find you, so the guarantee pauses with it and resumes the day you are visible again.",
  },
  {
    id: "g4b",
    category: "Refund",
    question: "What does a 160+ hour contracted engagement mean?",
    answer:
      "A signed proposal with a Findtern employer for at least 160 working hours - about four full-time weeks - logged on a monthly timesheet (sent on the period's last day) and paid through the platform. Anything shorter does not count as a placement, so the guarantee keeps running.",
  },
  {
    id: "g5",
    category: "Refund",
    question: "How long does the refund take to arrive?",
    answer:
      "Refunds are issued to the original payment method within 7 working days of the window closing. You get a written confirmation with the amount and the date.",
  },
];

export const EXCLUSIONS = [
  {
    title: "Work that was never requested",
    body: "An employer approaching you directly, off-platform, was never a Findtern placement request.",
  },
  {
    title: "Anything under 160 hours",
    body: "A three-week engagement is not a placement under the Skilled and Assured bands, however good it went.",
  },
  {
    title: "An AI interview you never completed",
    body: "The clock starts with your AI interview. A profile that never completed it is not under guarantee.",
  },
  {
    title: "More than 3 offers turned down or lapsed",
    body: "Turn down or let more than 3 offers lapse and you are no longer eligible for the refund. Only formal offers count, not interview requests.",
  },
];
