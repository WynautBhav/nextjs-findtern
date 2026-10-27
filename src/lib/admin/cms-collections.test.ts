import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INLINE_IMAGE_PREFIX,
  buildCmsCreate,
  buildCmsPatch,
  cmsImageSrc,
  draftFromItem,
  imageError,
  matchesCmsSearch,
  normaliseFaqCategory,
  slugError,
  validateCmsValues,
} from "./cms-collections.ts";

const legacyLogo = `data:image/png;base64,${"A".repeat(640_000)}`;

test("FAQ category: legacy chips need exactly Intern / Employer (DB-25)", () => {
  assert.equal(normaliseFaqCategory("interns"), "Intern");
  assert.equal(normaliseFaqCategory(" Employer "), "Employer");
  assert.equal(normaliseFaqCategory("COMPANIES"), "Employer");
  assert.equal(normaliseFaqCategory("general"), null);
  const ok = validateCmsValues("faq", { category: "employers", question: "Q?", answer: "A." }, { partial: false });
  assert.deepEqual(ok.ok && ok.values.category, "Employer");
  const bad = validateCmsValues("faq", { category: "general", question: "Q?", answer: "A." }, { partial: false });
  assert.equal(bad.ok, false);
});

test("inline data: images are accepted up to the cap (ADM-21)", () => {
  assert.equal(imageError(legacyLogo), null);
  assert.equal(imageError("https://cdn.example.com/a.png"), null);
  assert.equal(imageError("/api/files/abc.webp"), null);
  assert.match(imageError(`data:image/png;base64,${"A".repeat(2_000_000)}`) ?? "", /too large/);
  assert.match(imageError("javascript:alert(1)") ?? "", /must be/);
  assert.match(imageError(`${INLINE_IMAGE_PREFIX}640000`) ?? "", /must be/, "the list token is never a valid value");
});

test("edit sends only changed fields, so a legacy inline image is never re-posted", () => {
  const item = { id: "p1", name: "Acme", logoUrl: `${INLINE_IMAGE_PREFIX}640000`, href: "https://acme.test", sortOrder: 2 };
  const original = draftFromItem("partner", item);
  const patch = buildCmsPatch("partner", original, { ...original, name: "Acme Ltd" });
  assert.deepEqual(patch, { name: "Acme Ltd" });
});

test("an emptied optional field is sent as null and cleared (ADM-22)", () => {
  const original = draftFromItem("testimonial", { id: "t", name: "A", title: "B", company: "C", quote: "Q", avatarUrl: "https://x/y.png", sortOrder: 0 });
  const patch = buildCmsPatch("testimonial", original, { ...original, avatarUrl: "" });
  assert.deepEqual(patch, { avatarUrl: null });
  const checked = validateCmsValues("testimonial", patch, { partial: true });
  assert.deepEqual(checked, { ok: true, values: { avatarUrl: null } });
  // A required field can't be cleared.
  const refused = validateCmsValues("testimonial", { name: "" }, { partial: true });
  assert.equal(refused.ok, false);
});

test("legacy blog slugs stay editable; new or changed slugs follow the rule (ADM-23)", () => {
  assert.equal(slugError("Intern-10", "Intern-10"), null);
  assert.equal(slugError("my_post.v2", "my_post.v2"), null);
  assert.ok(slugError("Intern-11", "Intern-10"));
  assert.equal(slugError("intern-11", "Intern-10"), null);
  assert.ok(slugError("Bad Slug", null));
  const edit = validateCmsValues("blog", { slug: "Intern-10", title: "T" }, { partial: true, previousSlug: "Intern-10" });
  assert.equal(edit.ok, true);
});

test("a blog post can be created without a body, like legacy", () => {
  const draft = draftFromItem("blog", null);
  assert.equal(draft.status, "draft");
  const create = buildCmsCreate("blog", { ...draft, title: "Hello", slug: "hello" });
  const checked = validateCmsValues("blog", create, { partial: false });
  assert.equal(checked.ok, true);
});

test("numbers and selects are validated", () => {
  assert.equal(validateCmsValues("skill", { title: "React", resourceCount: "-1" }, { partial: false }).ok, false);
  const ok = validateCmsValues("skill", { title: "React", resourceCount: "120" }, { partial: false });
  assert.equal(ok.ok && ok.values.resourceCount, 120);
  assert.equal(validateCmsValues("blog", { status: "live" }, { partial: true }).ok, false);
  const pub = validateCmsValues("blog", { status: "Published" }, { partial: true });
  assert.equal(pub.ok && pub.values.status, "published");
});

test("search matches every word across text fields; image src routes inline images", () => {
  const item = { id: "1", question: "How do payouts work?", answer: "Monthly", category: "Intern" };
  assert.equal(matchesCmsSearch("faq", item, "payouts intern"), true);
  assert.equal(matchesCmsSearch("faq", item, "payouts employer"), false);
  assert.equal(cmsImageSrc("partner", "p 1", "logoUrl", `${INLINE_IMAGE_PREFIX}9`), "/api/admin/cms/image?type=partner&id=p%201&field=logoUrl");
  assert.equal(cmsImageSrc("partner", "p1", "logoUrl", "https://x/y.png"), "https://x/y.png");
  assert.equal(cmsImageSrc("partner", "p1", "logoUrl", ""), null);
});
