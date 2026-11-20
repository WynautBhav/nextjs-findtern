import assert from "node:assert/strict";
import test from "node:test";

import { flagTranscript } from "./flags.ts";
import { FLAG_CODES, FLAG_RULES } from "./review-types.ts";
import type { FlagCode, TranscriptLine } from "./review-types.ts";

const one = (t: string, i = 0): TranscriptLine => ({ i, t, s: 12, sp: "Speaker 1" });
const rulesOf = (t: string): FlagCode[] => flagTranscript([one(t)]).map((f) => f.rule);

/** Realistic ASR lines per rule: POSITIVE must raise the rule, NEGATIVE must not raise THAT rule. */
const MATRIX: Record<FlagCode, { positive: string[]; negative: string[] }> = {
  phone_number: {
    positive: [
      "You can call me on +91 98765 43210 anytime.",
      "My number is 98765-43210.",
      "9876543210 is my number, save it.",
      "Reach me at 098765 43210 after six.",
      "Mera number hai nau aath saat chhe paanch char teen do ek shunya.",
      "My number is nine eight seven six five four three two one zero.",
      "Call me on double nine eight seven six five four three two one.",
      "It is plus nine one nine eight seven six five four three two one zero.",
      "Triple nine eight seven six five four three two, got it?",
      "Note it down: 9 8 7 6 5 4 3 2 1 0.",
      "WhatsApp me on 91-98765-43210 please.",
      "Mera number likh lo, nau aath saat chheh paanch char teen do ek shunya.",
    ],
    negative: [
      "I have 10 years of experience in this field.",
      "My CGPA is 8.5 and I scored 92 percent in twelfth.",
      "The stipend is 15000 per month on Findtern.",
      "The stipend is 15,000 per month.",
      "My pincode is 560001, Bengaluru.",
      "I studied in the 2024-25 batch.",
      "The meeting is from 10:30 to 11:30 tomorrow.",
      "My reference id is 123456789012.",
      "The transaction code was 9876543210123456.",
      "A number starting with five like 5876543210 is not a mobile.",
      "One two three four five six seven eight nine zero.",
      "Nine eight seven six five, that is the code.",
      "The range is 60000-70000 for senior roles.",
      "The package is Rs 7000080000 in total, they said.",
      "What do you do and what do you want to learn?",
    ],
  },
  email_address: {
    positive: [
      "My email is rahul.sharma@gmail.com.",
      "Send it to priya99@yahoo.co.in please.",
      "It is rahul dot sharma at gmail dot com.",
      "Write rahul at the rate gmail dot com.",
      "Write rahul at the rate of gmail dot com.",
      "Priya underscore 99 at yahoo dot co dot in.",
      "Mail me at rahul @ gmail.",
      "hr@acmecorp.com is the id.",
      "My email id is neha at outlook.",
      "Mera mail aman at the rate hotmail dot com hai.",
    ],
    negative: [
      "Type the @ symbol on the keyboard.",
      "At gmail you can check the inbox.",
      "Our website is findtern dot in.",
      "Visit findtern dot in slash interns for details.",
      "Write to support@findtern.in for help.",
      "We meet at the office at nine.",
      "I was at yahoo finance yesterday.",
      "The interest is at the rate of 5 percent.",
      "I will look at gmail dot com later.",
      "My CGPA is 8.5 in computer science.",
    ],
  },
  messaging_handle: {
    positive: [
      "Message me on WhatsApp after this call.",
      "Text me on telegram, it is faster.",
      "Ping me on insta once you are free.",
      "Just dm me.",
      "Add me on Snapchat.",
      "My whatsapp is the same as on the resume.",
      "WhatsApp pe baat karte hain.",
      "Telegram pe aa jao.",
      "Insta pe message karo.",
      "Give me your whats app number.",
      "My handle is rahul_dev99.",
      "You can find me as @rahul_dev.",
      "Let's continue on what's app.",
      "Whatsapp me when you reach.",
      "Mera whatsapp number likh lo.",
    ],
    negative: [
      "I saw your Instagram portfolio.",
      "We use Slack for all the team chat.",
      "WhatsApp for family and friends only.",
      "My signal was weak on that call.",
      "Signal processing is my favourite subject.",
      "I posted the reel on Instagram last week.",
      "Our team follows telegram channels for news.",
      "Insta reels were part of my marketing internship.",
      "My insta followers grew by twenty percent.",
      "I will share the assignment on the platform.",
      "She snapped a photo of the dashboard.",
    ],
  },
  payment_handle: {
    positive: [
      "My upi id is rahul@oksbi.",
      "Pay on 9876543210@paytm.",
      "rahul99@ybl is my id.",
      "Send it on gpay.",
      "Gpay kar dena.",
      "What is your phonepe number?",
      "My Google Pay number is the same.",
      "Bank account number bhej do.",
      "Share your IFSC code.",
      "Please send your account details so I can transfer the money.",
      "Paytm pe bhej dunga.",
      "G pay kar do.",
      "Pay TM number do.",
      "UPI ID bata do.",
      "Rahul at the rate oksbi is the upi.",
    ],
    negative: [
      "Payments happen through the platform.",
      "Payment will be made through Findtern.",
      "I use Paytm for my bills.",
      "UPI is very popular in India.",
      "Please create your account on Findtern.",
      "My account details are on my profile page.",
      "I will share the assignment on the platform.",
      "Phone pe baat karte hain.",
      "Share your resume details so I can review.",
      "I work at Paytm in the data team.",
    ],
  },
  direct_payment: {
    positive: [
      "I will pay you directly.",
      "I will pay you 15000 per month directly.",
      "Let's do it outside the platform.",
      "We can handle this outside Findtern.",
      "That way we stay off the platform.",
      "I'll give you the stipend in cash.",
      "No commission for either side.",
      "We can save the platform fee.",
      "Direct payment kar dena.",
      "Seedha paise bhej dunga.",
      "Seedha mere account me daal do.",
      "Platform ke bahar payment karenge.",
      "Bahar se payment le lena.",
      "Cash me de dunga.",
      "Cash de dena.",
      "Commission bachao yaar.",
      "I will give you 15000 per month directly.",
      "Pay me directly.",
    ],
    negative: [
      "What is the stipend?",
      "The stipend is 15000 per month through Findtern.",
      "Payment will be made through Findtern.",
      "I will share the assignment on the platform.",
      "I worked on a project outside my college.",
      "I can start directly on Monday.",
      "Cash flow management was my course.",
      "Seedha baat karte hain.",
      "I will pay the fee on the Findtern platform.",
      "She paid attention directly to the manager.",
      "The offer letter will come on the platform.",
    ],
  },
  external_meeting_link: {
    positive: [
      "Join my zoom.",
      "Here is the zoom link.",
      "It is zoom.us/j/123456789.",
      "Teams link bhej raha hoon.",
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc",
      "Use meet.google.com/abc-defg-hij.",
      "Let's continue on zoom.",
      "Let's continue on google meet.",
      "whereby.com/rahul-room is open.",
      "webex.com/meet/rahul works.",
      "Can we shift to teams?",
      "Zoom pe aa jao.",
    ],
    negative: [
      "I used Zoom in my previous internship.",
      "Teams of five people worked on it.",
      "I led two teams in college.",
      "We met on Google Meet today.",
      "I will share the assignment on the platform.",
      "Zoom in on the chart please.",
      "Please open the Findtern link.",
      "I switched teams last year.",
      "The teams were assigned projects.",
      "I joined my team in June.",
    ],
  },
  skip_platform: {
    positive: [
      "Let's skip the platform.",
      "We can bypass Findtern.",
      "Without going through Findtern it is easier.",
      "We do not need Findtern for this.",
      "Let's take this offline.",
      "You can leave the platform.",
      "We can move out of the platform.",
      "Don't tell Findtern.",
      "Platform se bahar baat karte hain.",
      "Platform ko chhodo.",
      "Findtern ke bina kaam karte hain.",
      "Findtern ko mat batana.",
      "Platform ki zarurat nahi hai.",
      "Platform skip kar do.",
    ],
    negative: [
      "I will share the assignment on the platform.",
      "Payments happen through the platform.",
      "Findtern helped me find this internship.",
      "I need to leave early for class.",
      "The platform is easy to use.",
      "We do not need a laptop for this.",
      "Skip the intro, let's start.",
      "I will take the exam offline.",
      "Our website is findtern dot in.",
      "I was told to bypass the traffic.",
    ],
  },
};

for (const rule of FLAG_CODES) {
  const { positive, negative } = MATRIX[rule];
  test(`${rule}: has at least 6 positive and 6 negative fixtures`, () => {
    assert.ok(positive.length >= 6 && negative.length >= 6);
  });
  for (const line of positive) {
    test(`${rule} flags: ${line}`, () => {
      assert.ok(rulesOf(line).includes(rule), `expected ${rule} for: ${line}`);
    });
  }
  for (const line of negative) {
    test(`${rule} does not flag: ${line}`, () => {
      assert.ok(!rulesOf(line).includes(rule), `unexpected ${rule} for: ${line}`);
    });
  }
}

test("ordinary interview talk raises no flag at all", () => {
  const talk = [
    "Hi, thanks for joining. Can you introduce yourself?",
    "I am a third year student with a CGPA of 8.5 and ten years of cricket coaching experience in my family.",
    "The stipend is 15000 per month through Findtern, is that okay?",
    "Payments happen through the platform once the work is approved.",
    "I will share the assignment on the platform by Friday.",
    "Our pincode is 560001 and we work from the Bengaluru office from 10:30 to 6:30.",
    "I saw your Instagram portfolio and liked the reels.",
    "The project runs for 2024-25 and needs a laptop.",
    "Our website is findtern dot in.",
  ];
  assert.deepEqual(flagTranscript(talk.map((t, i) => one(t, i))), []);
});

test("flag carries rule severity, offsetSec, speaker and line", () => {
  const [f, ...rest] = flagTranscript([{ i: 7, t: "message me on whatsapp", s: 73.5, sp: "Employer" }]);
  assert.equal(rest.length, 0);
  assert.equal(f.rule, "messaging_handle");
  assert.equal(f.severity, FLAG_RULES.messaging_handle.severity);
  assert.equal(f.offsetSec, 73.5);
  assert.equal(f.speaker, "Employer");
  assert.equal(f.line, 7);
});

test("severity comes from FLAG_RULES for every rule", () => {
  for (const rule of FLAG_CODES) {
    const flags = flagTranscript(MATRIX[rule].positive.map((t, i) => one(t, i)));
    for (const f of flags.filter((x) => x.rule === rule)) assert.equal(f.severity, FLAG_RULES[rule].severity);
  }
});

test("null offset and speaker are carried as null", () => {
  const [f] = flagTranscript([{ i: 3, t: "let's skip the platform", s: null, sp: null }]);
  assert.equal(f.offsetSec, null);
  assert.equal(f.speaker, null);
});

test("snippet holds the evidence with about six words of context each side and ellipses where trimmed", () => {
  const [f] = flagTranscript([one("hello there how are you doing today my number is 98765 43210 please save it and call me back anytime soon")]);
  assert.equal(f.snippet, "… you doing today my number is 98765 43210 please save it and call me …");
});

test("snippet has no ellipsis when the whole line fits", () => {
  const [f] = flagTranscript([one("just dm me")]);
  assert.equal(f.snippet, "just dm me");
});

test("snippet collapses whitespace and stays on its own line", () => {
  const flags = flagTranscript([one("first line is clean", 0), { i: 1, t: "call   me\n on\twhatsapp   now", s: 1, sp: null }]);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].snippet, "call me on whatsapp now");
});

test("snippet is capped near 200 chars and still holds the evidence", () => {
  const long = "extraordinarily".repeat(3);
  const text = `${Array(8).fill(long).join(" ")} dm me ${Array(8).fill(long).join(" ")}`;
  const [f] = flagTranscript([one(text)]);
  assert.ok(f.snippet.length <= 200, `length ${f.snippet.length}`);
  assert.ok(f.snippet.includes("dm me"));
});

test("one flag per (line, rule) even with several matches; different rules on one line each flag", () => {
  const twoPhones = flagTranscript([one("call 9876543210 or 8123456789 whenever")]);
  assert.equal(twoPhones.filter((f) => f.rule === "phone_number").length, 1);
  const mixed = flagTranscript([one("my email is rahul@gmail.com and my number is 9876543210, also dm me")]);
  assert.deepEqual(mixed.map((f) => f.rule), ["phone_number", "email_address", "messaging_handle"]);
});

test("output is ordered by line index even when input is not", () => {
  const flags = flagTranscript([one("skip the platform", 5), one("dm me", 2), one("zoom link", 9)]);
  assert.deepEqual(flags.map((f) => f.line), [2, 5, 9]);
});

test("a duplicate line index never doubles a rule", () => {
  const flags = flagTranscript([one("dm me", 4), one("dm me again", 4)]);
  assert.equal(flags.length, 1);
});

test("at most 60 flags per transcript, earliest lines kept", () => {
  const lines = Array.from({ length: 100 }, (_, i) => one("my number is 9876543210", i));
  const flags = flagTranscript(lines);
  assert.equal(flags.length, 60);
  assert.equal(flags[0].line, 0);
  assert.equal(flags[59].line, 59);
});

test("deterministic: same input, same output; input is not mutated", () => {
  const lines = [one("dm me", 3), one("pay you directly", 1), one("ping me on insta", 2)];
  const copy = JSON.parse(JSON.stringify(lines));
  assert.deepEqual(flagTranscript(lines), flagTranscript(lines));
  assert.deepEqual(lines, copy);
});

test("empty input and blank lines give []", () => {
  assert.deepEqual(flagTranscript([]), []);
  assert.deepEqual(flagTranscript([one(""), one("   ", 1)]), []);
});
