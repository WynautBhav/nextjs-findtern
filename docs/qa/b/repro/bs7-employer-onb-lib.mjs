export async function step1(p, email) {
  const v = (n, x) => p.locator(`input[name=${n}]`).fill(x);
  await v("companyName", "Acme QA Test");
  await p.locator("select[name=companySize]").selectOption({ index: 2 });
  await v("websiteUrl", "https://www.acme-qa-test.in");
  await p.locator("select[name=country]").selectOption({ label: "India" }).catch(() => {});
  await p.locator("select[name=state]").selectOption({ label: "Rajasthan" });
  const city = p.locator("input[name=city]");
  await city.click(); await city.pressSequentially("Jai", { delay: 60 }); await p.waitForTimeout(700);
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter");
  await v("billingPincode", "302017");
  await v("primaryContactName", "Qa Employer");
  await v("primaryContactRole", "Talent lead");
  await v("primaryContactPhone", "9871203645");
  await v("escalationContactName", "Esc Manager");
  await v("escalationContactRole", "Ops head");
  await v("escalationContactEmail", "esc.manager@acme-qa-test.in");
  await v("escalationContactPhone", "9708124536");
  await p.getByRole("button", { name: /save and continue/i }).click();
  await p.waitForTimeout(3000);
}
