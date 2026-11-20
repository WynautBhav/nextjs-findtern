import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * With the 5 s browser page cache (staleTimes.dynamic), a plain router.push/replace after a change can land on a
 * page cached from before it. These four call router.refresh() first, which clears that cache.
 */
const SPOTS: [file: string, nav: RegExp][] = [
  ["src/components/payments/checkout-pay.tsx", /router\.replace\(AFTER_PAYMENT_HREF\)/g],
  ["src/components/employer/drive-enter-button.tsx", /router\.replace\(data\.redirect\)/g],
  ["src/app/employer/projects/project-list.tsx", /router\.push\(`\/employer\/projects\/\$\{p\.id\}\/edit`\)/g],
  ["src/components/admin/company-controls.tsx", /router\.push\("\/admin\/companies"\)/g],
];

for (const [file, nav] of SPOTS) {
  test(`${file}: router.refresh() comes right before the navigation`, () => {
    const lines = readFileSync(file, "utf8").split("\n");
    const hits = lines.flatMap((l, i) => (l.match(nav) ? [i] : []));
    assert.ok(hits.length > 0, "navigation found");
    for (const i of hits) assert.match(lines[i - 1], /router\.refresh\(\);/, `${file}:${i + 1} has no router.refresh() before it`);
  });
}
