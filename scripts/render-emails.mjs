// Render every transactional email to <out>/<id>.html and <id>.txt. Never sends anything.
//   node scripts/render-emails.mjs [outDir]      (default: logs/email-preview)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { rendered } from "./lib/email-samples.mjs";

const out = process.argv[2] ?? "logs/email-preview";
mkdirSync(out, { recursive: true });
const all = rendered();
for (const m of all) {
  writeFileSync(join(out, `${m.id}.html`), m.html);
  writeFileSync(join(out, `${m.id}.txt`), m.text);
}
console.log(`rendered ${all.length} emails to ${out}`);
