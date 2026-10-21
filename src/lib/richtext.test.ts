import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeRichText } from "./richtext.ts";

test("drops scripts and unsafe hrefs", () => {
  const out = sanitizeRichText('<p>Hi<script>alert(1)</script></p><a href="javascript:x">x</a>');
  assert.equal(out, '<p class="rt-p">Hi</p><a class="rt-a">x</a>');
});

test("unwraps an empty li wrapper around real items (Docs paste)", () => {
  const out = sanitizeRichText(
    '<ul><li dir="ltr" style="list-style-type:disc"><li><p>One</p></li><li><p>Two</p></li></li><li><p>Three</p></li></ul>',
  );
  assert.equal(
    out,
    '<ul class="rt-ul"><li class="rt-li"><p class="rt-p">One</p></li><li class="rt-li"><p class="rt-p">Two</p></li><li class="rt-li"><p class="rt-p">Three</p></li></ul>',
  );
});

test("keeps a properly nested sub-list", () => {
  const html = '<ul class="rt-ul"><li class="rt-li">A<ul class="rt-ul"><li class="rt-li">B</li></ul></li></ul>';
  assert.equal(sanitizeRichText(html), html);
});

test("drops Docs <div><br></div> spacer blocks", () => {
  const out = sanitizeRichText('<h3>For Interns</h3><div><span style="font-weight:700"><br></span></div><ul><li>Item</li></ul><div><br></div>');
  assert.equal(out, '<h2 class="rt-h2">For Interns</h2><ul class="rt-ul"><li class="rt-li">Item</li></ul>');
});

test("keeps h3 sub-clauses under h2 clauses instead of lifting them", () => {
  const out = sanitizeRichText("<h2>2. Registration</h2><h3>2.1 Account Creation</h3><p>Text.</p>");
  assert.equal(out, '<h2 class="rt-h2">2. Registration</h2><h3 class="rt-h3">2.1 Account Creation</h3><p class="rt-p">Text.</p>');
});

test("lifts a Docs h3/h4 outline so it starts at h2", () => {
  const out = sanitizeRichText("<h3>Section</h3><h4>Sub</h4>");
  assert.equal(out, '<h2 class="rt-h2">Section</h2><h3 class="rt-h3">Sub</h3>');
});

test("unwraps a heading that wraps whole blocks, and drops padding breaks", () => {
  const out = sanitizeRichText("<h3><p><br></p><ol><li><p><b>Title</b><br>Body.<br><br></p></li></ol></h3>");
  assert.equal(
    out,
    '<ol class="rt-ol"><li class="rt-li"><p class="rt-p"><b class="rt-strong">Title</b><br>Body.</p></li></ol>',
  );
});

test("gives an href-less email link its mailto", () => {
  assert.equal(
    sanitizeRichText("<p><a>communicate@findtern.in</a></p>"),
    '<p class="rt-p"><a class="rt-a" href="mailto:communicate@findtern.in">communicate@findtern.in</a></p>',
  );
});
