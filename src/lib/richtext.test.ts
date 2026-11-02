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

test("a nested list written as a sibling of its item is moved inside it (valid HTML for screen readers)", () => {
  const out = sanitizeRichText("<ol><li>First</li><ul><li>a</li><li>b</li></ul><li>Second</li><ul><li>c</li></ul></ol>");
  assert.doesNotMatch(out, /<\/li>\s*<ul/, "no list directly after an item");
  assert.match(out, /<li class="rt-li">First\s*<ul class="rt-ul"><li class="rt-li">a<\/li><li class="rt-li">b<\/li><\/ul><\/li>/);
  assert.match(out, /<li class="rt-li">Second\s*<ul class="rt-ul"><li class="rt-li">c<\/li><\/ul><\/li>/);
  // Already-correct nesting is untouched.
  const ok = "<ul><li>x<ul><li>y</li></ul></li><li>z</li></ul>";
  assert.equal(sanitizeRichText(ok).replace(/ class="[^"]*"/g, ""), ok);
  // A deeper sibling list keeps its own children.
  const deep = sanitizeRichText("<ol><li>A</li><ul><li>b<ul><li>c</li></ul></li></ul></ol>");
  assert.doesNotMatch(deep, /<\/li>\s*<ul/);
  assert.equal((deep.match(/<ul/g) ?? []).length, 2);
});

test("an unterminated tag at the end becomes text, so joining bodies cannot revive it", () => {
  const out = sanitizeRichText("<p>hi</p><img src=x onerror=alert(1)//");
  assert.ok(!/<img/i.test(out));
  assert.match(out, /&lt;img/);
  assert.ok(!/<img/i.test(`${out}<p>next</p>`));
});

test("protocol-relative and backslash links lose their href", () => {
  for (const href of ["//evil.example/x", "/\\evil.example", "/\\/evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "\t//evil.example"]) {
    const out = sanitizeRichText(`<a href="${href}">x</a>`);
    assert.ok(!out.includes("href"), `${href} survived as ${out}`);
  }
  assert.match(sanitizeRichText('<a href="/pricing">x</a>'), /href="\/pricing"/);
  assert.match(sanitizeRichText('<a href="https://x.test/a">x</a>'), /rel="noopener noreferrer"/);
});

test("hostile payloads never leave a live tag, handler or script URL", () => {
  const payloads = [
    "<script>alert(1)</script>",
    "<scr<script>ipt>alert(1)</scr</script>ipt>",
    "<img src=x onerror=alert(1)>",
    '<a href="java\tscript:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<a href="https://x.test" onclick="alert(1)">x</a>',
    '<a href="x" title=">"><img src=x onerror=alert(1)>">y</a>',
    '<p onmouseover="alert(1)" style="background:url(javascript:alert(1))">hi</p>',
    "<svg onload=alert(1)>",
    "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
    '<iframe srcdoc="<script>alert(1)</script>">',
    '<form action="javascript:alert(1)"><button formaction="javascript:alert(1)">x</button></form>',
    '<base href="https://evil.example/">',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    "<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></noscript>",
    "<!--><img src=x onerror=alert(1)>-->",
    "<textarea><img src=x onerror=alert(1)></textarea>",
    "<<img src=x onerror=alert(1)>",
    "<p<img src=x onerror=alert(1)>>",
    "<li><li><img src=x onerror=alert(1)>",
    "<h3><img src=x onerror=alert(1)></h3>",
  ];
  const liveTag = /<(?!\/?(?:h[234]|p|ul|ol|li|strong|em|a|blockquote|hr|br|code|pre|sup|sub|b|i)[\s>])[a-z!?]/i;
  for (const p of payloads) {
    const out = sanitizeRichText(p);
    assert.ok(!liveTag.test(out), `live tag in ${JSON.stringify(out)} from ${JSON.stringify(p)}`);
    // Handlers only count inside a tag; an escaped attribute value is inert text.
    for (const tag of out.match(/<[^>]*>/g) ?? []) {
      assert.ok(!/\son[a-z]+\s*=|\sstyle\s*=|\ssrc\s*=|srcdoc|formaction/i.test(tag), `attribute in ${tag}`);
      assert.ok(!/href="(?!https?:\/\/|mailto:|#|\/(?![/\\]))/i.test(tag), `unsafe href in ${tag}`);
    }
  }
});
