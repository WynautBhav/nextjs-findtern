// Tester B, 28 Oct: NC r35/r36 hypothesis. One shared client address (a campus or office behind one public IP)
// asks for sign-up codes for different students. The limiter keys on the address alone.
// Local server only (TRUST_PROXY=1, so the forwarded address is the key). Mail goes to the log, nothing is sent.
const origin = "http://localhost:3502";
const ip = "10.77.1.9";
const stamp = Date.now() % 1e6;
for (let n = 1; n <= 7; n++) {
  const res = await fetch(origin + "/api/auth/signup/send-otp", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": ip },
    body: JSON.stringify({ email: `qab.shared.${stamp}.${n}@gmail.com`, subjectType: "intern", purpose: "signup" }),
  });
  console.log(`student ${n} from the same address → ${res.status} ${(await res.text()).slice(0, 60)}`);
}
